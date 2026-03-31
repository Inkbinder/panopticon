#!/usr/bin/env node

import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

type ManagedProcessName = "sentinel" | "watchtower" | "overseer";

type ProcState = {
  name: ManagedProcessName;
  label: string;
  pid: number;
  startedAt: string;
};

type DaemonStateFile = {
  version: 1;
  pid: number;
  port: number;
  token: string;
  startedAt: string;
};

function getRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js -> package root is ../.., monorepo root is ../../..
  return path.resolve(here, "../../.. ".trim());
}

function getDaemonPackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js -> package root is ..
  return path.resolve(here, ".. ".trim());
}

function getStateDir(explicitDir?: string): string {
  return explicitDir ?? process.env.PANOPTICON_STATE_DIR ?? path.join(os.homedir(), ".panopticon");
}

function getDaemonStatePath(explicitDir?: string): string {
  return path.join(getStateDir(explicitDir), "panopticon-daemon.json");
}

function writeDaemonState(state: DaemonStateFile, stateDir?: string) {
  const p = getDaemonStatePath(stateDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

function readDaemonState(stateDir?: string): DaemonStateFile | null {
  const p = getDaemonStatePath(stateDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as DaemonStateFile;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getManagedProcesses(): Array<{ name: ManagedProcessName; label: string; cwd: string; command: string; args: string[] }> {
  const repoRoot = getRepoRoot();
  const daemonRoot = getDaemonPackageRoot();
  const useDev = Boolean(process.env.PANOPTICON_DEV) || process.env.NODE_ENV === "development";

  if (useDev) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    return [
    { name: "sentinel", label: "sentinel", cwd: path.join(repoRoot, "sentinel"), command: npm, args: ["run", "dev"] },
    { name: "watchtower", label: "watchtower", cwd: path.join(repoRoot, "watchtower"), command: npm, args: ["run", "dev"] },
    { name: "overseer", label: "overseer", cwd: path.join(repoRoot, "overseer"), command: npm, args: ["run", "dev"] },
    ];
  }

  // Production: run bundled runtime shipped with this package.
  const runtimeRoot = path.join(daemonRoot, "runtime");

  return [
    {
      name: "sentinel",
      label: "sentinel",
    cwd: path.join(runtimeRoot, "sentinel"),
      command: process.execPath,
    args: [path.join(runtimeRoot, "sentinel", "index.js")],
    },
    {
      name: "watchtower",
      label: "watchtower",
    cwd: path.join(runtimeRoot, "watchtower"),
      command: process.execPath,
    args: [path.join(runtimeRoot, "watchtower", "dist-server", "server.js")],
    },
    {
      name: "overseer",
      label: "overseer",
    cwd: path.join(runtimeRoot, "overseer"),
      command: process.execPath,
    args: [path.join(runtimeRoot, "overseer", "index.js")],
    },
  ];
}

class PanopticonDaemon {
  private children = new Map<ManagedProcessName, { proc: ChildProcess; info: ProcState }>();
  private shuttingDown = false;

  constructor(
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly stateDir?: string,
  ) {}

  async start(): Promise<{ port: number }> {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(404);
          res.end();
          return;
        }

        // Very small auth: require token header for any privileged ops
        const auth = req.headers["x-panopticon-token"];
        const authed = typeof auth === "string" && crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(this.token));

        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (req.url === "/status") {
          if (!authed) {
            res.writeHead(401);
            res.end();
            return;
          }
          const procs = Array.from(this.children.values()).map((c) => ({ ...c.info }));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ pid: process.pid, procs }));
          return;
        }

        if (req.url === "/shutdown" && req.method === "POST") {
          if (!authed) {
            res.writeHead(401);
            res.end();
            return;
          }
          res.writeHead(202);
          res.end();
          void this.shutdown().finally(() => process.exit(0));
          return;
        }

        res.writeHead(404);
        res.end();
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });

    // Bind to ephemeral port on localhost
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("failed to bind daemon server");

    const port = addr.port;

    // State for CLI to find us
    writeDaemonState(
      {
        version: 1,
        pid: process.pid,
        port,
        token: this.token,
        startedAt: new Date().toISOString(),
      },
      this.stateDir,
    );

    // Start managed processes
    for (const p of getManagedProcesses()) {
      const child = this.spawnManaged(p.command, p.args, p.cwd);
      if (!child.pid) throw new Error(`${p.label}: failed to spawn`);

  const effectiveLabel = process.platform === "win32" ? `${p.label} (job)` : p.label;
  const info: ProcState = { name: p.name, label: effectiveLabel, pid: child.pid, startedAt: new Date().toISOString() };
      this.children.set(p.name, { proc: child, info });

      child.once("exit", (code, signal) => {
        // If any critical component exits unexpectedly, bring the whole daemon down.
        if (!this.shuttingDown) {
          // eslint-disable-next-line no-console
          console.error(`${p.label} exited unexpectedly (${code ?? "?"}${signal ? `, ${signal}` : ""}); shutting down daemon`);
          void this.shutdown().finally(() => process.exit(1));
        }
      });
    }

    const handleSignal = (sig: NodeJS.Signals) => {
      if (this.shuttingDown) return;
      // eslint-disable-next-line no-console
      console.log(`Received ${sig}. Stopping...`);
      void this.shutdown().finally(() => process.exit(0));
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    return { port };
  }

  private spawnManaged(command: string, args: string[], cwd: string): ChildProcess {
    // IMPORTANT: do not use detached. The daemon must remain the true parent.
    // On Windows, we rely on a Job Object (native helper) for kill-on-daemon-exit.
    if (process.platform === "win32") {
      return this.spawnWithWindowsJobObject(command, args, cwd);
    }

    return spawn(command, args, {
      cwd,
      env: { ...process.env },
      stdio: "inherit",
      shell: false,
      detached: false,
    });
  }

  private spawnWithWindowsJobObject(command: string, args: string[], cwd: string): ChildProcess {
    // On Windows, spawn a small helper that creates a Job Object with
    // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. The helper holds the job handle open,
    // so if the daemon dies, the OS kills all processes in the job.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const platArch = `${process.platform}-${process.arch}`;
  const helperExe = path.resolve(here, `../native/bin/${platArch}/spawn_job_win32.exe`);

    if (!fs.existsSync(helperExe)) {
      throw new Error(
  `Windows helper not found at ${helperExe}. Your install is missing the prebuilt helper for ${platArch}.`,
      );
    }

    // We keep stdio inherited so logs behave like today.
    // Note: PID reported by helper is printed to stdout, but we don't need it because
    // we track the helper process itself – killing helper closes job.
    return spawn(helperExe, ["--cwd", cwd, "--", command, ...args], {
      cwd,
      env: { ...process.env },
      stdio: "inherit",
      shell: false,
      detached: false,
      windowsHide: true,
    });
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    // Stop in reverse dependency order
    const order: ManagedProcessName[] = ["overseer", "watchtower", "sentinel"]; // best-guess; adjust if needed

    for (const name of order) {
      const entry = this.children.get(name);
      if (!entry) continue;
      await stopPid(entry.proc.pid ?? entry.info.pid, entry.info.label, this.timeoutMs);
    }

    this.children.clear();
    // Clear daemon state file if we still own it
    try {
      const existing = readDaemonState(this.stateDir);
      if (existing?.pid === process.pid) fs.rmSync(getDaemonStatePath(this.stateDir), { force: true });
    } catch {
      // ignore
    }
  }
}

