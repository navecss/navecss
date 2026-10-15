/**
 * The Astro criteria for what each page of a build loads (AC-astro-23, -29, -31, -33, -34,
 * -37): no Nave runtime in any output, the screen-reader pair closed in every stylesheet, every
 * page covered by the stylesheets it loads, and every copy of the layer inside `@layer atomic`
 * after Nave's order statement.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import type { AstroApp, AstroAppSettings } from './helpers/astro-app.ts'
import type { AstroBuilt, PageStyle } from './helpers/astro-build.ts'

import { atomClassMap } from '../src/atoms.ts'
import {
  BASE_FILES,
  LEAN_FILES,
  makeAstroApp,
  NO_RENAME_FILES,
  PRERENDERED_FILES,
  SERVER_FILES,
} from './helpers/astro-app.ts'
import { layersStatement } from './helpers/astro-readme.ts'
import {
  buildAstro,
  filesUnder,
  layerStylesOfRoutes,
  stylesOf,
  prerenderedHtml,
} from './helpers/astro-build.ts'
import { shapeFiles } from './helpers/astro-shapes.ts'
import {
  ALL_ATOMS,
  BROWSER_KEEP,
  BROWSER_ONLY,
  eSet,
  parityProblems,
  setOfCss,
  unique,
} from './helpers/astro-checks.ts'
import { withoutAtomicLayer } from './helpers/css-layer.ts'
import { packCoreTarball } from './helpers/pack-core.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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
const READ = (name: string): string =>
  ({ ...BASE_FILES, ...SERVER_FILES, ...PRERENDERED_FILES })[name]!
const OUTPUTS: [string, AstroAppSettings][] = [
  ['static', {}],
  ['server, no prerendered page', { server: true }],
  ['server, a prerendered page, rename shape', { server: true, prerendered: true }],
  [
    'server, a prerendered page, no-rename shape',
    { server: true, prerendered: true, files: NO_RENAME_FILES },
  ],
]

/**
 * The text of every JavaScript file under `directory`.
 */
function javascriptUnder(directory: string): Record<string, string> {
  return Object.fromEntries(
    filesUnder(directory)
      .filter((file) => /\.m?js$/.test(file))
      .map((file) => [file, readFileSync(path.join(directory, file), 'utf8')]),
  )
}

const CLASS_NAMES = Object.values(atomClassMap)
const ATOM_NAMES = Object.keys(atomClassMap)

/**
 * Whether a JavaScript text holds every built-in atom, by its class name or by its name as a string:
 * the signature of a class map.
 */
