# Watchtower

A lightweight realtime UI for Panopticon.

- Overseer dashboard: live logs + list of active cells
- Cell dashboard: live logs + questions
- Realtime transport: SSE (`/api/events`)

## Development

Run the API server (the `sentinel` workspace) and the UI dev server.

- API listens on `http://localhost:8787`
- UI on `http://localhost:5173` (proxies `/api` to the API)

## Notes

This is intentionally in-memory right now for fast iteration. When you need multi-instance scaling, the event bus can be backed by Redis pub/sub (same event schema).
