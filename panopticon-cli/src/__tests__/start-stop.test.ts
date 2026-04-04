import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { MockedFunction } from "vitest";
import type { superviseAll as superviseAllFn } from "../lib/process-manager";

let superviseAll: MockedFunction<typeof superviseAllFn>;

vi.mock("../lib/process-manager", async () => {
	return {
		superviseAll: (...args: Parameters<typeof superviseAllFn>) => superviseAll(...args),
	};
});

describe("start/stop", () => {
	const realEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...realEnv };
		superviseAll = vi.fn().mockResolvedValue(undefined);
	});

	afterEach(() => {
		process.env = realEnv;
	});

	it("panopticon start calls superviseAll with dev/timeout", async () => {
		const { registerStartStop } = await import("../commands/start-stop");
		const { Command } = await import("commander");
		const program = new Command();
		program.exitOverride();
		registerStartStop(program);
		await program.parseAsync(["node", "panopticon", "start", "--dev", "--timeout", "1234"]);
		expect(superviseAll).toHaveBeenCalledWith({ dev: true, timeoutMs: 1234 });
	});

	it("panopticon start/stop propagate errors", async () => {
		superviseAll.mockRejectedValueOnce(new Error("boom"));
		const { registerStartStop } = await import("../commands/start-stop");
		const { Command } = await import("commander");
		const program = new Command();
		program.exitOverride();
		registerStartStop(program);
		await expect(program.parseAsync(["node", "panopticon", "start"])).rejects.toThrow(/boom/);
	});

	it("panopticon stop command is not registered", async () => {
		const { registerStartStop } = await import("../commands/start-stop");
		const { Command } = await import("commander");
		const program = new Command();
		program.exitOverride();
		registerStartStop(program);
		await expect(program.parseAsync(["node", "panopticon", "stop"])).rejects.toThrow();
	});
});
