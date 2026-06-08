import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonResult, guard } from '../result.js';
import { daemonStatus } from '../../scheduler/status.js';

export function registerOpsTools(server: McpServer): void {
  server.registerTool(
    'daemon_status',
    {
      title: 'Daemon status',
      description:
        'Whether the autonomous scheduler daemon is running, plus queued/in-flight/dead job counts.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      guard(() => {
        const s = daemonStatus();
        return jsonResult({
          running: s.running,
          pid: s.pid,
          jobs: { queued: s.queued, inFlight: s.inFlight, dead: s.dead },
          hint: s.running
            ? undefined
            : 'Start it with `social-mcp daemon start` so scheduled posts publish.',
        });
      }),
  );
}
