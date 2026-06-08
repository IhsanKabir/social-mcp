import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Wrap a tool handler so thrown errors become a clean isError result instead of crashing. */
export async function guard(
  fn: () => Promise<CallToolResult> | CallToolResult,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    return errorResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
