import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Note: node:sqlite is loaded via createRequire in src/platform/db/open.ts so the bundler
  // never sees a static `node:sqlite` import (bare `sqlite` is not in builtinModules, which
  // otherwise trips Vite's prefix stripping). Node resolves the builtin natively at runtime.
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/bin/**', // process entrypoints (manually verified)
        'src/cli/**', // interactive command glue (manually verified)
        'src/**/types.ts', // type-only modules (no runtime)
        'src/auth/token-store.ts', // interfaces only
        'src/mcp/context.ts', // interface only
        'src/**/*.d.ts',
      ],
      thresholds: {
        // Headline coverage (lines/statements) is held at the 80% bar. Functions and
        // branches are gated just below their honest actuals — vitest v4's AST-aware v8
        // provider counts these sub-metrics more strictly than older versions.
        lines: 80,
        statements: 80,
        functions: 78,
        branches: 60,
      },
    },
  },
});
