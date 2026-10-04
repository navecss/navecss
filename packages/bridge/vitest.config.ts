import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
    include: ['test/**/*.test.ts'],
  },
})
