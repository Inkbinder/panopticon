import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const nonNegativeInteger = z.number().int().min(0);
const portNumber = z.number().int().min(1).max(65_535);
const portStrategySchema = z.enum(['fixed', 'worktree']);

const runtimeConfigSchema = z
  .object({
    portStrategy: portStrategySchema.optional(),
  })
  .strict();

const overseerConfigSchema = z
  .object({
    logDir: nonEmptyString.optional(),
    logLevel: nonEmptyString.optional(),
    consoleLogLevel: nonEmptyString.optional(),
    fileLogLevel: nonEmptyString.optional(),
    sentinelUrl: z.string().url().optional(),
    apiBaseUrl: z.string().url().optional(),
    sentinelLogTimeoutMs: nonNegativeInteger.optional(),
    sentinelLogMaxQueue: nonNegativeInteger.optional(),
  })
  .strict();

const sentinelConfigSchema = z
  .object({
    port: portNumber.optional(),
    demoSim: z.boolean().optional(),
  })
  .strict();

const watchtowerConfigSchema = z
  .object({
    port: portNumber.optional(),
    host: nonEmptyString.optional(),
    apiBaseUrl: z.string().url().optional(),
  })
  .strict();

const panopticonConfigSchema = z
  .object({
    runtime: runtimeConfigSchema.optional(),
    overseer: overseerConfigSchema.optional(),
    sentinel: sentinelConfigSchema.optional(),
    watchtower: watchtowerConfigSchema.optional(),
  })
  .strict();

function formatConfigValidationError(error) {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'config'}: ${issue.message}`)
    .join('; ');
}

function getWorktreePortOffset(cwd) {
  let hash = 0;
  for (const char of cwd) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return 1 + (hash % 1000);
}

function resolvePanopticonConfig(config, cwd) {
  const useWorktreePorts = config.runtime?.portStrategy === 'worktree';
  const offset = useWorktreePorts ? getWorktreePortOffset(cwd) : 0;
  const sentinelPort = config.sentinel?.port ?? (8787 + offset);
  const watchtowerPort = config.watchtower?.port ?? (5173 + offset);
  const sentinelBaseUrl = `http://127.0.0.1:${sentinelPort}`;
  const overseerBaseUrl = config.overseer?.apiBaseUrl ?? config.overseer?.sentinelUrl ?? sentinelBaseUrl;

  return {
    ...config,
    sentinel: {
      ...config.sentinel,
      port: sentinelPort,
    },
    overseer: {
      ...config.overseer,
      sentinelUrl: config.overseer?.sentinelUrl ?? overseerBaseUrl,
      apiBaseUrl: config.overseer?.apiBaseUrl ?? overseerBaseUrl,
    },
    watchtower: {
      ...config.watchtower,
      port: watchtowerPort,
      host: config.watchtower?.host ?? '0.0.0.0',
      apiBaseUrl: config.watchtower?.apiBaseUrl ?? sentinelBaseUrl,
    },
  };
}

function findPanopticonYaml(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'panopticon.yaml');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function readPanopticonConfig(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const filePath = findPanopticonYaml(cwd);
  if (!filePath) {
    return resolvePanopticonConfig({}, cwd);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let parsedYaml;
  try {
    parsedYaml = YAML.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse panopticon.yaml: ${String(err)}`);
  }

  const parsedConfig = panopticonConfigSchema.safeParse(parsedYaml ?? {});
  if (!parsedConfig.success) {
    throw new Error(`Invalid panopticon.yaml: ${formatConfigValidationError(parsedConfig.error)}`);
  }

  return resolvePanopticonConfig(parsedConfig.data, cwd);
}