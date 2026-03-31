import type { Command } from "commander";
import { stopAll, superviseAll } from "../lib/process-manager.js";

export function registerStartStop(program: Command) {
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
			"\n\nEnvironment:\n  PANOPTICON_DEV=1            Same as --dev\n  PANOPTICON_STATE_DIR=path   Override pid/state directory\n",
		);

	program
		.command("stop")
		.description("Stop sentinel, watchtower, and overseer")
		.option("--timeout <ms>", "Grace period before SIGKILL", "5000")
		.action(async (opts: { timeout: string }) => {
			const timeoutMs = Number(opts.timeout);
			await stopAll({ timeoutMs });
		});
}
