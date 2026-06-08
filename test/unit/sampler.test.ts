import { describe, it, expect } from 'vitest';
import { createMcpSampler } from '../../src/mcp/sampler.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('createMcpSampler', () => {
  it('throws a helpful error when the client lacks sampling capability', async () => {
    const fake = { server: { getClientCapabilities: () => undefined } } as unknown as McpServer;
    const sampler = createMcpSampler(fake);
    await expect(sampler({ prompt: 'hi' })).rejects.toThrow(/does not support sampling/i);
  });

  it('returns text when sampling is supported', async () => {
    const fake = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: async () => ({
          role: 'assistant',
          content: { type: 'text', text: 'hello world' },
          model: 'm',
        }),
      },
    } as unknown as McpServer;
    const sampler = createMcpSampler(fake);
    expect(await sampler({ prompt: 'x' })).toBe('hello world');
  });
});
