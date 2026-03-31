import { useState } from 'react';
import type { Question } from '../types';

async function postAnswer(questionId: string, answer: string) {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const url = base
    ? new URL(`/api/questions/${encodeURIComponent(questionId)}/answer`, base).toString()
    : `/api/questions/${encodeURIComponent(questionId)}/answer`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export function QuestionCard({ question }: { question: Question }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const isOpen = question.status === 'open';

  return (
    <div className="row" style={{ alignItems: 'stretch', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div className="rowTitle">
          <strong>{question.fromAgent.toUpperCase()}</strong>
          <span className="small">
            {new Date(question.createdAt).toLocaleString()}
            {question.cellId ? ` • cell ${question.cellId}` : ''}
          </span>
        </div>
        <span className={`badge ${isOpen ? 'warn' : 'ok'}`}>{question.status}</span>
      </div>

      <div style={{ marginTop: 10 }}>{question.prompt}</div>

      {isOpen ? (
        <div className="inputRow">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type answer…"
          />
          <button
            className="btn"
            disabled={busy || answer.trim().length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await postAnswer(question.id, answer.trim());
                setAnswer('');
              } finally {
                setBusy(false);
              }
            }}
          >
            Send
          </button>
        </div>
      ) : question.answer ? (
        <div className="small" style={{ marginTop: 10 }}>
          Answer: <strong>{question.answer}</strong>
        </div>
      ) : null}
    </div>
  );
}
