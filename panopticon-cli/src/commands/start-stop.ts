import type { Command } from "commander";
import { superviseAll } from "../lib/process-manager";

export function registerStartStop(program: Command) {
	if (process.platform === "win32") {
		program
			.command("start")
			.description("Start sentinel, watchtower, and overseer")
			.action(() => {
				throw new Error("Windows is not supported. Run this CLI in WSL2 or a Linux dev container.");
			});

		program
			.command("stop")
			.description("Stop sentinel, watchtower, and overseer")
			.action(() => {
				throw new Error("Windows is not supported. Run this CLI in WSL2 or a Linux dev container.");
			});

		return;
	}

	program
		.command("start")
		.description("Start sentinel, watchtower, and overseer")
		.option("--dev", "Run in dev mode (uses each package's dev script)")
		.option("--timeout <ms>", "Grace period before SIGKILL on shutdown", "5000")
		.action(async (opts: { dev?: boolean; timeout: string }) => {
			await superviseAll({ dev: opts.dev, timeoutMs: Number(opts.timeout) });
		})
		.addHelpText(
			"after",
			"\n\nEnvironment:\n  PANOPTICON_DEV=1            Same as --dev\n",
		);
}
