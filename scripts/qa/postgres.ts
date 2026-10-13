/**
 * Disposable local PostgreSQL for QA, created inside this project under .qa/postgres.
 * It never touches any other cluster on the machine.
 *
 *   npm run qa:db -- start   initialise (if needed), start on port 54329, create tidynest_cms_qa
 *   npm run qa:db -- stop    stop the server
 *   npm run qa:db -- destroy stop and delete all QA data
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const PORT = "54329";
const root = resolve(".qa/postgres");
const dataDir = join(root, "data");
const socketDir = join(root, "socket");
const logFile = join(root, "server.log");
const binDir = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@15/bin";
const bin = (name: string) => join(binDir, name);

export const QA_DATABASE_URL = `postgresql://qa@localhost:${PORT}/tidynest_cms_qa`;

function run(command: string, args: string[]) {
  try {
    return execFileSync(bin(command), args, {
      stdio: ["ignore", "pipe", "pipe"],
      // On macOS the postmaster refuses to start without a valid locale in the environment.
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    }).toString();
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`${command} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function isRunning(): boolean {
  try {
    run("pg_ctl", ["status", "-D", dataDir]);
    return true;
  } catch {
    return false;
  }
}

function start() {
  if (!existsSync(bin("initdb"))) throw new Error(`PostgreSQL binaries not found in ${binDir}. Set PG_BIN.`);
  mkdirSync(socketDir, { recursive: true });
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    run("initdb", ["-D", dataDir, "-U", "qa", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  }
  if (!isRunning()) {
    run("pg_ctl", [
      "start",
      "-D",
      dataDir,
      "-l",
      logFile,
      "-w",
      "-o",
      `-p ${PORT} -k ${socketDir} -c listen_addresses=localhost`,
    ]);
  }
  const exists = run("psql", [
    "-h",
    "localhost",
    "-p",
    PORT,
    "-U",
    "qa",
    "-d",
    "postgres",
    "-tAc",
    "select 1 from pg_database where datname = 'tidynest_cms_qa'",
  ]).trim();
  if (exists !== "1") run("createdb", ["-h", "localhost", "-p", PORT, "-U", "qa", "tidynest_cms_qa"]);
  console.log(`QA database running. DATABASE_URL=${QA_DATABASE_URL}`);
}

function stop() {
  if (isRunning()) run("pg_ctl", ["stop", "-D", dataDir, "-m", "fast", "-w"]);
  console.log("QA database stopped.");
}

const command = process.argv[2];
if (command === "start") start();
else if (command === "stop") stop();
else if (command === "destroy") {
  stop();
  rmSync(root, { recursive: true, force: true });
  console.log("QA database deleted.");
} else {
  console.error("Usage: npm run qa:db -- start|stop|destroy");
  process.exit(1);
}
