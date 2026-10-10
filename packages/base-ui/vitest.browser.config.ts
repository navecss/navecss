import type { BrowserCommand, BrowserConfigOptions } from 'vitest/node'

import { playwright } from '@vitest/browser-playwright'
import { createReadStream, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'

const FIXTURES = path.resolve(import.meta.dirname, 'test/browser/fixtures')
const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
}

/**
 * Serves the generated fixture directories under `/__fixtures__/` exactly as they are on disk. The
 * consumer app a test opens in an iframe was built by a real `vite build`, and the page must get
 * the bytes that build wrote: Vite's own middleware would turn a requested stylesheet into a
 * module and rewrite an HTML file.
 */
function serveFixturesAsTheyAre(): Plugin {
  return {
    name: 'serve-fixtures-as-they-are',
    configureServer(server) {
      server.middlewares.use('/__fixtures__', (request, response, next) => {
        const relative = decodeURIComponent((request.url ?? '/').split('?', 1)[0]!)
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
 * Sets the page's `prefers-reduced-motion`, which a test running inside the page cannot do. The
 * emulation belongs to the whole page, so it reaches the iframe the test runs in.
 */
const emulateReducedMotion: BrowserCommand<['no-preference' | 'reduce']> = async (
  context,
  reducedMotion,
) => {
  await context.page.emulateMedia({ reducedMotion })
}

const require = createRequire(import.meta.url)
const wrapperSubpaths = Object.keys((require('./package.json') as { exports: object }).exports)
  .filter((key) => key.startsWith('./') && !key.endsWith('.css') && !key.endsWith('.json'))
  .map((key) => key.slice(2))
const installedVersion = (specifier: string): string =>
  (require(`${specifier}/package.json`) as { version: string }).version

// A project gets its own object: Vitest names the instances in place.
const browser = (): BrowserConfigOptions => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' as const }],
  commands: { emulateReducedMotion },
})

/**
 * The real-browser tests: what a real engine computes, lays out and hits, which jsdom (the render tests'
 * environment, `vitest.config.ts`) cannot. Kept as its own config and script (`test:browser`)
 * because it needs a browser binary and is meaningfully slower.
 *
 * The first project runs every file against the Base UI the package is developed against. The
 * others run the one file about a reduced-motion flip in the middle of a panel's exit against the
 * Base UI minors where an interrupted exit is never counted as finished, installed under their own
 * names (`base-ui-react-<version>` in the manifest) and substituted for `@base-ui/react`.
 */
const alias = (version: string): { find: RegExp; replacement: string }[] => [
  { find: /^@base-ui\/react(\/.*)?$/, replacement: `base-ui-react-${version}$1` },
]

/**
 * Base UI is pre-bundled by Vite on first use. Naming what the tests import up front keeps the
 * page from reloading in the middle of a run when the first import of one is found late.
 */
const optimized = (base: string, subpaths: readonly string[]): string[] => [
  'react',
  'react-dom',
  'react-dom/client',
  ...subpaths.map((subpath) => `${base}/${subpath}`),
]

const MID_EXIT_FILE = 'test/browser/reduced-motion-mid-exit.browser.test.ts'

export default defineConfig({
  plugins: [serveFixturesAsTheyAre()],
  test: {
    projects: [
      {
        extends: true,
        optimizeDeps: { include: optimized('@base-ui/react', wrapperSubpaths) },
        test: {
          name: 'current',
          include: ['test/browser/**/*.browser.test.ts'],
          globalSetup: ['test/browser/support/consumer-app.global-setup.ts'],
          provide: { baseUi: installedVersion('@base-ui/react') },
          browser: browser(),
        },
      },
      ...['1.5.0', '1.6.0'].map((version) => ({
        extends: true,
        resolve: { alias: alias(version) },
        optimizeDeps: {
          include: optimized(`base-ui-react-${version}`, ['accordion', 'collapsible']),
        },
        test: {
          name: `base-ui-${version}`,
          include: [MID_EXIT_FILE],
          provide: { baseUi: version },
          browser: browser(),
        },
      })),
    ],
  },
})
