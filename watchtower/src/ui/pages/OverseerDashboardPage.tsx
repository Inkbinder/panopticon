import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEventStream } from '../realtime/useEventStream';
import type { CellSummary, LogEvent, Question } from '../types.ts';
import { QuestionCard } from '../widgets/QuestionCard';

export function OverseerDashboardPage() {
  const [cells, setCells] = useState<CellSummary[]>([]);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const streamUrl = useMemo(() => '/api/events?scope=overseer', []);

  useEventStream(streamUrl, {
    onLog: (e) => setLogs((prev) => [...prev, e].slice(-400)),
    onCellUpsert: (c) =>
      setCells((prev) => {
        const idx = prev.findIndex((x) => x.cellId === c.cellId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = c;
          return next;
        }
        return [c, ...prev];
      }),
    onCellRemove: (cellId) => setCells((prev) => prev.filter((c) => c.cellId !== cellId)),
    onQuestionUpsert: (q) =>
      setQuestions((prev) => {
        const idx = prev.findIndex((x) => x.id === q.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = q;
          return next;
        }
        return [q, ...prev];
      }),
  });

  // Basic cleanup of ephemeral cells (if backend forgets to remove them).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setCells((prev) => prev.filter((c) => now - c.lastSeenAt < 60_000));
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid">
      <section className="card">
        <div className="cardHeader">
          <h2>Overseer logs</h2>
          <span className="badge ok">live</span>
        </div>
        <div className="cardBody">
          <div className="log" aria-label="overseer logs">
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
          <h2>Cells</h2>
          <span className="badge">{cells.length}</span>
        </div>
        <div className="cardBody">
          <div className="list">
            {cells.map((c) => (
              <div className="row" key={c.cellId}>
                <div className="rowTitle">
                  <strong>{c.cellId}</strong>
                  <span>
                    {c.guard.state} / {c.resident.state} / {c.janitor.state}
                  </span>
                </div>
                <Link className="btn" to={`/cells/${encodeURIComponent(c.cellId)}`}>
                  View
                </Link>
              </div>
            ))}
            {cells.length === 0 ? (
              <div className="small">No active cells yet.</div>
            ) : null}
          </div>
        </div>

        <div className="cardHeader">
          <h2>Questions</h2>
          <span className="badge">{questions.filter((q) => q.status === 'open').length} open</span>
        </div>
        <div className="cardBody">
          <div className="list">
            {questions.slice(0, 6).map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
            {questions.length === 0 ? (
              <div className="small">No questions.</div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
