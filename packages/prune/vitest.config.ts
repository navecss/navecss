import { defineConfig } from 'vitest/config'

/**
 * The rows that hold a stylesheet's `@nave` problems. Next.js sets `TURBOPACK` in the process that
 * runs PostCSS on its default bundler, and core's PostCSS plugin reports a problem differently
 * there, so these rows run a second time with it set.
 */
const DIRECTIVE_ROWS = [
  'test/directive-turbopack.test.ts',
  'test/plugin-directive-problems.test.ts',
  'test/plugin-layer-sheet.test.ts',
  'test/plugin-never-throws.test.ts',
  'test/plugin-stylesheet-records.test.ts',
  'test/plugin-without-wrapper.test.ts',
]

export default defineConfig({
  test: {
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
    testTimeout: 20_000,
    coverage: {
      // Measure and report only — no thresholds are configured, and none should be added here.
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
    projects: [
      // A shell that exports TURBOPACK would otherwise decide which way every row runs.
      {
        extends: true,
        test: { name: 'node', include: ['test/**/*.test.ts'], env: { TURBOPACK: '' } },
      },
      {
        extends: true,
        test: { name: 'turbopack', include: DIRECTIVE_ROWS, env: { TURBOPACK: '1' } },
      },
    ],
  },
})
