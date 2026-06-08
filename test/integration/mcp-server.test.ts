import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { buildServer } from '../../src/mcp/server.js';
import { upsertAccount } from '../../src/services/account-registry.js';

interface ToolText {
  content: { type: string; text: string }[];
  isError?: boolean;
}
function parse(res: unknown): any {
  const r = res as ToolText;
  return JSON.parse(r.content[0]!.text);
}

let client: Client;

beforeAll(async () => {
  const server = buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: 'test-client', version: '0' }, { capabilities: { sampling: {} } });
  // Stub the host model so generate_post (sampling) has something to call.
  client.setRequestHandler(CreateMessageRequestSchema, async () => ({
    role: 'assistant',
    content: { type: 'text', text: 'A thoughtful post about testing MCP servers.' },
    model: 'stub-model',
  }));

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

describe('MCP server', () => {
  it('exposes the expected tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of [
      'list_accounts',
      'get_capabilities',
      'generate_post',
      'publish_now',
      'schedule_post',
      'list_scheduled',
      'cancel_scheduled',
      'daemon_status',
      'get_comments',
      'get_mentions',
      'draft_reply',
      'post_reply',
      'get_post_insights',
      'get_account_insights',
      'generate_report',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('list_accounts reflects connected accounts', async () => {
    const before = parse(await client.callTool({ name: 'list_accounts', arguments: {} }));
    expect(before.count).toBe(0);

    upsertAccount({ platform: 'linkedin', label: 'mcp-test', remoteId: 'urn:li:person:z' });

    const after = parse(await client.callTool({ name: 'list_accounts', arguments: {} }));
    expect(after.count).toBe(1);
    expect(after.accounts[0].platform).toBe('linkedin');
  });

  it('get_capabilities reports LinkedIn abilities', async () => {
    const caps = parse(
      await client.callTool({ name: 'get_capabilities', arguments: { platform: 'linkedin' } }),
    );
    expect(caps.publish.media).toContain('text');
    expect(caps.engagement.reply).toBe(false);
    expect(caps.publish.scheduling).toBe('emulated');
  });

  it('generate_post drafts text via host sampling', async () => {
    const out = parse(
      await client.callTool({
        name: 'generate_post',
        arguments: { platform: 'linkedin', topic: 'launching my MCP', tone: 'excited' },
      }),
    );
    expect(out.text).toContain('testing MCP servers');
    expect(out.length).toBeGreaterThan(0);
  });

  it('schedule_post queues a post that appears in list_scheduled and the queue resource', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'sched' });
    const at = new Date(Date.now() + 3_600_000).toISOString();

    const scheduled = parse(
      await client.callTool({
        name: 'schedule_post',
        arguments: { accountId: acct.id, text: 'scheduled via MCP', at },
      }),
    );
    expect(scheduled.schedulingMode).toBe('local');
    expect(scheduled.postId).toBeTruthy();

    const list = parse(await client.callTool({ name: 'list_scheduled', arguments: {} }));
    expect(list.posts.some((p: { id: string }) => p.id === scheduled.postId)).toBe(true);

    const resource = await client.readResource({ uri: 'social://queue' });
    const queue = JSON.parse(resource.contents[0]!.text as string);
    expect(queue.some((p: { id: string }) => p.id === scheduled.postId)).toBe(true);
  });

  it('cancel_scheduled cancels a queued post', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'cancel' });
    const scheduled = parse(
      await client.callTool({
        name: 'schedule_post',
        arguments: { accountId: acct.id, text: 'to cancel', at: new Date(Date.now() + 3_600_000).toISOString() },
      }),
    );
    const res = parse(
      await client.callTool({ name: 'cancel_scheduled', arguments: { postId: scheduled.postId } }),
    );
    expect(res.canceled).toBe(true);
  });

  it('draft_reply returns a suggested reply via sampling (no send)', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'reply' });
    const out = parse(
      await client.callTool({
        name: 'draft_reply',
        arguments: { accountId: acct.id, commentText: 'Love this!', tone: 'warm' },
      }),
    );
    expect(out.reply).toContain('testing MCP servers');
  });

  it('generate_report returns a per-account array', async () => {
    const out = parse(await client.callTool({ name: 'generate_report', arguments: {} }));
    expect(Array.isArray(out.accounts)).toBe(true);
    // LinkedIn accounts (created in earlier tests) have no analytics -> a note, not metrics.
    expect(out.accounts.some((a: { note?: string }) => typeof a.note === 'string')).toBe(true);
  });

  it('exposes prompts and renders them', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('draft-post');

    const draft = await client.getPrompt({
      name: 'draft-post',
      arguments: { platform: 'linkedin', topic: 'shipping', tone: 'bold' },
    });
    const msg = draft.messages[0]!.content as { type: string; text: string };
    expect(msg.text).toContain('linkedin');

    const weekly = await client.getPrompt({ name: 'weekly-report', arguments: {} });
    expect(weekly.messages.length).toBeGreaterThan(0);
  });

  it('reads the capabilities resource template', async () => {
    const resource = await client.readResource({ uri: 'social://capabilities/youtube' });
    const caps = JSON.parse(resource.contents[0]!.text as string);
    expect(caps.platform).toBe('youtube');
    expect(caps.publish.scheduling).toBe('native');
  });
});
