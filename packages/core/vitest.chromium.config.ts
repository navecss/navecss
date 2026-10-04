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
    include: ['test/browser/driven/**/*.browser.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
