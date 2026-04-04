import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionCard } from '../QuestionCard';
import type { Question } from '../../types';

describe('QuestionCard', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders answered question with answer', () => {
    const q: Question = {
      id: 'q1',
      scope: 'overseer',
      fromAgent: 'overseer',
      prompt: 'p',
      status: 'answered',
      answer: 'done',
      createdAt: 1,
      answeredAt: 2,
    };

    render(<QuestionCard question={q} />);

  expect(screen.getByText('answered')).toBeTruthy();
    expect(screen.getByText(/Answer:/)).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
  });

  it('submits answer for open question and clears input', async () => {
    const q: Question = {
      id: 'q2',
      scope: 'cell',
      cellId: 'c1',
      fromAgent: 'guard',
      prompt: 'help',
      status: 'open',
      createdAt: Date.now(),
    };

    const user = userEvent.setup();

    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<QuestionCard question={q} />);

    const input = screen.getByPlaceholderText('Type answer…') as HTMLInputElement;
    const btn = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

    expect(btn.disabled).toBe(true);

    await user.type(input, ' ok ');
    expect(btn.disabled).toBe(false);

    await user.click(btn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('throws on non-ok fetch responses', async () => {
    const q: Question = {
      id: 'q3',
      scope: 'overseer',
      fromAgent: 'overseer',
      prompt: 'p',
      status: 'open',
      createdAt: Date.now(),
    };

    const user = userEvent.setup();

    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'nope' }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<QuestionCard question={q} />);

  const input = screen.getByPlaceholderText('Type answer…') as HTMLInputElement;
    const btn = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

    await user.type(input, 'ok');

    // click should not crash the test; component doesn't display error but it must stop busy state
    await user.click(btn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // input should remain (since request failed)
    expect(input.value).toBe('ok');
  });
});
