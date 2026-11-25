#requires -Version 7.2
[CmdletBinding()]
param(
    [switch]$Prototype,
    [switch]$Live,
    [switch]$Seed,
    [ValidateRange(0, 65535)][int]$AppPort,
    [ValidateRange(0, 65535)][int]$DatabasePort,
    [Parameter(DontShow)][switch]$Stop
)

$ErrorActionPreference = 'Stop'
# Check native failures explicitly, including on hosts that opt into native error records.
$PSNativeCommandUseErrorActionPreference = $false
$root = $PSScriptRoot
$dotenv = Join-Path $root '.env'
$composeFile = Join-Path $root 'docker-compose.yml'
$project = if ($env:SLATE_COMPOSE_PROJECT) { $env:SLATE_COMPOSE_PROJECT } else { 'slate' }
if ($project -cnotmatch '^[a-z0-9][a-z0-9_-]*$') { throw 'SLATE_COMPOSE_PROJECT must be a valid lowercase Compose project name.' }
if ($Prototype -and $Live) { throw 'Choose either -Prototype or -Live.' }

function Get-LocalDirectory([string]$Path) {
    $entry = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (!$entry) { $entry = New-Item -ItemType Directory -Path $Path -Force }
    if (!$entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Expected a real directory inside this checkout: $Path"
    }
    $entry.FullName
}

$cache = Get-LocalDirectory (Join-Path $root '.cache')
$state = Get-LocalDirectory (Join-Path $cache 'windows-launcher')
$lockPath = Join-Path $state 'launcher.lock'
$activePath = Join-Path $state 'active'
$stopPath = Join-Path $state 'stop-request'

function Open-LauncherLock {
    try { [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { $null }
}

function Test-PortInUse([int]$Port) {
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return $Port -in $listeners.Port
}

function Assert-Docker {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install Docker Desktop with the Compose plugin, then open Docker Desktop and retry.'
    }
    docker compose version --short *> $null
    if ($LASTEXITCODE) { throw 'Docker Compose v2 is required. Update Docker Desktop and retry.' }
    $endpoint = if ($env:DOCKER_HOST -and !$env:DOCKER_CONTEXT) {
        $env:DOCKER_HOST
    } else {
        docker context inspect --format '{{.Endpoints.docker.Host}}' 2>$null
        if ($LASTEXITCODE) { throw 'Cannot inspect the active Docker context. Select your local Docker Desktop context.' }
    }
    if ($endpoint -notmatch '^npipe://') { throw 'Select a local Windows Docker Desktop context before running Slate.' }
    $os = docker info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE) { throw 'Docker Engine is unavailable. Open Docker Desktop, wait until the engine starts, then retry.' }
    if ($os -ne 'linux') { throw 'Switch Docker Desktop to Linux containers for PostgreSQL 16.' }
}

function Invoke-Compose {
    docker compose --project-directory $root --project-name $project --file $composeFile --env-file $dotenv @args
}

