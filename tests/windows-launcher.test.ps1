#requires -Version 7.2
param(
    [Parameter(Mandatory)][ValidatePattern('^slate-launcher-(check|test-[a-z0-9-]+)$')][string]$Project,
    [Parameter(Mandatory)][ValidateRange(1024, 65535)][int]$AppPort
)

# Run only in a dedicated worktree with a previously initialized, disposable database.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
$dockerId = docker ps -aq --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.service=db'
if ($LASTEXITCODE -or @($dockerId).Count -ne 1 -or !$dockerId) { throw 'Prepare one isolated launcher database first.' }
$owner = docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' $dockerId
if ($LASTEXITCODE -or $owner -ine "$root|$(Join-Path $root '.cache/postgres')") {
    throw 'The requested database is outside this test checkout.'
}
if ($AppPort -ne (node "--env-file=$root/.env" -p 'new URL(process.env.BETTER_AUTH_URL).port')) {
    throw 'The application port must match the sandbox configuration.'
}
if ($AppPort -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) {
    throw 'The sandbox app port must be free before running launcher regressions.'
}
$cache = Join-Path $root '.cache'
$lock = Join-Path $cache 'windows-launcher/launcher.lock'
if (Test-Path -LiteralPath $lock) {
    try { [IO.File]::Open($lock, 'Open', 'Read', 'None').Dispose() }
    catch [IO.IOException] { throw 'The sandbox already has an active launcher.' }
}
$fixture = Join-Path $root '.env.development.local'
$oldProject = $env:SLATE_COMPOSE_PROJECT
$oldDatabaseUrl = $env:DATABASE_URL
$env:SLATE_COMPOSE_PROJECT = $Project
$fixtureCreated = $false
$startedManually = $false
$app = $null

function Start-TestProcess([string]$Name, [string[]]$Arguments) {
    $info = [Diagnostics.ProcessStartInfo]::new((Get-Command $Name).Source)
    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    [Diagnostics.Process]::Start($info)
}

try {
    $running = docker inspect --format '{{.State.Running}}' $dockerId
    if ($running -eq 'false') {
        docker start $dockerId | Out-Null
        if ($LASTEXITCODE) { throw 'Could not start the isolated test database.' }
        $startedManually = $true
    }
    $startedAt = docker inspect --format '{{.State.StartedAt}}' $dockerId
    $hashBefore = (Get-FileHash (Join-Path $root '.env')).Hash

    & (Join-Path $root 'stop.ps1')
    if ((docker inspect --format '{{.State.Running}}' $dockerId) -ne 'true') {
        throw 'Stop without an active launcher touched the independently managed database.'
    }
    $fake = Start-TestProcess 'node' @('-e', 'require("node:http").createServer((req,res)=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(req.url.endsWith("doc")?{info:{title:"Slate API"}}:{ok:true,db:"up"}))}).listen(Number(process.argv[1]),"127.0.0.1")', "$AppPort")
    try {
        $until = [DateTime]::UtcNow.AddSeconds(10)
        do {
            try { $null = Invoke-RestMethod "http://127.0.0.1:$AppPort/api/v1/health" -NoProxy -TimeoutSec 1; break }
            catch { Start-Sleep -Milliseconds 200 }
        } while ([DateTime]::UtcNow -lt $until -and !$fake.HasExited)
        if ([DateTime]::UtcNow -ge $until -or $fake.HasExited) { throw 'The test listener did not start.' }
        $message = & pwsh -NoProfile -File (Join-Path $root 'start.ps1') 2>&1 | Out-String
        if (!$LASTEXITCODE -or $message -notlike '*already in use*' -or $fake.HasExited) {
            throw 'The launcher should reject an occupied port even when the listener resembles Slate.'
        }
    } finally {
        if (!$fake.HasExited) { $fake.Kill(); $fake.WaitForExit() }
        $fake.Dispose()
    }

    $file = [IO.File]::Open($fixture, 'CreateNew', 'Write', 'None')
    $fixtureCreated = $true
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes("DATABASE_URL=postgres://slug:unusable@127.0.0.1:1/slate_demo`n")
        $file.Write($bytes, 0, $bytes.Length)
    } finally { $file.Dispose() }
    $stdout = Join-Path $cache 'launcher-regression.stdout.log'
    $stderr = Join-Path $cache 'launcher-regression.stderr.log'
    $launcher = Join-Path $root 'start.ps1'
    $app = Start-Process pwsh -ArgumentList @('-NoProfile', '-File', ('"' + $launcher + '"'), '-Live', '-Seed') -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    $until = [DateTime]::UtcNow.AddSeconds(110)
    do {
        Start-Sleep -Milliseconds 300
        $ready = Select-String -LiteralPath $stdout -SimpleMatch 'Slate is ready. Application health confirmed PostgreSQL is up.' -Quiet
    } while (!$ready -and !$app.HasExited -and [DateTime]::UtcNow -lt $until)
    if (!$ready) { throw "The app did not report readiness. Review launcher regression logs in $cache." }
    $health = Invoke-RestMethod "http://127.0.0.1:$AppPort/api/v1/health" -NoProxy -TimeoutSec 5
    if (!$health.ok -or $health.db -ne 'up') { throw 'The pinned database was not used by the app.' }
    & (Join-Path $root 'stop.ps1')
    if (!$app.WaitForExit(10000)) { throw 'The launcher app did not stop.' }
    if ((docker inspect --format '{{.State.Running}}|{{.State.StartedAt}}' $dockerId) -ne "true|$startedAt") {
        throw 'Stop interrupted the database that was already running before this launcher session.'
    }
    if ((Get-FileHash (Join-Path $root '.env')).Hash -ne $hashBefore) { throw 'The launcher changed .env.' }

    $env:DATABASE_URL = 'postgres://slate:unusable@192.0.2.1/slate_demo'
    $message = & pwsh -NoProfile -File (Join-Path $root 'start.ps1') 2>&1 | Out-String
    if (!$LASTEXITCODE -or $message -notlike '*matching local Compose*') { throw 'The process override was not validated.' }
    Write-Host 'Launcher regression checks passed.'
} finally {
    $env:DATABASE_URL = $oldDatabaseUrl
    if ($app -and !$app.HasExited) {
        & (Join-Path $root 'stop.ps1')
        if (!$app.WaitForExit(10000)) { throw 'The isolated test launcher did not exit.' }
    }
    if ($fixtureCreated) { Remove-Item -LiteralPath $fixture }
    if ($startedManually) { docker stop $dockerId | Out-Null }
    $env:SLATE_COMPOSE_PROJECT = $oldProject
}
