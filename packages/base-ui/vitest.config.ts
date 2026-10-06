import { defineConfig } from 'vitest/config'

import { aliasesFor, REACT_18_HOOKS, runs } from './test/support/matrix.ts'

// The React 18 runs preload a resolve hook that points every `react` at the React 18 copies.
const preload = (react: string): string[] => (react === '18' ? ['--import', REACT_18_HOOKS] : [])

export default defineConfig({
  test: {
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // A V8 garbage-collector crash in Node 24's baseline compiler can kill a test worker with
          // SIGSEGV. Remove this once the pinned Node carries the fix.
          execArgv: ['--no-sparkplug'],
          include: ['test/*.test.ts'],
        },
      },
      ...runs.map((run) => ({
        extends: true,
        resolve: { alias: aliasesFor(run) },
        test: {
          name: run.name,
          environment: 'jsdom' as const,
          env: { NAVE_BASE_UI: run.baseUi, NAVE_REACT: run.react },
          // Same crash as above.
          execArgv: ['--no-sparkplug', ...preload(run.react)],
          include: ['test/render/*.test.ts'],
          setupFiles: ['test/support/setup-render.ts'],
          // A render test renders whole scenes, and a run shares the machine with every other
          // package's tests in `ci:check`.
          testTimeout: 60_000,
        },
      })),
    ],
    coverage: {
      // Measure and report only: a threshold that has to be gamed to stay green teaches the
      // opposite habit of what coverage is for.

      // On for every `test` run, so the suites run once and that run is the measurement.
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
})
