# social-mcp

A local, **clone-and-run** [MCP](https://modelcontextprotocol.io) server **+ autonomous
scheduler** for managing multiple social media accounts via **official platform APIs**.

Drive it from Claude (Desktop / Code), and let a background daemon publish your queued posts
and pull analytics on its own — all on your machine, with your own developer-app credentials.
Nothing is sent to any third-party service.

## Platforms (v1)

| Platform | Publish | Schedule | Comments | Reply | Analytics |
|----------|:---:|:---:|:---:|:---:|:---:|
| **LinkedIn** | text/image/video | emulated¹ | — | — | — |
| **Facebook Pages** | text/image | native | ✓ | ✓ | ✓ |
| **Instagram** | image² | emulated¹ | ✓ | ✓ | ✓ |
| **Threads** | text/image | emulated¹ | ✓ | ✓ | ✓ |
| **YouTube** | video | native | ✓ | ✓ | ✓ |
| TikTok | _deferred_³ | | | | |

¹ *emulated* = the platform has no scheduling API, so the local daemon holds the post and
publishes it at the target time. ² Instagram requires a public image URL. ³ TikTok public
posting is gated behind a per-app manual audit, with no analytics API for normal developers —
deferred until the core is proven.

## What it does

- **AI content generation** — draft posts in your voice using your Claude session (free, no
  API key); the daemon can generate unattended with an optional Claude API key.
- **Publish & schedule** — post now or queue for later; native scheduling where it exists,
  emulated by the daemon where it doesn't.
- **Engagement** — read comments, AI-draft replies; replies are **held for your approval**
  (the daemon never auto-replies).
- **Analytics** — per-post/account metrics and a multi-account report.

## How it works

Two processes share one local SQLite database (`~/.social-mcp/state.db`, WAL mode) — no
Redis, no services to run:

- the **MCP server** (stdio) that Claude talks to — it drafts and enqueues;
- the **daemon** that claims due jobs and actually publishes, plus cron jobs for token
  refresh, an analytics cache, and a comment poll.

A per-platform **capability model** means the agent always knows what each account can and
can't do, and degrades gracefully (e.g. "LinkedIn has no comment API") instead of erroring.

## Requirements

- **Node.js ≥ 22** (uses the built-in `node:sqlite` — zero native build steps).
- Your own developer app per platform you want (each platform is optional). See
  [docs/SETUP.md](docs/SETUP.md).

## Quick start

```bash
npm install
npm run build
npm run cli -- setup        # interactive: pick platforms, enter creds, authorize
npm run cli -- doctor       # verify config, DB, and connected accounts
npm run cli -- daemon start # run the scheduler (keep this running)
```

Set an **encryption passphrase** so tokens can be encrypted at rest. It must be the same
value across the CLI, daemon, and MCP server:

```powershell
$env:SOCIAL_MCP_KEY = "a-strong-passphrase"   # PowerShell
```
```bash
export SOCIAL_MCP_KEY="a-strong-passphrase"    # bash
```

## Wire it into Claude Desktop

Add to `claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "social-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/social-mcp/dist/bin/mcp-server.js"],
      "env": { "SOCIAL_MCP_KEY": "a-strong-passphrase" }
    }
  }
}
```

Then ask Claude things like *"Draft a LinkedIn post about our launch and schedule it for
tomorrow 9am"* — it calls `generate_post` → `schedule_post`, and the daemon publishes it.

## CLI reference

| Command | What it does |
|---------|--------------|
| `setup` | Interactive first-run wizard |
| `auth <platform>` | Connect an account via OAuth |
| `accounts list` / `accounts remove <id>` | Manage connected accounts |
| `publish <id> --text "…"` | Publish now |
| `schedule <id> --text "…" [--at <ISO>]` | Queue a post |
| `queue list` / `queue cancel <postId>` | Inspect/cancel the queue |
| `daemon start` / `status` / `stop` | Control the scheduler |
| `doctor` | Diagnostics |

## MCP tools

`list_accounts`, `get_capabilities`, `account_health`, `generate_post`, `publish_now`,
`schedule_post`, `list_scheduled`, `cancel_scheduled`, `get_comments`, `get_mentions`,
`draft_reply`, `post_reply`, `get_post_insights`, `get_account_insights`, `generate_report`,
`daemon_status`. Resources: `social://accounts`, `social://queue`,
`social://capabilities/{platform}`, `social://insights/{accountId}`.

## Security

- OAuth tokens are **encrypted at rest** (AES-256-GCM, scrypt-derived key). Secrets are never
  logged or returned by list operations. Optional OS keychain store via `keytar` (opt-in).
- OAuth uses a **loopback redirect + PKCE** (where the provider supports it).
- The MCP server logs only to stderr/file — stdout is reserved for the JSON-RPC stream.
- All state lives under `~/.social-mcp/` (outside the repo); `doctor` warns if that's ever
  inside a git work tree.

## Develop

```bash
npm run typecheck
npm test           # vitest
npm run test:cov   # coverage gate
```

## License

MIT
