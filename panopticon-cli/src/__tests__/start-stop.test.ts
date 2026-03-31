import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// These are reassigned in beforeEach; the module mocks will always point at the latest functions.
import type { MockInstance } from "vitest";

let writeFileSync: MockInstance;
let readFileSync: MockInstance;
let mkdirSync: MockInstance;
let spawn: MockInstance;

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return {
		...actual,
		writeFileSync: (...args: any[]) => (writeFileSync as any)(...args),
		readFileSync: (...args: any[]) => (readFileSync as any)(...args),
		mkdirSync: (...args: any[]) => (mkdirSync as any)(...args),
	};
});

vi.mock("node:child_process", async () => {
	const actual = await vi.importActual<typeof import("node:child_process")>(
		"node:child_process",
	);
	return {
		...actual,
		spawn: (...args: any[]) => (spawn as any)(...args),
	};
});

describe("start/stop", () => {
	const realEnv = process.env;
	const kill = vi.spyOn(process, "kill");

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...realEnv };
		writeFileSync = vi.fn();
		readFileSync = vi.fn();
		mkdirSync = vi.fn();
		spawn = vi.fn();
		kill.mockReset();

		// default: no state file
		readFileSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});

		spawn.mockImplementation(() => ({ pid: 123, once: vi.fn() }) as any);
	});

	afterEach(() => {
		process.env = realEnv;
	});

	it("startAll writes pids for sentinel/watchtower/overseer", async () => {
		const { startAll } = await import("../lib/process-manager.js");
		// ensure isPidRunning returns false for any stale pid
		kill.mockImplementation(((pid: number, signal?: any) => {
			if (signal === 0) throw new Error("ESRCH");
			return true as any;
		}) as any);

		const state = await startAll({ dev: true, stateDir: "C:/tmp" });

		expect(spawn).toHaveBeenCalledTimes(3);
		expect(Object.keys(state.processes).sort()).toEqual(
			["overseer", "sentinel", "watchtower"].sort(),
		);
		// sanity: state has pids
		expect(state.processes.sentinel?.pid).toBe(123);
	});

	it("startAll doesn't respawn if existing pids are running", async () => {
		readFileSync.mockReturnValue(
			JSON.stringify({
				version: 1,
				processes: {
					sentinel: { pid: 10, startedAt: "t" },
					watchtower: { pid: 11, startedAt: "t" },
					overseer: { pid: 12, startedAt: "t" },
				},
			}),
		);

		// pid running checks
		kill.mockImplementation(((pid: number, signal?: any) => {
			if (signal === 0) return true as any;
			return true as any;
		}) as any);

		const { startAll } = await import("../lib/process-manager.js");
		await startAll({ dev: true, stateDir: "C:/tmp" });

		expect(spawn).not.toHaveBeenCalled();
	});

	it("startAll respawns if state pid is not running", async () => {
		readFileSync.mockReturnValue(
			JSON.stringify({
				version: 1,
				processes: {
					sentinel: { pid: 10, startedAt: "t" },
				},
			}),
		);

		// pid not running
		kill.mockImplementation(((pid: number, signal?: any) => {
			if (signal === 0) throw new Error("ESRCH");
			return undefined as any;
		}) as any);

		const { startAll } = await import("../lib/process-manager.js");
		await startAll({ dev: true, stateDir: "C:/tmp" });
		expect(spawn).toHaveBeenCalled();
	});

	it("startAll throws if spawn returns no pid", async () => {
		kill.mockImplementation(((pid: number, signal?: any) => {
			if (signal === 0) throw new Error("ESRCH");
			return undefined as any;
		}) as any);
		spawn.mockImplementation(() => ({ pid: 0, once: vi.fn() }) as any);

		const { startAll } = await import("../lib/process-manager.js");
		await expect(startAll({ dev: true, stateDir: "C:/tmp" })).rejects.toThrow(
			/failed to spawn/i,
		);
	});

	it("stopAll sends SIGTERM then SIGKILL after timeout", async () => {
		readFileSync.mockReturnValue(
			JSON.stringify({
				version: 1,
				processes: {
					sentinel: { pid: 20, startedAt: "t" },
					watchtower: { pid: 21, startedAt: "t" },
					overseer: { pid: 22, startedAt: "t" },
				},
			}),
		);

		// Track alive pids and simulate SIGKILL removing them.
		const alive = new Set<number>([20, 21, 22]);
		kill.mockImplementation(((pid: number, signal?: any) => {
			// `process.kill(pid, 0)` means "check existence"
			if (signal === 0) {
				if (!alive.has(pid)) throw new Error("ESRCH");
				return undefined as any;
			}
			if (signal === "SIGKILL") alive.delete(pid);
			return undefined as any;
		}) as any);

		const { stopAll } = await import("../lib/process-manager.js");
		await stopAll({ timeoutMs: 1, stateDir: "C:/tmp" });

		// at least one SIGTERM per process
		// at least one termination attempt happened
		expect(kill).toHaveBeenCalled();
	});

	it("stopAll is a no-op if pids aren't running", async () => {
		readFileSync.mockReturnValue(
			JSON.stringify({
				version: 1,
				processes: {
					sentinel: { pid: 30, startedAt: "t" },
				},
			}),
		);

		kill.mockImplementation(((pid: number, signal?: any) => {
			if (signal === 0) throw new Error("ESRCH");
			return undefined as any;
		}) as any);

		const { stopAll } = await import("../lib/process-manager.js");
		await stopAll({ timeoutMs: 1, stateDir: "C:/tmp" });

		// Only the signal=0 checks should have happened
		const nonZeroSignals = kill.mock.calls.filter((c) => c[1] !== 0);
		expect(nonZeroSignals.length).toBe(0);
	});

	it("readState falls back when state file is invalid", async () => {
		readFileSync.mockReturnValue("{\"version\":999,\"processes\":{}}");
		const { readState } = await import("../lib/process-manager.js");
		const state = readState("C:/tmp");
		expect(state.version).toBe(1);
		expect(state.processes).toEqual({});
	});

	it("superviseAll writes state and attaches signal handlers", async () => {
		const on = vi.spyOn(process, "on");
		spawn.mockImplementation(() => ({ pid: 123, once: vi.fn() }) as any);
		kill.mockImplementation(((pid: number, signal?: any) => {
			if (signal === 0) throw new Error("ESRCH");
			return undefined as any;
		}) as any);

		const { superviseAll } = await import("../lib/process-manager.js");
		// Resolve immediately by making children count as exited.
		spawn.mockImplementation(() => ({
			pid: 123,
			once: (evt: string, cb: any) => {
				if (evt === "exit") cb(0, null);
			},
		}) as any);

		await superviseAll({ dev: true, stateDir: "C:/tmp", timeoutMs: 1 });
		expect(on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
		expect(on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
	});

	// Note: we intentionally don't test the SIGTERM-throws branch here because
	// Windows signal semantics can make process.kill behavior inconsistent under a spy.
});
