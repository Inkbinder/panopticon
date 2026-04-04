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

## Internal workspace layering (PR10)

Some key internal dependency directions are now enforced mechanically by `npm run invariants`.

- `sentinel` layering (low → high): `events` → `state` → `routes`/`demo`.
	- `sentinel/src/events/**` must not import from `sentinel/src/state/**`, `sentinel/src/routes/**`, or `sentinel/src/demo/**`.
	- `sentinel/src/state/**` must not import from `sentinel/src/routes/**` or `sentinel/src/demo/**`.
- `watchtower` layering (low → high): `ui/realtime` → `ui/widgets` → `ui/pages`.
	- `watchtower/src/ui/realtime/**` must not import from `watchtower/src/ui/widgets/**` or `watchtower/src/ui/pages/**`.
	- `watchtower/src/ui/widgets/**` must not import from `watchtower/src/ui/pages/**`.

## Enforced constraints

The repo now enforces a lightweight subset of those constraints mechanically through `npm run invariants`:

- Workspace source files may not import another workspace's private `src/` or `bin/` tree.
- Sentinel route files must parse ingress data through `sentinel/src/validation.ts`.
- Config readers must validate `panopticon.yaml` with their shared schema before use.
- Watchtower event-stream handling must route payloads through the shared SSE parser.
- Overseer source must use the structured logger path instead of direct `console` calls.

## Worktree runtime model

- The repo default is `runtime.portStrategy: worktree` in `panopticon.yaml`.
- Sentinel and Watchtower derive deterministic local ports from the checkout path when explicit ports are not set.
- Watchtower proxy targets and Overseer Sentinel URLs follow the resolved Sentinel port automatically.
- Explicit port and URL values still override the derived defaults for specialized environments.

When these constraints change, update this file in the same change.