function holdsClassMap(text: string): boolean {
  return ATOM_NAMES.every((name, index) => {
    const quoted = ["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`))
    return quoted || text.includes(CLASS_NAMES[index]!)
  })
}

describe('AC-astro-23 — zero runtime on Astro: no Nave module and no class map in any output', () => {
  it.each(OUTPUTS)(
    '%s',
    async (_name, settings) => {
      const { app, result } = await built({ ...settings, options: BROWSER_KEEP })
      expect(result.error).toBeUndefined()
      const directories = [result.client, ...(result.server ? [result.server] : [])]
      const client = javascriptUnder(result.client)
      for (const directory of directories) {
        for (const [file, text] of Object.entries(javascriptUnder(directory))) {
          expect(text, file).not.toMatch(/@navecss\/core\/cx/)
          expect(holdsClassMap(text), file).toBe(false)
        }
      }
      const joined = Object.values(client).join('\n')
      for (const name of ['nave-grid', 'nave-inline-flex', 'nave-w-full'])
        expect(joined).toContain(name)
      expect(app.root).toBeTruthy()
    },
    SECOND,
  )

  it('control: the same per-file check finds the class map in the files the package’s cx module imports, in either spelling', () => {
    const dist = path.join(CORE_ROOT, 'dist')
    const text = readFileSync(path.join(dist, 'cx.js'), 'utf8')
    const imported = [...text.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((match) => match[1]!)
    const closure = [text, ...imported.map((file) => readFileSync(path.join(dist, file), 'utf8'))]
    expect(closure.some((source) => holdsClassMap(source))).toBe(true)
    expect(holdsClassMap(CLASS_NAMES.map((name) => `"${name}"`).join(','))).toBe(true)
    expect(holdsClassMap(ATOM_NAMES.map((name) => `'${name}'`).join(','))).toBe(true)
    expect(
      holdsClassMap(
        ATOM_NAMES.slice(1)
          .map((name) => `'${name}'`)
          .join(','),
      ),
    ).toBe(false)
  })
})

const SR_ONLY_ISLAND = READ('src/components/OnlyIsland.tsx').replace(
  "className={cx('inlineFlex')}",
  "className={cx('inlineFlex', 'srOnly')}",
)

describe('AC-astro-29 — every stylesheet closes the screen-reader pair on its own, on the final set', () => {
  it(
    'state 1: srOnly read only by a client:only island fails, and passes with keep',
    async () => {
      const files = { 'src/components/OnlyIsland.tsx': SR_ONLY_ISLAND }
      const failing = await built({ options: BROWSER_KEEP, files })
      expect(failing.result.output).toContain(
        'src/components/OnlyIsland.tsx: names srOnly, which the CSS already written does not hold.',
      )

      const kept = await built({
        options: "{ keep: ['inlineFlex', 'wFull', 'truncate', 'srOnly'] }",
        files,
      })
      const all = await built({ options: "{ atomic: 'all' }", files })
      expect(kept.result.error).toBeUndefined()
      const pages = await layerStylesOfRoutes(kept.app, kept.result, ['/', '/about'])
      const allPages = await layerStylesOfRoutes(all.app, all.result, ['/', '/about'])
      for (const route of ['/', '/about']) {
        for (const [index, style] of pages[route]!.entries()) {
          expect(setOfCss(style.css)).toEqual(expect.arrayContaining(['srOnly', 'srOnlyFocusable']))
          expect(parityProblems(style.css, allPages[route]![index]!.css)).toEqual([])
        }
      }
    },
    SECOND * 3,
  )

  it.each([
    ['pre.astro', 'src/pages/pre.astro', "cx('roundedFull')", "cx('roundedFull', 'srOnly')"],
    ['dyn.astro', 'src/pages/dyn.astro', "cx('absolute')", "cx('absolute', 'srOnly')"],
  ])(
    'read only by %s in the no-rename shape: every stylesheet holding srOnly holds srOnlyFocusable whole',
    async (_name, file, from, to) => {
      const source = file.endsWith('pre.astro') ? NO_RENAME_FILES[file]! : READ(file)
      const { app, result } = await built({
        server: true,
        prerendered: true,
        options: BROWSER_KEEP,
        files: { ...NO_RENAME_FILES, [file]: source.replace(from, to) },
      })
      const all = await built({
        server: true,
        prerendered: true,
        options: "{ atomic: 'all' }",
        files: { ...NO_RENAME_FILES, [file]: source.replace(from, to) },
      })
      expect(result.error).toBeUndefined()
      const routes = ['/', '/dyn', '/pre']
      const pages = await layerStylesOfRoutes(app, result, routes)
      const allPages = await layerStylesOfRoutes(all.app, all.result, routes)
      for (const route of routes) {
        for (const [index, style] of pages[route]!.entries()) {
          const set = setOfCss(style.css)
          if (set.includes('srOnly')) expect(set, route).toContain('srOnlyFocusable')
          expect(parityProblems(style.css, allPages[route]![index]!.css), route).toEqual([])
          if (set.includes('srOnly') || set.includes('srOnlyFocusable')) {
            expect(style.css).toContain('.nave-sr-only-focusable')
          }
        }
      }
      const holders = routes.flatMap((route) =>
        pages[route]!.filter((s) => setOfCss(s.css).includes('srOnly')),
      )
      expect(holders.length, 'a stylesheet holds srOnly').toBeGreaterThan(0)
    },
    SECOND * 2,
  )
})

const PAGES_OF: Record<string, string[]> = {
  static: ['/', '/about'],
}

/**
 * The atoms each page of the fixture can render.
 */
const NEEDS: Record<string, string[]> = {
  '/': [
    'block',
    'flex',
    'textCenter',
    'grid',
    'justifyCenter',
    'flexWrap',
    'itemsEnd',
    ...BROWSER_ONLY,
  ],
  '/about': ['relative'],
  '/dyn': ['absolute', 'minW0'],
  '/pre': ['roundedFull', 'minW0'],
}
const PRE_WITH_DEFERRED = (source: string): string =>
  source
    .replace(
      "import Layout from '../layouts/Layout.astro'",
      "import Layout from '../layouts/Layout.astro'\nimport Deferred from '../components/Deferred.astro'",
    )
    .replace('</Layout>', '  <Deferred server:defer />\n</Layout>')

describe('AC-astro-31 — coverage per page in every output: each page’s stylesheets hold every atom that page can render', () => {
  it.each(OUTPUTS)(
    '%s',
    async (name, settings) => {
      const isServer = settings.server === true
      const hasPre = settings.prerendered === true
      const routes = PAGES_OF['static']!.concat(isServer ? ['/dyn'] : [], hasPre ? ['/pre'] : [])
      const files = {
        ...settings.files,
        ...(hasPre && {
          'src/pages/pre.astro': PRE_WITH_DEFERRED(
            settings.files?.['src/pages/pre.astro'] ?? READ('src/pages/pre.astro'),
          ),
        }),
      }
      const used = await built({ ...settings, options: BROWSER_KEEP, files })
      const all = await built({ ...settings, options: "{ atomic: 'all' }", files })
      if (used.result.error !== undefined) {
        // Decision 22: a server island a prerendered page holds is present or the build says which.
        expect(name).toContain('no-rename')
        expect(used.result.output).toContain('src/components/Deferred.astro')
        expect(used.result.output).toContain('minW0')
        return
      }
      const pages = await layerStylesOfRoutes(used.app, used.result, routes)
      const allPages = await layerStylesOfRoutes(all.app, all.result, routes)
      const sets = new Map<string, string[]>()
      for (const route of routes) {
        const union = unique(pages[route]!.flatMap((style) => setOfCss(style.css)))
        for (const atom of NEEDS[route]!) expect(union, `${route} needs ${atom}`).toContain(atom)
        for (const [index, style] of pages[route]!.entries()) {
          expect(parityProblems(style.css, allPages[route]![index]!.css), route).toEqual([])
          const set = setOfCss(style.css)
          if (set.includes('srOnly')) expect(set).toContain('srOnlyFocusable')
          sets.set(route, set)
        }
      }
      if (!hasPre) {
        const identical = unique(routes.map((route) => JSON.stringify(sets.get(route))))
        expect(identical, 'one identical set on every page').toHaveLength(1)
      }
      const byName = new Map<string, string>()
      for (const route of routes) {
        for (const style of pages[route]!.filter((s) => s.kind === 'linked')) {
          expect(byName.get(style.name) ?? style.css, style.name).toBe(style.css)
          byName.set(style.name, style.css)
        }
      }
    },
    SECOND * 2,
  )
})

/**
 * A layer statement with its whitespace folded and one space after each comma.
 */
function normalized(statement: string): string {
  return statement
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\s*,\s*/g, ', ')
    .trim()
}

const LAYER_STATEMENT_FIRST = (styles: readonly PageStyle[]): string | undefined => {
  for (const style of styles) {
    const index = style.css.indexOf('@layer')
    if (index === -1) continue
    const statement = /^@layer\s+([^;{]*);/.exec(style.css.slice(index))
    return statement ? normalized(`@layer ${statement[1]!};`) : style.css.slice(index, index + 30)
  }
  return undefined
}

describe('AC-astro-33 — every copy of the layer, linked or inlined, sits inside @layer atomic after Nave’s order statement', () => {
  it.each(OUTPUTS)(
    '%s',
    async (_name, settings) => {
      const { app, result } = await built({
        ...settings,
        options: BROWSER_KEEP,
        files: { ...settings.files, ...LEAN_FILES },
      })
      expect(result.error).toBeUndefined()
      const routes = [
        '/',
        '/about',
        '/lean',
        ...(settings.server ? ['/dyn'] : []),
        ...(settings.prerendered ? ['/pre'] : []),
      ]
      const server = settings.server === true
      expect(server || app.root).toBeTruthy()
      const pageStyles = await stylesOfPages(app, result, routes)
      for (const [route, styles] of Object.entries(pageStyles)) {
        expect(LAYER_STATEMENT_FIRST(styles), route).toBe(normalized(layersStatement()))
        for (const style of styles) {
          expect(withoutAtomicLayer(style.css), route).not.toMatch(
            new RegExp(String.raw`\.(?:${CLASS_NAMES.join('|')})(?![\w-])`),
          )
        }
      }
    },
    SECOND,
  )

  it(
    'control: a layout without the order statement and a component’s consumer layer ahead of the stylesheet fails the first clause',
    async () => {
      const { app, result } = await built({ options: BROWSER_KEEP, files: shapeFiles(false) })
      expect(result.error).toBeUndefined()
      const pageStyles = await stylesOfPages(app, result, ['/c/p6'])
      const first = LAYER_STATEMENT_FIRST(pageStyles['/c/p6']!)
      expect(first).not.toBe(normalized(layersStatement()))
      expect(first).toContain('@layer components.consumer')
    },
    SECOND,
  )
})

/**
 * Every stylesheet of each of `routes`, in document order.
 */
async function stylesOfPages(
  app: AstroApp,
  result: AstroBuilt,
  routes: readonly string[],
): Promise<Record<string, PageStyle[]>> {
  const { serveServerBuild } = await import('./helpers/astro-build.ts')
  const server = app.settings.server === true ? await serveServerBuild(app) : undefined
  try {
    const found: Record<string, PageStyle[]> = {}
    for (const route of routes) {
      const html = server ? await server.text(route) : prerenderedHtml(result, route)
      found[route] = stylesOf(result, html)
    }
    return found
  } finally {
    await server?.stop()
  }
}

describe('AC-astro-34 — the fixture’s output stays test output, and its builds do not phone home', () => {
  it(
    'ignores its build output, packs none of it, and builds with telemetry off',
    async () => {
      const log = 'telemetry.log'
      const { app, result } = await built({
        integrations: `{ name: 'record', hooks: { 'astro:config:setup': async ({ config }) => { (await import('node:fs')).appendFileSync(config.root.pathname.replace(/\\/?$/, '/') + '${log}', \`\${globalThis.process.env.ASTRO_TELEMETRY_DISABLED}\\n\`) } } }`,
      })
      expect(result.error).toBeUndefined()
      expect(readFileSync(path.join(app.root, log), 'utf8').trim().split('\n')).toEqual(['1'])
      const rootRelative = path.relative(path.resolve(CORE_ROOT, '../..'), app.root)
      for (const directory of ['dist', '.astro']) {
        const target = path.join(rootRelative, directory)
        if (!existsSync(path.join(app.root, directory))) continue
        expect(() =>
          execFileSync('git', ['check-ignore', '-q', target], {
            cwd: path.resolve(CORE_ROOT, '../..'),
          }),
        ).not.toThrow()
      }
      const tracked = execFileSync('git', ['ls-files', rootRelative], {
        cwd: path.resolve(CORE_ROOT, '../..'),
        encoding: 'utf8',
      })
      expect(tracked).toBe('')
      const packed = packCoreTarball().files
      expect(packed.filter((file) => /astro|\.nave-/.test(file))).toEqual([])
    },
    SECOND,
  )
})

describe('AC-astro-37 — the README’s position claim for a @nave error in an .astro <style> block is true on the fixture', () => {
  it(
    'counts the line from the start of the <style> block',
    async () => {
      const page = `---\nimport Layout from '../layouts/Layout.astro'\n---\n<Layout><p class="b">b</p></Layout>\n<style>\n  .a {\n    color: red;\n  }\n  .b {\n    @nave inlin;\n  }\n</style>\n`
      const lines = page.split('\n')
      const tag = lines.findIndex((line) => line === '<style>') + 1
      const at = lines.findIndex((line) => line.includes('@nave inlin')) + 1
      expect(at - tag).toBeGreaterThanOrEqual(3)
      const { result } = await built({
        options: BROWSER_KEEP,
        files: { 'src/pages/badstyle.astro': page },
      })
      expect(result.error).toBeDefined()
      const reported = new RegExp(String.raw`src/pages/badstyle\.astro:(\d+):`).exec(result.output)
      expect(reported, 'the report names the page').not.toBeNull()
      expect(Number(reported![1])).toBe(at - tag + 1)
      expect(Number(reported![1])).toBeLessThan(at)
      expect(result.output).toMatch(/\(position in .* as processed; /)
    },
    SECOND,
  )
})

export { eSet, ALL_ATOMS }
