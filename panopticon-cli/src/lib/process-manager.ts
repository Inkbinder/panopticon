import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ManagedProcessName = "sentinel" | "watchtower" | "overseer";

export type ManagedProcInfo = {
	name: ManagedProcessName;
	label: string;
	cwd: string;
	command: string;
	args: string[];
};

function getDefaultManagedProcessesProd(): ManagedProcInfo[] {
	const root = getRepoRoot();
	return [
		{
			name: "sentinel",
			label: "sentinel",
			cwd: path.join(root, "sentinel"),
			command: process.execPath,
			args: [path.join(root, "sentinel", "dist", "index.js")],
		},
		{
			name: "watchtower",
			label: "watchtower",
			cwd: path.join(root, "watchtower"),
			command: process.execPath,
			args: [path.join(root, "watchtower", "dist-server", "server.js")],
		},
		{
			name: "overseer",
			label: "overseer",
			cwd: path.join(root, "overseer"),
			command: process.execPath,
			args: [path.join(root, "overseer", "dist", "index.js")],
		},
	];
}

function getDefaultManagedProcessesDev(): ManagedProcInfo[] {
	const root = getRepoRoot();
	// Keep dev mode using each workspace's dev script via npm, since this is for contributors.
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	return [
		{ name: "sentinel", label: "sentinel", cwd: path.join(root, "sentinel"), command: npm, args: ["run", "dev"] },
		{ name: "watchtower", label: "watchtower", cwd: path.join(root, "watchtower"), command: npm, args: ["run", "dev"] },
		{ name: "overseer", label: "overseer", cwd: path.join(root, "overseer"), command: npm, args: ["run", "dev"] },
	];
}

export type ProcState = {
	pid: number;
	startedAt: string;
};

export type StateFile = {
	version: 1;
	processes: Partial<Record<ManagedProcessName, ProcState>>;
};

function getRepoRoot(): string {
	// panopticon-cli/src/lib -> package root is ../.., monorepo root is ../../..
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "../../.. ".trim());
}

function getStateDir(explicitDir?: string): string {
	return explicitDir ?? process.env.PANOPTICON_STATE_DIR ?? path.join(os.homedir(), ".panopticon");
}

function getStatePath(explicitDir?: string): string {
	return path.join(getStateDir(explicitDir), "panopticon-cli-state.json");
}

export function readState(stateDir?: string): StateFile {
	const statePath = getStatePath(stateDir);
	try {
		const raw = fs.readFileSync(statePath, "utf8");
		const parsed = JSON.parse(raw) as StateFile;
		if (parsed?.version !== 1 || typeof parsed !== "object") throw new Error("invalid state version");
		return parsed;
	} catch {
		return { version: 1, processes: {} };
	}
}

export function writeState(state: StateFile, stateDir?: string) {
	const statePath = getStatePath(stateDir);
	fs.mkdirSync(path.dirname(statePath), { recursive: true });
	fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function getManagedProcesses(): ManagedProcInfo[] {
	const useDev = Boolean(process.env.PANOPTICON_DEV) || process.env.NODE_ENV === "development";
	return useDev ? getDefaultManagedProcessesDev() : getDefaultManagedProcessesProd();
}

export function isPidRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function stopPid(pid: number, label: string, timeoutMs: number): Promise<void> {
	if (!isPidRunning(pid)) return;

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

	try {
		process.kill(pid, "SIGKILL");
	} catch {
		console.warn(`${label}: failed to kill PID ${pid}`);
	}
}

export function startOneForeground(proc: ManagedProcInfo) {
	const child = spawn(proc.command, proc.args, {
		cwd: proc.cwd,
		stdio: "inherit",
		env: { ...process.env },
		shell: false,
		detached: false,
		windowsHide: false,
	});
	return child;
}

export async function startAll(opts?: { dev?: boolean; stateDir?: string }): Promise<StateFile> {
	if (opts?.dev) process.env.PANOPTICON_DEV = "1";
	const stateDir = opts?.stateDir;
	const state = readState(stateDir);
	const procs = getManagedProcesses();

	for (const p of procs) {
		const existing = state.processes[p.name];
		if (existing?.pid && isPidRunning(existing.pid)) continue;

		// startAll is used by tests; keep it pid-based, but do not detach.
		const child = startOneForeground(p);
		if (!child.pid) throw new Error(`${p.label}: failed to spawn`);
		state.processes[p.name] = { pid: child.pid, startedAt: new Date().toISOString() };
	}

	writeState(state, stateDir);
	return state;
}

export async function superviseAll(opts?: { dev?: boolean; stateDir?: string; timeoutMs?: number }): Promise<void> {
	if (opts?.dev) process.env.PANOPTICON_DEV = "1";
	const timeoutMs = opts?.timeoutMs ?? 5000;
	const stateDir = opts?.stateDir;
	const state = readState(stateDir);
	const procs = getManagedProcesses();

	const children: { name: ManagedProcessName; label: string; pid: number; child: ReturnType<typeof startOneForeground> }[] = [];

	for (const p of procs) {
		const existing = state.processes[p.name];
		if (existing?.pid && isPidRunning(existing.pid)) {
			console.log(`${p.label} already running (PID ${existing.pid})`);
			continue;
		}

		const child = startOneForeground(p);
		child.once("error", (err) => {
			console.error(`${p.label}: failed to start`, err);
		});
		if (!child.pid) throw new Error(`${p.label}: failed to spawn`);
		children.push({ name: p.name, label: p.label, pid: child.pid, child });
		state.processes[p.name] = { pid: child.pid, startedAt: new Date().toISOString() };
		console.log(`${p.label} started (PID ${child.pid})`);
	}

	writeState(state, stateDir);

	const shutdown = async () => {
		for (const c of children.slice().reverse()) {
			await stopPid(c.pid, c.label, timeoutMs);
		}
		// clear state
		const cleared = readState(stateDir);
		for (const c of children) delete cleared.processes[c.name];
		writeState(cleared, stateDir);
	};

	let shuttingDown = false;
	const handleSignal = (sig: NodeJS.Signals) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`\nReceived ${sig}. Stopping...`);
		void shutdown().finally(() => process.exit(0));
	};

	process.on("SIGINT", handleSignal);
	process.on("SIGTERM", handleSignal);

	await new Promise<void>((resolve) => {
		let exited = 0;
		for (const c of children) {
			c.child.once("exit", (code, signal) => {
				console.log(`${c.label} exited (${code ?? "?"}${signal ? `, ${signal}` : ""})`);
				exited++;
				if (exited >= children.length) resolve();
			});
		}
	});

	await shutdown();
}

export async function stopAll(opts?: { timeoutMs?: number; stateDir?: string }): Promise<StateFile> {
	const timeoutMs = opts?.timeoutMs ?? 5000;
	const stateDir = opts?.stateDir;
	const state = readState(stateDir);
	const procs = getManagedProcesses();

	for (const p of [...procs].reverse()) {
		const existing = state.processes[p.name];
		if (!existing?.pid) continue;
		await stopPid(existing.pid, p.label, timeoutMs);
		delete state.processes[p.name];
	}

	writeState(state, stateDir);
	return state;
}
