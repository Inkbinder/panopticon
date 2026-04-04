import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { SseEnvelope } from '../events/types';
import type { InMemoryEventBus } from '../events/bus';
import type { InMemoryStore } from '../state/store';
import { eventsQuerySchema, sendValidationError } from '../validation';

export function makeFilter(query: { scope: 'overseer' | 'cell'; cellId?: string }) {
  const { scope, cellId = '' } = query;

  return (msg: SseEnvelope) => {
    if (scope === 'overseer') {
      // Overseer view sees overseer logs + all cells + all questions
      return true;
    }

    if (scope === 'cell') {
      if (msg.type === 'cell.upsert') return msg.data.cellId === cellId;
      if (msg.type === 'cell.remove') return msg.data.cellId === cellId;
      if (msg.type === 'log') return msg.data.scope === 'cell' && msg.data.cellId === cellId;
      if (msg.type === 'question.upsert') return msg.data.scope === 'cell' && msg.data.cellId === cellId;
      return false;
    }

    return false;
  };
}

export function createEventsRoute(bus: InMemoryEventBus, store: InMemoryStore) {
  return (req: Request, res: Response) => {
    const parsedQuery = eventsQuerySchema.safeParse({
      scope: typeof req.query.scope === 'string' ? req.query.scope : undefined,
      cellId: typeof req.query.cellId === 'string' ? req.query.cellId : undefined,
    });

    if (!parsedQuery.success) {
      sendValidationError(res, parsedQuery.error);
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    // If behind nginx, helps prevent buffering.
    res.setHeader('X-Accel-Buffering', 'no');

    // Initial newline to establish the stream in some proxies.
    res.write(': connected\n\n');

    const filter = makeFilter(parsedQuery.data);

    // Send a snapshot so the UI can paint immediately.
    for (const ev of store.snapshotForSubscriber(filter)) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }

    const subId = crypto.randomUUID();

    const unsubscribe = bus.subscribe({
      id: subId,
      filter,
      send: (msg: SseEnvelope) => res.write(`data: ${JSON.stringify(msg)}\n\n`),
      close: () => {},
    });

    const heartbeat = setInterval(() => {
      res.write(`: ping ${Date.now()}\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
}
