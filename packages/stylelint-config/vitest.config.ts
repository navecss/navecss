import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest's own default is one directory at the workspace root that every package deletes at
    // once when the lockfile changes, which fails a package with ENOTEMPTY. Each config keeps its own.
    fsModuleCachePath: path.resolve(import.meta.dirname, 'node_modules/.vitest-cache/default'),
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
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
