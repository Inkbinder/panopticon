# Human Review Items

This repo is designed to make as much as possible mechanically checkable (`npm run check`, `npm run invariants`, `npm run smoke`).

This document lists the remaining decision points that should be explicitly reviewed by a human before merge/release.

## Ownership model

- Humans own the decision and sign-off.
- Agents can (and should) prepare a review packet: what changed, risks, commands run, and how to validate.

## Always review

- Intent and scope: does the change match the plan/spec and avoid scope creep?
- Security and privacy: does the change add new data ingestion, storage, or network exposure?
- UX/product correctness: does the UI or API behavior match expectations (not only tests)?
- Operational impact: does the change affect startup/shutdown, ports, or local developer workflow?

## Review when applicable

- Architecture/process changes:
  - Package boundaries or runtime responsibilities (must also update `docs/architecture.md`).
  - New invariants, new CI gates, or changes to the validation contract (must also update `docs/quality.md`).
- External-facing docs and claims:
  - README changes, docs that state guarantees, or guidance that users will rely on.
- Publishing and releases:
  - Versioning, publish workflows, and any change that affects what ships to npm.

## Suggested review packet (agents can generate)

- Summary: 3–5 bullets describing the behavioral change.
- Surfaces touched: which workspaces/routes/pages are affected.
- Validation run: exact commands executed (usually `npm run check`).
- Risk notes: what could go wrong and what to watch for.
- Rollback plan: how to revert safely if needed.
