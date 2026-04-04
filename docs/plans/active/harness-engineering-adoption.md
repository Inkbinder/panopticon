# Harness Engineering Adoption Plan

## Goal

Move Panopticon toward the harness-engineering approach described in OpenAI's article by making repository knowledge explicit, validation easier to run, and key engineering constraints mechanically enforceable.

## Non-goals

- Rewriting package internals without a clear harness benefit.
- Adding heavyweight infrastructure before local feedback loops are solid.
- Expanding docs faster than the team can keep them current.

## Baseline assessment

What already exists:

- A runnable local stack with a supervising CLI.
- Tests across core packages.
- Strict TypeScript settings in the workspaces.
- A publish workflow for tagged releases.

What is missing:

- A short agent map and structured docs tree.
- A single root validation command.
- Pull-request CI.
- Boundary validation as an explicit rule.
- Structural enforcement of architecture and repo conventions.

## PR sequence

### PR1: Repository map and plan artifacts

Status: complete.

Scope:

- Add `AGENTS.md`.
- Add `docs/index.md`, `docs/architecture.md`, and `docs/quality.md`.
- Add this execution plan.

Acceptance criteria:

- A contributor can find the repo overview, architecture notes, quality expectations, and active plan from one entry point.
- `AGENTS.md` stays short and acts as a table of contents.

### PR2: Single validation entry point

Status: complete.

Scope:

- Add a root `check` script.
- Standardize `typecheck` and `lint` scripts where missing.
- Decide the minimum required repo-wide validation contract.

Acceptance criteria:

- One command expresses the default validation path for a change.
- Failing checks point clearly to the broken package or rule.

Implemented contract:

- `npm run check` runs root lint, typecheck, and tests.
- Workspace-level `lint` and `typecheck` scripts are available where applicable.

### PR3: Pull-request CI

Status: complete.

Scope:

- Add a CI workflow triggered on pull requests and branch pushes.
- Run `npm ci` and `npm run check`.
- Keep publish workflow focused on release publication.

Acceptance criteria:

- Changes are verified before merge.
- CI coverage matches the local default validation path.

Implemented contract:

- `.github/workflows/ci.yml` runs on pull requests and branch pushes.
- CI installs dependencies with `npm ci` and validates with `npm run check`.
- `.github/workflows/publish.yml` remains focused on tagged release publication.

### PR4: Boundary validation

Status: complete.

Scope:

- Introduce a shared boundary-validation approach for config and HTTP/event payloads.
- Apply it first where data enters the system: config loading, API routes, SSE envelopes.

Acceptance criteria:

- Invalid external input fails early and consistently.
- Route and config behavior becomes easier to test.

Implemented contract:

- Config loading in `sentinel`, `overseer`, and `panopticon-cli` validates `panopticon.yaml` before use.
- Sentinel route params and request bodies are schema-checked at the boundary.
- Watchtower ignores malformed SSE envelopes instead of trusting raw event payloads.

### PR5: Harness smoke tests

Status: complete.

Scope:

- Add a deterministic smoke test for the local stack or its key interactions.
- Verify startup, health, a representative write, and observable output.

Acceptance criteria:

- The core loop can be validated automatically, not only manually.
- Failures indicate where the runtime loop is broken.

Implemented contract:

- `npm run smoke` builds the repo and starts the supervised local stack on isolated temporary ports.
- The smoke test verifies Watchtower startup, Sentinel health through the `/api` proxy, a representative question write, SSE visibility of that write, Overseer runtime output, and clean supervisor shutdown.

### PR6: Architecture and taste invariants

Status: in progress.

Scope:

- Add lightweight structural checks for package boundaries.
- Encode a small set of repo-specific invariants such as structured logging and boundary parsing.
- Tighten the lint baseline after the repo-wide floor introduced in PR2, starting with `no-explicit-any` and stale suppression cleanup.
- Write rule failures as remediation guidance.

Acceptance criteria:

- Important constraints are enforced mechanically.
- Review comments about the same recurring problems become less common.
- The lint contract catches more architectural and typing drift than the PR2 baseline.

Progress so far:

- Repo-wide `@typescript-eslint/no-explicit-any` is re-enabled and the current usages have been removed.
- Remaining PR6 work is structural enforcement and remediation-oriented rule design.

### PR7: Worktree-friendly local harness

Scope:

- Make multi-worktree development less collision-prone through deterministic port handling or automatic port assignment.
- Document the operating model.

Acceptance criteria:

- Two local copies of the repo can run without manual port edits.
- The harness becomes safer for concurrent agent work.

## Risks

- Over-documenting before checks exist will create stale guidance.
- Adding too many rules at once will slow adoption and generate noisy failures.
- End-to-end harnesses can become flaky if they rely on timing instead of explicit readiness.

## Success markers

- New contributors can answer "how do I validate a change?" from repo docs alone.
- The default local and CI validation paths are the same.
- Invalid external input is rejected predictably.
- A small set of mechanical checks prevents common regressions.