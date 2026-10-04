import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

const FIXTURES = path.resolve(import.meta.dirname, 'test/browser/fixtures')
const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
}

/**
 * Serves the generated fixture directories under `/__fixtures__/` exactly as they are on disk.
 * The page a test opens in an iframe is then served like a project with no bundler would serve
 * it: Vite's own middleware turns a requested stylesheet into a module and rewrites an HTML
 * file, and a page whose request for a stylesheet is the thing under test must get the bytes the
 * file holds, from the same origin as the test so it can be read.
 */
function serveFixturesAsTheyAre(): Plugin {
  return {
    name: 'serve-fixtures-as-they-are',
    configureServer(server) {
      server.middlewares.use('/__fixtures__', (request, response, next) => {
        const relative = decodeURIComponent((request.url ?? '/').split('?')[0]!)
        const file = path.join(FIXTURES, relative)
        const isInside = file.startsWith(`${FIXTURES}${path.sep}`)
        const stats = isInside ? statSync(file, { throwIfNoEntry: false }) : undefined
        if (!stats?.isFile()) {
          response.statusCode = 404
          response.end('not found')
          return
        }
        response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
        createReadStream(file).on('error', next).pipe(response)
      })
    },
  }
}

/**
 * A real-engine fixture, separate from the Node-environment unit tests
 * (vitest.config.ts). Node-side assertions can only check that generated
 * CSS/text has the right shape; they cannot prove a real browser resolves
 * @layer order or cascades a nested-CSS transform the way the shape implies.
 * Kept as its own config/script (test:browser) rather than folded into
 * `test` because it needs a browser binary and is meaningfully slower.
 */
export default defineConfig({
  plugins: [serveFixturesAsTheyAre()],
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
