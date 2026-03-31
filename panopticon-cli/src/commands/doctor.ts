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
	return path.resolve(here, "../../.. ".trim());
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
		// Prefer installed daemon package location.
		// Fallback to repo root (dev workspace) if resolution fails.
		let daemonRoot: string;
		try {
			daemonRoot = getInstalledDaemonRoot();
		} catch {
			daemonRoot = path.join(getRepoRoot(), "panopticon-daemon");
		}
		const platArch = `${platform}-${process.arch}`;
		const helperExe = path.join(daemonRoot, "native", "bin", platArch, "spawn_job_win32.exe");
		const helperExists = fs.existsSync(helperExe);
		checks.push({
			id: "win32-job-helper",
			ok: helperExists,
			message: helperExists
				? `Windows job helper present: ${helperExe}`
				: `Windows job helper missing for ${platArch}: ${helperExe}`,
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
