import { loadConfig } from '../../platform/config/load.js';
import { createDashboardServer } from '../../web/server.js';

/** `social-mcp dashboard` — serve the local web dashboard (127.0.0.1 only). */
export async function dashboardCommand(): Promise<void> {
  const config = loadConfig();
  const port = config.web.port;
  const server = createDashboardServer();

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      process.stdout.write(`social-mcp dashboard → http://localhost:${port}  (Ctrl+C to stop)\n`);
      resolve();
    });
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
