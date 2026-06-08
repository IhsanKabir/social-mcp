import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context.js';
import { listAccounts } from '../services/account-registry.js';
import { listPosts } from '../queue/posts-repo.js';
import { getInsightsCache } from '../services/insights-cache.js';
import { capabilitiesFor } from '../adapters/capabilities.js';
import { isPlatformId } from '../platform/ids.js';

/**
 * Read-only resources let the host load context without a tool round-trip.
 *  - social://accounts             roster + capability summary
 *  - social://queue                scheduled/queued posts
 *  - social://capabilities/{platform}  full capability sheet for one platform
 */
export function registerResources(server: McpServer, _ctx: McpContext): void {
  server.registerResource(
    'accounts',
    'social://accounts',
    {
      title: 'Connected accounts',
      description: 'All connected social accounts with a capability summary.',
      mimeType: 'application/json',
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            listAccounts().map((a) => ({
              id: a.id,
              platform: a.platform,
              label: a.label,
              status: a.status,
              capabilities: capabilitiesFor(a.platform),
            })),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    'queue',
    'social://queue',
    {
      title: 'Post queue',
      description: 'Scheduled and queued posts.',
      mimeType: 'application/json',
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(listPosts(), null, 2) },
      ],
    }),
  );

  server.registerResource(
    'insights',
    new ResourceTemplate('social://insights/{accountId}', { list: undefined }),
    {
      title: 'Cached account insights',
      description: 'Latest cached account-level metrics (refreshed by the daemon).',
      mimeType: 'application/json',
    },
    (uri, variables) => {
      const accountId = String(variables.accountId);
      const cached = getInsightsCache(accountId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(cached ?? { note: 'no cached insights yet' }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'capabilities',
    new ResourceTemplate('social://capabilities/{platform}', { list: undefined }),
    {
      title: 'Platform capabilities',
      description: 'What a platform can/cannot do via its official API.',
      mimeType: 'application/json',
    },
    (uri, variables) => {
      const platform = String(variables.platform);
      if (!isPlatformId(platform)) {
        return {
          contents: [
            { uri: uri.href, mimeType: 'text/plain', text: `Unknown platform: ${platform}` },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(capabilitiesFor(platform), null, 2),
          },
        ],
      };
    },
  );
}
