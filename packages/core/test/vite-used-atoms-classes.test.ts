/**
 * The used-atoms criteria for written classes and the layer's routes (AC-used-atoms-29, -30, -31,
 * -32): a `nave-*` class written in an HTML entry or a module is emitted on identifier
 * boundaries, a Nave class built from pieces is a build error, and every route to the atomic layer
 * is filtered by content.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { describe, expect, it } from 'vitest'

import { atomClassMap } from '../src/atoms.ts'
import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  APP_CSS,
  appFiles,
  atomLayerAtoms,
  atoms,
  type Built,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { classesOf, keepOnly, parseAtomicLayer } from './helpers/css-layer.ts'
import { IMPORT, PIECED_CLASS_ROWS, pieceModule } from './helpers/used-atoms-rows.ts'
import { startDev, appConfig } from './helpers/vite-app.ts'
import type { Transformer } from './helpers/vite-app.ts'

const TRANSFORMERS: Transformer[] = ['postcss', 'lightningcss']
const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe.each(TRANSFORMERS)('under css.transformer %s', (transformer) => {
  describe('AC-used-atoms-29 — a skip link in index.html after a newline is emitted whole', () => {
    const SEPARATORS: [string, string][] = [
      ['a line feed', '\n'],
      ['a tab', '\t'],
      ['a form feed', '\f'],
      ['a carriage return', '\r'],
    ]
    const page = (separator: string): string =>
      `<!doctype html><html><body><a href="#main" class="skip${separator}nave-sr-only-focusable">Skip to content</a><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`

    it.each(SEPARATORS)(
      'emits srOnlyFocusable whole when %s follows the first class',
      async (_name, separator) => {
        const app = makeUsedApp(
          appFiles({
            'index.html': page(separator),
            'about.html': '<!doctype html><p class="nave-truncate">about</p>',
          }),
        )
        try {
          const options = {
            transformer,
            build: {
              cssMinify: false,
              rolldownOptions: {
                input: {
                  main: path.join(app.root, 'index.html'),
                  about: path.join(app.root, 'about.html'),
                },
              },
            },
          }
          const used = await buildUsed(app, options)
          const all = await buildUsed(app, { ...options, options: { atomic: 'all' } })

          expect(used.error).toBeUndefined()
          expect(atomLayerAtoms(used.css)).toEqual(atoms('srOnlyFocusable', 'truncate'))
          const whole = keepOnly(
            parseAtomicLayer(all.css),
            classesOf('srOnlyFocusable', 'truncate'),
          )
          expect(parseAtomicLayer(used.css)).toEqual(whole)
        } finally {
          app.dispose()
        }
      },
      60_000,
    )

    it('reads the page in a hook of order pre, and a hook at default order would miss it', async () => {
      const [, collect] = navePlugin()
      expect(collect.transformIndexHtml.order).toBe('pre')

      const app = makeUsedApp(appFiles({ 'index.html': page('\n') }))
      try {
        const [nave, real] = navePlugin()
        const late = { ...real, transformIndexHtml: real.transformIndexHtml.handler }
        const built = await buildUsed(app, { transformer, nave: [nave, late] })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).not.toContain('srOnlyFocusable')
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('only reads the page: the dev server serves index.html byte for byte as it would without the hook', async () => {
      const app = makeUsedApp(appFiles({ 'index.html': page('\n') }))
      try {
        const [nave, collect] = navePlugin()
        const without = { ...collect, transformIndexHtml: undefined }
        const render = async (plugins: unknown[]): Promise<string> => {
          const server = await startDev(appConfig(app.root, transformer, plugins as never))
          try {
            return await server.transformIndexHtml(
              '/index.html',
              readFileSync(path.join(app.root, 'index.html'), 'utf8'),
            )
          } finally {
            await server.close()
          }
        }

        expect(await render([nave, collect])).toBe(await render([nave, without]))
      } finally {
        app.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-30 — literal classes match on CSS identifier boundaries', () => {
    const STRINGS = [
      "export const s1 = 'nave-block'",
      "export const s2 = 'a nave-inline-block,b'",
      "export const s3 = 'nave-flex-col'",
      "export const s4 = 'x\tnave-items-center'",
      String.raw`export const s5 = 'a\nnave-no-wrap'`,
      "export const s6 = '.nave-wrap-x nave-flex-wrap:hover'",
      "export const s7 = '--nave-justify-end'",
      "export const s8 = 'data-nave-justify-center'",
      "export const s9 = 'nave-flexx'",
      "export const s10 = 'anave-truncate'",
    ].join('\n')

    it('emits exactly the atoms written whole, and none from Nave’s own modules', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}export const a = cx('flex')\n`,
          'src/Hidden.svelte': '<div class="nave-hidden">h</div>\n',
          'src/strings.js': `${STRINGS}\nconsole.log(s1, s2, s3, s4, s5, s6, s7, s8, s9, s10)\n`,
          'src/uses.ts': "import { c } from 'ui-lib'\nconsole.log(c)\n",
        }),
      )
      addPackage(app, 'ui-lib', { 'index.js': 'export const c = "nave-grid"\n' }, false)
      try {
        const built = await buildUsed(app, { transformer, plugins: [svelte()] })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(
          atoms(
            'flex',
            'hidden',
            'grid',
            'block',
            'inlineBlock',
            'flexCol',
            'itemsCenter',
            'flexWrap',
            'noWrap',
          ),
        )
        // The guard that the Svelte case reaches the form the whitespace matcher misses.
        expect(built.js).toContain('class="nave-hidden">h')
      } finally {
        app.dispose()
      }
    }, 60_000)
  })
})

describe.each(TRANSFORMERS)('under css.transformer %s', (transformer) => {
  describe('AC-used-atoms-31 — a Nave class built from pieces is a build error; a token reference is not', () => {
    const greens = [
      '`color: var(--nave-color-${tone})`',
      "'--nave-' + tone",
      "'data-nave-' + tone",
      "'x-nave-' + tone",
      "tone + 'nave-'",
      "'nave-flex ' + tone",
    ]

    it.each(PIECED_CLASS_ROWS)(
      'refuses %s with one problem at the piece',
      async (expression, offset) => {
        const { text, column } = pieceModule(expression)
        const app = makeUsedApp(appFiles({ 'src/row.js': text }))
        try {
          const built = await buildUsed(app, { transformer })

          expect(built.error).toMatch(/^1 problem in 1 file/)
          expect(built.error).toContain(`src/row.js:3:${column + offset}: `)
          expect(built.error).toContain('a Nave class built from pieces is invisible to the build')
        } finally {
          app.dispose()
        }
      },
      60_000,
    )

    it.each(greens)(
      'allows %s with no warning',
      async (expression) => {
        const app = makeUsedApp(appFiles({ 'src/row.js': pieceModule(expression).text }))
        try {
          const built = await buildUsed(app, { transformer })

          expect(built.error).toBeUndefined()
          expect(built.warnings).toEqual([])
        } finally {
          app.dispose()
        }
      },
      60_000,
    )

    it('refuses it in a Svelte component, and in a dependency that imports cx but not in one that does not', async () => {
      const svelteApp = makeUsedApp(
        appFiles({
          'src/Tone.svelte':
            '<script>let { tone } = $props()</script>\n<div class="nave-{tone}">t</div>\n',
        }),
      )
      const depApp = makeUsedApp(
        appFiles({
          'src/uses.ts':
            "import { a } from 'dep-cx'\nimport { b } from 'dep-plain'\nconsole.log(a, b)\n",
        }),
      )
      addPackage(depApp, 'dep-cx', {
        'index.js': `${IMPORT}export const a = (t) => 'nave-' + t\nexport const f = cx('flex')\n`,
      })
      addPackage(
        depApp,
        'dep-plain',
        { 'index.js': "export const b = (t) => 'nave-' + t\n" },
        false,
      )
      try {
        const inSvelte = await buildUsed(svelteApp, { transformer, plugins: [svelte()] })
        const inDependency = await buildUsed(depApp, { transformer })

        expect(inSvelte.error).toMatch(/^1 problem in 1 file/)
        expect(inSvelte.error).toContain('src/Tone.svelte')
        expect(inDependency.error).toMatch(/^1 problem in 1 file/)
        expect(inDependency.error).toContain('dep-cx')
        expect(inDependency.error).not.toContain('dep-plain')
      } finally {
        svelteApp.dispose()
        depApp.dispose()
      }
    }, 60_000)
  })

  describe('AC-used-atoms-32 — every route to the atom layer is filtered by content', () => {
    const routes: [string, Record<string, string>][] = [
      ['@navecss/core', { 'src/main.ts': "import '@navecss/core'\nimport './App.ts'\n" }],
      [
        'layers and atomic',
        {
          'src/main.ts':
            "import '@navecss/core/layers'\nimport '@navecss/core/atomic'\nimport './App.ts'\n",
        },
      ],
      ['no-tokens', { 'src/main.ts': "import '@navecss/core/no-tokens'\nimport './App.ts'\n" }],
      [
        'the Quick start’s app.css',
        {
          'src/main.ts': "import './app.css'\nimport './App.ts'\n",
          'src/app.css': `${APP_CSS}.card { display: flex }\n@layer atomic { .brand-x { color: red } .nave-grid > .child { color: blue } }\n`,
        },
      ],
    ]

    it.each(routes)(
      'route: %s',
      async (_name, extra) => {
        const app = makeUsedApp({
          ...appFiles({ 'src/App.ts': `${IMPORT}console.log(cx('flex'))\n` }),
          ...extra,
        })
        try {
          const options = { transformer, build: { cssMinify: false } }
          const used = await buildUsed(app, options)
          const all = await buildUsed(app, { ...options, options: { atomic: 'all' } })

          expect(used.error).toBeUndefined()
          expect(atomLayerAtoms(used.css)).toEqual(atoms('flex'))
          const consumer = (css: string): string =>
            css.match(/\.brand-x\s*\{[^}]*\}|\.card\s*\{[^}]*\}/g)?.join('|') ?? ''
          expect(consumer(used.css)).toBe(consumer(all.css))
          if (extra['src/app.css']) {
            expect(all.css).toContain('.nave-grid > .child')
            expect(used.css).not.toContain('.nave-grid > .child')
            // The fixture reaches the Quick start shape: the atom rules sit inside app.css itself.
            let appCss = ''
            await buildUsed(app, {
              ...options,
              options: { atomic: 'all' },
              after: [
                {
                  name: 'record-app-css',
                  transform(code: string, id: string) {
                    if (id.endsWith('/src/app.css')) appCss = code
                  },
                },
              ],
            })
            expect(atomLayerAtoms(appCss).length).toBe(Object.keys(atomClassMap).length)
          }
        } finally {
          app.dispose()
        }
      },
      60_000,
    )

    it('keeps a rule that selects an emitted atom’s class among other selectors, byte for byte', async () => {
      const app = makeUsedApp(
        appFiles({
          'src/App.ts': `${IMPORT}console.log(cx('grid'))\n`,
          'src/app.css': `${APP_CSS}@layer atomic { .nave-grid > .child { color: blue } }\n`,
        }),
      )
      try {
        const options = { transformer, build: { cssMinify: false } }
        const built = await buildUsed(app, options)
        const all = await buildUsed(app, { ...options, options: { atomic: 'all' } })
        const rule = (css: string): string | undefined =>
          /\.nave-grid > \.child\s*\{[^}]*\}/.exec(css)?.[0]

        expect(rule(built.css)).toBeDefined()
        expect(rule(built.css)).toBe(rule(all.css))
      } finally {
        app.dispose()
      }
    }, 60_000)

    it('ships no changed published CSS: dist/index.css still imports the atomic file', () => {
      const index = readFileSync(path.join(CORE_ROOT, 'dist/index.css'), 'utf8')
      expect(index).toMatch(/@import url\(['"]\.\/atomic\.css['"]\)/)
      const atomic = readFileSync(path.join(CORE_ROOT, 'dist/atomic.css'), 'utf8')
      for (const className of Object.values(atomClassMap)) expect(atomic).toContain(`.${className}`)
    })

    it('ships the published stylesheets byte for byte as they were before the plugin read atoms', () => {
      // SHA-256 of each file, taken from the build of the commit before the plugin read atoms;
      // dist/atomic.css has its own checked-in snapshot.
      const published: Record<string, string> = {
        'index.css': '6eae13ef505be86381276dfb5d1a214bc372f1343e59d093bf76488bd88e5fdc',
        'layers.css': '14eb8556452bed3c38ec650ea2aeaea802615b2ddd71c625dbd72b886eaa840c',
        'no-tokens.css': 'a614e4b438c6f0f0f944504e56e22fc3d02adf7eaa67a0f64e192fd3ae98fc21',
        'reset.css': '0c043840061f8763c0042fed1468fcbaf9667a33cb95542a0105f0ea71718805',
      }
      const hashes = Object.fromEntries(
        Object.keys(published).map((name) => [
          name,
          createHash('sha256')
            .update(readFileSync(path.join(CORE_ROOT, 'dist', name)))
            .digest('hex'),
        ]),
      )

      expect(hashes).toEqual(published)
    })
  })
})
