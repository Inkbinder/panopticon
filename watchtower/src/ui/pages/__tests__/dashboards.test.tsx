import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OverseerDashboardPage } from '../OverseerDashboardPage';
import { CellDashboardPage } from '../CellDashboardPage';
import { MockEventSource } from '../../__tests__/testUtils';

let created: MockEventSource[] = [];

beforeEach(() => {
  cleanup();
  created = [];
  vi.stubGlobal('EventSource', function (url: string) {
    const es = new MockEventSource(url);
    created.push(es);
    return es;
  });
});

describe('dashboards', () => {
  it('OverseerDashboardPage handles cell upserts and removals', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <OverseerDashboardPage />
      </MemoryRouter>,
    );

    const es = created[0];

    es.emit('message', {
      type: 'cell.upsert',
      data: {
        cellId: 'alpha',
        lastSeenAt: Date.now(),
        guard: { role: 'guard', state: 'running', lastSeenAt: Date.now() },
        resident: { role: 'resident', state: 'idle', lastSeenAt: Date.now() },
        janitor: { role: 'janitor', state: 'idle', lastSeenAt: Date.now() },
      },
    });

  expect(await screen.findByText('alpha')).toBeTruthy();

    es.emit('message', { type: 'cell.remove', data: { cellId: 'alpha' } });
    // removal is also async
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('alpha')).toBeNull();
  });

  it('CellDashboardPage title uses route param and questions list updates', async () => {
    render(
      <MemoryRouter initialEntries={['/cells/bravo']}>
        <Routes>
          <Route path="/cells/:cellId" element={<CellDashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Cell: bravo logs')).toBeTruthy();

    const es = created[0];
    es.emit('message', {
      type: 'question.upsert',
      data: {
        id: 'q1',
        scope: 'cell',
        cellId: 'bravo',
        fromAgent: 'guard',
        prompt: 'p',
        status: 'open',
        createdAt: 1,
      },
    });

  expect(await screen.findByText('p')).toBeTruthy();

    // update existing question branch
    es.emit('message', {
      type: 'question.upsert',
      data: {
        id: 'q1',
        scope: 'cell',
        cellId: 'bravo',
        fromAgent: 'guard',
        prompt: 'p2',
        status: 'answered',
        answer: 'a',
        createdAt: 1,
        answeredAt: 2,
      },
    });

  expect(await screen.findByText('p2')).toBeTruthy();
  expect(await screen.findByText('answered')).toBeTruthy();
  });
});
