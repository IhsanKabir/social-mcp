# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow semver.

## [Unreleased]

### Added
- **Media depth:** Instagram Reels + carousels and Threads video + carousels, with media
  container status polling; YouTube Analytics API time-series.
- **Robustness:** dead-letter retry (`queue dead` / `queue retry`), deeper `account_health`
  (days-until-expiry, needs-reauth), and container poll error/timeout handling.
- **Local web dashboard** (`dashboard` command): a framework-free server + UI for the queue,
  mentions, accounts, and insights.
- **GitHub-ready:** CI workflow, CONTRIBUTING, issue/PR templates, this changelog.

### Changed
- Require **Node.js ≥ 24** (where `node:sqlite` is flag-free).

## [0.1.0] — initial

- MCP server (stdio) + autonomous scheduler daemon over a shared `node:sqlite` (WAL) store.
- Platforms: LinkedIn, Facebook Pages, Instagram, Threads, YouTube, and TikTok (draft-only).
- AI content generation (MCP sampling), publish, schedule (native + emulated), engagement
  (comments + approval-gated replies), analytics, and multi-account reporting.
- OAuth loopback + PKCE; AES-256-GCM encrypted token storage (optional OS keychain).
- Per-platform capability model for graceful degradation.
