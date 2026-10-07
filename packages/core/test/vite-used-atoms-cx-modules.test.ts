/* eslint-disable unicorn/consistent-function-scoping -- each fixture sits beside the criterion whose rows use it */
/**
 * The used-atoms criteria for declared re-exports (AC-used-atoms-47 to -52, and the `cxModules`
 * rows of -05, -43 and -55): a real `vite build` and dev server of a scratch app whose barrels
 * re-export Nave's `cx`, declared in `cxModules`, and what the build says when they are not.
 */
import type { InlineConfig, PluginOption } from 'vite'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildEnvironments,
  buildUsed,
  type Built,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'
import { appConfig, devCss, startDev, stopDev } from './helpers/vite-app.ts'

const BARREL = "export { cx } from '@navecss/core/cx'\n"

/**
 * AC-47's declared modules and importers, one module per row.
 */
const UI_FILES: Record<string, string> = {
  'src/ui/index.ts': BARREL,
  'src/ui2.ts': "export * from '@navecss/core/cx'\n",
  'src/ui3.ts': `${IMPORT}export { cx }\n`,
  'src/ui4.ts': "import { cx as c } from '@navecss/core/cx'\nexport { c as cx }\n",
  'src/a.ts': "import { cx } from './ui'\nexport const a = cx('flex')\n",
  'src/b.ts': "import { cx as k } from './ui/index.ts'\nexport const b = k('grid')\n",
  'src/c.ts': "import * as U from './ui2'\nexport const c = U.cx('block')\n",
  'src/d.ts':
    "import { cx } from './ui3'\nexport const d = (on: boolean) => [cx.raw('x'), cx(on && 'gap')]\n",
  'src/e.ts': "import { cx } from './ui4'\nexport const e = cx('hidden')\n",
  'src/f.ts': "import { cx } from '@/ui'\nexport const f = cx('truncate')\n",
}
const UI_MODULES = ['./src/ui/index.ts', './src/ui2.ts', './src/ui3.ts', './src/ui4.ts']
const UI_ATOM_NAMES = ['flex', 'grid', 'block', 'gap', 'hidden', 'truncate'] as const
const UI_ATOMS = atoms(...UI_ATOM_NAMES)

/**
 * The last `cxModules: [...]` array a failure prints, as the list a reader would paste.
 */
function printedList(error: string | undefined): string[] | undefined {
  const last = (error ?? '')
    .matchAll(/cxModules: (\[[^\]]*\])/g)
    .toArray()
    .at(-1)?.[1]
  return last === undefined
    ? undefined
    : last
        .matchAll(/'([^']*)'/g)
        .map((entry) => entry[1]!)
        .toArray()
}

/**
 * Builds with `configured`, then rebuilds with the list that failure printed, as a reader pasting
 * the remedy does. `pasted` is `undefined` when the first build printed no list.
 */
async function pasteAndRebuild(
  run: (cxModules: readonly string[]) => Promise<Built>,
  configured: readonly string[],
): Promise<{ first: Built; list: string[] | undefined; pasted: Built | undefined }> {
  const first = await run(configured)
  const list = printedList(first.error)
  return { first, list, pasted: list === undefined ? undefined : await run(list) }
}

/**
 * Builds an app of `modules` (each imported by `src/main.ts`), the alias `@` naming `src`.
 */
async function build(
  modules: Record<string, string>,
  settings: Parameters<typeof buildUsed>[1] = {},
): Promise<Built> {
  const app = makeUsedApp(appFiles(modules))
  try {
    return await buildUsed(app, {
      ...settings,
      config: {
        resolve: { alias: { '@': path.join(app.root, 'src') } },
        ...settings.config,
      },
    })
  } finally {
    app.dispose()
  }
}

/**
 * The dev server's config, its dependency cache under `node_modules` as a consumer's is.
 */
function devConfig(root: string, plugins: PluginOption[], alias = {}): InlineConfig {
  return {
    ...appConfig(root, 'postcss', plugins),
    cacheDir: path.join(root, 'node_modules', '.vite'),
    resolve: { alias },
  }
}

/**
 * The atoms of the layer the dev server serves for `src/app.css` once `src/main.ts` and what it
 * reaches have been requested.
 */
async function servedAtoms(
  files: Record<string, string>,
  options: Parameters<typeof navePlugin>[0],
  setup?: (app: ReturnType<typeof makeUsedApp>) => void,
): Promise<string[]> {
  const app = makeUsedApp(appFiles(files))
  setup?.(app)
  const server = await startDev(
    devConfig(app.root, [navePlugin(options)], { '@': path.join(app.root, 'src') }),
  )
  try {
    await server.transformIndexHtml(
      '/index.html',
      readFileSync(path.join(app.root, 'index.html'), 'utf8'),
    )
    const served = await devCss(server, '/src/main.ts')
    const css = Object.entries(served).find(([url]) => url.startsWith('/src/app.css'))?.[1] ?? ''
    return css === '' ? ['<no stylesheet>'] : atomLayerAtoms(css)
  } finally {
    await stopDev(server)
    app.dispose()
  }
}

