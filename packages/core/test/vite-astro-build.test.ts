/**
 * The Astro criteria for what a build ships (AC-astro-01, -02, -04 to -07): a real Astro project,
 * built with Astro's programmatic `build()`, with the plugin added the way the README adds it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

import type { AstroApp, AstroAppSettings } from './helpers/astro-app.ts'
import type { AstroBuilt } from './helpers/astro-build.ts'

import { HANDSHAKE_FILE } from '../src/vite-handshake.ts'
import { LEAN_FILES, makeAstroApp, NO_RENAME_FILES, probeRecords } from './helpers/astro-app.ts'
import {
  buildAstro,
  filesUnder,
  layerSheets,
  layerStylesOfRoutes,
  prerenderedHtml,
  setOf,
} from './helpers/astro-build.ts'
import { atomClassMap } from '../src/atoms.ts'
import { classesOf, keepOnly, type Node, parseAtomicLayer } from './helpers/css-layer.ts'
import {
  ALL_ATOMS,
  BROWSER_KEEP,
  BROWSER_ONLY,
  classOf,
  eSet,
  parityProblems,
  setOfCss,
  unique,
} from './helpers/astro-checks.ts'

const apps: AstroApp[] = []

afterAll(() => {
  for (const app of apps) app.dispose()
})

/**
 * Makes the project and builds it.
 */
async function built(settings: AstroAppSettings): Promise<{ app: AstroApp; result: AstroBuilt }> {
  const app = makeAstroApp(settings)
  apps.push(app)
  return { app, result: await buildAstro(app) }
}

const SECOND = 120_000

describe('AC-astro-01 — a static Astro build ships, in every stylesheet holding the layer, exactly the atoms it read', () => {
  it(
    'ships E, expands the directive, and the all build ships every atom',
    async () => {
      const { result } = await built({ options: BROWSER_KEEP })
      expect(result.error).toBeUndefined()
      const sheets = layerSheets(result)
      expect(sheets.length).toBeGreaterThan(0)
      for (const sheet of sheets) expect(setOf(sheet), sheet.name).toEqual(eSet())

      const html = prerenderedHtml(result, '/')
      expect(classOf(html, 'fm')).toBe('nave-block')
      expect(classOf(html, 't')).toBe('nave-flex')
      expect(classOf(html, 'raw')).toBe('nave-text-center')

      for (const file of filesUnder(result.client)) {
        if (!/\.(?:css|html|m?js)$/.test(file)) continue
        expect(readFileSync(path.join(result.client, file), 'utf8'), file).not.toMatch(
          /@nave(?![a-z])/,
        )
      }
      const css = sheets.map((sheet) => sheet.css).join('\n')
      expect(css).toMatch(/\.card\s*\{[^}]*overflow-wrap:\s*break-word/)
      expect(setOfCss(css)).not.toContain('breakWord')

      const all = await built({ options: "{ atomic: 'all' }" })
      expect(all.result.error).toBeUndefined()
      for (const sheet of layerSheets(all.result)) expect(setOf(sheet)).toEqual(ALL_ATOMS)
      expect(eSet()).not.toEqual(ALL_ATOMS)
    },
    SECOND,
  )
})

describe('AC-astro-02 — server output with no prerendered page prunes fully, linked and inlined alike', () => {
  it(
    'ships E plus absolute and minW0 in every stylesheet, an inlined one included',
    async () => {
      const { app, result } = await built({
        server: true,
        options: BROWSER_KEEP,
        files: LEAN_FILES,
      })
      expect(result.error).toBeUndefined()
      const pages = await layerStylesOfRoutes(app, result, ['/', '/about', '/dyn', '/lean'])
      expect(pages['/lean']!.map((style) => style.kind)).toEqual(['inline'])
      for (const [route, styles] of Object.entries(pages)) {
        expect(styles.length, route).toBeGreaterThan(0)
        for (const style of styles) {
          expect(setOfCss(style.css), `${route} ${style.name}`).toEqual(eSet('absolute', 'minW0'))
        }
      }
    },
    SECOND,
  )
})

