import type { InMemoryStore } from '../state/store';

const sample = [
  'Spawning cell',
  'Checking environment',
  'Pulling context',
  'Thinking…',
  'Writing output',
  'Awaiting user',
  'Resuming task',
  'Cleaning up',
];

function rand<T>(a: T[]) {
  return a[Math.floor(Math.random() * a.length)]!;
}

export function startDemoSimulator(store: InMemoryStore) {
  // Overseer chatter
  setInterval(() => {
    store.appendLog('overseer', 'overseer', rand(sample));
  }, 2500);

  // Spawn / update ephemeral cells
  const cellIds = ['alpha', 'bravo', 'charlie'];

  setInterval(() => {
    const cellId = rand(cellIds);
    store.upsertCell(cellId, {});

    const who = rand(['guard', 'resident', 'janitor'] as const);
    const state = rand(['running', 'waiting', 'idle'] as const);
    store.touchAgentState(cellId, who, state);

    store.appendLog('cell', who, rand(sample), cellId);

    // Occasionally ask a question
    if (Math.random() < 0.12) {
      store.createQuestion({
        scope: 'cell',
        cellId,
        fromAgent: who,
        prompt: `(${who}) Need input for ${cellId}: choose a direction?`,
      });
    }
  }, 1800);
}
