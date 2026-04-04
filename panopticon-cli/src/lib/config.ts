import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { formatConfigValidationError, panopticonConfigSchema, resolvePanopticonConfig, type PanopticonConfig } from "./config-schema";

let cached: { cwd: string; config: PanopticonConfig } | null = null;

function findPanopticonYaml(startDir: string): string | null {
	let dir = startDir;
	while (true) {
		const candidate = path.join(dir, "panopticon.yaml");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

export function readPanopticonConfig(opts?: { cwd?: string; required?: boolean }): PanopticonConfig {
	const cwd = opts?.cwd ?? process.cwd();
	if (cached?.cwd === cwd) return cached.config;

	const filePath = findPanopticonYaml(cwd);
	if (!filePath) {
		if (opts?.required) {
			throw new Error(`Missing panopticon.yaml in ${cwd} (or any parent directory)`);
		}
		const empty: PanopticonConfig = {};
		cached = { cwd, config: empty };
		return empty;
	}

	const raw = fs.readFileSync(filePath, "utf8");
	let parsedYaml: unknown;
	try {
		parsedYaml = YAML.parse(raw);
	} catch (err) {
		throw new Error(`Failed to parse panopticon.yaml: ${String(err)}`);
	}

	const parsedConfig = panopticonConfigSchema.safeParse(parsedYaml ?? {});
	if (!parsedConfig.success) {
		throw new Error(`Invalid panopticon.yaml: ${formatConfigValidationError(parsedConfig.error)}`);
	}

	const config = resolvePanopticonConfig(parsedConfig.data, cwd);
	cached = { cwd, config };
	return config;
}