describe('AC-used-atoms-47 — a declared module re-exporting Nave’s cx, and every importer form', () => {
  it('builds green and ships exactly the atoms the importers name', async () => {
    const built = await build(UI_FILES, { options: { cxModules: UI_MODULES } })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(UI_ATOMS)
  }, 60_000)

  it('serves the same atoms in dev', async () => {
    expect(await servedAtoms(UI_FILES, { cxModules: UI_MODULES })).toEqual(UI_ATOMS)
  }, 60_000)

  it('control: with cxModules empty, one problem on each declared module and none on an importer', async () => {
    const built = await build(UI_FILES)

    expect(built.error).toMatch(/^4 problems in 4 files/)
    for (const file of ['src/ui/index.ts', 'src/ui2.ts', 'src/ui3.ts', 'src/ui4.ts']) {
      expect(built.error).toContain(`${file}:`)
    }
    for (const file of 'abcdef') expect(built.error).not.toContain(`src/${file}.ts:`)
  }, 60_000)

  it('fails an importer’s unreadable call, and a declared module’s own, in the file that holds it', async () => {
    const importer = await build(
      {
        ...UI_FILES,
        'src/g.ts': "import { cx } from './ui'\nexport const g = (v: string) => cx(v)\n",
      },
      { options: { cxModules: UI_MODULES } },
    )
    const namespace = await build(
      {
        ...UI_FILES,
        'src/c.ts': "import * as U from './ui2'\nexport const c = (v: string) => U.cx(v)\n",
      },
      { options: { cxModules: UI_MODULES } },
    )
    const declared = await build(
      {
        ...UI_FILES,
        'src/ui3.ts': `${IMPORT}export { cx }\nexport const k = (v: string) => cx(v)\n`,
      },
      { options: { cxModules: UI_MODULES } },
    )

    expect(importer.error).toMatch(/^1 problem in 1 file/)
    expect(importer.error).toContain('src/g.ts:')
    expect(namespace.error).toMatch(/^1 problem in 1 file/)
    expect(namespace.error).toContain('src/c.ts:')
    expect(declared.error).toMatch(/^1 problem in 1 file/)
    expect(declared.error).toContain('src/ui3.ts:')
  }, 120_000)
})

describe('AC-used-atoms-47 - an importer reaching its own directory’s barrel, and a query spelling', () => {
  const listed = { options: { cxModules: UI_MODULES } }

  it('reads an importer that writes `.` or `..` and fails no build-end check', async () => {
    const built = await build(
      {
        ...UI_FILES,
        'src/ui/button.ts': "import { cx } from '.'\nexport const g1 = cx('inlineFlex')\n",
        'src/ui/forms/field.ts': "import { cx } from '..'\nexport const g2 = cx('relative')\n",
      },
      listed,
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('inlineFlex', 'relative', ...UI_ATOM_NAMES))
  }, 60_000)

  it('reads a call made through a query spelling of the barrel, never green without its rule', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/q.ts': "import { cx } from './ui?v=1'\nexport const q = cx('flex')\n",
      },
      { options: { cxModules: ['./src/ui/index.ts'] } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)

  it('fails a dynamic import of the query spelling as one problem in the importer', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/q.ts': "export const q = import('./ui?v=1').then((m) => m.cx('flex'))\n",
      },
      { options: { cxModules: ['./src/ui/index.ts'] } },
    )

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/q.ts:')
    expect(built.error).not.toContain('src/ui/index.ts:')
  }, 60_000)
})

describe('AC-used-atoms-47 - a namespace import of a declared module read for its other exports', () => {
  const BUTTON_BARREL = `${BARREL}export const Button = 'b'\n`
  const NS = "import * as U from './ui'\n"
  const options = { cxModules: ['./src/ui/index.ts'] }

  const reads: [string, string, string[]][] = [
    ['a member', `${NS}export const h = U.Button\n`, []],
    ['a member beside a call', `${NS}export const i = [U.cx('flex'), U.Button]\n`, ['flex']],
    ['a string key', `${NS}export const j = U['Button']\n`, []],
    ['a destructuring', `${NS}const { Button } = U\nexport const k = Button\n`, []],
  ]

  it.each(reads)(
    '%s is no use of cx, built alone and green',
    async (_name, text, expected) => {
      const built = await build({ 'src/ui/index.ts': BUTTON_BARREL, 'src/h.ts': text }, { options })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms(...expected))
    },
    60_000,
  )

  it('reads a package’s namespace for its component and its cx', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/App.tsx':
          "import * as UI from '@acme/ui'\nexport const A = () => [UI.Button, UI.cx('grid')]\n",
      }),
    )
    addPackage(app, '@acme/ui', { 'index.js': BUTTON_BARREL })
    try {
      const built = await buildUsed(app, { options: { cxModules: ['@acme/ui'] } })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  const refused: [string, string][] = [
    ['passed', `${NS}export const l = f(U)\n`],
    ['spread', `${NS}export const m = ({ ...U })\n`],
    ['read by a computed key', `${NS}export const n = (k: string) => U[k]\n`],
    ['destructured by cx', `${NS}const { cx: c } = U\nexport const o = c\n`],
    [
      'destructured with a rest element',
      `${NS}const { Button, ...rest } = U\nexport const p = [Button, rest]\n`,
    ],
  ]

  it.each(refused)(
    '%s is one problem in the importer, built alone',
    async (_name, text) => {
      const built = await build({ 'src/ui/index.ts': BUTTON_BARREL, 'src/h.ts': text }, { options })

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('src/h.ts:')
      expect(built.error).not.toContain('src/ui/index.ts:')
    },
    60_000,
  )
})

