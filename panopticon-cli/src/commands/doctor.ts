import type { Command } from "commander";

export function registerDoctor(program: Command) {
	program
		.command("doctor")
		.description("Run diagnostics")
		.action(() => {
			console.log("The doctor is on call");
		});
}