const PAGES = ['/', '/about']
const SERVER_PAGES = ['/', '/about', '/dyn']
// Browser targets below the ones that read CSS nesting, so Lightning CSS lowers it and a pseudo-class
// rule sits apart from the rule it belongs to.
const LIGHTNING =
  "css: { transformer: 'lightningcss', lightningcss: { targets: { chrome: 100 << 16, firefox: 100 << 16, safari: 15 << 16 } } }"
const FOCUS_PAGE = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
---
<Layout>
  <div id="r" class={cx('relative')}>r</div>
  <button id="fr" class={cx('focusRing')}>fr</button>
  <a id="skip" href="#r" class={cx('srOnlyFocusable')}>skip</a>
</Layout>
`

describe('AC-astro-04 — on Astro, each emitted atom ships whole and nothing outside the layer changes', () => {
  const OUTPUTS: [string, AstroAppSettings, string[]][] = [
    ['static', {}, PAGES],
    ['server, no prerendered page', { server: true }, SERVER_PAGES],
    [
      'server, a prerendered page, no rename',
      { server: true, prerendered: true, files: NO_RENAME_FILES },
      [...SERVER_PAGES, '/pre'],
    ],
  ]
  it.each(
    OUTPUTS.flatMap(([name, settings, routes]) =>
      [undefined, LIGHTNING].map(
        (vite) => [name, vite ?? 'postcss', settings, routes, vite] as const,
      ),
    ),
  )(
    '%s under %s: every stylesheet is the full layer pruned to its set',
    async (_name, _t, settings, routes, vite) => {
      const common = {
        ...settings,
        files: { ...settings.files, 'src/pages/about.astro': FOCUS_PAGE },
        ...(vite && { vite }),
      }
      const used = await built({ ...common, options: BROWSER_KEEP })
      const all = await built({ ...common, options: "{ atomic: 'all' }" })
      expect(used.result.error).toBeUndefined()
      expect(all.result.error).toBeUndefined()
      const usedPages = await layerStylesOfRoutes(used.app, used.result, routes)
      const allPages = await layerStylesOfRoutes(all.app, all.result, routes)
      for (const route of routes) {
        expect(usedPages[route]!.length, route).toBeGreaterThan(0)
        for (const [index, style] of usedPages[route]!.entries()) {
          expect(parityProblems(style.css, allPages[route]![index]!.css), route).toEqual([])
        }
      }
      const about = usedPages['/about']!.flatMap((style) => setOfCss(style.css))
      expect(about).toEqual(expect.arrayContaining(['focusRing', 'srOnlyFocusable']))
    },
    SECOND,
  )

  it(
    'control: a filter that keeps only rules whose selector is exactly an emitted class drops the pseudo-class rules',
    async () => {
      const { app, result } = await built({
        options: BROWSER_KEEP,
        vite: LIGHTNING,
        files: { 'src/pages/about.astro': FOCUS_PAGE },
      })
      const all = await built({
        options: "{ atomic: 'all' }",
        vite: LIGHTNING,
        files: { 'src/pages/about.astro': FOCUS_PAGE },
      })
      expect(app.root).toBeTruthy()
      const [style] = (await layerStylesOfRoutes(app, result, ['/about']))['/about']!
      const [full] = (await layerStylesOfRoutes(all.app, all.result, ['/about']))['/about']!
      const set = setOfCss(style!.css)
      const classes = classesOf(...set)
      const exactly = (nodes: Node[]): Node[] =>
        nodes.flatMap((node) => {
          if (node.children) {
            const children = exactly(node.children)
            return children.length > 0 ? [{ prelude: node.prelude, children }] : []
          }
          return [...classes].some((name) => node.prelude === `.${name}`) ? [node] : []
        })
      const crude = exactly(parseAtomicLayer(full!.css))
      expect(keepOnly(parseAtomicLayer(full!.css), classes)).toEqual(parseAtomicLayer(style!.css))
      expect(isDeepStrictEqual(crude, parseAtomicLayer(style!.css))).toBe(false)
      expect(Object.keys(atomClassMap).length).toBeGreaterThan(0)
    },
    SECOND,
  )
})

/**
 * Where Vite's cache directory holds the plugin's file in `app`, if it does.
 */
function handshakeIn(app: AstroApp): string | undefined {
  return [
    path.join(app.root, 'node_modules', '.vite', HANDSHAKE_FILE),
    path.join(app.root, '.vite', HANDSHAKE_FILE),
    path.join(app.root, 'node_modules', '.astro', HANDSHAKE_FILE),
  ].find((file) => existsSync(file))
}

describe('AC-astro-05 — builds of one project in one process each ship their own set, and no state crosses them', () => {
  it(
    'static: E, then E without relative, then E again',
    async () => {
      const app = makeAstroApp({ options: BROWSER_KEEP })
      apps.push(app)
      const about = path.join(app.root, 'src/pages/about.astro')
      const original = readFileSync(about, 'utf8')
      const setsOf = async (): Promise<string[]> => {
        const result = await buildAstro(app)
        expect(result.error).toBeUndefined()
        return unique(layerSheets(result).flatMap((sheet) => setOf(sheet)))
      }
      expect(await setsOf()).toEqual(eSet())
      const file = handshakeIn(app)
      expect(file, 'Vite’s cacheDir holds the plugin’s file after the first build').toBeDefined()
      writeFileSync(about, original.replace("cx('relative')", "'plain'"))
      const second = await setsOf()
      expect(second).toEqual(eSet().filter((atom) => atom !== 'relative'))
      writeFileSync(about, original)
      expect(await setsOf()).toEqual(eSet())
    },
    SECOND * 2,
  )

  it(
    'server, no prerendered page: E plus absolute and minW0, without relative in the second',
    async () => {
      const app = makeAstroApp({ server: true, options: BROWSER_KEEP })
      apps.push(app)
      const about = path.join(app.root, 'src/pages/about.astro')
      const original = readFileSync(about, 'utf8')
      const setsOf = async (): Promise<string[]> => {
        const result = await buildAstro(app)
        expect(result.error).toBeUndefined()
        const pages = await layerStylesOfRoutes(app, result, SERVER_PAGES)
        return unique(
          Object.values(pages).flatMap((styles) => styles.flatMap((s) => setOfCss(s.css))),
        )
      }
      expect(await setsOf()).toEqual(eSet('absolute', 'minW0'))
      writeFileSync(about, original.replace("cx('relative')", "'plain'"))
      expect(await setsOf()).toEqual(
        eSet('absolute', 'minW0').filter((atom) => atom !== 'relative'),
      )
      writeFileSync(about, original)
      expect(await setsOf()).toEqual(eSet('absolute', 'minW0'))
    },
    SECOND * 2,
  )
})

const RENAME = { server: true, prerendered: true, options: BROWSER_KEEP } as const

/**
 * The route-to-file-name table of the layer-holding stylesheets each page links.
 */
function linkedNames(
  pages: Record<string, { kind: string; name: string }[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(pages).map(([route, styles]) => [
      route,
      styles.filter((style) => style.kind === 'linked').map((style) => style.name),
    ]),
  )
}

describe('AC-astro-06 — the rename shape: the shared copy ships whole, so no served file name ever changes its bytes', () => {
  it(
    'ships every atom in the one stylesheet every page links, and keeps the bytes of a file name',
    async () => {
      const pagesList = [...SERVER_PAGES, '/pre']
      const a = await built({ ...RENAME, probe: {} })
      const b = await built({
        ...RENAME,
        files: {
          'src/pages/dyn.astro': readFileSync(
            path.join(a.app.root, 'src/pages/dyn.astro'),
            'utf8',
          ).replace(
            '<Deferred server:defer />',
            `<span class={cx('noWrap')}>w</span>\n  <Deferred server:defer />`,
          ),
        },
      })
      const all = await built({ server: true, prerendered: true, options: "{ atomic: 'all' }" })
      for (const run of [a, b, all]) expect(run.result.error).toBeUndefined()

      const records = probeRecords(a.app).filter((record) => record.holdsLayer)
      expect(new Set(records.map((record) => record.environment))).toEqual(
        new Set(['prerender', 'ssr']),
      )
      const pagesA = await layerStylesOfRoutes(a.app, a.result, pagesList)
      const names = new Set(Object.values(linkedNames(pagesA)).flat())
      expect(names.size, 'every page links one stylesheet holding the layer, under one name').toBe(
        1,
      )

      const pagesB = await layerStylesOfRoutes(b.app, b.result, pagesList)
      const pagesAll = await layerStylesOfRoutes(all.app, all.result, pagesList)
      for (const pages of [pagesA, pagesB]) {
        for (const route of pagesList) {
          for (const [index, style] of pages[route]!.entries()) {
            expect(setOfCss(style.css), route).toEqual(ALL_ATOMS)
            expect(parityProblems(style.css, pagesAll[route]![index]!.css), route).toEqual([])
          }
        }
      }
      const inA = new Set(filesUnder(a.result.client).filter((file) => file.endsWith('.css')))
      for (const file of filesUnder(b.result.client).filter((name) => inA.has(name))) {
        expect(readFileSync(path.join(b.result.client, file), 'utf8'), file).toBe(
          readFileSync(path.join(a.result.client, file), 'utf8'),
        )
      }
      expect(pagesB['/dyn']![0]!.css).toContain('nave-no-wrap')
    },
    SECOND * 2,
  )
})

describe('AC-astro-07 — the no-rename shape: who wrote first decides what each stylesheet holds', () => {
  it(
    'prunes the prerendered page’s stylesheet and the inlined one, and leaves the shared copy whole',
    async () => {
      const routes = ['/', '/about', '/dyn', '/pre', '/lean']
      const used = await built({
        ...RENAME,
        probe: {},
        files: { ...NO_RENAME_FILES, ...LEAN_FILES },
      })
      const all = await built({
        server: true,
        prerendered: true,
        options: "{ atomic: 'all' }",
        files: { ...NO_RENAME_FILES, ...LEAN_FILES },
      })
      expect(used.result.error).toBeUndefined()
      expect(all.result.error).toBeUndefined()
      const pages = await layerStylesOfRoutes(used.app, used.result, routes)
      const allPages = await layerStylesOfRoutes(all.app, all.result, routes)

      const records = probeRecords(used.app).filter((record) => record.holdsLayer)
      expect(
        records.some((record) => record.environment === 'prerender'),
        'a prerender stylesheet holds the layer',
      ).toBe(true)
      expect(
        records.some((record) => record.environment === 'ssr'),
        'an ssr stylesheet holds the layer',
      ).toBe(true)
      const linked = linkedNames(pages)
      expect(linked['/pre']![0], 'the shapes differ: /pre links its own stylesheet').not.toBe(
        linked['/']![0],
      )
      expect(linked['/']).toEqual(linked['/dyn'])
      expect(
        pages['/lean']!.map((style) => style.kind),
        'the inlined layer is reached',
      ).toEqual(['inline'])

      const setOfRoute = (route: string): string[] =>
        unique(pages[route]!.flatMap((style) => setOfCss(style.css)))
      // prerender wrote first: what it read, roundedFull, and the keep.
      expect(setOfRoute('/pre')).toEqual(atoms2('roundedFull', ...BROWSER_ONLY))
      // the copy ssr shares with it ships whole.
      expect(setOfRoute('/')).toEqual(ALL_ATOMS)
      expect(setOfRoute('/dyn')).toEqual(ALL_ATOMS)
      // a stylesheet only ssr wrote: everything read by prerender and ssr, and the keep.
      expect(setOfRoute('/lean')).toEqual(eSet('absolute', 'minW0', 'roundedFull'))
      for (const route of routes) {
        for (const [index, style] of pages[route]!.entries()) {
          expect(parityProblems(style.css, allPages[route]![index]!.css), route).toEqual([])
        }
      }
    },
    SECOND * 2,
  )
})

/**
 * Sorted atom names.
 */
function atoms2(...names: string[]): string[] {
  return names.toSorted((a, b) => a.localeCompare(b))
}