describe('AC-used-atoms-47 — in every environment of one build', () => {
  it('recognises the importers of each environment, so a server render’s calls are read too', async () => {
    const app = makeUsedApp(
      appFiles({
        ...UI_FILES,
        'src/entry-server.ts': "import { cx } from './ui'\nexport const s = cx('inlineFlex')\n",
      }),
    )
    try {
      const built = await buildEnvironments(app, {
        options: { cxModules: UI_MODULES },
        order: ['ssr', 'client'],
        config: { resolve: { alias: { '@': path.join(app.root, 'src') } } },
      })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.client.css)).toEqual(atoms('inlineFlex', ...UI_ATOM_NAMES))
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-48 — what a declared module may not do, and the hidden second hop', () => {
  const rows: [string, string, number][] = [
    ['another name', "export { cx as x } from '@navecss/core/cx'\n", 1],
    ['a default', `${IMPORT}export default cx\n`, 1],
    ['a namespace', "export * as n from '@navecss/core/cx'\n", 1],
    ['not Nave’s', "export const cx = (...a) => a.join(' ')\n", 1],
    [
      'a wrapper',
      "import { cx as n } from '@navecss/core/cx'\nexport const cx = (...a) => n(...a)\n",
      2,
    ],
    ['a second hop', "export { cx } from './ui/index.ts'\n", 1],
  ]

  it.each(rows)(
    '%s alone fails in the declared module',
    async (_name, text, count) => {
      const built = await build(
        { 'src/ui/index.ts': BARREL, 'src/bad.ts': text },
        { options: { cxModules: ['./src/ui/index.ts', './src/bad.ts'] } },
      )

      expect(built.error).toMatch(new RegExp(`^${count} problems? in 1 file`))
      expect(built.error).toContain('src/bad.ts:')
      expect(built.error).not.toContain('src/ui/index.ts:')
      expect(built.warnings).toEqual([])
    },
    60_000,
  )

  it('control: each row replaced by the plain re-export builds green', async () => {
    const built = await build(
      { 'src/ui/index.ts': BARREL, 'src/bad.ts': BARREL },
      { options: { cxModules: ['./src/ui/index.ts', './src/bad.ts'] } },
    )

    expect(built.error).toBeUndefined()
  }, 60_000)

  it('fails a re-export of a declared module in an undeclared one, and a dynamic import of it', async () => {
    const hop = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/hop.ts': "export * from './ui/index.ts'\n",
        'src/use.ts': "import { cx } from './hop.ts'\nexport const u = cx('flex')\n",
      },
      { options: { cxModules: ['./src/ui/index.ts'] } },
    )
    const dynamic = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/dyn.ts': "export const d = import('./ui/index.ts').then((m) => m.cx('flex'))\n",
      },
      { options: { cxModules: ['./src/ui/index.ts'] } },
    )

    expect(hop.error).toMatch(/^1 problem in 1 file/)
    expect(hop.error).toContain('src/hop.ts:')
    expect(dynamic.error).toMatch(/^1 problem in 1 file/)
    expect(dynamic.error).toContain('src/dyn.ts:')
    expect(dynamic.error).toContain('a dynamic import of cx')
    expect(hop.warnings).toEqual([])
    expect(dynamic.warnings).toEqual([])
  }, 120_000)

  it('control: an undeclared module importing the declared one and calling cx builds green', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/hop.ts': "import { cx } from './ui/index.ts'\nexport const h = cx('flex')\n",
      },
      { options: { cxModules: ['./src/ui/index.ts'] } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)

  it('words the declared-module problem and its remedy for the reader', async () => {
    const built = await build(
      { 'src/ui/index.ts': BARREL, 'src/bad.ts': "export const cx = (...a) => a.join(' ')\n" },
      { options: { cxModules: ['./src/ui/index.ts', './src/bad.ts'] } },
    )

    expect(built.error).toContain(
      "listed in cxModules, but this export can give it a cx the build does not follow: the build follows a listed module one step, to Nave's cx re-exported from @navecss/core/cx under the name cx.",
    )
    expect(built.error).toContain(
      "In a module listed in cxModules, make export { cx } from '@navecss/core/cx' its only export of cx, or remove the module from cxModules and import cx from @navecss/core/cx where it is called.",
    )
  }, 60_000)
})

