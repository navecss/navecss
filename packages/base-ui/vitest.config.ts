import { defineConfig } from 'vitest/config'

import { aliasesFor, REACT_18_HOOKS, runs } from './test/support/matrix.ts'

// A V8 garbage-collector crash in Node 24's baseline compiler can kill a test worker with
// SIGSEGV. Remove this once the pinned Node carries the fix.
const NO_SPARKPLUG = '--no-sparkplug'

export default defineConfig({
  test: {
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          execArgv: [NO_SPARKPLUG],
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
          execArgv:
            run.react === '18' ? [NO_SPARKPLUG, '--import', REACT_18_HOOKS] : [NO_SPARKPLUG],
          include: ['test/render/*.test.ts'],
          setupFiles: ['test/support/setup-render.ts'],
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
