import { useEffect, useRef } from 'react';
import type { CellSummary, LogEvent, Question, SseEnvelope } from '../types';

type Handlers = {
  onLog?: (e: LogEvent) => void;
  onCellUpsert?: (cell: CellSummary) => void;
  onCellRemove?: (cellId: string) => void;
  onQuestionUpsert?: (q: Question) => void;
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
      const parsed: SseEnvelope = JSON.parse(ev.data);
      switch (parsed.type) {
        case 'log':
          handlersRef.current.onLog?.(parsed.data as LogEvent);
          break;
        case 'cell.upsert':
          handlersRef.current.onCellUpsert?.(parsed.data as CellSummary);
          break;
        case 'cell.remove':
          handlersRef.current.onCellRemove?.((parsed.data as { cellId: string }).cellId);
          break;
        case 'question.upsert':
          handlersRef.current.onQuestionUpsert?.(parsed.data as Question);
          break;
        default:
          break;
      }
    };

    es.addEventListener('message', onMessage as any);

    return () => {
      es.close();
    };
  }, [url]);
}