describe('AC-used-atoms-48 - a star never lets a cx that is not Nave’s through unreported', () => {
  const options = { cxModules: ['./src/ui/index.ts'] }
  const user = "import { cx } from './ui'\nexport const a = cx('flex')\n"
  const rows: [string, string, Record<string, string>, string][] = [
    [
      'a star from a module that exports its own cx',
      "export * from './helpers'\n",
      {
        'src/ui/helpers.ts': "export const cx = (...a: string[]) => a.filter(Boolean).join(' ')\n",
      },
      '1 problem in 1 file',
    ],
    [
      'a star re-exported as cx',
      "export * as cx from './other'\n",
      { 'src/ui/other.ts': "export const Button = 'b'\n" },
      '1 problem in 1 file',
    ],
    [
      'a star from a module that is itself a Nave barrel',
      "export * from './inner'\n",
      { 'src/ui/inner.ts': BARREL },
      '2 problems in 2 files',
    ],
    [
      'a star from a module with no cx',
      "export * from './parts'\n",
      { 'src/ui/parts.ts': "export const Button = 'b'\n" },
      '1 problem in 1 file',
    ],
  ]

  it.each(rows)(
    '%s alone is a problem at the star, none in the importer',
    async (_name, barrel, others, count) => {
      const built = await build(
        { 'src/ui/index.ts': barrel, 'src/a.ts': user, ...others },
        { options },
      )

      expect(built.error).toMatch(new RegExp(`^${count}`))
      expect(built.error).toMatch(/src\/ui\/index\.ts:1:1: /)
      expect(built.error).not.toContain('src/a.ts:')
      expect(built.warnings).toEqual([])
    },
    60_000,
  )

  it('prints one message for the three export * from rows, and it offers the explicit re-export', async () => {
    const messages: string[] = []
    const stars = rows.filter((row) => row[1].startsWith('export * from'))
    for (const [, barrel, others] of stars) {
      const built = await build(
        { 'src/ui/index.ts': barrel, 'src/a.ts': user, ...others },
        { options },
      )
      messages.push(
        built.error!.split('\n').find((line) => line.startsWith('src/ui/index.ts:1:1: '))!,
      )
    }

    expect(new Set(messages).size).toBe(1)
    expect(messages[0]).toContain('this export can give it a cx the build does not follow')
  }, 120_000)

  it('control: an explicit re-export beside a star is no problem, and the importer’s call is read', async () => {
    const built = await build(
      {
        'src/ui/index.ts': `${BARREL}export * from './parts'\n`,
        'src/ui/parts.ts': "export const Button = 'b'\n",
        'src/a.ts': user,
      },
      { options },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)
})

describe('AC-used-atoms-49 - a specifier the text test reads is recognised in a build', () => {
  const options = { cxModules: ['./src/ui/index.ts'] }

  it('reads an importer whose specifier ends in a slash', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/pages/X.ts': "import { cx } from '../ui/'\nexport const x = cx('flex')\n",
      },
      { options },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)

  it('reads an untransformed module whatever apostrophe its text holds before the import', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/q.js':
          "const s = \"it's\"; import { cx } from './ui'\nexport const q = [s, cx('flex')]\n",
        'src/r.js': "/* it's */ import { cx } from './ui'\nexport const r = cx('grid')\n",
      },
      { options },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
  }, 60_000)
})

