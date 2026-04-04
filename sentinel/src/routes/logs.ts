import type { Request, Response } from 'express';
import type { InMemoryStore } from '../state/store';
import { logCreateBodySchema, sendValidationError } from '../validation';

export function createLogsRoutes(store: InMemoryStore) {
  return {
    create: (req: Request, res: Response) => {
      const parsedBody = logCreateBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        sendValidationError(res, parsedBody.error);
        return;
      }

      const ev = store.appendLog(
        parsedBody.data.scope,
        parsedBody.data.agent,
        parsedBody.data.message,
        parsedBody.data.cellId,
        parsedBody.data.level,
      );
      res.status(201).json(ev);
    },
  };
}
