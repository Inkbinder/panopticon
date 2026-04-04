# Architecture

## Current system

Panopticon is a small Node/TypeScript monorepo with five workspaces:

- `panopticon-cli`: starts and supervises the local stack, and provides diagnostics.
- `sentinel`: exposes the local API surface, SSE event stream, and in-memory state.
- `watchtower`: renders realtime dashboards backed by Sentinel.
- `overseer`: emits structured logs and scheduled task activity.
- `panopticon`: thin package wrapper for publishing the `panopticon` binary.

## Runtime flow

1. `panopticon-cli` starts `sentinel`, `watchtower`, and `overseer`.
2. `overseer` emits structured logs.
3. `sentinel` accepts writes and publishes updates over `/api/events`.
4. `watchtower` consumes the SSE stream and renders current system state.

## Current strengths

- Local stack is easy to boot.
- Runtime roles are separated at the package level.
- The SSE/event-loop model already resembles a lightweight harness.

## Current gaps

- Boundaries are conventional, not mechanically enforced.
- Request/config/event payload validation is not yet defined as a cross-repo invariant.
- There is no documented layering model inside each package.
- There is no end-to-end smoke harness that asserts the full loop works.

## Near-term target architecture constraints

- Define and document allowed package responsibilities.
- Keep cross-package contracts explicit and versioned.
- Parse and validate external data at boundaries.
- Prefer deterministic startup and teardown paths that can be run in CI.

When these constraints change, update this file in the same change.