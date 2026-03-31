import type { Request, Response } from 'express';
import type { AgentRole } from '../events/types';
import type { InMemoryStore } from '../state/store';

const allowedScopes = new Set(['overseer', 'cell']);
const allowedAgents = new Set(['overseer', 'guard', 'resident', 'janitor']);
const allowedLevels = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);

export function createLogsRoutes(store: InMemoryStore) {
  return {
    create: (req: Request, res: Response) => {
      const body = req.body as any;
      const scope = body?.scope as 'overseer' | 'cell';
      const agent = body?.agent as AgentRole;
      const message = body?.message as string;
      const cellId = body?.cellId as string | undefined;
      const level = body?.level as string | undefined;

      if (!scope || !agent || !message) {
        res.status(400).send('Missing scope/agent/message');
        return;
      }

      if (!allowedScopes.has(scope)) {
        res.status(400).send('Invalid scope');
        return;
      }

      if (!allowedAgents.has(agent)) {
        res.status(400).send('Invalid agent');
        return;
      }

      const trimmed = message.trim();
      if (trimmed.length === 0) {
        res.status(400).send('Missing message');
        return;
      }

      if (scope === 'cell' && (!cellId || cellId.trim().length === 0)) {
        res.status(400).send('Missing cellId for cell scope');
        return;
      }

      const normalizedLevel = level && allowedLevels.has(level) ? level : undefined;

      const ev = store.appendLog(scope, agent, trimmed, cellId, normalizedLevel);
      res.status(201).json(ev);
    },
  };
}
