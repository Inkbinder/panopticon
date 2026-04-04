import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useEventStream } from '../useEventStream';
import { MockEventSource } from '../../__tests__/testUtils';

describe('useEventStream', () => {
  it('routes messages to handlers and closes on unmount', () => {
    const created: MockEventSource[] = [];

    vi.stubGlobal('EventSource', function (url: string) {
      const es = new MockEventSource(url);
      created.push(es);
      return es;
    });

    const onLog = vi.fn();
    const onCellUpsert = vi.fn();
    const onCellRemove = vi.fn();
    const onQuestionUpsert = vi.fn();

    function Harness() {
      useEventStream('/api/events?scope=overseer', { onLog, onCellUpsert, onCellRemove, onQuestionUpsert });
      return <div>ok</div>;
    }

    const { unmount } = render(<Harness />);

    expect(created.length).toBe(1);
    const es = created[0];

    es.emit('message', { type: 'log', data: { id: '1', ts: 1, scope: 'overseer', agent: 'overseer', message: 'hi' } });
    es.emit('message', {
      type: 'cell.upsert',
      data: {
        cellId: 'c1',
        lastSeenAt: 1,
        guard: { role: 'guard', state: 'running', lastSeenAt: 1 },
        resident: { role: 'resident', state: 'idle', lastSeenAt: 1 },
        janitor: { role: 'janitor', state: 'idle', lastSeenAt: 1 },
      },
    });
    es.emit('message', { type: 'cell.remove', data: { cellId: 'c1' } });
    es.emit('message', {
      type: 'question.upsert',
      data: { id: 'q', scope: 'overseer', fromAgent: 'overseer', prompt: 'p', status: 'open', createdAt: 1 },
    });

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onCellUpsert).toHaveBeenCalledTimes(1);
    expect(onCellRemove).toHaveBeenCalledWith('c1');
    expect(onQuestionUpsert).toHaveBeenCalledTimes(1);

    unmount();
    expect(es.closed).toBe(true);
  });

  it('does nothing when url is empty', () => {
    const spy = vi.fn();
    vi.stubGlobal('EventSource', spy);

    function Harness() {
      useEventStream('', {});
      return <div />;
    }

    render(<Harness />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores invalid SSE envelopes', () => {
    const created: MockEventSource[] = [];

    vi.stubGlobal('EventSource', function (url: string) {
      const es = new MockEventSource(url);
      created.push(es);
      return es;
    });

    const onLog = vi.fn();

    function Harness() {
      useEventStream('/api/events?scope=overseer', { onLog });
      return <div>ok</div>;
    }

    render(<Harness />);

    created[0].emit('message', { type: 'log', data: { scope: 'overseer', message: 123 } });
    expect(onLog).not.toHaveBeenCalled();
  });
});
