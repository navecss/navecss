import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
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
