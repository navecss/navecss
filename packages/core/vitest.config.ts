import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
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
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
})
