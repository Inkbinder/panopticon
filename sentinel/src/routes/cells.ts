import type { Request, Response } from 'express';
import type { InMemoryStore } from '../state/store';

export function createCellsRoutes(store: InMemoryStore) {
  return {
    heartbeat: (req: Request, res: Response) => {
      const cellId = req.params.cellId;
      // Agents can call this periodically to keep the cell present.
      store.upsertCell(cellId, {});
      res.status(204).end();
    },

    setAgentState: (req: Request, res: Response) => {
      const cellId = req.params.cellId;
      const role = req.params.role as 'guard' | 'resident' | 'janitor';
      const body = req.body as any;
      const state = body?.state as any;
      if (!state) {
        res.status(400).send('Missing state');
        return;
      }
      store.touchAgentState(cellId, role, state);
      res.status(204).end();
    },

    stop: (req: Request, res: Response) => {
      const cellId = req.params.cellId;
      store.removeCell(cellId);
      res.status(204).end();
    },
  };
}
