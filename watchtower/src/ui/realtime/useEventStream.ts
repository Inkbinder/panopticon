import { useEffect, useRef } from 'react';
import type { SseEnvelope } from '../types.ts';
import { parseSseEnvelope } from './sse';

type Handlers = {
  onLog?: (e: Extract<SseEnvelope, { type: 'log' }>['data']) => void;
  onCellUpsert?: (cell: Extract<SseEnvelope, { type: 'cell.upsert' }>['data']) => void;
  onCellRemove?: (cellId: Extract<SseEnvelope, { type: 'cell.remove' }>['data']['cellId']) => void;
  onQuestionUpsert?: (q: Extract<SseEnvelope, { type: 'question.upsert' }>['data']) => void;
};

export function useEventStream(url: string, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;

    const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
    const fullUrl = base ? new URL(url, base).toString() : url;

    const es = new EventSource(fullUrl);

    const onMessage = (ev: MessageEvent<string>) => {
      const parsed = parseSseEnvelope(ev.data);
      if (!parsed) {
        return;
      }

      switch (parsed.type) {
        case 'log':
          handlersRef.current.onLog?.(parsed.data);
          break;
        case 'cell.upsert':
          handlersRef.current.onCellUpsert?.(parsed.data);
          break;
        case 'cell.remove':
          handlersRef.current.onCellRemove?.(parsed.data.cellId);
          break;
        case 'question.upsert':
          handlersRef.current.onQuestionUpsert?.(parsed.data);
          break;
      }
    };

    es.addEventListener('message', onMessage);

    return () => {
      es.close();
    };
  }, [url]);
}
