export type AgentRole = 'overseer' | 'guard' | 'resident' | 'janitor';

export type AgentState = 'idle' | 'starting' | 'running' | 'waiting' | 'done' | 'error';

export type AgentSummary = {
  role: AgentRole;
  state: AgentState;
  lastSeenAt: number;
};

export type CellSummary = {
  cellId: string;
  guard: AgentSummary;
  resident: AgentSummary;
  janitor: AgentSummary;
  lastSeenAt: number;
};

export type LogEvent = {
  id: string;
  ts: number;
  level?: string;
  scope: 'overseer' | 'cell';
  cellId?: string;
  agent: AgentRole;
  message: string;
};

export type QuestionStatus = 'open' | 'answered' | 'expired';

export type Question = {
  id: string;
  scope: 'overseer' | 'cell';
  cellId?: string;
  fromAgent: AgentRole;
  prompt: string;
  status: QuestionStatus;
  answer?: string;
  createdAt: number;
  answeredAt?: number;
};

export type SseEnvelope =
  | { type: 'log'; data: LogEvent }
  | { type: 'cell.upsert'; data: CellSummary }
  | { type: 'cell.remove'; data: { cellId: string } }
  | { type: 'question.upsert'; data: Question };