function Get-OwnedDatabase {
    # Scope by exact Compose labels, then verify the config and bind mount before any mutation.
    $ids = @(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=db' --filter 'label=com.docker.compose.oneoff=False' 2>$null)
    if ($LASTEXITCODE) { throw 'Could not enumerate Slate database containers.' }
    if ($ids.Count -eq 0) { return $null }
    if ($ids.Count -ne 1) { throw 'There is more than one database container for this Compose project. Inspect it before continuing.' }
    $format = '{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}|{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}}:{{.Source}}{{end}}{{end}}|{{.State.Running}}|{{.State.StartedAt}}|{{json (index .HostConfig.PortBindings "5432/tcp")}}'
    $details = docker inspect --format $format $ids[0] 2>$null
    if ($LASTEXITCODE) { throw 'Could not inspect the Slate database container.' }
    $workingDir, $configFile, $mount, $running, $startedAt, $portJson = $details -split '\|', 6
    if ($workingDir -ine $root -or $configFile -ine $composeFile -or
        $mount -ine ('bind:' + (Join-Path $cache 'postgres'))) {
        throw 'The selected Compose project belongs to another checkout or data directory. Select a unique SLATE_COMPOSE_PROJECT.'
    }
    $ports = @($portJson | ConvertFrom-Json)
    if ($ports.Count -ne 1 -or $ports[0].HostIp -ne '127.0.0.1') {
        throw 'The owned PostgreSQL container must publish exactly one IPv4 loopback port.'
    }
    return @{ Id = $ids[0]; Running = $running -eq 'true'; Port = [int]$ports[0].HostPort; StartedAt = $startedAt }
}

function Assert-DatabaseDirectoryAvailable {
    $ids = @(docker ps -aq --filter 'volume=/var/lib/postgresql/data' 2>$null)
    if ($LASTEXITCODE) { throw 'Could not verify which containers own the database directory.' }
    if ($ids.Count -eq 0) { return }
    $format = '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}'
    $paths = @(docker inspect --format $format @ids 2>$null)
    if ($LASTEXITCODE) { throw 'Could not inspect existing database mounts.' }
    if ((Join-Path $cache 'postgres') -iin $paths) {
        throw 'Another container already owns this PostgreSQL directory for this checkout. Use its Compose project name.'
    }
}

function Stop-SessionDatabase([string]$Id, [string]$StartedAt) {
    if (!$Id) { return }
    Assert-Docker
    $database = Get-OwnedDatabase
    if ($database -and $database.Running -and $database.Id -eq $Id -and $database.StartedAt -eq $StartedAt) {
        docker stop $Id | Out-Null
        if ($LASTEXITCODE) { throw 'Docker could not stop the launcher-started PostgreSQL session.' }
        Write-Host 'Stopped PostgreSQL started by this launcher session. Local data is preserved.'
    }
}

function Test-AppListener($Process, [int]$Port) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $Port -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $pidToCheck = $listener.OwningProcess
        while ($pidToCheck -gt 0) {
            if ($pidToCheck -eq $Process.Id) { return !$Process.HasExited }
            $info = Get-CimInstance Win32_Process -Filter "ProcessId=$pidToCheck" -ErrorAction SilentlyContinue
            if (!$info -or $info.CreationDate -lt $Process.StartTime -or $info.ParentProcessId -eq $pidToCheck) { break }
            $pidToCheck = $info.ParentProcessId
        }
    }
    return $false
}

$token = $null
$gate = Open-LauncherLock
if (!$gate -and $Stop) {
    $token, $activeProject, $sessionDatabaseId, $sessionDatabaseStartedAt = (Get-Content -LiteralPath $activePath -Raw -ErrorAction SilentlyContinue) -split '\|', 4
    if ($activeProject -and $activeProject -ne $project) {
        throw "Use SLATE_COMPOSE_PROJECT=$activeProject in this terminal to stop the running launcher."
    }
    if ($token -notmatch '^[a-f0-9]{32}$') {
        throw 'Slate setup is still running. Wait for it to finish or press Ctrl+C in its terminal.'
    }
    [IO.File]::WriteAllText($stopPath, $token)
    for ($attempt = 0; $attempt -lt 30 -and !$gate; $attempt++) {
        Start-Sleep -Milliseconds 250
        $gate = Open-LauncherLock
    }
    if (!$gate) { throw 'Slate did not exit. Use Ctrl+C in the terminal that started it.' }
}
if (!$gate) {
    if ($Prototype -or $Live -or $Seed) {
        throw 'Slate is running or starting in this checkout. Stop it before switching modes or seeding.'
    }
    Write-Host 'Slate is running or starting in this checkout. Use the original launcher terminal.'
    return
}

$originalEnv = @{}
function Set-LauncherEnv([string]$Name, [string]$Value) {
    if (!$originalEnv.ContainsKey($Name)) {
        $originalEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function New-LocalEnv {
    $dbPort = if ($DatabasePort) { $DatabasePort } else { 5432 }
    $webPort = if ($AppPort) { $AppPort } else { 3000 }
    $dbPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
    $authSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $demoPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(20)).ToLowerInvariant()
    $contents = [IO.File]::ReadAllText((Join-Path $root '.env.example'))
    $contents = $contents.Replace('replace-with-a-local-password', $dbPassword).
        Replace('replace-with-openssl-rand-base64-32', $authSecret).
        Replace('# SLATE_DEMO_PASSWORD=replace-with-a-local-demo-password', "SLATE_DEMO_PASSWORD=$demoPassword").
        Replace('127.0.0.1:5432/slate_demo', "127.0.0.1:$dbPort/slate_demo").
        Replace('DB_PORT=5432', "DB_PORT=$dbPort").
        Replace('http://localhost:3000', "http://localhost:$webPort")
    $file = [IO.File]::Open($dotenv, 'CreateNew', 'Write', 'None')
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($contents)
        $file.Write($bytes, 0, $bytes.Length)
    } finally { $file.Dispose() }
    Write-Host 'Created .env with local credentials. The demo password is in .env.'
}

