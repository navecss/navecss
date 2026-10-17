import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
    testTimeout: 20_000,
    include: ['test/**/*.test.ts'],
    coverage: {
      // Measure and report only — no thresholds are configured, and none should be added here.
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
})
