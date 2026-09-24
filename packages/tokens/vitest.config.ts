import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
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
