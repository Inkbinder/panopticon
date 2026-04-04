import type { Response } from 'express';
import { z } from 'zod';

const trimmedString = z.string().trim().min(1);

export const scopeSchema = z.enum(['overseer', 'cell']);
export const agentRoleSchema = z.enum(['overseer', 'guard', 'resident', 'janitor']);
export const cellAgentRoleSchema = z.enum(['guard', 'resident', 'janitor']);
export const agentStateSchema = z.enum(['idle', 'starting', 'running', 'waiting', 'done', 'error']);
export const logLevelSchema = z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);
export const questionStatusSchema = z.enum(['open', 'answered', 'expired']);

const agentSummarySchema = z
  .object({
    role: agentRoleSchema,
    state: agentStateSchema,
    lastSeenAt: z.number(),
  })
  .strict();

const cellSummarySchema = z
  .object({
    cellId: trimmedString,
    guard: agentSummarySchema,
    resident: agentSummarySchema,
    janitor: agentSummarySchema,
    lastSeenAt: z.number(),
  })
  .strict();

const logEventSchema = z
  .object({
    id: trimmedString,
    ts: z.number(),
    level: logLevelSchema.optional(),
    scope: scopeSchema,
    cellId: trimmedString.optional(),
    agent: agentRoleSchema,
    message: trimmedString,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'cell' && !value.cellId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cellId is required for cell scope', path: ['cellId'] });
    }
  });

const questionSchema = z
  .object({
    id: trimmedString,
    scope: scopeSchema,
    cellId: trimmedString.optional(),
    fromAgent: agentRoleSchema,
    prompt: trimmedString,
    status: questionStatusSchema,
    answer: trimmedString.optional(),
    createdAt: z.number(),
    answeredAt: z.number().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'cell' && !value.cellId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cellId is required for cell scope', path: ['cellId'] });
    }
  });

export const sseEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('log'), data: logEventSchema }).strict(),
  z.object({ type: z.literal('cell.upsert'), data: cellSummarySchema }).strict(),
  z.object({ type: z.literal('cell.remove'), data: z.object({ cellId: trimmedString }).strict() }).strict(),
  z.object({ type: z.literal('question.upsert'), data: questionSchema }).strict(),
]);

export const logCreateBodySchema = z
  .object({
    scope: scopeSchema,
    agent: agentRoleSchema,
    message: trimmedString,
    cellId: trimmedString.optional(),
    level: logLevelSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'cell' && !value.cellId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cellId is required for cell scope', path: ['cellId'] });
    }
  });

export const questionCreateBodySchema = z
  .object({
    scope: scopeSchema,
    fromAgent: agentRoleSchema,
    prompt: trimmedString,
    cellId: trimmedString.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'cell' && !value.cellId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cellId is required for cell scope', path: ['cellId'] });
    }
  });

export const questionAnswerBodySchema = z.object({ answer: trimmedString }).strict();
export const cellIdParamsSchema = z.object({ cellId: trimmedString }).strict();
export const setAgentStateParamsSchema = z.object({ cellId: trimmedString, role: cellAgentRoleSchema }).strict();
export const setAgentStateBodySchema = z.object({ state: agentStateSchema }).strict();

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'input'}: ${issue.message}`)
    .join('; ');
}

export function sendValidationError(res: Response, error: z.ZodError) {
  res.status(400).json({ error: 'Invalid request', details: formatIssues(error) });
}