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
const alias = (installedAs: string): { find: RegExp; replacement: string }[] => [
  { find: /^@base-ui\/react(\/.*)?$/, replacement: `base-ui-react-${installedAs}$1` },
]

/**
 * Base UI is pre-bundled by Vite on first use. Naming what the tests import up front keeps the
 * page from reloading in the middle of a run when the first import of one is found late.
 */
const optimized = (base: string, subpaths: readonly string[], react = ''): string[] => [
  `react${react}`,
  `react-dom${react}`,
  `react-dom${react}/client`,
  ...subpaths.map((subpath) => `${base}/${subpath}`),
]

/**
The React 18 copies, installed under their own names, substituted for `react` and `react-dom`.
 */
const REACT_18 = [
  { find: /^react$/, replacement: 'react-18' },
  { find: /^react\/(.*)$/, replacement: 'react-18/$1' },
  { find: /^react-dom$/, replacement: 'react-dom-18' },
  { find: /^react-dom\/(.*)$/, replacement: 'react-dom-18/$1' },
]

/**
What the mid-exit file imports through the wrappers: the panels' and the popups', whose scenes share a helper.
 */
const MID_EXIT_SUBPATHS = [
  'accordion',
  'alert-dialog',
  'autocomplete',
  'collapsible',
  'combobox',
  'context-menu',
  'dialog',
  'menu',
  'menubar',
  'popover',
  'preview-card',
  'select',
]

const MID_EXIT_FILE = 'test/browser/reduced-motion-mid-exit.browser.test.ts'
const EXIT_FILE = 'test/browser/navigation-menu-exit.browser.test.ts'
const STRIP_FILE = 'test/browser/scroll-area-strip.browser.test.ts'
const TRIGGER_FILE = 'test/browser/navigation-menu-trigger.browser.test.ts'
const TOAST_FLIP_FILE = 'test/browser/toast-reduced-motion.browser.test.ts'

/**
 * The Base UI minors the files run against besides the devDependency, each by the name it is
 * installed under (`base-ui-react-<name>`), with the files that run at it and the Base UI
 * subpaths those files import. Every minor runs the Navigation Menu panel's exit and the Scroll
 * Area strip as one target; the rest are the files whose criteria name that minor.
 */
const MINORS = [
  {
    files: [EXIT_FILE, STRIP_FILE, TRIGGER_FILE],
    installedAs: 'floor',
    subpaths: ['navigation-menu', 'scroll-area'],
    version: '1.3.0',
  },
  {
    files: [EXIT_FILE, STRIP_FILE],
    installedAs: '1.4.0',
    subpaths: ['navigation-menu', 'scroll-area'],
    version: '1.4.0',
  },
  {
    files: [MID_EXIT_FILE, EXIT_FILE, STRIP_FILE],
    installedAs: '1.5.0',
    subpaths: ['navigation-menu', 'scroll-area', ...MID_EXIT_SUBPATHS],
    version: '1.5.0',
  },
  {
    files: [MID_EXIT_FILE, EXIT_FILE, STRIP_FILE, TOAST_FLIP_FILE],
    installedAs: '1.6.0',
    subpaths: ['navigation-menu', 'scroll-area', 'toast', ...MID_EXIT_SUBPATHS],
    version: '1.6.0',
  },
  {
    files: [EXIT_FILE, STRIP_FILE],
    installedAs: '1.7.0',
    subpaths: ['navigation-menu', 'scroll-area'],
    version: '1.7.0',
  },
  {
    files: [EXIT_FILE, STRIP_FILE],
    installedAs: '1.8.0',
    subpaths: ['navigation-menu', 'scroll-area'],
    version: '1.8.0',
  },
] as const

export default defineConfig({
  plugins: [serveFixturesAsTheyAre()],
  test: {
    // The pointer, the focus and the frame clock belong to the page, so two files never run at once:
    // one file's hover or Escape would land in another's scene.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        optimizeDeps: {
          include: optimized('@base-ui/react', [...wrapperSubpaths, 'direction-provider']),
        },
        test: {
          name: 'current',
          include: ['test/browser/**/*.browser.test.ts'],
          globalSetup: [
            'test/browser/support/consumer-app.global-setup.ts',
            'test/browser/support/registry-consumer-app.global-setup.ts',
          ],
          provide: { baseUi: installedVersion('@base-ui/react') },
          browser: browser(),
        },
      },
      ...MINORS.map(({ files, installedAs, subpaths, version }) => ({
        extends: true,
        resolve: { alias: alias(installedAs) },
        optimizeDeps: { include: optimized(`base-ui-react-${installedAs}`, subpaths) },
        test: {
          name: `base-ui-${version}`,
          include: [...files],
          provide: { baseUi: version },
          browser: browser(),
        },
      })),
      // The Navigation Menu panel's exit is also read under React 18, at the devDependency and at
      // every minor.
      {
        extends: true,
        resolve: { alias: REACT_18 },
        optimizeDeps: {
          include: optimized('@base-ui/react', ['navigation-menu'], '-18'),
        },
        test: {
          name: 'current-react-18',
          include: [EXIT_FILE],
          provide: { baseUi: installedVersion('@base-ui/react') },
          browser: browser(),
        },
      },
      ...MINORS.map(({ installedAs, version }) => ({
        extends: true,
        resolve: { alias: [...REACT_18, ...alias(installedAs)] },
        optimizeDeps: {
          include: optimized(`base-ui-react-${installedAs}`, ['navigation-menu'], '-18'),
        },
        test: {
          name: `base-ui-${version}-react-18`,
          include: [EXIT_FILE],
          provide: { baseUi: version },
          browser: browser(),
        },
      })),
    ],
  },
})
