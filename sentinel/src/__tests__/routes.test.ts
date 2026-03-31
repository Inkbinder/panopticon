import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../index';
import { makeFilter } from '../routes/events';

describe('sentinel routes', () => {
  it('GET /api/health returns ok', async () => {
    const { app } = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /api/questions validates body and can create+answer', async () => {
    const { app } = createApp();

    const bad = await request(app).post('/api/questions').send({});
    expect(bad.status).toBe(400);

    const created = await request(app)
      .post('/api/questions')
      .send({ scope: 'cell', fromAgent: 'guard', prompt: 'hello', cellId: 'alpha' });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('open');
    expect(created.body.id).toBeTruthy();

    const emptyAnswer = await request(app).post(`/api/questions/${created.body.id}/answer`).send({ answer: '   ' });
    expect(emptyAnswer.status).toBe(400);

    const answered = await request(app).post(`/api/questions/${created.body.id}/answer`).send({ answer: 'ok' });
    expect(answered.status).toBe(200);
    expect(answered.body.status).toBe('answered');
    expect(answered.body.answer).toBe('ok');

    const notFound = await request(app).post('/api/questions/does-not-exist/answer').send({ answer: 'ok' });
    expect(notFound.status).toBe(404);
  });

  it('cell routes heartbeat/state/stop work and publish events', async () => {
    const { app } = createApp();

    const hb = await request(app).post('/api/cells/c1/heartbeat').send({});
    expect(hb.status).toBe(204);

    const missingState = await request(app).post('/api/cells/c1/agents/guard/state').send({});
    expect(missingState.status).toBe(400);

    const setState = await request(app).post('/api/cells/c1/agents/guard/state').send({ state: 'running' });
    expect(setState.status).toBe(204);

    const stop = await request(app).post('/api/cells/c1/stop').send({});
    expect(stop.status).toBe(204);
  });

  it('POST /api/logs validates body and publishes log event', async () => {
    const { app, bus } = createApp();

    const published: any[] = [];
    bus.subscribe({
      id: 't',
      filter: () => true,
      send: (m: any) => published.push(m),
      close: () => {},
    });

    const bad = await request(app).post('/api/logs').send({});
    expect(bad.status).toBe(400);

    const badScope = await request(app).post('/api/logs').send({ scope: 'nope', agent: 'overseer', message: 'x' });
    expect(badScope.status).toBe(400);

    const missingCellId = await request(app)
      .post('/api/logs')
      .send({ scope: 'cell', agent: 'guard', message: 'hi' });
    expect(missingCellId.status).toBe(400);

    const ok = await request(app)
      .post('/api/logs')
      .send({ scope: 'overseer', agent: 'overseer', message: 'hello', level: 'info' });

    expect(ok.status).toBe(201);
    expect(ok.body.message).toBe('hello');
    expect(ok.body.scope).toBe('overseer');

    expect(published.some((m) => m.type === 'log' && m.data.message === 'hello')).toBe(true);
  });

  it('events filter includes only matching cell-scoped messages', () => {
    const filter = makeFilter({ query: { scope: 'cell', cellId: 'alpha' } } as any);

    expect(filter({ type: 'cell.upsert', data: { cellId: 'alpha' } } as any)).toBe(true);
    expect(filter({ type: 'cell.upsert', data: { cellId: 'bravo' } } as any)).toBe(false);
    expect(filter({ type: 'cell.remove', data: { cellId: 'alpha' } } as any)).toBe(true);
    expect(filter({ type: 'cell.remove', data: { cellId: 'bravo' } } as any)).toBe(false);
    expect(
      filter({ type: 'log', data: { scope: 'cell', cellId: 'alpha', agent: 'guard', message: 'x', id: '1', ts: 1 } } as any),
    ).toBe(true);
    expect(
      filter({ type: 'log', data: { scope: 'overseer', agent: 'overseer', message: 'x', id: '1', ts: 1 } } as any),
    ).toBe(false);
    expect(
      filter({ type: 'question.upsert', data: { scope: 'cell', cellId: 'alpha', fromAgent: 'guard', prompt: 'p', status: 'open', id: 'q', createdAt: 1 } } as any),
    ).toBe(true);
    expect(
      filter({ type: 'question.upsert', data: { scope: 'cell', cellId: 'bravo', fromAgent: 'guard', prompt: 'p', status: 'open', id: 'q', createdAt: 1 } } as any),
    ).toBe(false);

    // Unknown message type should be rejected for cell scope
    expect(filter({ type: 'log', data: { scope: 'cell', cellId: 'bravo', agent: 'guard', message: 'x', id: '1', ts: 1 } } as any)).toBe(
      false,
    );
  });

  it('events filter allows all messages for overseer scope and rejects unknown scope', () => {
    const overseer = makeFilter({ query: { scope: 'overseer' } } as any);
    expect(overseer({ type: 'cell.remove', data: { cellId: 'x' } } as any)).toBe(true);
    expect(
      overseer({ type: 'question.upsert', data: { scope: 'cell', cellId: 'x', fromAgent: 'guard', prompt: 'p', status: 'open', id: 'q', createdAt: 1 } } as any),
    ).toBe(true);

    const unknown = makeFilter({ query: { scope: 'weird', cellId: 'x' } } as any);
    expect(unknown({ type: 'cell.remove', data: { cellId: 'x' } } as any)).toBe(false);
  });
});
