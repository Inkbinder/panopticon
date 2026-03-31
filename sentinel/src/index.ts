import express from 'express';
import cors from 'cors';
import { InMemoryEventBus } from './events/bus';
import { InMemoryStore } from './state/store';
import { createEventsRoute } from './routes/events';
import { createQuestionsRoutes } from './routes/questions';
import { createCellsRoutes } from './routes/cells';
import { createLogsRoutes } from './routes/logs';
import { startDemoSimulator } from './demo/simulator';
import { readPanopticonConfig } from './config';

export function createApp(deps?: { bus?: InMemoryEventBus; store?: InMemoryStore }) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const bus = deps?.bus ?? new InMemoryEventBus();
  const store = deps?.store ?? new InMemoryStore(bus);

  app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));
  app.get('/api/events', createEventsRoute(bus, store));

  const logs = createLogsRoutes(store);
  app.post('/api/logs', logs.create);

  const q = createQuestionsRoutes(store);
  app.post('/api/questions', q.create);
  app.post('/api/questions/:id/answer', q.answer);

  const cells = createCellsRoutes(store);
  app.post('/api/cells/:cellId/heartbeat', cells.heartbeat);
  app.post('/api/cells/:cellId/agents/:role/state', cells.setAgentState);
  app.post('/api/cells/:cellId/stop', cells.stop);

  return { app, bus, store };
}

export function startServer() {
	const config = readPanopticonConfig();
	const PORT = Number(config.sentinel?.port ?? 8787);
  const { app, store } = createApp();

  const demoSim = config.sentinel?.demoSim;
  if (demoSim === true) {
    startDemoSimulator(store);
  }

  return app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`panopticon-server listening on http://localhost:${PORT}`);
  });
}

// Preserve existing behavior when run directly (but don't auto-start during tests/imports).
const argvEntry = process.argv[1]?.replace(/\\/g, '/');
const isDirect = argvEntry?.endsWith('/src/index.ts') || argvEntry?.endsWith('/dist/index.js');

if (isDirect && process.env.VITEST !== 'true') {
  startServer();
}
