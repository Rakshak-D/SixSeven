import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";

const env = { ...process.env };
const root = process.cwd();
const project = env.SLATE_COMPOSE_PROJECT || "slate";
const composeFile = resolve("docker-compose.yml");

function run(tool, args, capture = true) {
  const result = spawnSync(tool, args, {
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0) throw new Error(`${tool} failed during ${args[0]}.`);
  return result.stdout?.trim();
}

function localDirectory(path) {
  if (!existsSync(path)) mkdirSync(path);
  if (!lstatSync(path).isDirectory()) throw new Error(`Expected a local directory at ${path}.`);
  return resolve(path);
}

async function requireFreePort(port) {
  const server = createServer();
  try {
    await new Promise((ready, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", ready);
    });
  } catch {
    throw new Error(`Port ${port} is unavailable. Configure an unused port in .env.`);
  } finally {
    if (server.listening) await new Promise((done) => server.close(done));
  }
}

function requireLocalDocker() {
  try {
    run("docker", ["compose", "version"]);
    const socket =
      env.DOCKER_HOST && !env.DOCKER_CONTEXT
        ? env.DOCKER_HOST
        : run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
    if (!socket?.startsWith("unix:///")) throw new Error();
    if (run("docker", ["info", "--format", "{{.OSType}}"]) !== "linux") throw new Error();
  } catch {
    throw new Error(
      "Start a local Docker Engine with Compose v2 and select its Unix socket context.",
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: { live: { type: "boolean" }, seed: { type: "boolean" } },
  });
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw new Error("Invalid SLATE_COMPOSE_PROJECT.");
  try {
    run("corepack", ["--version"]);
  } catch {
    throw new Error("Install Corepack for Node 24, then retry.");
  }

  requireLocalDocker();

  if (!existsSync(".env")) {
    const secret = () => randomBytes(32).toString("hex");
    const password = secret();
    const example = readFileSync(".env.example", "utf8")
      .replaceAll("replace-with-a-local-password", password)
      .replace("replace-with-openssl-rand-base64-32", secret())
      .replace(
        "# SLATE_DEMO_PASSWORD=replace-with-a-local-demo-password",
        `SLATE_DEMO_PASSWORD=${secret()}`,
      )
      .replace(/^NEXT_PUBLIC_USE_MOCKS=1$/m, "NEXT_PUBLIC_USE_MOCKS=0");
    writeFileSync(".env", example, { flag: "wx", mode: 0o600 });
    console.log("Created .env with local credentials. The demo password is stored there.");
  }
  process.loadEnvFile(".env");
  Object.assign(env, process.env);
  requireLocalDocker();

  let url;
  let origin;
  try {
    url = new URL(env.DATABASE_URL);
    origin = new URL(env.BETTER_AUTH_URL);
  } catch {
    throw new Error("Set valid DATABASE_URL and BETTER_AUTH_URL values in .env.");
  }
  const local = (hostname) => ["127.0.0.1", "localhost"].includes(hostname);
  const db = url.pathname.slice(1);
  const dbPort = Number(env.DB_PORT || "5432");
  const appPort = Number(origin.port || "80");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !local(url.hostname) ||
    url.username !== "slate" ||
    !url.password ||
    url.search ||
    url.hash ||
    !/^slate_demo(?:_[a-zA-Z0-9_-]+)?$/.test(db) ||
    db !== env.SLATE_MIGRATION_DATABASE ||
    db !== (env.POSTGRES_DB || "slate_demo") ||
    dbPort !== Number(url.port || "5432") ||
    origin.protocol !== "http:" ||
    !local(origin.hostname) ||
    origin.pathname !== "/" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    appPort === dbPort ||
    !env.POSTGRES_PASSWORD ||
    env.POSTGRES_PASSWORD.startsWith("replace-with-") ||
    !env.BETTER_AUTH_SECRET ||
    env.BETTER_AUTH_SECRET.length < 32 ||
    env.BETTER_AUTH_SECRET.startsWith("replace-with-")
  ) {
    throw new Error(
      "Use matching local Compose database settings, a loopback HTTP origin, and local credentials in .env.",
    );
  }

  Object.assign(env, {
    DATABASE_URL: url.href,
    BETTER_AUTH_URL: origin.origin,
    POSTGRES_DB: db,
    DB_PORT: String(dbPort),
    NEXT_PUBLIC_USE_MOCKS: "0",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "development",
    SLATE_DEMO_SEED: "0",
  });
  const seedReady =
    /^.{12,64}$/.test(env.SLATE_DEMO_PASSWORD ?? "") &&
    !env.SLATE_DEMO_PASSWORD.startsWith("replace-with-");
  if (values.seed && !seedReady)
    throw new Error("Set a local SLATE_DEMO_PASSWORD of 12–64 characters.");

  await requireFreePort(appPort);
  const cache = localDirectory(".cache");
  const data = localDirectory(".cache/postgres");
  const temp = localDirectory(".cache/tmp");
  Object.assign(env, {
    COREPACK_HOME: resolve(cache, "corepack"),
    npm_config_cache: resolve(cache, "npm"),
    npm_config_cache_dir: resolve(cache, "pnpm-cache"),
    npm_config_state_dir: resolve(cache, "pnpm-state"),
    PNPM_HOME: resolve(cache, "pnpm-home"),
    TMPDIR: temp,
    TEMP: temp,
    TMP: temp,
  });
  const compose = (...args) =>
    run("docker", [
      "compose",
      "--project-directory",
      root,
      "--project-name",
      project,
      "--file",
      composeFile,
      "--env-file",
      ".env",
      ...args,
    ]);
  const inspect = (id) => JSON.parse(run("docker", ["inspect", id]))[0];
  const findDatabase = () => {
    const output = run("docker", [
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      "label=com.docker.compose.service=db",
    ]);
    if (!output) return null;
    const ids = output.split(/\s+/);
    if (ids.length !== 1) throw new Error("More than one database matches this Compose project.");
    const container = inspect(ids[0]);
    const labels = container.Config.Labels;
    const mount = container.Mounts.find((item) => item.Destination === "/var/lib/postgresql/data");
    const ports = container.HostConfig.PortBindings?.["5432/tcp"];
    if (
      labels["com.docker.compose.project.working_dir"] !== root ||
      labels["com.docker.compose.project.config_files"] !== composeFile ||
      mount?.Type !== "bind" ||
      mount.Source !== data ||
      ports?.length !== 1 ||
      ports[0].HostIp !== "127.0.0.1" ||
      Number(ports[0].HostPort) !== dbPort
    )
      throw new Error(
        "Compose project or PostgreSQL mount belongs to another configuration. Use a separate project name and ports.",
      );
    return container;
  };
  let container = findDatabase();
  if (!container) {
    const mounted = run("docker", ["ps", "-aq", "--filter", "volume=/var/lib/postgresql/data"]);
    const mountedIds = mounted ? mounted.split(/\s+/) : [];
    if (mountedIds.some((id) => inspect(id).Mounts.some((mount) => mount.Source === data))) {
      throw new Error("Another container already owns this checkout's PostgreSQL data directory.");
    }
  }
  if (!container?.State.Running) await requireFreePort(dbPort);

  const expected = JSON.parse(readFileSync("package.json", "utf8")).packageManager;
  const pnpm = (...args) => run("corepack", ["pnpm", ...args], false);
  if (`pnpm@${run("corepack", ["pnpm", "--version"])}` !== expected)
    throw new Error(`Expected ${expected} via Corepack.`);
  pnpm("install", "--frozen-lockfile", "--store-dir", resolve(cache, "pnpm-store"));

  if (!container?.State.Running) {
    compose("up", "-d", "--no-recreate", "db");
    container = findDatabase();
  }
  if (!container?.State.Running)
    throw new Error("The checkout's PostgreSQL container did not start.");
  const id = container.Id;
  let identity;
  for (let attempt = 0; attempt < 45; attempt++) {
    const status = inspect(id).State;
    if (!status.Running || status.Health?.Status === "unhealthy") break;
    if (status.Health?.Status === "healthy") {
      try {
        run("docker", ["exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "slate", "-d", db]);
        identity = run("docker", [
          "exec",
          id,
          "psql",
          "-XAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "slate",
          "-d",
          db,
          "-c",
          "select system_identifier from pg_control_system()",
        ]);
        if (/^\d+$/.test(identity)) break;
      } catch {
        identity = undefined;
      }
    }
    await setTimeout(2000);
  }
  if (!identity || !/^\d+$/.test(identity))
    throw new Error("PostgreSQL did not become healthy. Inspect the Compose database logs.");
  const state = run(process.execPath, ["scripts/verify-demo-db.mjs", identity]);
  if (state !== "fresh" && state !== "existing")
    throw new Error("The database identity or Slate migration history could not be verified.");
  run("corepack", ["pnpm", "db:migrate"]);
  if (values.seed || (state === "fresh" && seedReady)) {
    env.SLATE_DEMO_SEED = "1";
    run("corepack", ["pnpm", "db:seed"]);
    env.SLATE_DEMO_SEED = "0";
    console.log("Demo data is ready.");
  }
  await requireFreePort(appPort);
  console.log(`Starting Slate in live mode at ${origin.origin}.`);
  console.log(`Health: ${origin.origin}/api/v1/health · OpenAPI: ${origin.origin}/api/v1/doc`);
  console.log("Demo users: owner@demo.invalid, contractor@demo.invalid, engineer@demo.invalid");
  const appArgs = [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ];
  if (typeof process.execve === "function")
    process.execve(process.execPath, [process.execPath, ...appArgs], env);
  run(process.execPath, appArgs, false);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
