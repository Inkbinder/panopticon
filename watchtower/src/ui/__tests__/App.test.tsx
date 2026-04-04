import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';

declare const globalThis: any;

beforeEach(() => {
  cleanup();
  // Minimal EventSource stub so pages using useEventStream don't explode.
  globalThis.EventSource = function () {
    return { addEventListener: () => {}, close: () => {} };
  };
});

describe('App', () => {
  it('renders overseer route by default', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Watchtower')).toBeTruthy();
    expect(screen.getByText('Overseer logs')).toBeTruthy();
  });

  it('renders cell dashboard route', () => {
    // Fix Date locale output instability
    vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('t');

    render(
      <MemoryRouter initialEntries={['/cells/alpha']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Cell: alpha logs')).toBeTruthy();
  expect(screen.getAllByText('Questions').length).toBeGreaterThan(0);
  });
});
