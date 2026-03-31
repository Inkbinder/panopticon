import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type DaemonStateFile = {
  version: 1;
  pid: number;
  port: number;
  token: string;
  startedAt: string;
};

function getStateDir(explicitDir?: string): string {
  return explicitDir ?? process.env.PANOPTICON_STATE_DIR ?? path.join(os.homedir(), ".panopticon");
}

function getDaemonStatePath(explicitDir?: string): string {
  return path.join(getStateDir(explicitDir), "panopticon-daemon.json");
}

function readDaemonState(explicitDir?: string): DaemonStateFile | null {
  try {
    const raw = fs.readFileSync(getDaemonStatePath(explicitDir), "utf8");
    const parsed = JSON.parse(raw) as DaemonStateFile;
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

async function request(
  port: number,
  token: string,
  pathName: string,
  method: "GET" | "POST" = "GET",
): Promise<{ statusCode: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathName,
        method,
        headers: {
          "x-panopticon-token": token,
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function startDaemon(opts?: { dev?: boolean; timeoutMs?: number; stateDir?: string }): Promise<void> {
  if (opts?.dev) process.env.PANOPTICON_DEV = "1";

  const existing = readDaemonState(opts?.stateDir);
  if (existing?.pid && isPidRunning(existing.pid)) {
    // already running
    return;
  }

  // Start daemon in background (detached) and return.
  // The daemon itself will supervise children, and on Windows will use Job Objects for kill-on-daemon-exit.
  const daemonCmd = process.execPath;

  // Monorepo: panopticon-cli/src/lib -> repo root is ../../..
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.. ".trim());
  const daemonEntry = path.join(repoRoot, "panopticon-daemon", "dist", "index.js");

  const args: string[] = [daemonEntry];
  if (opts?.dev) args.push("--dev");
  if (opts?.timeoutMs != null) args.push("--timeout", String(opts.timeoutMs));
  if (opts?.stateDir) args.push("--state-dir", opts.stateDir);

  const child = spawn(daemonCmd, args, {
    stdio: "ignore",
    detached: true,
    windowsHide: true,
    env: { ...process.env },
  });

  child.unref();

  // Wait briefly for state file to appear (daemon writes it after binding port)
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const s = readDaemonState(opts?.stateDir);
    if (s?.pid && isPidRunning(s.pid)) return;
    await new Promise((r) => setTimeout(r, 100));
  }

  // If it failed to come up, surface a helpful error
  throw new Error("panopticon-daemon failed to start (no state file found)");
}

export async function stopDaemon(opts?: { timeoutMs?: number; stateDir?: string }): Promise<void> {
  const state = readDaemonState(opts?.stateDir);
  if (!state) return;

  if (!isPidRunning(state.pid)) {
    // stale state
    try {
      fs.rmSync(getDaemonStatePath(opts?.stateDir), { force: true });
    } catch {
      // ignore
    }
    return;
  }

  await request(state.port, state.token, "/shutdown", "POST");

  const deadline = Date.now() + (opts?.timeoutMs ?? 5000);
  while (Date.now() < deadline) {
    if (!isPidRunning(state.pid)) return;
    await new Promise((r) => setTimeout(r, 100));
  }

  // Fall back to hard kill (best effort); Windows will also have job object killing children.
  try {
    process.kill(state.pid, "SIGKILL");
  } catch {
    // ignore
  }
}