function Show-Addresses($Config) {
    Write-Host "Slate:    $($Config.origin)"
    Write-Host "Health:   $($Config.origin)/api/v1/health"
    Write-Host "OpenAPI:  $($Config.origin)/api/v1/doc"
    Write-Host 'Demo accounts: owner@demo.invalid, contractor@demo.invalid, engineer@demo.invalid'
}

$process = $null
$activeWritten = $false
Push-Location -LiteralPath $root
try {
    if ($Stop) {
        if (!$token) {
            Write-Host 'No active launcher session in this checkout. Existing services were left running.'
            return
        }
        Write-Host 'Stopped the application managed by this launcher.'
        Stop-SessionDatabase $sessionDatabaseId $sessionDatabaseStartedAt
        return
    }

    # A previous process may have exited without clearing its session marker.
    [IO.File]::WriteAllText($activePath, '')
    foreach ($tool in @('node', 'corepack')) {
        if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "Missing $tool. Install Node 24 with Corepack, open a new PowerShell window, and retry."
        }
    }
    $nodeVersion = node --version
    if ($LASTEXITCODE -or $nodeVersion -notmatch '^v(2[2-6])\.') { throw 'Use Node 24 as pinned in .nvmrc.' }
    Assert-Docker

    if (!(Test-Path -LiteralPath $dotenv)) { New-LocalEnv }

    $readConfiguration = @"
