import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../events/bus.js';

describe('InMemoryEventBus', () => {
  it('unsubscribes and calls close', () => {
    const bus = new InMemoryEventBus();

    let closed = 0;
    const received: any[] = [];

    const unsubscribe = bus.subscribe({
      id: 'x',
      filter: () => true,
  send: (m: any) => received.push(m),
      close: () => {
        closed += 1;
      },
    });

    bus.publish({ type: 'cell.remove', data: { cellId: 'a' } } as any);
    expect(received.length).toBe(1);

    unsubscribe();
    expect(closed).toBe(1);

    bus.publish({ type: 'cell.remove', data: { cellId: 'b' } } as any);
    expect(received.length).toBe(1);
  });
});
