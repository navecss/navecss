import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * A real-engine fixture, separate from the Node-environment unit tests
 * (vitest.config.ts). Node-side assertions can only check that generated
 * CSS/text has the right shape; they cannot prove a real browser resolves
 * @layer order or cascades a nested-CSS transform the way the shape implies.
 * Kept as its own config/script (test:browser) rather than folded into
 * `test` because it needs a browser binary and is meaningfully slower.
 */
export default defineConfig({
  test: {
    include: ['test/browser/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
