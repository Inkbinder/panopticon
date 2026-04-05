# Panopticon MVP Roadmap

## Goal

Deliver a locally runnable “agent work supervision loop” that is:

- Useful to a human engineer day-to-day (visibility + fewer wasted CI cycles).
- Friendly to agents (explicit contracts, deterministic checks, remediation-oriented failures).
- Incrementally adoptable (MVP first, then agent-runner + PR workflow integrations).

This plan intentionally avoids committing to one “agent framework” until we agree what Panopticon should integrate with first.

## What exists today (baseline)

Already implemented in this repo:

- A supervised local stack (`panopticon-cli` starts Sentinel + Watchtower + Overseer).
- An in-memory event hub + SSE transport (`sentinel`).
- A realtime UI backed by SSE (`watchtower`).
- A structured logging emitter (`overseer`).
- A local validation contract (`npm run check`), invariants (`npm run invariants`), and a runtime smoke harness (`npm run smoke`).

## MVP definition (we should agree)

MVP is a single, end-to-end slice of the target workflow:

- **Single cell loop**: queued → running (Citizen) → validating (Guard) → succeeded/failed
- **Guard-in-the-loop**: Guard is the gate between “Citizen says done” and “Warden accepts”, and Guard output is suitable for re-prompting the Citizen
- **Warden-defined cell**: the Warden creates the cell tasks from the Overseer’s work context and constrains the cell’s allowed filesystem scope
- **Minimal visibility**: Watchtower shows the cell status, Guard output, and PR creation outcome (link + status)
- **Auto PR creation**: when the cell succeeds, Warden creates a PR automatically (GitHub first)
- **MVP state**: runtime coordination/state is in-memory; persist only artifacts needed for audit/debug (structured logs, Guard results, PR link)

This is intentionally minimal: one cell, one PR. Multi-cell parallelism and full cellblock semantics are follow-on.

### Primary user (MVP)

The primary user for MVP is the **engineer running locally** to supervise and deliver work. Agents are also a first-class “user” of the system through the fast local feedback loop (Guard output + deterministic checks), but the MVP should optimize for the human engineer experience end-to-end.

### MVP expansions (post-0.1)

These are not separate MVPs; they are incremental expansions of the same product:

- **Richer visibility**: more dashboards/history, searchable views, better summaries
- **Broader Guard coverage**: configurable check lists, per-repo policies, richer remediation hints
- **Multi-cell / cellblocks**: Warden can decompose work into multiple parallel cells and open a PR when the cellblock is complete
- **External agent adapters**: plug in real agent runners (Copilot/Claude/Codex/etc.)

#### Multi-cell collision policy (design note)

Multiple cells are sensible, but only when the Warden can keep their change scopes disjoint.

- Default strategy (safe): Warden assigns each cell an explicit scope (paths/files/owned modules) and rejects/serializes work that overlaps.
- Parallel execution is safe when cells operate on disjoint file sets or disjoint modules.
- When overlap is likely, run cells sequentially or isolate each cell in its own git worktree/branch and merge results deliberately.

MVP assumes a single cell to avoid collisions; multi-cell is an expansion gated on having an explicit scope/merge strategy.

## Release plan

### Release 0.1 — MVP

Status: planned.

Scope:

- Clarify the domain model in docs: **Overseer / Warden / Citizen / Guard** vs what exists in code today.
- Ensure Watchtower surfaces the MVP primitives (cell lifecycle, Guard output, PR outcome).
- Tighten the API/UI contract tests for the MVP behavior.
- Define the minimal “auto PR” contract and keep it small (GitHub first).

Acceptance criteria:

- `npm run check` remains the default validation contract.
- The MVP flow can be exercised locally and is covered by a deterministic test path (unit/integration and/or smoke).
- Watchtower reflects state transitions with no manual refresh.
- On successful completion of the MVP workflow, a PR is created automatically.

Implemented contract (target):

- Documented MVP definition and UX entrypoints in `README.md`.
- A single documented “happy path” that a new contributor can follow.
- A documented PR-creation path that works on GitHub checkouts.

### Release 0.2 — Guard + results reporting (if not chosen for MVP)

Status: planned.

Scope:

- Add `panopticon guard` command in the CLI.
- Emit guard run results into Sentinel so Watchtower can show:
  - command list + status
  - failure remediation hints
  - timing and summary

Acceptance criteria:

- Guard results are visible via API + UI.
- Guard can be run repeatedly without leaking processes.

### Release 0.3 — External agent integration (first adapter)

Status: planned.

Scope:

- Define a small “Agent Runner Adapter” interface (spawn, stream logs, exit status, workspace root).
- Implement **one** adapter for the primary target: **Copilot**.
- Post “cell execution” events + logs into Sentinel.

Acceptance criteria:

- A single cell can be dispatched to the external runner and observed end-to-end in Watchtower.
- Failures feed back remediation hints (at least: command output + which invariant/check failed).

### Release 1.0 — Multi-cell orchestration + workflow fit

Status: planned.

Scope:

- Define minimal orchestration semantics (queue, retry policy, cancellation).
- Ensure shutdown/cleanup is deterministic.
- Document operational model clearly (what Panopticon guarantees and what it doesn’t).

Acceptance criteria:

- “Agent work session” can be supervised locally, produces structured traces, and has deterministic cleanup.
- Repo documentation matches behavior and is enforced by `docs:check`/invariants where possible.

## Work items (next 1–2 PRs)

1. Align documentation with reality (no hand-wavy nouns)
   - Update README “Nuts and Guts” section to distinguish:
     - implemented components (Sentinel/Watchtower/Overseer/CLI)
     - aspirational components (Warden/Citizen/Guard orchestration)
2. Lock the MVP contract (single cell loop + Guard + auto PR + minimal visibility).
3. Add/adjust tests to lock down the MVP contract.

## Auto PR contract (MVP)

For MVP, “auto PR creation” means:

- Warden creates a branch for the cell.
- Warden commits changes with a deterministic message.
- Warden pushes the branch to `origin`.
- Warden opens a PR automatically against the default branch.

### Provider plugin model

PR creation must be implemented behind a small “forge provider” plugin interface so we can extend beyond GitHub later.

- Selection mechanism: `panopticon.yaml` `runtime.repo.forge` (initial values: `github`, `gitlab`, `bitbucket`).
- Default behavior (if omitted): `github`.

The interface contract should cover:

- detect capability + provide actionable diagnostics (e.g. missing CLI, not authenticated)
- create branch + commit + push
- open PR against base branch

Initial implementation target: `github` provider using the GitHub CLI (GitHub-only for MVP).

- Mechanism: `gh pr create` (requires `gh` installed and authenticated).
- The system should emit clear, remediation-oriented failures when PR creation is not possible (missing `gh`, not authenticated, no remote, incompatible remote).

MVP prerequisite (opinionated): require both `gh` and the Copilot CLI tooling to be installed and authenticated.

Non-goal for MVP: implementing GitLab/Bitbucket providers. Those become follow-on provider plugins.

## Open questions

None.

## Risks

- Trying to build the full Overseer/Warden/Citizen hierarchy too early will create a lot of surface area without proving usefulness.
- Without a clear MVP “north star”, the UI can drift into a generic dashboard that doesn’t reduce cycle time.
- Integration with closed-source agents may require “best effort” adapters; keep the core model runner-agnostic.
