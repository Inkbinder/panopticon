import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../events/bus';
import type { SseEnvelope } from '../events/types';

describe('InMemoryEventBus', () => {
  it('unsubscribes and calls close', () => {
    const bus = new InMemoryEventBus();

    let closed = 0;
    const received: SseEnvelope[] = [];

    const unsubscribe = bus.subscribe({
      id: 'x',
      filter: () => true,
      send: (message) => received.push(message),
      close: () => {
        closed += 1;
      },
    });

    bus.publish({ type: 'cell.remove', data: { cellId: 'a' } });
    expect(received.length).toBe(1);

    unsubscribe();
    expect(closed).toBe(1);

    bus.publish({ type: 'cell.remove', data: { cellId: 'b' } });
    expect(received.length).toBe(1);
  });
});
