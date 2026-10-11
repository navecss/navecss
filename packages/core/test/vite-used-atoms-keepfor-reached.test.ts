/**
 * AC-used-atoms-52 covers: R17, as amended for `keepFor` and the exports of `cx` the application
 * takes, for the exports a listed package gives out through its own re-exports, an alias that
 * names the file, a take the build cannot read, an `import()` read through `await` or `.then`, and
 * the names the printed line spells (a real `vite build` of a scratch app and a dependency, except
 * where a row says it drives the check itself).
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { RenderContext } from '../src/vite-types.ts'
import type { LocatedProblem } from '../src/vite-used-report.ts'
import type { UsedContext } from '../src/vite-used.ts'

import { takenReexports } from '../src/vite-listed-takes.ts'
import { packageLines } from '../src/vite-used-package-lines.ts'
import { atomLayerAtoms, atoms } from './helpers/used-atoms-app.ts'
import {
  forwardLine,
  KEEP_FLEX,
  KEEP_NONE,
  NAVE_APP,
  PASSED_ON,
  run,
  runWithConfig,
  takenLine,
  WHOLE,
  withMenu,
} from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const CN = "export { cx as cn } from '@navecss/core/cx'\n"
const PLAIN = "export { cx } from '@navecss/core/cx'\n"
const DEFAULT = `${IMPORT}export default cx\n`
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const ENTRY = { 'index.js': `export { Menu } from './menu.js'\n${CN}`, 'menu.js': MENU_JS }
const WITHOUT_FIX = ''
const P1_LINE =
  "@acme/ui re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in src/App.ts (cn). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this. The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out."
const P4_LINE =
  "@acme/ui re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in src/App.ts (cx). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this. The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out."
const REQUIRE_LINE =
  "@acme/ui re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in src/w.cjs (a require() or other import the build cannot read). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place; where a file takes a module whole (a namespace import, export *, import() or an import the build cannot read), import by name what it uses from that module, and cx from @navecss/core/cx. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this. The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out."
const MIXED_LINE =
  "@acme/ui also re-exports cx other than under the name cx (renamed, as a default or inside a namespace), and no cxModules entry clears an export of cx from a module that does, under the name cx or another; the keepFor entry above clears that export too. The build does not read calls made through it: where your code imports it from @acme/ui or one of its subpaths, import cx from @navecss/core/cx instead and call cx in its place. The lasting fix there is the package's: import cx from @navecss/core/cx where it is called, and re-export it only under the name cx."

/**
 * A package whose entry exports `Menu` and then `extra`, with the files beside it.
 */
function barrel(
  extra: string,
  files: Record<string, string>,
): Record<string, Record<string, string>> {
  return {
    '@acme/ui': {
      'index.js': `export { Menu } from './menu.js'\n${extra}`,
      'menu.js': MENU_JS,
      ...files,
    },
  }
}

/**
 * The Vite config that makes `@ui` an alias for `file` of the installed `@acme/ui`.
 */
function aliasTo(file: string): (root: string) => Record<string, unknown> {
  return (root) => ({
    resolve: {
      alias: { '@ui': path.join(realpathSync(root), 'node_modules/@acme/ui', file) },
    },
  })
}

