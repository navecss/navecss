import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * The rows that run in all three engines Playwright ships: Chromium, Firefox and WebKit
 * (`test/browser/engines/`). They are in their own configuration so that the rest of the browser
 * suite, which names Chromium alone in `vitest.browser.config.ts`, does not start running in two
 * more engines. Playwright's engines are current releases, not the supported floor: what they
 * prove is the CSS the plugins emit, not the floor.
 */
export default defineConfig({
  test: {
    include: ['test/browser/engines/**/*.engines.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
