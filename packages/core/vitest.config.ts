import path from 'node:path'
import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest's own default is one directory at the workspace root that every package deletes at
    // once when the lockfile changes, which fails a package with ENOTEMPTY. Each config keeps its own.
    fsModuleCachePath: path.resolve(import.meta.dirname, 'node_modules/.vitest-cache/default'),
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
    // The PostCSS plugin prints instead of warning when TURBOPACK is set (postcss-warn.ts), so a
    // shell that exports it would turn every such row that expects a warning red. The rows that
    // want it set it themselves.
    env: { TURBOPACK: '' },
    // A test that builds a real Vite app, the used-atoms ones most of all, takes well under a
    // second alone but queues behind other runs when several share a loaded machine, where one
    // took longer than 20 s. The budget only has to outlast a loaded machine; a hang is still
    // bounded by the job's own timeout. Rows that assert nothing about time set no budget of their
    // own, so this one governs them; a row that measures how its time grows keeps its own.
    testTimeout: 240_000,
    include: ['test/**/*.test.ts'],
    // test/browser/**/*.browser.test.ts is this same glob's problem too
    // (it also ends in .test.ts): those fixtures need real browser globals
    // (document, window) and run only under vitest.browser.config.ts
    // (test:browser). Without this exclude they get picked up here as well
    // and fail with "document is not defined" under the node environment.
    exclude: [...defaultExclude, 'test/browser/**'],
    coverage: {
      // Measure and report only — no thresholds are configured, and none
      // should be added here. A library that is mostly CSS and generated
      // output would have coverage percentages that measure the wrong
      // thing, and a number that has to be gamed to stay green teaches the
      // opposite habit of what coverage is for.

      // On for every `test` run, so the suites run once and that run is the measurement.
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
})
