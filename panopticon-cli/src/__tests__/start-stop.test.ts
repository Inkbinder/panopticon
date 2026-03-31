import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// These are reassigned in beforeEach; the module mocks will always point at the latest functions.
import type { MockInstance } from "vitest";

let startDaemon: MockInstance;
let stopDaemon: MockInstance;

vi.mock("../lib/daemon-client", async () => {
	return {
		startDaemon: (...args: any[]) => (startDaemon as any)(...args),
		stopDaemon: (...args: any[]) => (stopDaemon as any)(...args),
	};
});

describe("start/stop", () => {
	const realEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...realEnv };
		startDaemon = vi.fn().mockResolvedValue(undefined);
		stopDaemon = vi.fn().mockResolvedValue(undefined);
	});

	afterEach(() => {
		process.env = realEnv;
	});

	it("panopticon start calls startDaemon with dev/timeout", async () => {
		const { registerStartStop } = await import("../commands/start-stop");
		const { Command } = await import("commander");
		const program = new Command();
		program.exitOverride();
		registerStartStop(program);
		await program.parseAsync(["node", "panopticon", "start", "--dev", "--timeout", "1234"]);
		expect(startDaemon).toHaveBeenCalledWith({ dev: true, timeoutMs: 1234 });
	});

	it("panopticon stop calls stopDaemon with timeout", async () => {
		const { registerStartStop } = await import("../commands/start-stop");
		const { Command } = await import("commander");
		const program = new Command();
		program.exitOverride();
		registerStartStop(program);
		await program.parseAsync(["node", "panopticon", "stop", "--timeout", "222"]);
		expect(stopDaemon).toHaveBeenCalledWith({ timeoutMs: 222 });
	});

	it("panopticon start/stop propagate errors", async () => {
		startDaemon.mockRejectedValueOnce(new Error("boom"));
		const { registerStartStop } = await import("../commands/start-stop");
		const { Command } = await import("commander");
		const program = new Command();
		program.exitOverride();
		registerStartStop(program);
		await expect(program.parseAsync(["node", "panopticon", "start"])).rejects.toThrow(/boom/);
	});

	// Note: start/stop lifecycle is now daemon-based; per-process pid supervision is handled by panopticon-daemon.
});