describe('AC-used-atoms-52 - a cx export the package gives out through its own re-exports', () => {
  const rows = [
    {
      name: 'a barrel that re-exports a renamed cx by name',
      extra: "export { cn } from './f.js'\n",
      files: { 'f.js': CN },
      app: "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      takes: 'src/App.ts (cn)',
    },
    {
      name: 'a barrel that re-exports a renamed cx with export *',
      extra: "export * from './f.js'\n",
      files: { 'f.js': CN },
      app: "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      takes: 'src/App.ts (cn)',
    },
    {
      name: 'a barrel that gives the default export of cx a name',
      extra: "export { default as cn } from './f.js'\n",
      files: { 'f.js': DEFAULT },
      app: "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      takes: 'src/App.ts (cn)',
    },
    {
      name: 'a barrel that re-exports a plain cx from an inner file',
      extra: "export { cx } from './f.js'\n",
      files: { 'f.js': PLAIN },
      app: "import { Menu, cx } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n",
      takes: 'src/App.ts (cx)',
    },
    {
      name: 'a renamed cx re-exported through two inner files',
      extra: "export { cn } from './mid.js'\n",
      files: { 'mid.js': "export { cn } from './f.js'\n", 'f.js': CN },
      app: "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      takes: 'src/App.ts (cn)',
    },
    {
      name: 'the namespace of an inner file that holds a renamed cx',
      extra: "export * as ui from './f.js'\n",
      files: { 'f.js': CN },
      app: "import { Menu, ui } from '@acme/ui'\nexport const A = [Menu, ui.cn('block')]\n",
      takes: 'src/App.ts (ui)',
    },
    {
      name: 'a renamed cx imported and then exported by the barrel',
      extra: "import { cn } from './f.js'\nexport { cn }\n",
      files: { 'f.js': CN },
      app: "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      takes: 'src/App.ts (cn)',
    },
    {
      name: 'a namespace of cx exported by an inner file and re-exported by the barrel',
      extra: "export { n } from './f.js'\n",
      files: { 'f.js': "export * as n from '@navecss/core/cx'\n" },
      app: "import { Menu, n } from '@acme/ui'\nexport const A = [Menu, n.cx('block')]\n",
      takes: 'src/App.ts (n)',
    },
    {
      name: 'a barrel that gives a renamed cx another name',
      extra: "export { cn as k } from './f.js'\n",
      files: { 'f.js': CN },
      app: "import { Menu, k } from '@acme/ui'\nexport const A = [Menu, k('block')]\n",
      takes: 'src/App.ts (k)',
    },
    {
      name: 'the default export of an inner file, re-exported as the default',
      extra: "export { default } from './f.js'\n",
      files: { 'f.js': DEFAULT },
      app: "import k from '@acme/ui'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, k('block')]\n",
      takes: 'src/App.ts (the default export)',
    },
    {
      name: 'the application taking the barrel as a namespace',
      extra: "export { cn } from './f.js'\n",
      files: { 'f.js': CN },
      app: "import * as ui from '@acme/ui'\nexport const A = [ui.Menu, ui.cn('block')]\n",
      takes: 'src/App.ts (a namespace import reading cn)',
      whole: WHOLE,
    },
    {
      name: 'the application re-exporting the barrel with export *, a second module calling it',
      extra: "export * from './f.js'\n",
      files: { 'f.js': CN },
      app: "export * from '@acme/ui'\n",
      more: { 'src/B.ts': "import { cn } from './App.ts'\nexport const B = cn('block')\n" },
      takes: 'src/App.ts (export *)',
      whole: WHOLE,
    },
  ]

  it.each(rows)(
    'for $name the build fails with the line that names the file, and importing cx from Nave builds green',
    async ({ extra, files, app, more, takes, whole }) => {
      const packages = barrel(extra, files)
      const first = await run(app, packages, { keepFor: KEEP_FLEX }, more)

      expect(first.error!.split('\n')).toContain(takenLine(takes, 'in that file', whole))
      expect(first.error).not.toMatch(/cxModules: \[/)
      const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
    },
    120_000,
  )

  it('keeps failing when only the inner file that holds the plain cx is listed in cxModules', async () => {
    const packages = barrel("export { cx } from './f.js'\n", { 'f.js': PLAIN })
    const app = "import { Menu, cx } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"
    const listed = await run(app, packages, { keepFor: KEEP_FLEX, cxModules: ['@acme/ui/f.js'] })

    expect(listed.error!.split('\n')).toContain(
      forwardLine('@acme/ui', { listed: 'src/App.ts (cx)' }),
    )
    const followed = await run(NAVE_APP, packages, {
      keepFor: KEEP_FLEX,
      cxModules: ['@acme/ui/f.js'],
    })

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
  }, 120_000)

  it('fails for the renamed cx that the entry itself gives out, the same as one an inner file does', async () => {
    const first = await run(
      "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
    )

    expect(first.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
  }, 60_000)

  it('is green when the application takes only Menu from a barrel that re-exports a renamed cx', async () => {
    const built = await run(
      "import { Menu } from '@acme/ui'\nexport const A = Menu\n",
      barrel("export { cn } from './f.js'\n", { 'f.js': CN }),
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)
})

describe('AC-used-atoms-52 - an alias that names the file clears it like a package subpath', () => {
  const app =
    "import { Menu } from '@acme/ui'\nimport { cx } from '@ui'\nexport const A = [Menu, cx('block')]\n"

  it('prints the cxModules line naming the alias for a plain cx the application imports through it', async () => {
    const built = await runWithConfig(
      aliasTo('f.js'),
      app,
      { '@acme/ui': withMenu('f.js', PLAIN) },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error!.split('\n')).toContain(
      "@acme/ui re-exports cx in '@ui'. List it in navePlugin(): cxModules: ['@ui'].",
    )
    expect(built.error).not.toContain('your code takes it from the package')
  }, 60_000)

  it('is green, and holds the atoms of both calls, once that entry is listed', async () => {
    const built = await runWithConfig(
      aliasTo('f.js'),
      app,
      { '@acme/ui': withMenu('f.js', PLAIN) },
      { keepFor: KEEP_FLEX, cxModules: ['@ui'] },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex'))
  }, 60_000)

  it('still tells the application to import cx from Nave for a renamed export behind an alias', async () => {
    const renamed = await runWithConfig(
      aliasTo('f.js'),
      "import { Menu } from '@acme/ui'\nimport { cn } from '@ui'\nexport const A = [Menu, cn('block')]\n",
      { '@acme/ui': withMenu('f.js', CN) },
      { keepFor: KEEP_FLEX },
    )

    expect(renamed.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
    const entry = await runWithConfig(
      aliasTo('index.js'),
      "import { Menu, cn } from '@ui'\nexport const A = [Menu, cn('block')]\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
    )

    expect(entry.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
  }, 120_000)
})

describe('AC-used-atoms-52 - a take the build cannot read counts as taking the module whole', () => {
  const UNREADABLE = 'src/w.cjs (a require() or other import the build cannot read)'
  const app = {
    'src/w.cjs': "const { cn } = require('@acme/ui/f.js')\nexports.w = cn('block')\n",
  }
  const code =
    "import { Menu } from '@acme/ui'\nimport { w } from './w.cjs'\nexport const A = [Menu, w]\n"

  it('fails for a CommonJS module that requires a renamed export, with the lasting fix', async () => {
    const built = await run(code, { '@acme/ui': withMenu('f.js', CN) }, { keepFor: KEEP_FLEX }, app)

    expect(built.error!.split('\n')).toContain(takenLine(UNREADABLE, 'in that file', WHOLE))
  }, 60_000)

  it('fails for one that requires a plain cx, with no cxModules line and no lasting fix', async () => {
    const plain = {
      'src/w.cjs': "const { cx } = require('@acme/ui/cx.js')\nexports.w = cx('block')\n",
    }
    const built = await run(
      code,
      { '@acme/ui': withMenu('cx.js', PLAIN) },
      { keepFor: KEEP_FLEX },
      plain,
    )

    expect(built.error!.split('\n')).toContain(
      takenLine(UNREADABLE, 'in that file', WHOLE, WITHOUT_FIX),
    )
    expect(built.error).not.toMatch(/cxModules: \[/)
  }, 60_000)

  it('fails the same way when the module also has a specifier that clears it', async () => {
    const plain = {
      'src/w.cjs': "const { cx } = require('@acme/ui/cx.js')\nexports.w = cx('block')\n",
    }
    const bare =
      "import '@acme/ui/cx.js'\nimport { Menu } from '@acme/ui'\nimport { w } from './w.cjs'\nexport const A = [Menu, w]\n"
    const built = await run(
      bare,
      { '@acme/ui': withMenu('cx.js', PLAIN) },
      { keepFor: KEEP_FLEX },
      plain,
    )

    expect(built.error!.split('\n')).toContain(
      takenLine(UNREADABLE, 'in that file', WHOLE, WITHOUT_FIX),
    )
    expect(built.error).not.toMatch(/cxModules: \[/)
  }, 60_000)

  describe('and an importer the build has no text for, or cannot parse, reads the same', () => {
    const ID = '/project/node_modules/@acme/ui/f.js'
    const TAKER = '/project/src/App.ts'
    const problem = {
      kind: 'reexport',
      offset: 0,
      construct: "export { cx as cn } from '@navecss/core/cx'",
      text: 'a re-export of cx',
      isListable: true,
      isRenamed: true,
      exportedAs: ['cn'],
      file: 'node_modules/@acme/ui/f.js',
      line: 1,
      column: 1,
      pkg: '@acme/ui',
      moduleId: ID,
    } as LocatedProblem
    const context = {
      options: { cxModules: [] },
      packageNames: new Map(),
      root: '/project',
    } as unknown as UsedContext

    /**
     * The check's context over a graph of one importer of the module, whose text is `code` and
     * which `parse` reads.
     */
    function over(code: string | null, parse: (text: string) => unknown): RenderContext {
      return {
        environment: { name: 'client' },
        getModuleInfo: (id: string) =>
          id === ID ? { importers: [TAKER], dynamicImporters: [] } : { code },
        resolve: () => Promise.resolve(undefined),
        parse,
      } as unknown as RenderContext
    }

    it.each([
      // eslint-disable-next-line unicorn/no-null -- the module graph holds `null` for a module with no text
      ['has no text', null, () => ({})],
      [
        'has text that does not parse',
        "import { cn } from '@acme/ui/f.js'",
        () => {
          throw new SyntaxError('unexpected token')
        },
      ],
    ] as const)('when the importer %s', async (_, code, parse) => {
      const kept = await takenReexports(over(code, parse), context, { standingIn: [problem] })
      const lines = packageLines('@acme/ui', kept, [])

      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain(
        ' in src/App.ts (a require() or other import the build cannot read).',
      )
      expect(lines[0]).not.toContain('(a namespace import)')
    })
  })
})

/**
 * An application module that exports `body`.
 */
function lazy(body: string): string {
  return `export const A = ${body}\n`
}

describe('AC-used-atoms-52 - an import() read through await or then', () => {
  const green = [
    ['a member read of the awaited module', "async () => (await import('@acme/ui')).Menu"],
    ['a .then callback that reads one member', "() => import('@acme/ui').then((m) => m.Menu)"],
    [
      'a .then callback that destructures other keys',
      "() => import('@acme/ui').then(({ Menu }) => Menu)",
    ],
  ] as const
  const red = [
    [
      'a member read of a cx export of the awaited module',
      "async () => (await import('@acme/ui')).cn('block')",
      'src/App.ts (import() reading cn)',
    ],
    [
      'a .then callback that calls a cx export',
      "() => import('@acme/ui').then((m) => m.cn('block'))",
      'src/App.ts (import() reading cn)',
    ],
    [
      'a .then callback that passes the module on',
      "() => import('@acme/ui').then((m) => m)",
      'src/App.ts (import())',
    ],
  ] as const

  it.each(green)(
    'takes nothing for %s',
    async (_, body) => {
      const built = await run(lazy(body), { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    },
    60_000,
  )

  it.each(red)(
    'takes the module for %s',
    async (_, body, what) => {
      const built = await run(lazy(body), { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

      expect(built.error!.split('\n')).toContain(takenLine(what, 'in that file', WHOLE))
    },
    60_000,
  )
})

/**
 * The error of a build whose application imports `imported` from a file that exports `cx` as
 * `name`, both spelled as export names.
 */
async function errorOfTaking(name: string, imported: string): Promise<string> {
  const built = await run(
    `import { Menu } from '@acme/ui'\nimport { ${imported} as k } from '@acme/ui/f.js'\nexport const A = [Menu, k('block')]\n`,
    { '@acme/ui': withMenu('f.js', `export { cx as ${name} } from '@navecss/core/cx'\n`) },
    { keepFor: KEEP_NONE },
  )
  return built.error!
}

describe('AC-used-atoms-52 - the names the printed line spells', () => {
  it('writes an identifier of any script bare', async () => {
    const error = await errorOfTaking('größe', 'größe')

    expect(error.split('\n')).toContain(takenLine('src/App.ts (größe)'))
  }, 60_000)

  it('quotes a name that is no identifier, escaping the quote and the backslash', async () => {
    const quoted = await errorOfTaking('"it\'s"', '"it\'s"')

    expect(quoted.split('\n')).toContain(takenLine(String.raw`src/App.ts ('it\'s')`))
    const slashed = await errorOfTaking(String.raw`"a\\b"`, String.raw`"a\\b"`)

    expect(slashed.split('\n')).toContain(takenLine(String.raw`src/App.ts ('a\\b')`))
  }, 120_000)
})

describe('AC-used-atoms-52 - the worked lines, word for word', () => {
  it('prints the line for a renamed cx taken through a barrel', async () => {
    const built = await run(
      "import { cn, Menu } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      barrel("export { cn } from './f.js'\n", { 'f.js': CN }),
      { keepFor: KEEP_FLEX },
    )

    expect(built.error!.split('\n').at(-1)).toBe(P1_LINE)
  }, 60_000)

  it('prints the line for a plain cx taken through a barrel', async () => {
    const built = await run(
      "import { cx, Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n",
      barrel("export { cx } from './f.js'\n", { 'f.js': PLAIN }),
      { keepFor: KEEP_FLEX },
    )

    expect(built.error!.split('\n').at(-1)).toBe(P4_LINE)
  }, 60_000)

  it('prints the line for a take by require()', async () => {
    const built = await run(
      "import { Menu } from '@acme/ui'\nimport { w } from './w.cjs'\nexport const A = [Menu, w]\n",
      { '@acme/ui': withMenu('f.js', CN) },
      { keepFor: KEEP_FLEX },
      { 'src/w.cjs': "const { cn } = require('@acme/ui/f.js')\nexports.w = cn('block')\n" },
    )

    expect(built.error!.split('\n').at(-1)).toBe(REQUIRE_LINE)
  }, 60_000)
})

/**
 * An application module that exports `name`, called through a renamed `cx` of the package.
 */
function takerOf(name: string): string {
  return `import { cn } from '@acme/ui/f.js'\nexport const ${name} = cn('block')\n`
}

describe('AC-used-atoms-52 - what the application takes, in shapes that already held', () => {
  const SUBPATH = withMenu('f.js', CN)

  it('counts a named re-export of a cx export as a take', async () => {
    const built = await run(
      "import { Menu } from '@acme/ui'\nexport { cn } from '@acme/ui/f.js'\nexport const A = Menu\n",
      { '@acme/ui': SUBPATH },
      { keepFor: KEEP_FLEX },
      { 'src/B.ts': "import { cn } from './App.ts'\nexport const B = cn('block')\n" },
    )

    expect(built.error!.split('\n')).toContain(
      takenLine('src/App.ts (cn)', 'in that file', PASSED_ON),
    )
  }, 60_000)

  it('counts export * as ns from the package as a take of the namespace', async () => {
    const built = await run(
      "export * as ui from '@acme/ui'\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
      { 'src/B.ts': "import { ui } from './App.ts'\nexport const B = ui.cn('block')\n" },
    )

    expect(built.error!.split('\n')).toContain(
      takenLine('src/App.ts (a namespace import)', 'in that file', WHOLE),
    )
  }, 60_000)

  it('counts export * as a take only when a cx export other than the default is among them', async () => {
    const star =
      "import { Menu } from '@acme/ui'\nexport * from '@acme/ui/f.js'\nexport const A = Menu\n"
    const onlyDefault = await run(
      star,
      { '@acme/ui': withMenu('f.js', DEFAULT) },
      { keepFor: KEEP_FLEX },
    )

    expect(onlyDefault.error).toBeUndefined()
    expect(atomLayerAtoms(onlyDefault.css)).toEqual(atoms('flex'))
    const withOther = await run(
      star,
      { '@acme/ui': withMenu('f.js', `${DEFAULT}export const Other = 1\n`) },
      { keepFor: KEEP_FLEX },
    )

    expect(withOther.error).toBeUndefined()
    const named = await run(star, { '@acme/ui': SUBPATH }, { keepFor: KEEP_FLEX })

    expect(named.error!.split('\n')).toContain(
      takenLine('src/App.ts (export *)', 'in that file', WHOLE),
    )
  }, 180_000)

  it('counts a namespace read through a computed key as taken', async () => {
    const built = await run(
      "import * as ui from '@acme/ui'\nconst k = 'c' + 'n'\nexport const A = [ui.Menu, ui[k]('block')]\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error!.split('\n')).toContain(
      takenLine('src/App.ts (a namespace import)', 'in that file', WHOLE),
    )
  }, 60_000)

  it('lists the takers in code-unit order, not locale order', async () => {
    const built = await run(
      "import { cn } from '@acme/ui/f.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('gap')]\n",
      { '@acme/ui': SUBPATH },
      { keepFor: KEEP_FLEX },
      { 'src/c.ts': takerOf('c'), 'src/a.ts': takerOf('a'), 'src/B.ts': takerOf('B') },
    )

    expect(built.error!.split('\n')).toContain(
      takenLine(
        'src/App.ts (cn), src/B.ts (cn), src/a.ts (cn), src/c.ts (cn)',
        'in each of those files',
      ),
    )
  }, 60_000)

  it('lists what one taker takes in code-unit order, whichever it writes first', async () => {
    const built = await run(
      "import * as f from '@acme/ui/f.js'\nimport { cn } from '@acme/ui/f.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, f.cn('grid'), cn('block')]\n",
      { '@acme/ui': SUBPATH },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error!.split('\n')).toContain(
      takenLine(
        'src/App.ts (a namespace import reading cn), src/App.ts (cn)',
        'in that file',
        WHOLE,
      ),
    )
  }, 60_000)

  it('prints the keepFor line for a plain re-export beside a namespace one in an unlisted package', async () => {
    const mixed = `${PLAIN}import * as ns from '@navecss/core/cx'\nexport { ns }\n`
    const built = await run(
      "import { Menu } from '@acme/ui'\nimport { cx } from '@acme/ui/f.js'\nexport const A = [Menu, cx('block')]\n",
      { '@acme/ui': withMenu('f.js', mixed) },
      {},
    )

    expect(built.error!.split('\n').at(-1)).toBe(MIXED_LINE)
  }, 60_000)
})
