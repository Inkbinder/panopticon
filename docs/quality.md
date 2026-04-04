# Quality

## Current definition of done

Today, the repo can usually validate a change with some subset of:

- `npm run check`
- `npm run smoke`
- `npm run build`
- `npm test`
- package-level `typecheck`
- package-level `lint`

`npm run check` is now the default local validation contract. It runs lint, typecheck, tests, and the built harness smoke test across the workspaces.

`npm run smoke` is the focused runtime contract for the harness itself. It builds the repo, starts the supervised stack on temporary ports, verifies health through Watchtower's proxy, performs a representative write, confirms the result through SSE, and checks that shutdown is clean.

## Current lint baseline

The current lint baseline is intentionally conservative:

- Shared ESLint configuration runs across the workspaces.
- React hook and refresh rules are enforced in `watchtower`.
- The repo does not yet fail lint on `@typescript-eslint/no-explicit-any`.

That last point is temporary. PR2 established a runnable floor for the whole monorepo; PR6 is where the baseline should become meaningfully stricter.

## Gaps to close

- No shared boundary-validation convention for config, HTTP payloads, and event envelopes.
- No structural checks for package boundaries or allowed dependency directions.
- No doc freshness or cross-link validation.

## Target invariants

These are the first invariants to encode mechanically:

1. Every behavior change is covered by a deterministic validation path.
2. External inputs are parsed at the boundary.
3. Structured logs remain machine-readable across services.
4. The local harness can start and stop cleanly.
5. Repository guidance lives in versioned docs, not only in chat or memory.

## PR6 lint tightening target

PR6 should tighten the lint contract in small, explicit steps:

1. Re-enable `@typescript-eslint/no-explicit-any` after the current usages are removed or isolated behind deliberate escapes.
2. Fail on unused lint suppression comments so bypasses cannot accumulate silently.
3. Add repo-specific rules for structural constraints once package boundaries are documented precisely.
4. Write remediation-oriented error messages so failures tell agents and contributors how to fix the issue.

## Recommended rollout

1. Introduce a root `check` command.
2. Add PR CI that runs `npm ci` and `npm run check`.
3. Add missing lint/typecheck scripts consistently across workspaces.
4. Add an end-to-end smoke test for the local stack.
5. Promote recurring review feedback into docs or checks.