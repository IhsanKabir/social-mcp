import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Sampler } from '../content/content-service.js';

/**
 * A Sampler backed by MCP sampling — i.e. the connected host's own model generates the text
 * (free, no API key). If the client doesn't advertise the `sampling` capability, we throw a
 * clear message so the agent can just draft the text itself and pass it to a publish tool.
 */
export function createMcpSampler(server: McpServer): Sampler {
  return async ({ prompt, system, maxTokens }) => {
    const caps = server.server.getClientCapabilities();
    if (!caps?.sampling) {
      throw new Error(
        'This MCP client does not support sampling. Draft the post text yourself and pass it to schedule_post / publish_now (or set an Anthropic API key for autonomous daemon generation).',
      );
    }
    const result = await server.server.createMessage({
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
      systemPrompt: system,
      maxTokens: maxTokens ?? 800,
    });
    if (result.content.type !== 'text') {
      throw new Error('Sampling returned non-text content.');
    }
    return result.content.text;
  };
}