const env = process.env;
try {
    const url = new URL(env.DATABASE_URL);
    const origin = new URL(env.BETTER_AUTH_URL);
    const database = url.pathname.slice(1);
    const port = Number(env.DB_PORT || '5432');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        decodeURIComponent(url.username) !== 'slate' || !url.password || url.hash || url.search ||
        !/^slate_demo(?:_[a-zA-Z0-9_-]+)?$/.test(database) ||
        database !== env.SLATE_MIGRATION_DATABASE || database !== (env.POSTGRES_DB || 'slate_demo') ||
        Number(url.port || '5432') !== port || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error();
    }
    if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) ||
        origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
        throw new Error();
    }
    if (!env.POSTGRES_PASSWORD || env.POSTGRES_PASSWORD.startsWith('replace-with-') ||
        !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 ||
        env.BETTER_AUTH_SECRET.startsWith('replace-with-') ||
        !['0', '1'].includes(env.NEXT_PUBLIC_USE_MOCKS || '0')) {
        throw new Error();
    }
    console.log(JSON.stringify({
        origin: origin.origin, appPort: Number(origin.port || '80'), dbPort: port, database,
        mocks: env.NEXT_PUBLIC_USE_MOCKS === '1',
        // Pass the exact validated values to every child, even when its dotenv loader differs.
        pinnedEnv: {
            DATABASE_URL: env.DATABASE_URL,
            SLATE_MIGRATION_DATABASE: database,
            POSTGRES_DB: database,
            POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
            DB_PORT: String(port),
            BETTER_AUTH_URL: origin.origin,
            BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
            SLATE_DEMO_PASSWORD: env.SLATE_DEMO_PASSWORD || '',
        },
        seedReady: !!env.SLATE_DEMO_PASSWORD && env.SLATE_DEMO_PASSWORD.length >= 12 &&
            env.SLATE_DEMO_PASSWORD.length <= 64 && !env.SLATE_DEMO_PASSWORD.startsWith('replace-with-'),
    }));
} catch { process.exitCode = 1; }
"@
    $configJson = $readConfiguration | node --env-file=.env - 2>$null
    if ($LASTEXITCODE) {
        throw 'Check .env: use the matching local Compose slate_demo database, migration name and DB_PORT, a loopback HTTP auth origin, and valid local credentials.'
    }
    try { $config = $configJson | ConvertFrom-Json }
    catch { throw 'Could not read the launcher configuration from Node.' }
    foreach ($setting in $config.pinnedEnv.PSObject.Properties) {
        Set-LauncherEnv $setting.Name $setting.Value
    }
    if (($AppPort -and $AppPort -ne $config.appPort) -or ($DatabasePort -and $DatabasePort -ne $config.dbPort)) {
        throw 'Port options initialize a new .env. Update your existing .env manually to change ports.'
    }
    if ($config.appPort -eq $config.dbPort) { throw 'The app and database require different ports.' }
    if (Test-PortInUse $config.appPort) {
        throw "Application port $($config.appPort) is already in use. Stop its current listener yourself or configure another BETTER_AUTH_URL."
    }

    if ($Seed -and !$config.seedReady) {
        throw 'Set SLATE_DEMO_PASSWORD in .env to a local password of 12–64 characters before using -Seed.'
    }

    $database = Get-OwnedDatabase
    if ($database -and $database.Port -ne $config.dbPort) {
        throw 'DB_PORT differs from the port of the checkout-owned PostgreSQL container. Restore the original port in .env before continuing.'
    }
    if ((!$database -or !$database.Running) -and (Test-PortInUse $config.dbPort)) {
        throw "Database port $($config.dbPort) is in use. Free it manually or update DB_PORT and DATABASE_URL together."
    }
    if (!$database) { Assert-DatabaseDirectoryAvailable }
    $null = Get-LocalDirectory (Join-Path $cache 'postgres')
    $store = Get-LocalDirectory (Join-Path $cache 'pnpm-store')
    Set-LauncherEnv 'COREPACK_HOME' (Get-LocalDirectory (Join-Path $cache 'corepack'))
    Set-LauncherEnv 'npm_config_cache' (Get-LocalDirectory (Join-Path $cache 'npm'))
    Set-LauncherEnv 'npm_config_cache_dir' (Get-LocalDirectory (Join-Path $cache 'pnpm-cache'))
    Set-LauncherEnv 'npm_config_state_dir' (Get-LocalDirectory (Join-Path $cache 'pnpm-state'))
    Set-LauncherEnv 'PNPM_HOME' (Get-LocalDirectory (Join-Path $cache 'pnpm-home'))
    Set-LauncherEnv 'TEMP' (Get-LocalDirectory (Join-Path $cache 'tmp'))
    Set-LauncherEnv 'TMP' $env:TEMP
    Set-LauncherEnv 'NEXT_TELEMETRY_DISABLED' '1'
    Set-LauncherEnv 'NODE_ENV' 'development'
    $pinned = (Get-Content package.json -Raw | ConvertFrom-Json).packageManager -replace '^pnpm@', ''
    $version = corepack pnpm --version
    if ($LASTEXITCODE -or $version -ne $pinned) { throw "Corepack could not run pinned pnpm $pinned. Check network access and retry." }

    $hash = ((Get-FileHash pnpm-lock.yaml, package.json, pnpm-workspace.yaml).Hash -join ':') + ":$nodeVersion"
    $dependencyStamp = Join-Path $state 'dependencies'
    if (!(Test-Path node_modules/next/dist/bin/next) -or !(Test-Path node_modules/.bin/drizzle-kit.cmd) -or
        (Get-Content -LiteralPath $dependencyStamp -Raw -ErrorAction SilentlyContinue) -ne $hash) {
        corepack pnpm install --frozen-lockfile --store-dir $store
        if ($LASTEXITCODE) { throw 'Locked dependency installation failed. Check the pnpm output and retry.' }
        [IO.File]::WriteAllText($dependencyStamp, $hash)
    }

    $startedDatabase = $null
    if (!$database -or !$database.Running) {
        Invoke-Compose up -d --no-recreate db
        if ($LASTEXITCODE) { throw 'PostgreSQL startup failed. Inspect the Slate Compose service and port configuration.' }
        $database = Get-OwnedDatabase
        $startedDatabase = $database
    }
    if (!$database -or !$database.Running) { throw 'The checkout-owned PostgreSQL container is not running.' }

    $identity = $null
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        $healthStatus = docker inspect --format '{{.State.Status}}:{{.State.Health.Status}}' $database.Id 2>$null
        if ($LASTEXITCODE -or $healthStatus -match '^(exited|dead):|:unhealthy$') { break }
        if ($healthStatus -eq 'running:healthy') {
            # PostgreSQL init briefly starts a socket-only server. Wait for the final TCP listener.
            docker exec $database.Id pg_isready -h 127.0.0.1 -p 5432 -U slate -d $config.database *> $null
            if (!$LASTEXITCODE) {
                $identity = docker exec $database.Id psql -XAt -v ON_ERROR_STOP=1 -U slate -d $config.database -c 'select system_identifier from pg_control_system()' 2>$null
                if (!$LASTEXITCODE -and $identity -match '^\d+$') { break }
            }
        }
        $identity = $null
        Start-Sleep -Seconds 2
    }
    if (!$identity) {
        throw 'PostgreSQL did not become healthy with the configured database. Check the Compose logs and POSTGRES_DB before retrying.'
    }


    # Use the app's actual URL for the probe and compare its cluster to the owned container.
    $databaseState = node scripts/verify-demo-db.mjs $identity 2>$null
    if ($LASTEXITCODE -or $databaseState -notin @('fresh', 'existing')) {
        throw 'Database verification failed. Check DATABASE_URL credentials and confirm this database is empty or has Slate migration history matching this checkout.'
    }

    Write-Host "Verified local PostgreSQL database $($config.database). Applying pending migrations."
    corepack pnpm db:migrate *> $null
    if ($LASTEXITCODE) { throw 'Migration failed. Check the local migration history and database configuration before retrying.' }
    if ($Seed -or ($databaseState -eq 'fresh' -and $config.seedReady)) {
        Set-LauncherEnv 'SLATE_DEMO_SEED' '1'
        Write-Host 'Preparing synthetic demo accounts and fixtures.'
        corepack pnpm db:seed *> $null
        if ($LASTEXITCODE) { throw 'Demo seed failed. Check .env and the local database, then retry with -Seed.' }
    } elseif ($databaseState -eq 'fresh') {
        Write-Host 'Set SLATE_DEMO_PASSWORD in .env and run with -Seed to provision demo accounts.'
    }

    if (Test-PortInUse $config.appPort) { throw 'The application port became occupied during setup.' }
    $mocks = if ($Prototype) { '1' } elseif ($Live) { '0' } elseif ($config.mocks) { '1' } else { '0' }
    Set-LauncherEnv 'NEXT_PUBLIC_USE_MOCKS' $mocks
    # Match the database validation even if Next reads additional dotenv files.
    $child = [Diagnostics.ProcessStartInfo]::new()
    $child.FileName = (Get-Command node).Source
    $child.WorkingDirectory = $root
    $child.UseShellExecute = $false
    $app = "process.loadEnvFile(); process.execArgv.length = 0; require('next/dist/bin/next')"
    foreach ($arg in @('-e', $app, '--', 'next', 'dev', '--hostname', '127.0.0.1', '--port', "$($config.appPort)")) {
        $child.ArgumentList.Add($arg)
    }
    $token = [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($activePath, "$token|$project|$($startedDatabase.Id)|$($startedDatabase.StartedAt)")
    $activeWritten = $true
    Write-Host 'Starting the Next.js development server. Waiting for application and database health.'
    $process = [Diagnostics.Process]::Start($child)
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    $ready = $false
    while (!$process.HasExited -and $deadline.Elapsed.TotalSeconds -lt 90) {
        if ((Get-Content -LiteralPath $stopPath -Raw -ErrorAction SilentlyContinue) -eq $token) { return }
        if (Test-AppListener $process $config.appPort) {
            try {
                $health = Invoke-RestMethod "$($config.origin)/api/v1/health" -NoProxy -MaximumRedirection 0 -TimeoutSec 4
                $ready = $health.ok -eq $true -and $health.db -eq 'up'
            } catch { $ready = $false }
            if ($ready) { break }
            $ready = $false
        }
        Start-Sleep -Milliseconds 350
    }
    if (!$ready) {
        if ($process.HasExited) { throw "Next.js exited before becoming healthy (code $($process.ExitCode))." }
        throw 'Slate did not report healthy application and database status within 90 seconds.'
    }
    Write-Host 'Slate is ready. Application health confirmed PostgreSQL is up.'
    Show-Addresses $config
    if ($mocks -eq '1') { Write-Host 'Prototype mode. Frontend mocks are enabled.' }
    else { Write-Host 'Live mode. The frontend uses the real API.' }
    Write-Host 'Use stop.ps1 from another terminal to stop this launcher session, or press Ctrl+C to exit the app.'
    while (!$process.WaitForExit(350)) {
        if ((Get-Content -LiteralPath $stopPath -Raw -ErrorAction SilentlyContinue) -eq $token) { return }
    }
    if ($process.ExitCode) { throw "The Next.js development server exited with code $($process.ExitCode)." }
} finally {
    if ($process) {
        if (!$process.HasExited) {
            try { $process.Kill($true); $process.WaitForExit() }
            catch [InvalidOperationException] { if (!$process.HasExited) { throw } }
        }
        $process.Dispose()
    }
    if ($activeWritten) { [IO.File]::WriteAllText($activePath, '') }
    foreach ($key in $originalEnv.Keys) {
        [Environment]::SetEnvironmentVariable($key, $originalEnv[$key], 'Process')
    }
    Pop-Location
    $gate.Dispose()
}
