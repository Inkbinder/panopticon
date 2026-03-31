import express from 'express';
import cors from 'cors';
import { InMemoryEventBus } from './events/bus';
import { InMemoryStore } from './state/store';
import { createEventsRoute } from './routes/events';
import { createQuestionsRoutes } from './routes/questions';
import { createCellsRoutes } from './routes/cells';
import { startDemoSimulator } from './demo/simulator';

const PORT = Number(process.env.PORT ?? 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const bus = new InMemoryEventBus();
const store = new InMemoryStore(bus);

app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/api/events', createEventsRoute(bus, store));

const q = createQuestionsRoutes(store);
app.post('/api/questions', q.create);
app.post('/api/questions/:id/answer', q.answer);

const cells = createCellsRoutes(store);
app.post('/api/cells/:cellId/heartbeat', cells.heartbeat);
app.post('/api/cells/:cellId/agents/:role/state', cells.setAgentState);
app.post('/api/cells/:cellId/stop', cells.stop);

if (process.env.DEMO_SIM === '1') {
  startDemoSimulator(store);
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`panopticon-server listening on http://localhost:${PORT}`);
});
