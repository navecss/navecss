import { defineConfig } from 'vitest/config'

/**
 * Tests that start a Vite dev server or preview in this process and drive a real Chromium
 * against it from Node (`test/browser/driven/`). They need both Node's APIs and a browser engine,
 * which neither the Node configuration (no engine installed where it runs) nor the browser
 * configuration (test code runs inside the page) provides. Run by `test:browser`, where the
 * engine is installed.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // A V8 garbage-collector crash in Node 24's baseline compiler (nodejs/node#62393) can kill a
    // test worker with SIGSEGV. Remove this once the pinned Node carries the fix.
    execArgv: ['--no-sparkplug'],
    include: ['test/browser/driven/**/*.browser.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
