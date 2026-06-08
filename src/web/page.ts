/**
 * The dashboard is a single self-contained HTML page (inline CSS/JS, no build step). It
 * fetches the local /api/* JSON endpoints and renders accounts, queue, mentions, and insights.
 * Visual direction: dark editorial — strong type hierarchy, intentional spacing, real hover
 * states, status-coloured chips. Deliberately not a default card-grid template.
 */
export function renderDashboardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>social-mcp</title>
<style>
  :root {
    --bg: oklch(16% 0.012 265); --panel: oklch(21% 0.014 265); --panel-2: oklch(25% 0.016 265);
    --text: oklch(95% 0.01 265); --muted: oklch(68% 0.02 265); --line: oklch(30% 0.02 265);
    --accent: oklch(72% 0.16 250); --good: oklch(72% 0.17 150); --warn: oklch(78% 0.16 75);
    --bad: oklch(66% 0.2 25);
    --radius: 14px; --space: clamp(1rem, 0.6rem + 1.5vw, 2rem);
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.5; }
  header { padding: var(--space); border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: clamp(1.4rem, 1rem + 2vw, 2.2rem); letter-spacing: -0.02em; font-weight: 700; }
  header h1 .dot { color: var(--accent); }
  #status { margin-left: auto; font-size: 0.85rem; color: var(--muted); }
  .pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0.6rem;
    border-radius: 999px; font-size: 0.72rem; font-weight: 600; border: 1px solid var(--line); }
  .pill.on { color: var(--good); border-color: color-mix(in oklch, var(--good) 40%, var(--line)); }
  .pill.off { color: var(--warn); }
  nav { display: flex; gap: 0.25rem; padding: 0 var(--space); border-bottom: 1px solid var(--line); }
  nav button { background: none; border: 0; color: var(--muted); padding: 0.9rem 1rem; cursor: pointer;
    font: inherit; font-weight: 600; border-bottom: 2px solid transparent; }
  nav button:hover { color: var(--text); }
  nav button.active { color: var(--text); border-bottom-color: var(--accent); }
  main { padding: var(--space); display: grid; gap: 0.75rem; max-width: 1100px; }
  .row { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 1rem 1.2rem; display: grid; gap: 0.35rem; transition: border-color 120ms, transform 120ms; }
  .row:hover { border-color: color-mix(in oklch, var(--accent) 35%, var(--line)); transform: translateY(-1px); }
  .row .top { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .row .title { font-weight: 600; }
  .row .meta { color: var(--muted); font-size: 0.82rem; }
  .tag { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent);
    background: color-mix(in oklch, var(--accent) 12%, transparent); padding: 0.1rem 0.5rem; border-radius: 6px; }
  .state { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .state.published, .state.active { color: var(--good); }
  .state.queued, .state.draft, .state.new { color: var(--warn); }
  .state.failed, .state.needs_reauth, .state.dead { color: var(--bad); }
  button.act { margin-left: auto; background: var(--panel-2); color: var(--text); border: 1px solid var(--line);
    border-radius: 8px; padding: 0.35rem 0.7rem; cursor: pointer; font: inherit; font-size: 0.8rem; }
  button.act:hover { border-color: var(--bad); color: var(--bad); }
  .empty { color: var(--muted); padding: 2rem 0; text-align: center; }
  pre { margin: 0; font-size: 0.78rem; color: var(--muted); white-space: pre-wrap; }
</style>
</head>
<body>
  <header>
    <h1>social<span class="dot">·</span>mcp</h1>
    <div id="status"></div>
  </header>
  <nav id="tabs">
    <button data-tab="queue" class="active">Queue</button>
    <button data-tab="mentions">Mentions</button>
    <button data-tab="accounts">Accounts</button>
    <button data-tab="insights">Insights</button>
  </nav>
  <main id="view"></main>
<script>
const view = document.getElementById('view');
const statusEl = document.getElementById('status');
let active = 'queue';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = (ms) => ms ? new Date(ms).toLocaleString() : 'ASAP';
const api = (p, opts) => fetch(p, opts).then(r => r.json());

async function refreshStatus() {
  try {
    const s = await api('/api/status');
    statusEl.innerHTML = '<span class="pill ' + (s.running ? 'on' : 'off') + '">'
      + (s.running ? 'daemon running' : 'daemon stopped') + '</span> &nbsp; '
      + s.queued + ' queued · ' + s.inFlight + ' in-flight · ' + s.dead + ' dead';
  } catch { statusEl.textContent = 'offline'; }
}

function rows(html) { return html || '<div class="empty">Nothing here yet.</div>'; }

async function renderQueue() {
  const posts = await api('/api/queue');
  view.innerHTML = rows(posts.map(p => \`
    <div class="row">
      <div class="top">
        <span class="tag">\${esc(p.platform)}</span>
        <span class="state \${esc(p.state)}">\${esc(p.state)}</span>
        <span class="meta">\${when(p.scheduledAt)}</span>
        \${(p.state === 'queued' || p.state === 'draft')
          ? '<button class="act" data-cancel="' + esc(p.id) + '">Cancel</button>' : ''}
      </div>
      <div class="title">\${esc(p.text || '(media post)')}</div>
      \${p.remoteUrl ? '<a class="meta" href="' + esc(p.remoteUrl) + '" target="_blank">' + esc(p.remoteUrl) + '</a>' : ''}
    </div>\`).join(''));
  view.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    await api('/api/cancel?postId=' + encodeURIComponent(b.dataset.cancel), { method: 'POST' });
    render();
  }));
}

async function renderMentions() {
  const items = await api('/api/mentions');
  view.innerHTML = rows(items.map(m => \`
    <div class="row">
      <div class="top"><span class="title">\${esc(m.author || 'someone')}</span>
        <span class="state \${esc(m.status)}">\${esc(m.status)}</span></div>
      <div class="meta">\${esc(m.text || '')}</div>
    </div>\`).join(''));
}

async function renderAccounts() {
  const accts = await api('/api/accounts');
  view.innerHTML = rows(accts.map(a => \`
    <div class="row">
      <div class="top"><span class="tag">\${esc(a.platform)}</span>
        <span class="title">\${esc(a.label)}</span>
        <span class="state \${esc(a.status)}">\${esc(a.status)}</span></div>
      <div class="meta">publish: \${esc((a.capabilities.publish.media || []).join(', '))} ·
        schedule: \${esc(a.capabilities.publish.scheduling)} ·
        reply: \${a.capabilities.engagement.reply ? 'yes' : 'no'} ·
        analytics: \${a.capabilities.analytics.postInsights ? 'yes' : 'no'}</div>
    </div>\`).join(''));
}

async function renderInsights() {
  const data = await api('/api/insights');
  view.innerHTML = rows(data.map(d => \`
    <div class="row">
      <div class="top"><span class="tag">\${esc(d.platform)}</span><span class="title">\${esc(d.label)}</span></div>
      <pre>\${esc(d.cached ? JSON.stringify(d.cached.data, null, 2) : 'no cached insights yet')}</pre>
    </div>\`).join(''));
}

const renderers = { queue: renderQueue, mentions: renderMentions, accounts: renderAccounts, insights: renderInsights };
function render() { renderers[active](); refreshStatus(); }

document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.dataset.tab; if (!tab) return;
  active = tab;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  render();
});

render();
setInterval(refreshStatus, 5000);
</script>
</body>
</html>`;
}