describe('AC-used-atoms-50 — the build-end check finds an importer the text test missed', () => {
  const PAGES = ['src/pages/Orders.tsx', 'src/pages/Users.tsx']
  const files = (
    second = "import { cx } from '#ds'\nexport const u = cx('grid')\n",
  ): Record<string, string> => ({
    'src/ui/index.ts': BARREL,
    'src/pages/Orders.tsx': "import { cx } from '#ds'\nexport const o = cx('grid')\n",
    'src/pages/Users.tsx': second,
  })

  /**
   * Builds with `#ds` an alias of the barrel, `parsedBy` collecting the modules the post-order
   * half parsed.
   */
  async function buildAliased(
    modules: Record<string, string>,
    cxModules: string[],
    parsed: string[] = [],
    imports = PAGES,
  ): Promise<Built> {
    const app = makeUsedApp(appFiles(modules, imports))
    const [nave, collect] = navePlugin({ cxModules })
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with the host's `this`
    const original = collect.transform
    collect.transform = function transform(this: never, code: string, id: string, meta?: never) {
      const host = this as { parse(code: string, options?: unknown): unknown }
      const watched = new Proxy(host, {
        get(target, key) {
          if (key !== 'parse') return Reflect.get(target, key, target) as unknown
          return (text: string, options?: unknown) => {
            parsed.push(id)
            return target.parse(text, options)
          }
        },
      })
      return original.call(watched as never, code, id, meta)
    }
    try {
      return await buildUsed(app, {
        nave: [nave, collect],
        config: { resolve: { alias: { '#ds': path.join(app.root, 'src/ui/index.ts') } } },
      })
    } finally {
      app.dispose()
    }
  }

  it('fails once, apart from the report, naming each importer and the specifier', async () => {
    const parsed: string[] = []
    const built = await buildAliased(files(), ['./src/ui/index.ts'], parsed)

    expect(built.error).toBe(
      [
        '2 files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read those files for cx() calls.',
        "src/pages/Orders.tsx: imports './src/ui/index.ts' as '#ds'.",
        "src/pages/Users.tsx: imports './src/ui/index.ts' as '#ds'.",
        "Add the specifier, as written, to cxModules in navePlugin(): cxModules: ['./src/ui/index.ts', '#ds'].",
      ].join('\n'),
    )
    // The control: the check, not the prefilter, found them.
    expect(parsed.filter((id) => id.includes('/pages/'))).toEqual([])
    expect(parsed.some((id) => id.endsWith('/src/ui/index.ts'))).toBe(true)
  }, 60_000)

  it('is green once the specifier is declared, and the layer holds grid', async () => {
    const built = await buildAliased(files(), ['./src/ui/index.ts', '#ds'])

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  }, 60_000)

  it('clears the error when its printed array is pasted', async () => {
    const { first, list, pasted } = await pasteAndRebuild(
      (cxModules) => buildAliased(files(), [...cxModules]),
      ['./src/ui/index.ts'],
    )

    expect(first.error).toContain('2 files import a module listed in cxModules')
    expect(list).toEqual(['./src/ui/index.ts', '#ds'])
    expect(pasted?.error).toBeUndefined()
    expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('grid'))
  }, 120_000)

  it('fails a dynamic importer of a declared specifier as an R2(d) problem on it', async () => {
    const built = await buildAliased(
      files("export const u = import('#ds').then((m) => m.cx('grid'))\n"),
      ['./src/ui/index.ts', '#ds'],
    )

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/pages/Users.tsx:')
  }, 60_000)

  it('prints the report and this error in one failure, the report first, neither folded into the other', async () => {
    const built = await buildAliased(
      { ...files(), 'src/pages/Bad.tsx': `${IMPORT}export const b = (v: string) => cx(v)\n` },
      ['./src/ui/index.ts'],
      [],
      [...PAGES, 'src/pages/Bad.tsx'],
    )
    const report = built.error!.indexOf('1 problem in 1 file')
    const check = built.error!.indexOf('2 files import a module listed in cxModules')

    expect(report).toBe(0)
    expect(check).toBeGreaterThan(report)
    expect(built.error!.slice(report, check)).not.toContain('cxModules')
  }, 60_000)

  describe('a relative importer the text test misses', () => {
    // A directory whose manifest names the barrel as its entry: Vite resolves `../shell` to the
    // barrel, and no name in the specifier is the barrel's.
    const SHELL = { 'src/shell/package.json': '{ "main": "../ui/index.ts" }\n' }
    const reports = (specifier: string): Record<string, string> => ({
      ...SHELL,
      'src/ui/index.ts': BARREL,
      'src/pages/Reports.tsx': `import { cx } from '${specifier}'\nexport const r = cx('flex')\n`,
    })
    const FIRST =
      '1 file imports a module listed in cxModules through a specifier the build does not recognise, so the build did not read that file for cx() calls.'
    const RELATIVE_REMEDY =
      'Adding a relative specifier to cxModules would not clear this: a relative entry is read from the project root. Instead of the rewrite its line gives, the file can import the module through an alias for it, added to cxModules.'

    it('is told a spelling to write and no entry to add', async () => {
      const built = await buildAliased(
        reports('../shell'),
        ['./src/ui/index.ts'],
        [],
        ['src/pages/Reports.tsx'],
      )

      expect(built.error).toBe(
        [
          FIRST,
          "src/pages/Reports.tsx: imports './src/ui/index.ts' as '../shell'. Write '../ui/index' in its place.",
          RELATIVE_REMEDY,
        ].join('\n'),
      )
      expect(built.error).not.toMatch(/cxModules: \[/)
    }, 60_000)

    it('builds green once the importer writes the spelling the line gives', async () => {
      const built = await buildAliased(
        reports('../ui/index'),
        ['./src/ui/index.ts'],
        [],
        ['src/pages/Reports.tsx'],
      )

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    }, 60_000)

    it('beside an alias importer, prints the array holding the alias only, and pasting it with the rewrite is green', async () => {
      const mixed = (specifier: string): Record<string, string> => ({
        ...reports(specifier),
        'src/pages/Orders.tsx': "import { cx } from '#ds'\nexport const o = cx('grid')\n",
      })
      const imports = ['src/pages/Orders.tsx', 'src/pages/Reports.tsx']
      const first = await buildAliased(mixed('../shell'), ['./src/ui/index.ts'], [], imports)

      expect(first.error).toBe(
        [
          '2 files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read those files for cx() calls.',
          "src/pages/Orders.tsx: imports './src/ui/index.ts' as '#ds'.",
          "src/pages/Reports.tsx: imports './src/ui/index.ts' as '../shell'. Write '../ui/index' in its place.",
          RELATIVE_REMEDY,
          "Add the specifier, as written, to cxModules in navePlugin(): cxModules: ['./src/ui/index.ts', '#ds'].",
        ].join('\n'),
      )
      const pasted = await buildAliased(
        mixed('../ui/index'),
        printedList(first.error)!,
        [],
        imports,
      )

      expect(pasted.error).toBeUndefined()
      expect(atomLayerAtoms(pasted.css)).toEqual(atoms('flex', 'grid'))
    }, 120_000)

    it('an importer inside a dependency gets the same line, naming a file the reader cannot change', async () => {
      const app = makeUsedApp(appFiles({ 'src/uses.ts': "import '@acme/ui'\n" }))
      addPackage(app, '@acme/ui', {
        'index.js': `${BARREL}import './dist/button.js'\n`,
        'dist/button.js': "import { cx } from '../shell'\nexport const B = cx('flex')\n",
        'shell/package.json': '{ "main": "../index.js" }\n',
      })
      try {
        const built = await buildUsed(app, { options: { cxModules: ['@acme/ui'] } })

        expect(built.error).toContain('node_modules/@acme/ui/dist/button.js: imports')
        expect(built.error).toContain("'../shell'")
      } finally {
        app.dispose()
      }
    }, 60_000)
  })

  it('in dev gives no error, and the importers’ atoms are served only once the specifier is declared', async () => {
    const run = async (cxModules: string[]): Promise<string[]> => {
      const app = makeUsedApp(appFiles(files(), PAGES))
      const server = await startDev(
        devConfig(app.root, [navePlugin({ cxModules })], {
          '#ds': path.join(app.root, 'src/ui/index.ts'),
        }),
      )
      try {
        await server.transformIndexHtml(
          '/index.html',
          readFileSync(path.join(app.root, 'index.html'), 'utf8'),
        )
        const served = await devCss(server, '/src/main.ts')
        const css = Object.entries(served).find(([url]) => url.startsWith('/src/app.css'))?.[1]
        return atomLayerAtoms(css ?? '')
      } finally {
        await stopDev(server)
        app.dispose()
      }
    }

    expect(await run(['./src/ui/index.ts'])).toEqual([])
    expect(await run(['./src/ui/index.ts', '#ds'])).toEqual(atoms('grid'))
  }, 60_000)
})

