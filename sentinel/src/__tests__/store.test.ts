import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '../events/bus';
import { InMemoryStore } from '../state/store';

describe('InMemoryStore', () => {
  it('publishes question.upsert on create and answer', () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryStore(bus);

    const published: any[] = [];
    bus.subscribe({
      id: 't',
      filter: () => true,
      send: (m) => published.push(m),
      close: () => {},
    });

    const q = store.createQuestion({ scope: 'cell', cellId: 'alpha', fromAgent: 'guard', prompt: 'hi' });
    store.answerQuestion(q.id, 'ok');

    expect(published.some((m) => m.type === 'question.upsert' && m.data.id === q.id)).toBe(true);
    expect(published.some((m) => m.type === 'question.upsert' && m.data.status === 'answered')).toBe(true);
  });
});
