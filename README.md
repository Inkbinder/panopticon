# panopticon

Opinionated agentic engineering with a harness-based approach.

This repo is a small monorepo:

- **sentinel**: in-memory API server used by the UI (SSE at `GET /api/events`, plus logs/questions/cell endpoints).
- **watchtower**: lightweight realtime UI (React) for dashboards.
- **overseer**: a local process that emits structured logs (to file + console + Sentinel).
- **panopticon-cli**: the CLI that runs diagnostics and starts/stops the local stack.
- **panopticon**: a thin published wrapper that exposes the `panopticon` binary (it just loads `panopticon-cli`).

## Requirements

- Node.js **>= 22**
- npm (uses npm workspaces)

## Quickstart (UI + API)

From the repo root:

```bash
npm install
npm run dev
```

- Sentinel (API): `http://localhost:8787`
- Watchtower (UI): `http://localhost:5173` (proxies `/api` to Sentinel)

### Demo mode

Publishes fake overseer/cell activity into Sentinel:

```bash
npm run dev:demo
```

## CLI

The CLI command is named `panopticon`.

From the repo root (uses the workspace binary):

```bash
npx panopticon doctor
```

Start the full local stack (Sentinel + Watchtower + Overseer):

```bash
npx panopticon start --dev
```

Notes:

- `--dev` runs each package's `dev` script (hot reload / watch). Without `--dev`, the CLI expects built `dist/` outputs.
- `PANOPTICON_DEV=1` is equivalent to `--dev`.
- Windows is not supported directly; use WSL2, a Linux VM, or a Linux dev container.

## Build and test

Build everything:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Platform support

This repository supports **Linux/macOS/WSL2** environments for running the local supervisor and managed processes.

If you're on Windows, use one of:

- **WSL2** (recommended)
- **Dev Container** (VS Code)
- A Linux VM