describe('AC-used-atoms-51 — cxModules entries resolve from Vite’s root and a typo surfaces on the barrel', () => {
  const files = { 'src/ui/index.ts': BARREL, 'src/a.ts': UI_FILES['src/a.ts']! }

  it('(a) an entry that resolves to nothing is no error and no message', async () => {
    const built = await build(files, {
      options: { cxModules: ['./src/ui/index.ts', './src/missing.ts'] },
    })

    expect(built.error).toBeUndefined()
    expect(built.warnings).toEqual([])
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)

  it('(b) a typo fails on the undeclared barrel, whose first remedy prints the whole list with that barrel, and pasting it builds green', async () => {
    const { first, list, pasted } = await pasteAndRebuild(
      (cxModules) => build(files, { options: { cxModules } }),
      ['./src/ui/indx.ts'],
    )
    const lines = first.error!.split('\n')

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('src/ui/index.ts:')
    // The first line after the problem lines is the cxModules remedy, the typo kept as written.
    expect(lines[2]).toBe(
      "To keep a module that re-exports cx, list it in navePlugin() by its path from the project root: cxModules: ['./src/ui/indx.ts', './src/ui/index.ts']. Files that import cx from it are then read as if they imported it from @navecss/core/cx. Or import cx from @navecss/core/cx directly where it is called.",
    )
    expect(list).toEqual(['./src/ui/indx.ts', './src/ui/index.ts'])
    expect(pasted?.error).toBeUndefined()
    expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('flex'))
  }, 120_000)

  it('(c) the app moved to apps/web resolves a relative entry from root, whatever the working directory', async () => {
    const moved = Object.entries(appFiles(files)).map(([name, text]): [string, string] => [
      `apps/web/${name}`,
      text,
    ])
    const app = makeUsedApp({
      'package.json': '{"private":true,"type":"module"}',
      ...Object.fromEntries(moved),
    })
    try {
      const root = path.join(app.root, 'apps/web')
      const built = await buildUsed(app, {
        options: { cxModules: ['./src/ui/index.ts'] },
        config: { root, build: { write: false, outDir: path.join(root, 'dist') } },
      })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
      // The control: from the working directory the entry names no file.
      const fromCwd = path.resolve(process.cwd(), 'src/ui/index.ts')
      expect(existsSync(fromCwd)).toBe(false)
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('(d) the entry written as the barrel’s absolute path', async () => {
    const app = makeUsedApp(appFiles(files))
    try {
      const built = await buildUsed(app, {
        options: { cxModules: [path.join(app.root, 'src/ui/index.ts')] },
      })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-51 - a relative entry matches by its file only, and Nave’s own module is no entry', () => {
  const importing = (from: string, name: string, atom: string): string =>
    `import { cx } from '${from}'\nexport const ${name} = cx('${atom}')\n`

  it('reads the barrel outside src through the entry’s file and leaves a sibling ./ui alone', async () => {
    const files = {
      'ui/index.ts': BARREL,
      'src/a.ts': importing('../ui', 'a', 'flex'),
      'src/feature/ui.ts': "export const cx = (...a: string[]) => a.join(' ')\n",
      'src/feature/b.ts':
        "import { cx } from './ui'\nexport const b = (v: string) => cx('card', v)\n",
    }
    const app = makeUsedApp(appFiles(files, ['src/a.ts', 'src/feature/b.ts']))
    try {
      const built = await buildUsed(app, { options: { cxModules: ['./ui'] } })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('with the barrel inside src, an entry written as the importer writes it does nothing, and its printed array pastes green', async () => {
    const files = { 'src/ui/index.ts': BARREL, 'src/a.ts': UI_FILES['src/a.ts']! }
    const { first, list, pasted } = await pasteAndRebuild(
      (cxModules) => build(files, { options: { cxModules } }),
      ['./ui'],
    )

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('src/ui/index.ts:')
    expect(list).toEqual(['./ui', './src/ui/index.ts'])
    expect(pasted?.error).toBeUndefined()
    expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('flex'))
  }, 120_000)

  const files = {
    'src/ui/index.ts': BARREL,
    'src/a.ts': UI_FILES['src/a.ts']!,
    'src/d.ts': "import { cx } from '@navecss/core/cx'\nexport const d = cx('grid')\n",
  }

  it('ignores the entry @navecss/core/cx on its own', async () => {
    const built = await build(
      { 'src/d.ts': files['src/d.ts'] },
      { options: { cxModules: ['@navecss/core/cx'] } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('grid'))
  }, 60_000)

  it('ignores the entry @navecss/core/cx beside the barrel’s entry', async () => {
    const built = await build(files, {
      options: { cxModules: ['./src/ui/index.ts', '@navecss/core/cx'] },
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
  }, 60_000)
})

describe('AC-used-atoms-52 — a design-system package that re-exports cx, declared by its specifier', () => {
  const ui = (
    button = "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
  ): Record<string, string> => ({
    'index.js': "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n",
    'button.js': button,
  })
  const files = {
    'src/App.tsx':
      "import { cx, Button } from '@acme/ui'\nexport const A = () => [Button, cx('grid')]\n",
  }

  function installed(button?: string): ReturnType<typeof makeUsedApp> {
    const app = makeUsedApp(appFiles(files))
    addPackage(app, '@acme/ui', ui(button))
    return app
  }

  it('with the entry the build is green and the layer holds the package’s and the consumer’s atoms', async () => {
    const app = installed()
    try {
      const built = await buildUsed(app, { options: { cxModules: ['@acme/ui'] } })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('in dev the layer served holds both', async () => {
    expect(
      await servedAtoms(files, { cxModules: ['@acme/ui'] }, (app) => {
        addPackage(app, '@acme/ui', ui())
      }),
    ).toEqual(atoms('flex', 'grid'))
  }, 60_000)

  it('without the entry the build fails in the package’s index, printing the cxModules line and no keepFor line', async () => {
    const app = installed()
    try {
      const built = await buildUsed(app)

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('@acme/ui/index.js:')
      expect(built.error).toContain(
        "@acme/ui re-exports cx in '@acme/ui'. List it in navePlugin(): cxModules: ['@acme/ui'].",
      )
      expect(built.error).not.toContain('keepFor')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('the printed line, pasted, builds green', async () => {
    const { first, list, pasted } = await pasteAndRebuild(async (cxModules) => {
      const app = installed()
      try {
        return await buildUsed(app, { options: { cxModules } })
      } finally {
        app.dispose()
      }
    }, [])

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(list).toEqual(['@acme/ui'])
    expect(pasted?.error).toBeUndefined()
  }, 120_000)

  it('a re-export reached through a subpath prints that subpath, and pasting it builds green', async () => {
    const { first, list, pasted } = await pasteAndRebuild(async (cxModules) => {
      const app = makeUsedApp(
        appFiles({
          'src/App.tsx': "import { cx } from '@acme/ui/cx.js'\nexport const app = cx('grid')\n",
        }),
      )
      addPackage(app, '@acme/ui', { 'index.js': "export const Button = 'b'\n", 'cx.js': BARREL })
      try {
        return await buildUsed(app, { options: { cxModules } })
      } finally {
        app.dispose()
      }
    }, [])

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('@acme/ui/cx.js:')
    expect(first.error).toContain(
      "@acme/ui re-exports cx in '@acme/ui/cx.js'. List it in navePlugin(): cxModules: ['@acme/ui/cx.js'].",
    )
    expect(first.error).not.toContain('keepFor')
    expect(list).toEqual(['@acme/ui/cx.js'])
    expect(pasted?.error).toBeUndefined()
    expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('grid'))
  }, 120_000)

  it('a re-export reached only from inside the package prints the keepFor line, and pasting it builds green', async () => {
    const run = async (keepFor: Record<string, ['flex']> | undefined): Promise<Built> => {
      const app = makeUsedApp(
        appFiles({
          'src/App.tsx': "import { Button } from '@acme/ui'\nexport const A = () => Button\n",
        }),
      )
      addPackage(app, '@acme/ui', {
        'index.js': "export { Button } from './button.js'\n",
        'button.js': "import { cx } from './utils/cx.js'\nexport const Button = () => cx('flex')\n",
        'utils/cx.js': BARREL,
      })
      try {
        return await buildUsed(app, keepFor ? { options: { keepFor } } : {})
      } finally {
        app.dispose()
      }
    }
    const first = await run(undefined)

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('@acme/ui/utils/cx.js:')
    expect(first.error).not.toMatch(/cxModules: \[/)
    const line = first.error!.split('\n').find((text) => text.includes("keepFor: { '@acme/ui'"))
    expect(line).toBe(
      "@acme/ui re-exports cx in a file that only the package itself imports, so your code has no specifier for it to list in cxModules. List the atoms its calls can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry.",
    )
    const pasted = await run({ '@acme/ui': ['flex'] })

    expect(pasted.error).toBeUndefined()
    expect(atomLayerAtoms(pasted.css)).toEqual(atoms('flex'))
  }, 120_000)

  it('names no @acme/ui error in dev without the entry', async () => {
    const app = makeUsedApp(appFiles(files))
    addPackage(app, '@acme/ui', ui())
    const server = await startDev(devConfig(app.root, [navePlugin()]))
    try {
      await expect(devCss(server, '/src/main.ts')).resolves.toBeDefined()
    } finally {
      await stopDev(server)
      app.dispose()
    }
  }, 60_000)

  it('with the entry, an unreadable call in the package is a dependency problem with its keepFor line', async () => {
    const app = installed("import { cx } from './index.js'\nexport const Button = (v) => cx(v)\n")
    try {
      const built = await buildUsed(app, { options: { cxModules: ['@acme/ui'] } })

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
      expect(built.error).not.toContain("cxModules: ['@acme/ui']")
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-05 — the remedy for an undeclared re-export offers cxModules first', () => {
  const barrels: Record<string, string> = {
    'src/utils.js': BARREL,
    'src/utils2.js': `${IMPORT}export { cx }\n`,
    'src/utils3.js': "export * from '@navecss/core/cx'\n",
    'src/utils4.js': "export * as n from '@navecss/core/cx'\n",
  }

  it('prints one array naming every listable barrel, once, before the direct import', async () => {
    const built = await build(barrels)
    const remedies = built.error!.split('\n').filter((line) => line.includes('cxModules: ['))

    expect(remedies).toHaveLength(1)
    expect(remedies[0]).toBe(
      "To keep a module that re-exports cx, list it in navePlugin() by its path from the project root: cxModules: ['./src/utils.js', './src/utils2.js', './src/utils3.js', './src/utils4.js']. Files that import cx from it are then read as if they imported it from @navecss/core/cx. Or import cx from @navecss/core/cx directly where it is called.",
    )
  }, 60_000)

  it('with a list already present, one paste is enough and the two barrels no longer alternate', async () => {
    const files = {
      'src/ui/index.ts': BARREL,
      'src/other.ts': BARREL,
      'src/a.ts': "import { cx } from './ui'\nexport const a = cx('flex')\n",
      'src/b.ts': "import { cx } from './other'\nexport const b = cx('grid')\n",
    }
    const { first, list, pasted } = await pasteAndRebuild(
      (cxModules) => build(files, { options: { cxModules } }),
      ['./src/ui/index.ts'],
    )

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('src/other.ts:')
    expect(list).toEqual(['./src/ui/index.ts', './src/other.ts'])
    expect(pasted?.error).toBeUndefined()
    expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('flex', 'grid'))
  }, 120_000)

  it('builds the first three green once declared, and the namespace row still fails', async () => {
    const built = await build(barrels, {
      options: { cxModules: ['./src/utils.js', './src/utils2.js', './src/utils3.js'] },
    })

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/utils4.js:')
  }, 60_000)
})

describe('AC-used-atoms-43 and -55 - a dependency’s re-export gets a line that clears it', () => {
  it('prints the keepFor line once for a re-export only the package imports, and no cxModules line', async () => {
    const app = makeUsedApp(appFiles({ 'src/uses.ts': "import 'wide-lib'\n" }))
    addPackage(app, 'wide-lib', {
      'index.js': "import './a.js'\nimport './dist/cx.js'\n",
      'a.js': `${IMPORT}export const a = (v) => cx(v)\n`,
      'dist/cx.js': BARREL,
    })
    try {
      const built = await buildUsed(app)
      const lines = built.error!.split('\n')
      const keepFor = lines.findIndex((line) => line.includes("keepFor: { 'wide-lib'"))

      expect(keepFor).toBeGreaterThan(-1)
      expect(lines.filter((line) => line.includes("keepFor: { 'wide-lib'"))).toHaveLength(1)
      expect(built.error).not.toMatch(/cxModules: \[/)
      expect(lines[keepFor + 1]).toBe(
        "wide-lib also re-exports cx in a file that only the package itself imports; the keepFor entry above clears that too. The lasting fix there is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry.",
      )
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('prints the cxModules line alone for a package whose only problem is a re-export in its entry, and pasting it builds green', async () => {
    const { first, list, pasted } = await pasteAndRebuild(async (cxModules) => {
      const app = makeUsedApp(appFiles({ 'src/uses.ts': "import '@acme/ds'\n" }))
      addPackage(app, '@acme/ds', { 'index.js': BARREL })
      try {
        return await buildUsed(app, { options: { cxModules } })
      } finally {
        app.dispose()
      }
    }, [])

    expect(first.error).toContain(
      "@acme/ds re-exports cx in '@acme/ds'. List it in navePlugin(): cxModules: ['@acme/ds'].",
    )
    expect(first.error).not.toContain('keepFor')
    expect(list).toEqual(['@acme/ds'])
    expect(pasted?.error).toBeUndefined()
  }, 120_000)
})

describe('AC-used-atoms-01 — under all, cxModules is validated and does nothing else', () => {
  it('builds the same CSS with and without it', async () => {
    const files = { 'src/a.ts': 'export const a = 1\n' }
    const plain = await build(files, { options: { atomic: 'all' } })
    const listed = await build(files, {
      options: { atomic: 'all', cxModules: ['./src/ui/index.ts'] },
    })

    expect(listed.error).toBeUndefined()
    expect(listed.css).toBe(plain.css)
  }, 60_000)
})
