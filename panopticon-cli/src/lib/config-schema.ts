import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const nonNegativeInteger = z.number().int().min(0);
const portNumber = z.number().int().min(1).max(65_535);

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

export const panopticonConfigSchema = z
  .object({
    overseer: overseerConfigSchema.optional(),
    sentinel: sentinelConfigSchema.optional(),
    watchtower: watchtowerConfigSchema.optional(),
  })
  .strict();

export type PanopticonConfig = z.infer<typeof panopticonConfigSchema>;

export function formatConfigValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'config'}: ${issue.message}`)
    .join('; ');
}