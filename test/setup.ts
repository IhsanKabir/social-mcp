import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Point every test run at a throwaway home directory so tests never read or write the
 * real ~/.social-mcp. Each test file gets its own worker, so this runs per file.
 * Must execute before any module that imports platform/config/paths.
 */
process.env.SOCIAL_MCP_HOME = mkdtempSync(join(tmpdir(), 'social-mcp-test-'));
process.env.SOCIAL_MCP_LOG_LEVEL = 'silent';
// Encryption passphrase for the token store (tests run headless, no prompt).
process.env.SOCIAL_MCP_KEY = 'test-passphrase-for-vitest';
