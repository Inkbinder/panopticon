import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export type DoctorCheck = {
	id: string;
	ok: boolean;
	message: string;
};

function getRepoRoot(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	// panopticon-cli/src/commands -> repo root is ../../..
	return path.resolve(here, "../../..");
}

function getInstalledDaemonRoot(): string {
	// Resolve where @inkbinder/panopticon-daemon is installed.
	// In a workspace this will point into the repo; in global installs it'll point into node_modules.
	const require = createRequire(import.meta.url);
	const pkgJson = require.resolve("@inkbinder/panopticon-daemon/package.json");
	return path.dirname(pkgJson);
}

export function runDoctorChecks(opts?: { platform?: NodeJS.Platform }): DoctorCheck[] {
	const platform = opts?.platform ?? process.platform;
	const checks: DoctorCheck[] = [];

	checks.push({ id: "node", ok: true, message: `node ${process.version}` });

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
