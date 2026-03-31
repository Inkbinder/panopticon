import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../events/bus.js';
import { InMemoryStore } from '../state/store.js';

describe('InMemoryStore', () => {
  it('publishes question.upsert on create and answer', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    const published: any[] = [];
    bus.subscribe({
      id: 't',
      filter: () => true,
  send: (m: any) => published.push(m),
      close: () => {},
    });

    const q = store.createQuestion({ scope: 'cell', cellId: 'alpha', fromAgent: 'guard', prompt: 'hi' });
    store.answerQuestion(q.id, 'ok');

    expect(published.some((m) => m.type === 'question.upsert' && m.data.id === q.id)).toBe(true);
    expect(published.some((m) => m.type === 'question.upsert' && m.data.status === 'answered')).toBe(true);
  });

  it('answers are idempotent and missing questions return undefined', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    expect(store.answerQuestion('missing', 'x')).toBeUndefined();

    const q = store.createQuestion({ scope: 'overseer', fromAgent: 'overseer', prompt: 'p' });
    const first = store.answerQuestion(q.id, 'a1');
    const second = store.answerQuestion(q.id, 'a2');

    expect(first?.status).toBe('answered');
    // once answered, should return the already-answered question and not reopen/overwrite
    expect(second?.answer).toBe('a1');
  });

  it('upserts/removes cells and snapshots are filterable', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    store.upsertCell('alpha', {});
    store.upsertCell('bravo', {});
    store.createQuestion({ scope: 'cell', cellId: 'alpha', fromAgent: 'guard', prompt: 'q1' });
    store.createQuestion({ scope: 'cell', cellId: 'bravo', fromAgent: 'guard', prompt: 'q2' });

  const onlyAlpha = store.snapshotForSubscriber((m: any) => {
      if (m.type === 'cell.upsert') return m.data.cellId === 'alpha';
      if (m.type === 'question.upsert') return m.data.cellId === 'alpha';
      return false;
    });
  expect(onlyAlpha.some((e: any) => e.type === 'cell.upsert' && e.data.cellId === 'alpha')).toBe(true);
  expect(onlyAlpha.some((e: any) => e.type === 'cell.upsert' && e.data.cellId === 'bravo')).toBe(false);
  expect(onlyAlpha.some((e: any) => e.type === 'question.upsert' && e.data.cellId === 'alpha')).toBe(true);
  expect(onlyAlpha.some((e: any) => e.type === 'question.upsert' && e.data.cellId === 'bravo')).toBe(false);

    store.removeCell('alpha');
  expect(store.listCells().some((c: any) => c.cellId === 'alpha')).toBe(false);
  });

  it('appendLog and touchAgentState publish events', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    const published: any[] = [];
    bus.subscribe({
      id: 't',
      filter: () => true,
  send: (m: any) => published.push(m),
      close: () => {},
    });

    store.appendLog('cell', 'guard', 'hello', 'alpha');
    store.touchAgentState('alpha', 'guard', 'running');

    expect(published.some((m) => m.type === 'log')).toBe(true);
    expect(published.some((m) => m.type === 'cell.upsert' && m.data.cellId === 'alpha')).toBe(true);
  });
});
