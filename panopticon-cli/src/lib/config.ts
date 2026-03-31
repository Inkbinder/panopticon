import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type PanopticonConfig = {

overseer?: {
		logDir?: string;
		logLevel?: string;
		consoleLogLevel?: string;
		fileLogLevel?: string;
		sentinelUrl?: string;
		apiBaseUrl?: string;
		sentinelLogTimeoutMs?: number;
		sentinelLogMaxQueue?: number;
	};
	sentinel?: {
		port?: number;
		demoSim?: boolean;
	};
	watchtower?: {
		port?: number;
		host?: string;
		apiBaseUrl?: string;
	};
};

let cached: { cwd: string; config: PanopticonConfig } | null = null;

export function readPanopticonConfig(opts?: { cwd?: string; required?: boolean }): PanopticonConfig {
	const cwd = opts?.cwd ?? process.cwd();
	if (cached?.cwd === cwd) return cached.config;

	const filePath = path.join(cwd, "panopticon.yaml");
	if (!fs.existsSync(filePath)) {
		if (opts?.required) {
			throw new Error(`Missing panopticon.yaml in ${cwd}`);
		}
		const empty: PanopticonConfig = {};
		cached = { cwd, config: empty };
		return empty;
	}

	const raw = fs.readFileSync(filePath, "utf8");
	let parsed: unknown;
	try {
		parsed = YAML.parse(raw);
	} catch (err) {
		throw new Error(`Failed to parse panopticon.yaml: ${String(err)}`);
	}

	const config = (parsed && typeof parsed === "object" ? (parsed as PanopticonConfig) : {}) as PanopticonConfig;
	cached = { cwd, config };
	return config;
}
