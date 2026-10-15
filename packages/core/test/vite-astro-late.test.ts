/**
 * The Astro criteria for what is read after the stylesheet is written (AC-astro-03, -08, -09, -11,
 * -13, -15, -17, -18, -29, -31): code only the browser runs, a dependency the server build left
 * external, a check of every stylesheet Astro ships, and a skip link in an `.astro` layout.
 */
import { afterAll, describe, expect, it } from 'vitest'

import type { AstroApp, AstroAppSettings } from './helpers/astro-app.ts'
import type { AstroBuilt } from './helpers/astro-build.ts'

import {
  BASE_FILES,
  LEAN_FILES,
  makeAstroApp,
  NO_RENAME_FILES,
  PRERENDERED_FILES,
  SERVER_FILES,
} from './helpers/astro-app.ts'
import { buildAstro, layerStylesOfRoutes } from './helpers/astro-build.ts'
import {
  ALL_ATOMS,
  BROWSER_KEEP,
  BROWSER_ONLY,
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
const OUTPUTS: [string, AstroAppSettings][] = [
  ['static', {}],
  ['server, no prerendered page', { server: true }],
  ['server, a prerendered page', { server: true, prerendered: true }],
]
const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * `line:column` of the first `needle` in `source`, 1-based, as the report prints a position.
 */
function place(source: string, needle: string): string {
  const before = source.slice(0, source.indexOf(needle))
  const lines = before.split('\n')
  return `${lines.length}:${lines.at(-1)!.length + 1}`
}

describe('AC-astro-03 — an unreadable cx() call in an .astro file, or read late by the browser’s build, fails at its file, line and column', () => {
  const BAD = `---\n${IMPORT}const { tone } = Astro.props\nconst a = cx(tone)\n---\n<div class={cx(Astro.props.tone)}>{a}</div>\n`
  const ONLY_BAD = `${IMPORT}export default function OnlyBad({ variant }: { variant: string }) {\n  return <div className={cx(variant)}>x</div>\n}\n`
  const ABOUT_WITH_ONLY_BAD = (about: string): string =>
    about
      .replace(
        "import Layout from '../layouts/Layout.astro'",
        "import Layout from '../layouts/Layout.astro'\nimport OnlyBad from '../components/OnlyBad.tsx'",
      )
      .replace(
        '<a id="to-index"',
        '<OnlyBad client:only="react" variant="flex" />\n  <a id="to-index"',
      )

  it.each(OUTPUTS)(
    '%s: both states fail at the argument of the call, and pass with a literal',
    async (_name, settings) => {
      const first = await built({
        ...settings,
        options: BROWSER_KEEP,
        files: { 'src/pages/bad.astro': BAD },
      })
      expect(first.result.error).toBeDefined()
      const found = [
        ...first.result.output.matchAll(/^src\/pages\/bad\.astro:(\d+):(\d+): /gm),
      ].map((match) => ({ line: Number(match[1]), column: Number(match[2]) }))
      const [frontmatter, template] = [place(BAD, 'tone)'), place(BAD, 'Astro.props.tone)')].map(
        (at) => {
          const [line, column] = at.split(':').map(Number)
          return { line: line!, column: column! }
        },
      )
      // The line is exact for both calls; the template call’s column is its argument’s, and the
      // frontmatter call’s is where Astro’s source map leads, never past its argument.
      expect(unique(found.map((one) => `${one.line}`))).toEqual(
        [`${frontmatter!.line}`, `${template!.line}`].toSorted(),
      )
      const atTemplate = found.find((one) => one.line === template!.line)!
      expect(atTemplate.column).toBe(template!.column)
      expect(atTemplate.column).not.toBe(1)
      const atFrontmatter = found.find((one) => one.line === frontmatter!.line)!
      expect(atFrontmatter.column).toBeGreaterThanOrEqual(1)
      expect(atFrontmatter.column).toBeLessThanOrEqual(frontmatter!.column)

      const about = BASE_FILES['src/pages/about.astro']!
      const second = await built({
        ...settings,
        options: BROWSER_KEEP,
        files: {
          'src/components/OnlyBad.tsx': ONLY_BAD,
          'src/pages/about.astro': ABOUT_WITH_ONLY_BAD(about),
        },
      })
      expect(second.result.error).toBeDefined()
      const failing = second.result.output
        .split('\n')
        .filter((line) => line.startsWith('src/components/OnlyBad.tsx:'))
      expect(unique(failing.map((line) => line.slice(0, line.indexOf(': '))))).toEqual([
        `src/components/OnlyBad.tsx:${place(ONLY_BAD, 'variant)}')}`,
      ])

      const fixed = await built({
        ...settings,
        options: BROWSER_KEEP,
        files: {
          'src/pages/bad.astro': BAD.replace('cx(tone)', "cx('flex')").replace(
            'cx(Astro.props.tone)',
            "cx('grid')",
          ),
          'src/components/OnlyBad.tsx': ONLY_BAD.replace('cx(variant)', "cx('flex')"),
          'src/pages/about.astro': ABOUT_WITH_ONLY_BAD(about),
        },
      })
      expect(fixed.result.error).toBeUndefined()
    },
    SECOND * 2,
  )
})

const SERVER_RENDERED = ['grid', 'justifyCenter', 'flexWrap', 'itemsEnd']
const MISS_LINES = [
  'The build read atoms after it wrote the CSS, so their rules are missing from it:',
  'src/components/OnlyIsland.tsx: names inlineFlex, which the CSS already written does not hold.',
  'src/lib/lazy.ts: names wFull, which the CSS already written does not hold.',
  'src/pages/index.astro: names truncate, which the CSS already written does not hold.',
  'A server build wrote the CSS, and only a build after it read these modules, such as code only the browser runs (an Astro client:only component, or a <script> in an .astro file).',
  'List the atoms in keep in navePlugin(), or have the server render that code too (a hydrated island rather than client:only).',
]

describe('AC-astro-08 — code only the browser runs fails the build in case (b), with the printed lines byte for byte', () => {
  it.each(OUTPUTS)(
    '%s: names the three atoms and the two remedies',
    async (_name, settings) => {
      const { result } = await built(settings)
      expect(result.error).toBeDefined()
      expect(result.output).toContain(MISS_LINES.join('\n'))
      expect(result.output).not.toContain('builder.buildApp')
      for (const atom of SERVER_RENDERED) expect(result.output).not.toContain(`names ${atom}`)

      const two = await built({ ...settings, options: "{ keep: ['inlineFlex', 'wFull'] }" })
      const named = two.result.output
        .split('\n')
        .filter((line) => line.includes(', which the CSS already written'))
      expect(unique(named)).toEqual([MISS_LINES[3]])
      const kept = await built({ ...settings, options: BROWSER_KEEP })
      expect(kept.result.error).toBeUndefined()
    },
    SECOND * 2,
  )
})

const ISLAND_LIB = {
  'island-lib': {
    'package.json': JSON.stringify({
      name: 'island-lib',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${IMPORT}export const cls = () => cx('justifyBetween')\n`,
  },
}
const LOAD_WITH_LIB = `import { useEffect, useRef } from 'react'
import { cls } from 'island-lib'

export default function Load() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.setAttribute('data-hydrated', '')
  }, [])
  return (
    <div ref={root} id="load" className={cls()}>
      Load
    </div>
  )
}
`
const LIB_LINES = [
  'The build read atoms after it wrote the CSS, so their rules are missing from it:',
  'node_modules/island-lib/index.js: names justifyBetween, which the CSS already written does not hold.',
  MISS_LINES[4]!,
  MISS_LINES[5]!,
  'island-lib is a dependency the server build left external: add it to resolve.noExternal in your Vite config (on Astro, under vite in astro.config) so the server build reads it.',
]

describe('AC-astro-09 — a dependency the server build left external: its own line, resolve.noExternal as the remedy', () => {
  const settings = {
    options: BROWSER_KEEP,
    files: { 'src/components/Load.tsx': LOAD_WITH_LIB },
    packages: ISLAND_LIB,
  } as const

  it(
    'fails with the dependency line, passes with resolve.noExternal, and ssr.noExternal does not reach prerender',
    async () => {
      const failing = await built(settings)
      expect(failing.result.output).toContain(LIB_LINES.join('\n'))

      const fixed = await built({ ...settings, vite: "resolve: { noExternal: ['island-lib'] }" })
      expect(fixed.result.error).toBeUndefined()
      const pages = await layerStylesOfRoutes(fixed.app, fixed.result, ['/', '/about'])
      for (const styles of Object.values(pages)) {
        for (const style of styles) expect(setOfCss(style.css)).toEqual(eSet('justifyBetween'))
      }

      const control = await built({ ...settings, vite: "ssr: { noExternal: ['island-lib'] }" })
      expect(control.result.output).toContain(LIB_LINES.join('\n'))
    },
    SECOND * 3,
  )

  it(
    'names a scoped package whole',
    async () => {
      const renamed = await built({
        options: BROWSER_KEEP,
        files: {
          'src/components/Load.tsx': LOAD_WITH_LIB.replace("'island-lib'", "'@acme/island-ui'"),
        },
        packages: {
          '@acme/island-ui': {
            'package.json': JSON.stringify({
              name: '@acme/island-ui',
              version: '1.0.0',
              type: 'module',
              main: './index.js',
              dependencies: { '@navecss/core': '*' },
            }),
            'index.js': ISLAND_LIB['island-lib']['index.js'],
          },
        },
      })
      const lines = renamed.result.output.split('\n')
      expect(lines.some((line) => line.startsWith('@acme/island-ui is a dependency'))).toBe(true)
      expect(
        lines.some((line) =>
          line.startsWith('node_modules/@acme/island-ui/index.js: names justifyBetween'),
        ),
      ).toBe(true)
    },
    SECOND,
  )
})

const SERVER_LIB = {
  'server-lib': {
    'package.json': JSON.stringify({
      name: 'server-lib',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${IMPORT}export const cls = () => cx('flexGrow')\n`,
  },
}
const WARNING =
  'server-lib depends on @navecss/core, but no environment of this build transforms it, so the atoms its cx() calls name are not read. Add it to resolve.noExternal in your Vite config (on Astro, under vite in astro.config) so the build reads it, or list the atoms its calls can produce under its name in keepFor in navePlugin().'

