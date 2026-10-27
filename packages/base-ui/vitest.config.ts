import path from 'node:path'
import { defineConfig } from 'vitest/config'

import { aliasesFor, REACT_18_HOOKS, runs } from './test/support/matrix.ts'

// The React 18 runs preload a resolve hook that points every `react` at the React 18 copies.
const preload = (react: string): string[] => (react === '18' ? ['--import', REACT_18_HOOKS] : [])

export default defineConfig({
  test: {
    // Vitest's own default is one directory at the workspace root that every package deletes at
    // once when the lockfile changes, which fails a package with ENOTEMPTY. Each config keeps its own.
    fsModuleCachePath: path.resolve(import.meta.dirname, 'node_modules/.vitest-cache/default'),
    testTimeout: 20_000,
    // Vitest gives a test worker 60 s to start and offers no setting for that. Every project here
    // starts its own workers, and on a machine running other suites a dozen of them starting at once
    // each missed it. Three at a time missed it far less often in a slowed run of this package alone;
    // beside other packages' suites, at a load of about 80, some still did.
    maxWorkers: 3,
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
          // A row that runs the registry generator took 21.5 s in a `ci:check` beside other
          // sessions' suites, against the 20 s every row gets. No row asserts how long it takes, so
          // the budget only has to outlast a loaded machine.
          testTimeout: 240_000,
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
          // A render test renders whole scenes, a hook can render them too (the minor-version
          // files render in `beforeAll`), and a run shares the machine with every other package's
          // tests in `ci:check`.
          testTimeout: 60_000,
          hookTimeout: 60_000,
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
