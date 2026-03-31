# panopticon
Opinionated agentic engineering with harness-based approach.

## Platform support

This repository currently supports **Linux/macOS** environments for running the local supervisor and managed processes.

If you're on Windows, use one of:

- **WSL2** (recommended): run the repo inside an Ubuntu (or similar) WSL distro.
- **Dev Container** (VS Code): open the repo in a Linux container and run the CLI there.
- A Linux VM.

## Import specifiers (.js extensions)

This repo ships packages as **Node ESM** (`"type": "module"`). In Node's ESM loader, **relative imports must include a file extension** at runtime (for example `./routes/events.js`). TypeScript's `NodeNext` mode enforces the same rule at typecheck time so that `dist/*.js` runs unmodified.

If you want to avoid writing `.js` extensions in source, the practical, Node-compatible option is to **bundle** each package for production (so there are no internal relative imports left to resolve).