describe('AC-astro-11 — in case (b) the untransformed-dependency warning names resolve.noExternal', () => {
  it(
    'warns once with the Astro text, and resolve.noExternal clears it',
    async () => {
      const index = BASE_FILES['src/pages/index.astro']!
      const withLib = index
        .replace('import Load from', "import { cls } from 'server-lib'\nimport Load from")
        .replace('<p id="s">s</p>', '<p id="s" class={cls()}>s</p>')
      const settings = {
        options: BROWSER_KEEP,
        files: { 'src/pages/index.astro': withLib },
        packages: SERVER_LIB,
      } as const
      const warned = await built(settings)
      expect(warned.result.error).toBeUndefined()
      expect(warned.result.output.split(WARNING).length - 1).toBe(1)
      const pages = await layerStylesOfRoutes(warned.app, warned.result, ['/'])
      for (const style of pages['/']!) expect(setOfCss(style.css)).not.toContain('flexGrow')

      const fixed = await built({ ...settings, vite: "resolve: { noExternal: ['server-lib'] }" })
      expect(fixed.result.output).not.toContain('depends on @navecss/core')
      const fixedPages = await layerStylesOfRoutes(fixed.app, fixed.result, ['/'])
      for (const style of fixedPages['/']!) expect(setOfCss(style.css)).toContain('flexGrow')

      const control = await built({ ...settings, vite: "ssr: { noExternal: ['server-lib'] }" })
      expect(control.result.output.split(WARNING).length - 1).toBe(1)
    },
    SECOND * 3,
  )
})

