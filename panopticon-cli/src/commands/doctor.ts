import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { readPanopticonConfig } from "../lib/config";


export type DoctorCheck = {
	id: string;
	ok: boolean;
	message: string;
};

export function runDoctorChecks(opts?: { platform?: NodeJS.Platform }): DoctorCheck[] {
	const platform = opts?.platform ?? process.platform;
	const checks: DoctorCheck[] = [];

	checks.push({ id: "node", ok: true, message: `node ${process.version}` });

	// Ensure we can find and parse panopticon.yaml in the directory the CLI is run from.
	try {
		const filePath = path.join(process.cwd(), "panopticon.yaml");
		if (!fs.existsSync(filePath)) {
			checks.push({ id: "config", ok: false, message: `Missing panopticon.yaml in ${process.cwd()}` });
		} else {
			readPanopticonConfig({ required: true });
			checks.push({ id: "config", ok: true, message: `Loaded panopticon.yaml from ${process.cwd()}` });
		}
	} catch (err) {
		checks.push({ id: "config", ok: false, message: String(err) });
	}

	if (platform === "win32") {
		checks.push({
			id: "platform",
			ok: false,
			message: "Windows is not supported. Use WSL2, a Linux VM, or a Linux dev container.",
		});
	}

	return checks;
}

export function registerDoctor(program: Command) {
	program
		.command("doctor")
		.description("Run diagnostics")
		.action(() => {
			const checks = runDoctorChecks();
			for (const c of checks) {
				// Keep output simple and greppable
				console.log(`${c.ok ? "OK" : "FAIL"} ${c.id}: ${c.message}`);
			}
			const anyFail = checks.some((c) => !c.ok);
			if (anyFail) process.exitCode = 1;
		});
}
