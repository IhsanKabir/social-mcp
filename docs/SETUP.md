# Per-platform setup

Each platform needs **your own developer app**. OAuth client credentials can't be shared, so
every user registers their own. The CLI wizard (`social-mcp setup`) collects the credentials
and runs the OAuth flow; this guide is how to obtain those credentials.

**Redirect URL** (register this exactly in every app): `http://localhost:8765/callback`
(override the base via `oauth.redirectBaseUrl` in `~/.social-mcp/config.json`).

Start with **LinkedIn** — it needs no app review and is the fastest path to a working setup.

---

## LinkedIn (easiest — no app review)

1. Go to <https://www.linkedin.com/developers/apps> → **Create app** (you need a Company Page
   to associate; a placeholder is fine).
2. **Products** tab → add **"Sign In with LinkedIn using OpenID Connect"** and **"Share on
   LinkedIn"**. Both are self-serve (instant).
3. **Auth** tab → add redirect URL `http://localhost:8765/callback`. Copy the **Client ID**
   and **Client Secret**.
4. `social-mcp auth linkedin`.

Notes: personal posting only; no comment/analytics API; tokens (~60 days) can't be silently
refreshed — re-run `auth linkedin` when they expire.

---

## Facebook Pages & Instagram (one Meta app)

1. Go to <https://developers.facebook.com/apps> → **Create app** → type **Business**.
2. Add the **Facebook Login** product. Under its settings, add the redirect URL
   `http://localhost:8765/callback`.
3. **App settings → Basic**: copy **App ID** (→ clientId) and **App Secret** (→ clientSecret).
4. **Facebook:** you need a Facebook **Page** you manage. `social-mcp auth facebook` connects
   the first Page it finds.
5. **Instagram:** convert your IG account to **Business/Creator** and link it to that Facebook
   Page (IG app → Settings → linked accounts). Then `social-mcp auth instagram`.

Notes:
- Managing Pages/accounts you don't own needs **App Review + Business Verification**. Your own
  Page/IG works in development with you added as an app role.
- Instagram publishing needs a **public image URL** (the API fetches it); pass `imageUrls`.
- Tokens are long-lived (~60 days) and auto-re-extended by the daemon's refresh sweep.

---

## Threads (separate Threads app)

1. <https://developers.facebook.com/apps> → your app → add the **Threads API** use case (or
   create a dedicated app for Threads).
2. Configure the Threads redirect URL `http://localhost:8765/callback` and copy the Threads
   **App ID / App Secret**.
3. Your account needs a Threads profile (tied to an IG Business/Creator account).
4. `social-mcp auth threads`.

Notes: new accounts are heavily rate-limited (limits scale with impressions). Long-lived
tokens are refreshed automatically.

---

## YouTube (Google Cloud project)

1. <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library** → enable **YouTube Data API v3** (and **YouTube Analytics
   API** if you want richer analytics later).
3. **OAuth consent screen** → External; add yourself as a **Test user**.
4. **Credentials → Create credentials → OAuth client ID** → type **Web application** → add
   redirect URI `http://localhost:8765/callback`. Copy the **Client ID / Client Secret**.
5. `social-mcp auth youtube`.

Notes (important caveats):
- `youtube.upload`/`youtube.force-ssl` are **restricted scopes**: an unverified app is capped
  at ~100 users, and in **Testing** mode refresh tokens **expire after 7 days** — publish the
  OAuth app to **Production** to stop that (no review needed just to avoid the 7-day expiry).
- Default quota allows **~6 uploads/day** (videos.insert is ~1600 of 10,000 units). The tool
  refuses uploads past that with a clear message; request a quota increase from Google for
  more.

---

## TikTok (deferred)

TikTok's public-posting Content Posting API is gated behind a **manual per-app audit**;
unaudited apps can only post privately, and there's no analytics API for normal developers.
It's deferred in v1 — the architecture leaves a clean adapter slot for it.

---

## After setup

```bash
social-mcp doctor          # confirm everything is connected
social-mcp daemon start    # run the scheduler so scheduled posts publish
```

Remember to set `SOCIAL_MCP_KEY` (your encryption passphrase) in the environment of the CLI,
the daemon, and the Claude Desktop MCP server entry — it must be the same value everywhere.
