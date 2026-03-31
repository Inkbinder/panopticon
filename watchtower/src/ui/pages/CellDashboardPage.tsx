import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEventStream } from '../realtime/useEventStream';
import type { LogEvent, Question } from '../types';
import { QuestionCard } from '../widgets/QuestionCard';

export function CellDashboardPage() {
  const { cellId } = useParams();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const streamUrl = useMemo(
    () => `/api/events?scope=cell&cellId=${encodeURIComponent(cellId ?? '')}`,
    [cellId],
  );

  useEventStream(streamUrl, {
    onLog: (e) => setLogs((prev) => [...prev, e].slice(-400)),
    onQuestionUpsert: (q) => setQuestions((prev) => {
      const idx = prev.findIndex((x) => x.id === q.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = q;
        return next;
      }
      return [q, ...prev];
    }),
  });

  const title = cellId ? `Cell: ${cellId}` : 'Cell';

  return (
    <div className="grid">
      <section className="card">
        <div className="cardHeader">
          <h2>{title} logs</h2>
          <span className="badge ok">live</span>
        </div>
        <div className="cardBody">
          <div className="log" aria-label="cell logs">
            {logs.slice(-250).map((l) => (
              <div key={l.id} className="logLine">
                <span className="small">[{new Date(l.ts).toLocaleTimeString()}]</span>{' '}
                <strong>{l.agent}</strong> {l.message}
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="card">
        <div className="cardHeader">
          <h2>Questions</h2>
          <span className="badge">{questions.filter((q) => q.status === 'open').length} open</span>
        </div>
        <div className="cardBody">
          <div className="list">
            {questions.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
            {questions.length === 0 ? (
              <div className="small">No questions for this cell.</div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
