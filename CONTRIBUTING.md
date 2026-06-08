# Contributing to social-mcp

Thanks for your interest! social-mcp is a local, clone-and-run MCP server + scheduler for
social media. This guide covers local development.

## Prerequisites

- **Node.js ≥ 24** (the project uses the built-in `node:sqlite`, which is flag-free from
  Node 24 — no native build tools needed).

## Setup

```bash
npm install
npm run build
```

State and secrets live under `~/.social-mcp/` (override with `SOCIAL_MCP_HOME`). Tests run
against a throwaway home automatically, so they never touch your real config.

## Workflow

```bash
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run test:cov       # vitest + coverage gate
npm run cli -- doctor  # run the CLI in dev (tsx)
```

CI (`.github/workflows/ci.yml`) runs typecheck + build + coverage on every push/PR.

## Project layout

- `src/platform/` — infra: db (`node:sqlite`), http, crypto, config, logger
- `src/auth/` — OAuth (loopback + PKCE), token stores, per-platform profiles/providers
- `src/adapters/` — one folder per platform behind the `SocialAdapter` interface
- `src/queue/`, `src/scheduler/` — job queue + the autonomous daemon
- `src/services/` — orchestration shared by the MCP server and the daemon
- `src/mcp/` — the MCP server (tools, resources, prompts)
- `src/web/` — the local dashboard
- `src/cli/`, `src/bin/` — CLI commands and process entrypoints

## Adding a platform

1. Create `src/adapters/<platform>/adapter.ts` implementing `SocialAdapter`, plus thin
   HTTP helpers (test them against a stub server with a `baseUrl` override).
2. Add a static entry to `src/adapters/capabilities.ts`.
3. Add an OAuth profile under `src/auth/profiles/` and register it in `src/auth/providers.ts`.
4. Register the adapter in `src/adapters/register.ts`.
5. Add stub-based tests for publish/comments/insights and the auth identity resolver.

## Conventions

- TypeScript strict, ESM with `.js` import specifiers, files < 800 lines.
- No `console.*` in `src/` — use the logger (stdout is the MCP JSON-RPC channel).
- Never log or return secrets; tokens are encrypted at rest.
- Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Keep the coverage gate green (`npm run test:cov`).
