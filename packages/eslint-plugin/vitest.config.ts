import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup/rule-tester.ts'],
    testTimeout: 20_000,
    coverage: {
      // Measure and report only — no thresholds are configured, and none
      // should be added here. A number that has to be gamed to stay green
      // teaches the opposite habit of what coverage is for.

      // On for every `test` run, so the suites run once and that run is the measurement.
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
})
