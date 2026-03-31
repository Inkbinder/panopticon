import crypto from 'node:crypto';
import type { AgentRole, AgentState, CellSummary, LogEvent, Question, SseEnvelope } from '../events/types.js';
import { InMemoryEventBus } from '../events/bus.js';

type CellRecord = {
  summary: CellSummary;
};

export class InMemoryStore {
  private bus: InMemoryEventBus;
  private cells = new Map<string, CellRecord>();
  private questions = new Map<string, Question>();

  constructor(bus: InMemoryEventBus) {
    this.bus = bus;
  }

  listCells(): CellSummary[] {
    return [...this.cells.values()].map((r) => r.summary);
  }

  getQuestion(id: string) {
    return this.questions.get(id);
  }

  upsertCell(cellId: string, patch: Partial<CellSummary>) {
    const now = Date.now();

    const base: CellSummary =
      this.cells.get(cellId)?.summary ?? {
        cellId,
        guard: { role: 'guard', state: 'starting', lastSeenAt: now },
        resident: { role: 'resident', state: 'starting', lastSeenAt: now },
        janitor: { role: 'janitor', state: 'starting', lastSeenAt: now },
        lastSeenAt: now,
      };

    const merged: CellSummary = {
      ...base,
      ...patch,
      lastSeenAt: now,
      guard: { ...base.guard, ...(patch.guard ?? {}), lastSeenAt: now },
      resident: { ...base.resident, ...(patch.resident ?? {}), lastSeenAt: now },
      janitor: { ...base.janitor, ...(patch.janitor ?? {}), lastSeenAt: now },
    };

    this.cells.set(cellId, { summary: merged });
    this.bus.publish({ type: 'cell.upsert', data: merged });
  }

  removeCell(cellId: string) {
    this.cells.delete(cellId);
    this.bus.publish({ type: 'cell.remove', data: { cellId } });
  }

  appendLog(scope: 'overseer' | 'cell', agent: AgentRole, message: string, cellId?: string) {
    const e: LogEvent = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      scope,
      cellId,
      agent,
      message,
    };
    this.bus.publish({ type: 'log', data: e });
    return e;
  }

  createQuestion(input: {
    scope: 'overseer' | 'cell';
    fromAgent: AgentRole;
    prompt: string;
    cellId?: string;
  }) {
    const q: Question = {
      id: crypto.randomUUID(),
      scope: input.scope,
      cellId: input.cellId,
      fromAgent: input.fromAgent,
      prompt: input.prompt,
      status: 'open',
      createdAt: Date.now(),
    };
    this.questions.set(q.id, q);
    this.bus.publish({ type: 'question.upsert', data: q });
    return q;
  }

  answerQuestion(id: string, answer: string) {
    const q = this.questions.get(id);
    if (!q) return undefined;
    if (q.status !== 'open') return q;

    const next: Question = {
      ...q,
      status: 'answered',
      answer,
      answeredAt: Date.now(),
    };
    this.questions.set(id, next);
    this.bus.publish({ type: 'question.upsert', data: next });
    return next;
  }

  snapshotForSubscriber(filter: (m: SseEnvelope) => boolean) {
    const events: SseEnvelope[] = [];

    for (const cell of this.listCells()) {
      const ev: SseEnvelope = { type: 'cell.upsert', data: cell };
      if (filter(ev)) events.push(ev);
    }

    for (const q of this.questions.values()) {
      const ev: SseEnvelope = { type: 'question.upsert', data: q };
      if (filter(ev)) events.push(ev);
    }

    return events;
  }

  touchAgentState(cellId: string, role: Exclude<AgentRole, 'overseer'>, state: AgentState) {
    this.upsertCell(cellId, { [role]: { role, state, lastSeenAt: Date.now() } } as any);
  }
}
