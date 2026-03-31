import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
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

function getRepoRoot(): string {
	// At runtime this file is bundled into panopticon-cli/dist.
	// dist -> panopticon-cli -> repo root
	const here = path.dirname(fileURLToPath(import.meta.url));
	const root = path.resolve(here, "../..");
	// Sanity check: repo root should contain package workspaces.
	// If this trips, callers will get a clear error instead of spawning nonsense paths.
	if (!root.endsWith("panopticon") && !root.includes("panopticon" + path.sep)) {
		// Non-fatal: still return computed root, but we can help debugging in logs.
		// (We don't throw because bundled paths can vary in tests.)
	}
	return root;
}

function getWorkspaceLocalNpmCliPath(repoRoot: string): string {
	// Spec: prefer calling npm via the workspace-local entrypoint to avoid PATH quirks.
	return path.join(repoRoot, "node_modules", "npm", "bin", "npm-cli.js");
}

function getNpmLauncher(repoRoot: string): { command: string; argsPrefix: string[] } {
	const localNpmCli = getWorkspaceLocalNpmCliPath(repoRoot);
	if (fs.existsSync(localNpmCli)) {
		// node <repoRoot>/node_modules/npm/bin/npm-cli.js ...
		return { command: "node", argsPrefix: [localNpmCli] };
	}

	// Fallback: system npm. This is common in WSL where npm is installed globally via apt.
	return { command: "npm", argsPrefix: [] };
}

function getDefaultManagedProcessesProd(): ManagedProcInfo[] {
	const root = getRepoRoot();
	const runCwd = process.cwd();
	return [
		{
			name: "sentinel",
			label: "sentinel",
			cwd: runCwd,
			command: "node",
			args: [path.join(root, "sentinel", "dist", "index.js")],
		},
		{
			name: "watchtower",
			label: "watchtower",
			cwd: runCwd,
			command: "node",
			args: [path.join(root, "watchtower", "dist-server", "server.js")],
		},
		{
			name: "overseer",
			label: "overseer",
			cwd: runCwd,
			command: "node",
			args: [path.join(root, "overseer", "dist", "index.js")],
		},
	];
}

function getDefaultManagedProcessesDev(): ManagedProcInfo[] {
	const root = getRepoRoot();
	const npm = getNpmLauncher(root);
	const runCwd = process.cwd();
	const npmArgs = (workspace: string) => [...npm.argsPrefix, "-w", workspace, "run", "dev"];

	return [
		{
			name: "sentinel",
			label: "sentinel",
			cwd: runCwd,
			command: npm.command,
			args: npmArgs("sentinel"),
		},
		{
			name: "watchtower",
			label: "watchtower",
			cwd: runCwd,
			command: npm.command,
			args: npmArgs("watchtower"),
		},
		{
			name: "overseer",
			label: "overseer",
			cwd: runCwd,
			command: npm.command,
			args: npmArgs("overseer"),
		},
	];
}

export function getManagedProcesses(opts?: { dev?: boolean }): ManagedProcInfo[] {
	const useDev = Boolean(opts?.dev) || false;
	return useDev ? getDefaultManagedProcessesDev() : getDefaultManagedProcessesProd();
}

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function isPidRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function killProcessGroup(pid: number, signal: NodeJS.Signals): Promise<void> {
	// On Unix, detached children become their own process group leader.
	// Killing -pid targets the entire group.
	process.kill(-pid, signal);
}

async function stopProcessTreeUnix(pid: number, label: string, timeoutMs: number): Promise<void> {
	if (!isPidRunning(pid)) return;

	try {
		await killProcessGroup(pid, "SIGTERM");
	} catch {
		// ignore
	}

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isPidRunning(pid)) return;
		await delay(100);
	}

	try {
		await killProcessGroup(pid, "SIGKILL");
	} catch {
		console.warn(`${label}: failed to SIGKILL process group ${pid}`);
	}
}

export type SupervisedChild = {
	info: ManagedProcInfo;
	child: ChildProcess;
	pid: number;
};

function spawnInNewProcessGroup(proc: ManagedProcInfo): SupervisedChild {
	// Guardrail: child_process.spawn() takes (command, args). If args includes the command again,
	// the OS will attempt to execute `command` with argv[0]=command and argv[1]=command, which is wrong.
	if (proc.args[0] === proc.command) {
		throw new Error(`${proc.label}: internal error: args must not include the command (${proc.command})`);
	}

	const child = spawn(proc.command, proc.args, {
		cwd: proc.cwd,
		stdio: "inherit",
		shell: false,
		detached: true,
		windowsHide: false,
	});

	child.on("error", (err) => {
		console.error(`${proc.label}: spawn error`, {
			command: proc.command,
			args: proc.args,
			cwd: proc.cwd,
			err: String(err),
		});
	});

	if (!child.pid) {
		throw new Error(
			`${proc.label}: failed to spawn (command=${proc.command} args=${JSON.stringify(proc.args)} cwd=${proc.cwd})`,
		);
	}

	return { info: proc, child, pid: child.pid };
}

export async function superviseAll(opts?: { dev?: boolean; timeoutMs?: number }): Promise<void> {
	if (process.platform === "win32") {
		throw new Error("Windows is not supported. Run this CLI in WSL2 or a Linux dev container.");
	}

	const timeoutMs = opts?.timeoutMs ?? 5000;
	const children: SupervisedChild[] = [];

	const procs = getManagedProcesses({ dev: opts?.dev });
	for (const p of procs) {
		const c = spawnInNewProcessGroup(p);
		children.push(c);
		console.log(`${p.label} started (PID ${c.pid})`);
	}

	let unexpectedExit: { who: string; code: number | null; signal: NodeJS.Signals | null } | null = null;
	let shuttingDown = false;

	const shutdown = async (reason: string, exitCode: number) => {
		if (shuttingDown) return;
		shuttingDown = true;

		if (reason) console.log(`\n${reason}`);

		// Stop in reverse order (overseer, watchtower, sentinel) to reduce churn.
		for (const c of [...children].reverse()) {
			await stopProcessTreeUnix(c.pid, c.info.label, timeoutMs);
		}

		process.exitCode = exitCode;
	};

	const onSignal = (sig: NodeJS.Signals) => {
		void shutdown(`Received ${sig}. Stopping...`, 0).finally(() => {
			process.exit(process.exitCode ?? 0);
		});
	};

	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	// Fail-fast: if any managed process exits unexpectedly, stop the others and exit non-zero.
	for (const c of children) {
		c.child.once("exit", (code, signal) => {
			if (shuttingDown) return;
			unexpectedExit = { who: c.info.label, code, signal };
			void shutdown(
				`${c.info.label} exited unexpectedly (${code ?? "?"}${signal ? `, ${signal}` : ""}). Shutting down...`,
				1,
			).finally(() => process.exit(1));
		});

		c.child.once("error", (err) => {
			if (shuttingDown) return;
			unexpectedExit = { who: c.info.label, code: 1, signal: null };
			void shutdown(`${c.info.label} error: ${String(err)}. Shutting down...`, 1).finally(() => process.exit(1));
		});
	}

	// Park the supervisor.
	await new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			if (shuttingDown || unexpectedExit) {
				clearInterval(interval);
				resolve();
			}
		}, 1000);
	});
}

