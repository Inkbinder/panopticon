import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../events/bus';
import { InMemoryStore } from '../state/store';
import type { CellSummary, SseEnvelope } from '../events/types';

describe('InMemoryStore', () => {
  it('publishes question.upsert on create and answer', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    const published: SseEnvelope[] = [];
    bus.subscribe({
      id: 't',
      filter: () => true,
      send: (message) => published.push(message),
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

    const onlyAlpha = store.snapshotForSubscriber((message) => {
      if (message.type === 'cell.upsert') return message.data.cellId === 'alpha';
      if (message.type === 'question.upsert') return message.data.cellId === 'alpha';
      return false;
    });
    expect(onlyAlpha.some((event) => event.type === 'cell.upsert' && event.data.cellId === 'alpha')).toBe(true);
    expect(onlyAlpha.some((event) => event.type === 'cell.upsert' && event.data.cellId === 'bravo')).toBe(false);
    expect(onlyAlpha.some((event) => event.type === 'question.upsert' && event.data.cellId === 'alpha')).toBe(true);
    expect(onlyAlpha.some((event) => event.type === 'question.upsert' && event.data.cellId === 'bravo')).toBe(false);

    store.removeCell('alpha');
    expect(store.listCells().some((cell: CellSummary) => cell.cellId === 'alpha')).toBe(false);
  });

  it('appendLog and touchAgentState publish events', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    const published: SseEnvelope[] = [];
    bus.subscribe({
      id: 't',
      filter: () => true,
      send: (message) => published.push(message),
      close: () => {},
    });

    store.appendLog('cell', 'guard', 'hello', 'alpha');
    store.touchAgentState('alpha', 'guard', 'running');

    expect(published.some((m) => m.type === 'log')).toBe(true);
    expect(published.some((m) => m.type === 'cell.upsert' && m.data.cellId === 'alpha')).toBe(true);
  });
});