const PERSIST = `${IMPORT}export default function Persist() {\n  return <div id="persist" className={cx('noWrap')}>Persist</div>\n}\n`

describe('AC-astro-13 — the late check is against the first stylesheet, for code only the browser runs', () => {
  it(
    'names noWrap and Persist, and leaves a module a server environment read alone',
    async () => {
      const read = (name: string): string =>
        ({ ...BASE_FILES, ...SERVER_FILES, ...PRERENDERED_FILES })[name]!
      const dyn = read('src/pages/dyn.astro')
      const files = {
        ...NO_RENAME_FILES,
        'src/components/Persist.tsx': PERSIST,
        'src/pages/pre.astro': NO_RENAME_FILES['src/pages/pre.astro']!.replace(
          "import Layout from '../layouts/Layout.astro'",
          "import Layout from '../layouts/Layout.astro'\nimport Persist from '../components/Persist.tsx'",
        ).replace('<div id="p"', '<Persist client:only="react" />\n  <div id="p"'),
        'src/pages/dyn.astro': dyn.replace(
          '<div id="a"',
          `<div class={cx('noWrap')}></div>\n  <div id="a"`,
        ),
      }
      const failing = await built({ server: true, prerendered: true, options: BROWSER_KEEP, files })
      expect(failing.result.error).toBeDefined()
      expect(failing.result.output).toContain(
        'src/components/Persist.tsx: names noWrap, which the CSS already written does not hold.',
      )

      const shared = await built({
        server: true,
        prerendered: true,
        options: BROWSER_KEEP,
        files: {
          'src/lib/shared.ts': `${IMPORT}export const shared = cx('itemsStart')\n`,
          'src/components/OnlyIsland.tsx': read('src/components/OnlyIsland.tsx')
            .replace(
              "import { cx } from '@navecss/core/cx'",
              "import { cx } from '@navecss/core/cx'\nimport { shared } from '../lib/shared.ts'",
            )
            .replace("className={cx('inlineFlex')}", "className={cx('inlineFlex') + ' ' + shared}"),
          'src/pages/index.astro': read('src/pages/index.astro')
            .replace(
              'import Layout from',
              "import { shared } from '../lib/shared.ts'\nimport Layout from",
            )
            .replace('<p id="s">s</p>', '<p id="s" class={shared}>s</p>'),
        },
      })
      expect(shared.result.output).not.toContain('names itemsStart')
      expect(shared.result.error).toBeUndefined()
      const pages = await layerStylesOfRoutes(shared.app, shared.result, ['/'])
      for (const style of pages['/']!) expect(setOfCss(style.css)).toContain('itemsStart')
    },
    SECOND * 3,
  )
})

