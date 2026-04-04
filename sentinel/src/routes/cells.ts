import type { Request, Response } from 'express';
import type { InMemoryStore } from '../state/store';
import { cellIdParamsSchema, sendValidationError, setAgentStateBodySchema, setAgentStateParamsSchema } from '../validation';

export function createCellsRoutes(store: InMemoryStore) {
  return {
    heartbeat: (req: Request, res: Response) => {
      const parsedParams = cellIdParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        sendValidationError(res, parsedParams.error);
        return;
      }

      // Agents can call this periodically to keep the cell present.
      store.upsertCell(parsedParams.data.cellId, {});
      res.status(204).end();
    },

    setAgentState: (req: Request, res: Response) => {
      const parsedParams = setAgentStateParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        sendValidationError(res, parsedParams.error);
        return;
      }

      const parsedBody = setAgentStateBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        sendValidationError(res, parsedBody.error);
        return;
      }

      store.touchAgentState(parsedParams.data.cellId, parsedParams.data.role, parsedBody.data.state);
      res.status(204).end();
    },

    stop: (req: Request, res: Response) => {
      const parsedParams = cellIdParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        sendValidationError(res, parsedParams.error);
        return;
      }

      store.removeCell(parsedParams.data.cellId);
      res.status(204).end();
    },
  };
}