async function stopPid(pid: number, label: string, timeoutMs: number): Promise<void> {
  if (!pid || !isPidRunning(pid)) return;

  // On Windows, SIGTERM is best-effort. We'll do a fallback to taskkill tree if needed.
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidRunning(pid)) return;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (process.platform === "win32") {
    try {
      // /T kills child processes; /F forces.
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      return;
    } catch {
      // fall through
    }
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`${label}: failed to kill PID ${pid}`);
  }
}

function parseArgs(argv: string[]) {
  const out: { timeoutMs: number; stateDir?: string; dev?: boolean } = { timeoutMs: 5000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--timeout" && argv[i + 1]) out.timeoutMs = Number(argv[++i]);
    if (a === "--state-dir" && argv[i + 1]) out.stateDir = argv[++i];
    if (a === "--dev") out.dev = true;
  }
  return out;
}

// If a daemon is already running, do nothing.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.dev) process.env.PANOPTICON_DEV = "1";

  const existing = readDaemonState(args.stateDir);
  if (existing?.pid && isPidRunning(existing.pid)) {
    // eslint-disable-next-line no-console
    console.log(`panopticon-daemon already running (PID ${existing.pid})`);
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const daemon = new PanopticonDaemon(token, args.timeoutMs, args.stateDir);
  const { port } = await daemon.start();

  // eslint-disable-next-line no-console
  console.log(`panopticon-daemon started (PID ${process.pid}, port ${port})`);

  // Keep alive
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise<void>(() => {});
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
