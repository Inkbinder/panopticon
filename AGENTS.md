# AGENTS

This repository is designed to support a harness-first, agent-legible workflow.

Use this file as a map, not as the full source of truth.

## Start here

- Read [README.md](README.md) for the product overview and local quickstart.
- Read [docs/index.md](docs/index.md) for the repository map.
- Read [docs/architecture.md](docs/architecture.md) before changing package boundaries or runtime flow.
- Read [docs/quality.md](docs/quality.md) before changing tests, logging, validation, or CI.

## Repository layout

- `panopticon-cli`: supervisor CLI for diagnostics and starting/stopping the local stack.
- `sentinel`: local API server with SSE transport and in-memory state.
- `watchtower`: realtime UI for overseer and cell dashboards.
- `overseer`: local process that emits structured activity and logs.
- `panopticon`: thin published wrapper that exposes the `panopticon` binary.

## Working rules

- Prefer small, verifiable changes over broad refactors.
- Keep repo knowledge in versioned markdown, not only in prompts or chat.
- Preserve package boundaries unless the change explicitly updates architecture docs.
- Add or update tests when behavior changes.
- Prefer deterministic local validation that can be run from the repo root.

## Validation

Current root commands:

- `npm run dev`
- `npm run dev:demo`
- `npm run check`
- `npm run invariants`
- `npm run smoke`
- `npm run build`
- `npm test`

The checked-in `panopticon.yaml` defaults to worktree-derived local ports. If a local run does not appear on `8787/5173`, read the startup logs for the resolved URLs.

Package-level commands vary. Before adding new rules, update the relevant package scripts and document them in [docs/quality.md](docs/quality.md).

## Active plan

- Harness engineering adoption plan: [docs/plans/active/harness-engineering-adoption.md](docs/plans/active/harness-engineering-adoption.md)

## When changing architecture or process

- Update [docs/architecture.md](docs/architecture.md) if boundaries or runtime responsibilities change.
- Update [docs/quality.md](docs/quality.md) if the definition of done changes.
- Add a plan entry under `docs/plans/active/` for multi-step work.