import { describe, expect, it } from 'vitest';
import type { Question } from '../types.ts';

describe('types', () => {
  it('allows an open question shape', () => {
    const q: Question = {
      id: 'q1',
      scope: 'cell',
      cellId: 'cell-a',
      fromAgent: 'guard',
      prompt: 'Where should I look?',
      status: 'open',
      createdAt: Date.now(),
    };
    expect(q.status).toBe('open');
  });
});
