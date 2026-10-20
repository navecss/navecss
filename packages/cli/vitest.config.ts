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
  },
})