const TAMPER = '@layer atomic{.nave-hidden{display:none}}'

describe('AC-astro-15 — the check runs on every stylesheet a case (b) environment writes, inlined ones included', () => {
  const rows: [string, AstroAppSettings][] = [
    ['the linked shared stylesheet (static)', { probe: { tamper: { css: TAMPER } } }],
    [
      'the inlined layer of /lean (static)',
      { files: LEAN_FILES, probe: { tamper: { css: TAMPER, match: 'lean' } } },
    ],
    [
      'a stylesheet ssr emits that prerender did not (no-rename shape)',
      {
        server: true,
        prerendered: true,
        files: NO_RENAME_FILES,
        probe: { tamper: { css: TAMPER, environment: 'ssr' } },
      },
    ],
  ]
  it.each(rows)(
    'fails with the line for hidden: %s',
    async (_name, settings) => {
      const { result } = await built({ ...settings, options: BROWSER_KEEP })
      expect(result.error).toBeDefined()
      expect(result.output).toMatch(
        /: the atomic layer holds a rule for hidden, which the build did not emit\./,
      )
      const clean = await built({ ...settings, options: BROWSER_KEEP, probe: {} })
      expect(clean.result.error).toBeUndefined()
    },
    SECOND * 2,
  )
})

describe('AC-astro-17 — a @nave left in a small page <style> fails the build, naming the stylesheet’s asset name before Astro inlined it', () => {
  const SURV = `---\nimport Layout from '../layouts/Layout.astro'\n---\n<Layout><p class="surv2">s</p></Layout>\n<style>\n  .surv2 {\n    color: @nave flex;\n  }\n</style>\n`
  const LINE =
    /^_astro\/surv\.[A-Za-z0-9_-]+\.css:\d+:\d+: @nave flex \(in \.surv2\[data-astro-cid-[a-z0-9]+\]\)$/m

  it(
    'fails under the default and under inlineStylesheets: never, and in the linked stylesheet',
    async () => {
      const files = { 'src/pages/surv.astro': SURV }
      const auto = await built({ options: BROWSER_KEEP, files })
      expect(auto.result.error).toBeDefined()
      expect(auto.result.output).toMatch(LINE)
      const never = await built({
        options: BROWSER_KEEP,
        files,
        astro: "build: { inlineStylesheets: 'never' }",
      })
      expect(never.result.output).toMatch(LINE)
      const linked = await built({
        options: BROWSER_KEEP,
        files: { 'src/styles/app.css': '.surv { color: @nave flex; }\n' },
      })
      expect(linked.result.error).toBeDefined()
      expect(linked.result.output).toMatch(/_astro\/[^:\n]+\.css:\d+:\d+: @nave flex/)
    },
    SECOND * 3,
  )
})

describe('AC-astro-18 — a pruned atom layer Astro inlines is filtered and checked like a linked one', () => {
  it(
    'holds the same set as the linked stylesheet and passes parity',
    async () => {
      const used = await built({ options: BROWSER_KEEP, files: LEAN_FILES })
      const all = await built({ options: "{ atomic: 'all' }", files: LEAN_FILES })
      expect(used.result.error).toBeUndefined()
      const pages = await layerStylesOfRoutes(used.app, used.result, ['/', '/lean'])
      const allPages = await layerStylesOfRoutes(all.app, all.result, ['/', '/lean'])
      expect(pages['/lean']!.map((style) => style.kind)).toEqual(['inline'])
      expect(setOfCss(pages['/lean']![0]!.css)).toEqual(setOfCss(pages['/']![0]!.css))
      expect(parityProblems(pages['/lean']![0]!.css, allPages['/lean']![0]!.css)).toEqual([])
      expect(setOfCss(allPages['/lean']![0]!.css)).toEqual(ALL_ATOMS)

      const tampered = await built({
        options: BROWSER_KEEP,
        files: LEAN_FILES,
        probe: { tamper: { css: TAMPER, match: 'lean' } },
      })
      expect(tampered.result.error).toBeDefined()
    },
    SECOND * 3,
  )
})

export { BROWSER_ONLY, unique }
