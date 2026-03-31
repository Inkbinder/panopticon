import type { Command } from "commander";


export type DoctorCheck = {
	id: string;
	ok: boolean;
	message: string;
};

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
