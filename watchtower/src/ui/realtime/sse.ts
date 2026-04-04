import { z } from 'zod';
import type { SseEnvelope } from '../types';

const trimmedString = z.string().trim().min(1);
const agentRoleSchema = z.enum(['overseer', 'guard', 'resident', 'janitor']);
const agentStateSchema = z.enum(['idle', 'starting', 'running', 'waiting', 'done', 'error']);
const scopeSchema = z.enum(['overseer', 'cell']);
const logLevelSchema = z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);
const questionStatusSchema = z.enum(['open', 'answered', 'expired']);

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
  .strict();

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
  .strict();

const sseEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('log'), data: logEventSchema }).strict(),
  z.object({ type: z.literal('cell.upsert'), data: cellSummarySchema }).strict(),
  z.object({ type: z.literal('cell.remove'), data: z.object({ cellId: trimmedString }).strict() }).strict(),
  z.object({ type: z.literal('question.upsert'), data: questionSchema }).strict(),
]);

export function parseSseEnvelope(raw: string): SseEnvelope | null {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsedEnvelope = sseEnvelopeSchema.safeParse(parsedJson);
  return parsedEnvelope.success ? parsedEnvelope.data : null;
}