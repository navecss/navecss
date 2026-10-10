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

describe('AC-used-atoms-48 - a star from a declared module beside the module’s own Nave cx', () => {
  const options = { cxModules: ['./src/ui/index.ts'] }
  const FORMS = `${BARREL}export const Field = 'f'\n`
  const user = "import { cx, Field } from './ui'\nexport const a = [cx('flex'), Field]\n"
  const rows: [string, string][] = [
    [
      'a star of Nave’s cx beside a star of a second barrel',
      "export * from '@navecss/core/cx'\nexport * from './forms'\n",
    ],
    [
      'an explicit export of Nave’s cx beside a star of a second barrel',
      `${BARREL}export * from './forms'\n`,
    ],
  ]

  it.each(rows)(
    '%s is one problem on the second barrel, and its printed array pasted builds green',
    async (_name, barrel) => {
      const files = { 'src/ui/index.ts': barrel, 'src/ui/forms/index.ts': FORMS, 'src/a.ts': user }
      const { first, list, pasted } = await pasteAndRebuild(
        (cxModules) => build(files, { options: { cxModules } }),
        options.cxModules,
      )

      expect(first.error).toMatch(/^1 problem in 1 file/)
      expect(first.error).toContain('src/ui/forms/index.ts:')
      expect(first.error).not.toContain('src/ui/index.ts:')
      expect(list).toEqual(['./src/ui/index.ts', './src/ui/forms/index.ts'])
      expect(pasted?.error).toBeUndefined()
      expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('flex'))
    },
    120_000,
  )

  it('control: a barrel whose only export is a star of a second listed barrel is one problem at that star', async () => {
    const built = await build(
      {
        'src/ui/index.ts': "export * from './forms'\n",
        'src/ui/forms/index.ts': FORMS,
        'src/a.ts': user,
      },
      { options: { cxModules: ['./src/ui/index.ts', './src/ui/forms/index.ts'] } },
    )

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toMatch(/src\/ui\/index\.ts:1:1: /)
  }, 60_000)
})

describe('AC-used-atoms-48 - a foreign cx reaching an importer through a star is reported at the star only', () => {
  const options = { cxModules: ['./src/ui/index.ts'] }
  const HELPERS = { 'src/ui/helpers.ts': "export const cx = (...a: string[]) => a.join(' ')\n" }
  const importers: [string, string][] = [
    ['an atom the join function does not name', "export const a = [cx('btn'), cx('flex')]\n"],
    ['a name chosen at run time', 'export const a = (v: string) => cx(v)\n'],
  ]
  const barrels: [string, string][] = [
    ['a star of a module that exports its own cx', "export * from './helpers'\n"],
    ['an explicit re-export of it', "export { cx } from './helpers'\n"],
  ]

  describe.each(barrels)('%s', (_barrel, text) => {
    it.each(importers)(
      'is one problem in the barrel and none in an importer calling cx with %s',
      async (_name, body) => {
        const built = await build(
          {
            'src/ui/index.ts': text,
            ...HELPERS,
            'src/a.ts': `import { cx } from './ui'\n${body}`,
          },
          { options },
        )

        expect(built.error).toMatch(/^1 problem in 1 file/)
        expect(built.error).toMatch(/src\/ui\/index\.ts:1:1: /)
        expect(built.error).not.toContain('src/a.ts:')
        expect(built.error).not.toContain('cx.dynamic')
      },
      60_000,
    )
  })

  it('control: the same importer beside a listed module with no problem is still judged', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BARREL,
        'src/a.ts': "import { cx } from './ui'\nexport const a = cx('btn')\n",
      },
      { options },
    )

    expect(built.error).toContain('src/a.ts:')
  }, 60_000)

  it('control: a listed module whose problem leaves Nave’s cx exported does not hide a call it cannot read', async () => {
    const built = await build(
      {
        'src/ui/index.ts': `${BARREL}export { cx as cn } from '@navecss/core/cx'\n`,
        'src/a.ts': "import { cx } from './ui'\nexport const a = (v: string) => cx(v)\n",
      },
      { options },
    )

    expect(built.error).toMatch(/^2 problems in 2 files/)
    expect(built.error).toContain('src/ui/index.ts:')
    expect(built.error).toContain('src/a.ts:')
  }, 60_000)
})

describe('AC-used-atoms-47 - a directory specifier with more than one dot segment, and a namespace taken apart by assignment', () => {
  const options = { cxModules: ['./src/ui/index.ts'] }

  it.each([
    ['../..', 'src/ui/forms/inputs/text.ts'],
    ['../../', 'src/ui/forms/inputs/text.ts'],
    ['./.', 'src/ui/b.ts'],
  ])(
    'reads an importer that writes %s as the listed index file',
    async (specifier, file) => {
      const built = await build(
        {
          'src/ui/index.ts': BARREL,
          [file]: `import { cx } from '${specifier}'\nexport const t = cx('flex')\n`,
        },
        { options },
      )

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    },
    60_000,
  )

  const BUTTON_BARREL = `${BARREL}export const Button = 'b'\n`
  const NS = "import * as U from './ui'\n"
  const reads: [string, string][] = [
    ['an assignment', `${NS}let B\n;({ Button: B } = U)\nexport const k = B\n`],
    ['a parameter default', `${NS}export const a = ({ Button } = U) => Button\n`],
  ]

  it.each(reads)(
    'destructuring a namespace by %s is no use of cx',
    async (_name, text) => {
      const built = await build({ 'src/ui/index.ts': BUTTON_BARREL, 'src/h.ts': text }, { options })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual([])
    },
    60_000,
  )

  it('control: an assignment that names cx is still one problem in the importer', async () => {
    const built = await build(
      {
        'src/ui/index.ts': BUTTON_BARREL,
        'src/h.ts': `${NS}let c\n;({ cx: c } = U)\nexport const o = c\n`,
      },
      { options },
    )

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/h.ts:')
  }, 60_000)

  it.each([
    [
      'its value kept in a constant',
      `${NS}let B\nconst r = ({ Button: B } = U)\nexport const h = [B, U.cx('flex'), r.cx('grid')]\n`,
    ],
    [
      'its value returned from a function',
      `${NS}let B\nconst pick = () => ({ Button: B } = U)\nexport const h = [B, U.cx('flex'), pick().cx('grid')]\n`,
    ],
  ])(
    'control: an assignment whose value is used is one problem in the importer, %s',
    async (_name, text) => {
      const built = await build({ 'src/ui/index.ts': BUTTON_BARREL, 'src/h.ts': text }, { options })

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('src/h.ts:')
      expect(built.error).toContain('U is used other than as U.cx.')
    },
    60_000,
  )
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
        config: {
          resolve: {
            alias: {
              '#ds': path.join(app.root, 'src/ui/index.ts'),
              '#kit': path.join(app.root, 'src/ui/index.ts'),
            },
          },
        },
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
        '2 files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read the cx() calls made through those specifiers.',
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
      '1 file imports a module listed in cxModules through a specifier the build does not recognise, so the build did not read the cx() calls made through it.'
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
          '2 files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read the cx() calls made through those specifiers.',
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

    describe('an importer that also holds a spelling the build reads', () => {
      const BOTH = "import { cx } from './ui'\n"
      const shell = (second: string, isAlone = false): Record<string, string> => ({
        ...SHELL,
        'src/ui/index.ts': BARREL,
        'src/a.ts': `${isAlone ? '' : BOTH}import { cx as k } from '${second}'\nexport const a = [${isAlone ? '' : "cx('flex'), "}k('grid')]\n`,
      })
      const only = ['src/a.ts']
      const run = (modules: Record<string, string>, cxModules: readonly string[]): Promise<Built> =>
        buildAliased(modules, [...cxModules], [], only)

      it('names the second spelling and its replacement, and rewritten as printed builds green with both atoms', async () => {
        const first = await run(shell('./shell'), ['./src/ui/index.ts'])

        expect(first.error).toBe(
          [
            FIRST,
            "src/a.ts: imports './src/ui/index.ts' as './shell'. Write './ui/index' in its place.",
            RELATIVE_REMEDY,
          ].join('\n'),
        )
        const fixed = await run(shell('./ui/index'), ['./src/ui/index.ts'])

        expect(fixed.error).toBeUndefined()
        expect(atomLayerAtoms(fixed.css)).toEqual(atoms('flex', 'grid'))
      }, 120_000)

      it('prints an array that adds an alias spelling (R5b), and pasting it builds green with both atoms', async () => {
        const { first, list, pasted } = await pasteAndRebuild(
          (cxModules) => run(shell('#kit'), cxModules),
          ['./src/ui/index.ts'],
        )

        expect(first.error).toContain("src/a.ts: imports './src/ui/index.ts' as '#kit'.")
        expect(list).toEqual(['./src/ui/index.ts', '#kit'])
        expect(pasted?.error).toBeUndefined()
        expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('flex', 'grid'))
      }, 120_000)

      it('control: the alias spelling alone fails the same way, and pasting its array builds green', async () => {
        const { first, list, pasted } = await pasteAndRebuild(
          (cxModules) => run(shell('#kit', true), cxModules),
          ['./src/ui/index.ts'],
        )

        expect(first.error!.split('\n', 1)[0]).toBe(FIRST)
        expect(first.error).toContain("src/a.ts: imports './src/ui/index.ts' as '#kit'.")
        expect(list).toEqual(['./src/ui/index.ts', '#kit'])
        expect(pasted?.error).toBeUndefined()
        expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('grid'))
      }, 120_000)
    })

    describe('the spelling the line gives lands on the listed file', () => {
      const file = (name: string, code: string): Record<string, string> => ({ [name]: code })
      const use = "import { cx } from '../shell'\nexport const r = cx('flex')\n"

      it('prints the extension when a sibling with an earlier extension would be taken instead', async () => {
        const modules = {
          ...SHELL,
          'src/ui/index.ts': BARREL,
          'src/ui/index.js': "export const cx = (...a) => a.filter(Boolean).join(' ')\n",
          ...file('src/pages/R.ts', use),
        }
        const first = await buildAliased(modules, ['./src/ui/index.ts'], [], ['src/pages/R.ts'])

        expect(first.error).toContain(
          "src/pages/R.ts: imports './src/ui/index.ts' as '../shell'. Write '../ui/index.ts' in its place.",
        )
        const fixed = await buildAliased(
          { ...modules, ...file('src/pages/R.ts', use.replace('../shell', '../ui/index.ts')) },
          ['./src/ui/index.ts'],
          [],
          ['src/pages/R.ts'],
        )

        expect(fixed.error).toBeUndefined()
        expect(atomLayerAtoms(fixed.css)).toEqual(atoms('flex'))
      }, 120_000)

      describe('the TypeScript condition beside a replacement that ends in a TypeScript extension', () => {
        const CONDITION =
          'Where a rewrite ends in .ts, .tsx, .mts or .cts, TypeScript accepts it only if your tsconfig sets allowImportingTsExtensions or rewriteRelativeImportExtensions; if it sets neither, use the alias the line above describes instead.'
        const reportsOf = (...names: string[]): Record<string, string> =>
          Object.fromEntries(
            names.map((name) => [
              `src/pages/${name}.tsx`,
              `import { cx } from '../shell'\nexport const r = cx('flex')\n`,
            ]),
          )
        const beside = (
          extension: string,
          pages: Record<string, string>,
        ): Record<string, string> => ({
          'src/shell/package.json': `{ "main": "../ui/index.${extension}" }\n`,
          [`src/ui/index.${extension}`]: BARREL,
          'src/ui/index.js': "export const cx = (...a) => a.filter(Boolean).join(' ')\n",
          ...pages,
        })

        it.each(['ts', 'tsx', 'mts', 'cts'])(
          'prints the condition once, last, for a replacement ending .%s, and rewritten as printed the build is green',
          async (extension) => {
            const modules = beside(extension, reportsOf('Reports'))
            const entry = `./src/ui/index.${extension}`
            const first = await buildAliased(modules, [entry], [], ['src/pages/Reports.tsx'])

            expect(first.error).toBe(
              [
                FIRST,
                `src/pages/Reports.tsx: imports '${entry}' as '../shell'. Write '../ui/index.${extension}' in its place.`,
                RELATIVE_REMEDY,
                CONDITION,
              ].join('\n'),
            )
            expect(first.error).toContain('allowImportingTsExtensions')
            expect(first.error).not.toMatch(/\b(?:turn|enable)\b/)
            const fixed = await buildAliased(
              {
                ...modules,
                'src/pages/Reports.tsx': `import { cx } from '../ui/index.${extension}'\nexport const r = cx('flex')\n`,
              },
              [entry],
              [],
              ['src/pages/Reports.tsx'],
            )

            expect(fixed.error).toBeUndefined()
            expect(atomLayerAtoms(fixed.css)).toEqual(atoms('flex'))
          },
          120_000,
        )

        it('prints it once for the error however many replacements end in one', async () => {
          const modules = beside('ts', reportsOf('Reports', 'Orders'))
          const first = await buildAliased(
            modules,
            ['./src/ui/index.ts'],
            [],
            ['src/pages/Orders.tsx', 'src/pages/Reports.tsx'],
          )

          expect(first.error!.match(/Write '\.\.\/ui\/index\.ts' in its place/g)).toHaveLength(2)
          expect(first.error!.match(/allowImportingTsExtensions/g)).toHaveLength(1)
          expect(first.error!.split('\n').at(-1)).toBe(CONDITION)
        }, 60_000)

        it('prints none for a declared .jsx file, which needs no TypeScript setting', async () => {
          const modules = beside('jsx', reportsOf('Reports'))
          const first = await buildAliased(
            modules,
            ['./src/ui/index.jsx'],
            [],
            ['src/pages/Reports.tsx'],
          )

          expect(first.error).toContain("Write '../ui/index.jsx' in its place.")
          expect(first.error).not.toContain('allowImportingTsExtensions')
        }, 60_000)
      })

      it('keeps the short spelling when it lands on the file: the same directory, another name, an .mts file', async () => {
        const rows: [string, Record<string, string>, string, string][] = [
          [
            'the same directory',
            { 'src/ui/index.ts': BARREL, ...file('src/ui/x.ts', use) },
            'src/ui/x.ts',
            './index',
          ],
          [
            'a file not named index',
            { 'src/kit/barrel.ts': BARREL, ...file('src/pages/R.ts', use) },
            'src/pages/R.ts',
            '../kit/barrel',
          ],
          [
            'an .mts file',
            { 'src/ui/index.mts': BARREL, ...file('src/pages/R.ts', use) },
            'src/pages/R.ts',
            '../ui/index',
          ],
        ]
        for (const [, modules, importer, spelling] of rows) {
          const listed = Object.keys(modules).find(
            (name) => name.startsWith('src/') && !name.includes(importer),
          )!
          const first = await buildAliased(
            {
              ...SHELL,
              'src/shell/package.json': `{ "main": "../${listed.slice(4)}" }\n`,
              ...modules,
            },
            [`./${listed}`],
            [],
            [importer],
          )

          expect(first.error).toContain(`Write '${spelling}' in its place.`)
        }
      }, 120_000)

      it('does not offer a relative specifier with a query as an entry to add', async () => {
        const modules = {
          'src/ui/index.ts': BARREL,
          'src/ui/x.ts': "import { cx } from '.?v=1'\nexport const x = cx('flex')\n",
        }
        const first = await buildAliased(modules, ['./src/ui/index.ts'], [], ['src/ui/x.ts'])

        expect(first.error).toBe(
          [
            FIRST,
            "src/ui/x.ts: imports './src/ui/index.ts' as '.?v=1'. Write './index' in its place.",
            RELATIVE_REMEDY,
          ].join('\n'),
        )
        expect(first.error).not.toMatch(/cxModules: \[/)
      }, 60_000)
    })

    describe('an importer inside a dependency', () => {
      const TWO =
        '2 files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read the cx() calls made through those specifiers.'
      const DEPENDENCY_LINE =
        "node_modules/@acme/ui/dist/button.js: imports '@acme/ui' as '../shell'. The file is in @acme/ui, a dependency, so it is not yours to change."
      const APP_LINE =
        "src/pages/Reports.tsx: imports './src/ui/index.ts' as '../shell'. Write '../ui/index' in its place."
      const PACKAGE_LINE =
        "For @acme/ui, list the atoms its calls can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. Once the package is listed, its files no longer fail the build here, and the atoms you list stand in for the calls the build did not read. The lasting fix is the package's: import the module by a specifier ending in the listed file's name."
      const ALSO_LINE =
        "@acme/ui also imports a module listed in cxModules in a file the build did not read; the keepFor entry above clears that too. The lasting fix there is the package's: import the module by a specifier ending in the listed file's name."
      const KEEP = { '@acme/ui': ['flex'] } as const
      const button = (specifier = '../shell'): Record<string, string> => ({
        'index.js': `${BARREL}import './dist/button.js'\n`,
        'dist/button.js': `import { cx } from '${specifier}'\nexport const B = cx('flex')\n`,
        'shell/package.json': '{ "main": "../index.js" }\n',
      })
      const run = async (
        pkg: Record<string, string>,
        settings: Parameters<typeof buildUsed>[1] & { app?: Record<string, string> } = {},
      ): Promise<Built> => {
        const { app: appModules = {}, ...rest } = settings
        const app = makeUsedApp(appFiles({ 'src/uses.ts': "import '@acme/ui'\n", ...appModules }))
        addPackage(app, '@acme/ui', pkg)
        try {
          return await buildUsed(app, rest)
        } finally {
          app.dispose()
        }
      }
      const withApp = {
        app: {
          ...SHELL,
          'src/ui/index.ts': BARREL,
          'src/pages/Reports.tsx': "import { cx } from '../shell'\nexport const r = cx('grid')\n",
        },
      }
      const options = { cxModules: ['@acme/ui', './src/ui/index.ts'] }

      it('prints one line for the file, not its to change, and the package’s keepFor line last', async () => {
        const built = await run(button(), { options: { cxModules: ['@acme/ui'] } })

        expect(built.error).toBe([FIRST, DEPENDENCY_LINE, PACKAGE_LINE].join('\n'))
      }, 60_000)

      it.each([
        ['../shell', '#k'],
        ['#k', '../shell'],
      ])(
        'names the specifiers of one file in the order it writes them: %s, then %s',
        async (first, second) => {
          const pkg = {
            ...button(),
            'package.json':
              '{ "name": "@acme/ui", "version": "1.0.0", "type": "module", "main": "./index.js", "imports": { "#k": "./index.js" } }\n',
            'dist/button.js': `import { cx } from '${first}'\nimport { cx as k } from '${second}'\nexport const B = [cx('flex'), k('flex')]\n`,
          }
          const built = await run(pkg, { options: { cxModules: ['@acme/ui'] } })

          expect(built.error).toContain(
            `node_modules/@acme/ui/dist/button.js: imports '@acme/ui' as '${first}', '${second}'. The file is in @acme/ui`,
          )
        },
        60_000,
      )

      it('is green once the package is listed in keepFor, shipping its atom', async () => {
        const built = await run(button(), {
          options: { cxModules: ['@acme/ui'], keepFor: KEEP },
        })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
      }, 60_000)

      it('is green once the package imports the module by its own name, with no keepFor, shipping the call it read', async () => {
        const built = await run(button('../index'), { options: { cxModules: ['@acme/ui'] } })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
      }, 60_000)

      it('lists the application’s lines first, its rewrite remedy counted by its own lines, the package line last', async () => {
        const built = await run(button(), { ...withApp, options })

        expect(built.error).toBe(
          [TWO, APP_LINE, DEPENDENCY_LINE, RELATIVE_REMEDY, PACKAGE_LINE].join('\n'),
        )
      }, 60_000)

      it('leaves only the application’s line once the package is listed in keepFor', async () => {
        const built = await run(button(), { ...withApp, options: { ...options, keepFor: KEEP } })

        expect(built.error).toBe([FIRST, APP_LINE, RELATIVE_REMEDY].join('\n'))
      }, 60_000)

      it('says the keepFor entry the report printed clears this too, so the failure holds one such line', async () => {
        const pkg = {
          ...button(),
          'index.js': `${BARREL}import './dist/button.js'\nimport './dist/menu.js'\n`,
          'dist/menu.js': `${IMPORT}export const M = (v) => cx(v)\n`,
        }
        const built = await run(pkg, { options: { cxModules: ['@acme/ui'] } })
        const lines = built.error!.split('\n')

        expect(lines.filter((line) => line.includes("keepFor: { '@acme/ui'"))).toHaveLength(1)
        expect(lines.at(-1)).toBe(ALSO_LINE)
        expect(built.error!.indexOf("keepFor: { '@acme/ui'")).toBeLessThan(
          built.error!.indexOf(FIRST),
        )
        const listed = await run(pkg, { options: { cxModules: ['@acme/ui'], keepFor: KEEP } })

        expect(listed.error).toBeUndefined()
        expect(atomLayerAtoms(listed.css)).toEqual(atoms('flex'))
      }, 120_000)
    })

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

describe('AC-used-atoms-51 - a # entry binds by file, never by its text alone', () => {
  const JOIN = "export const cx = (...a: string[]) => a.join(' ')\n"
  const files = (scope: Record<string, string>): Record<string, string> => ({
    ...scope,
    'src/ui/index.ts': BARREL,
    'src/feature/package.json': '{ "imports": { "#ds": "./join.ts" } }\n',
    'src/feature/join.ts': JOIN,
    'src/feature/b.ts': "import { cx } from '#ds'\nexport const b = (v: string) => cx('card', v)\n",
    'src/a.ts': "import { cx } from '#ds'\nexport const a = cx('flex')\n",
  })
  const options = { cxModules: ['./src/ui/index.ts', '#ds'] }
  const imports = ['src/a.ts', 'src/feature/b.ts']
  const rows: [string, Record<string, string>][] = [
    [
      'a nested scope maps #ds to the barrel',
      { 'src/package.json': '{ "imports": { "#ds": "./ui/index.ts" } }\n' },
    ],
    [
      'the root scope maps #ds to the barrel',
      {
        'package.json':
          '{ "private": true, "type": "module", "imports": { "#ds": "./src/ui/index.ts" } }\n',
      },
    ],
  ]

  it.each(rows)(
    'where %s, another scope’s own #ds is no cx, and the barrel’s importer is read',
    async (_name, scope) => {
      const app = makeUsedApp(appFiles(files(scope), imports))
      try {
        const built = await buildUsed(app, { options })

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it('control: a # import reachable only from src prints an array that adds it, and pasting it builds green', async () => {
    const modules = {
      'src/package.json': '{ "imports": { "#ds": "./ui/index.ts" } }\n',
      'src/ui/index.ts': BARREL,
      'src/a.ts': "import { cx } from '#ds'\nexport const a = cx('grid')\n",
    }
    const { first, list, pasted } = await pasteAndRebuild(
      (cxModules) => build(modules, { options: { cxModules } }),
      ['./src/ui/index.ts'],
    )

    expect(first.error).toContain("src/a.ts: imports './src/ui/index.ts' as '#ds'.")
    expect(list).toEqual(['./src/ui/index.ts', '#ds'])
    expect(pasted?.error).toBeUndefined()
    expect(atomLayerAtoms(pasted!.css)).toEqual(atoms('grid'))
  }, 120_000)
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
      "@acme/ui re-exports cx in a file that only the package itself imports, so your code has no specifier for it to list in cxModules, and the build does not read calls made through that cx. Where your code imports cx from @acme/ui or one of its subpaths, import it from @navecss/core/cx instead. For the package's own calls, list the atoms they can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry.",
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

describe('AC-used-atoms-52 - a re-export in a file only the package imports, told to the reader whose code calls the package’s cx', () => {
  const INTERNAL =
    "@acme/ui re-exports cx in a file that only the package itself imports, so your code has no specifier for it to list in cxModules, and the build does not read calls made through that cx. Where your code imports cx from @acme/ui or one of its subpaths, import it from @navecss/core/cx instead. For the package's own calls, list the atoms they can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry."
  const pkg = (extra: Record<string, string> = {}): Record<string, string> => ({
    'index.js': "export { cx } from './cx.js'\nexport const Button = 'b'\n",
    'cx.js': BARREL,
    'helpers.js': "export { cx } from './cx.js'\n",
    ...extra,
  })
  const run = async (
    code: string,
    modules: Record<string, string> = pkg(),
    options: NonNullable<Parameters<typeof navePlugin>[0]> = {},
  ): Promise<Built> => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': code }))
    addPackage(app, '@acme/ui', modules)
    try {
      return await buildUsed(app, { options })
    } finally {
      app.dispose()
    }
  }

  it.each([
    ['the package', "import { cx } from '@acme/ui'\nexport const a = cx('grid')\n"],
    [
      'a subpath that re-exports the file',
      "import { cx } from '@acme/ui/helpers.js'\nexport const a = cx('grid')\n",
    ],
    [
      'neither: the application imports only a component',
      "import { Button } from '@acme/ui'\nexport const a = Button\n",
    ],
  ])(
    'prints the one line, with the reader’s own act before keepFor, for an application importing from %s',
    async (_name, code) => {
      const built = await run(code)

      expect(built.error!.split('\n')).toContain(INTERNAL)
    },
    60_000,
  )

  it('control: an application that takes cx from @navecss/core/cx and listed keepFor ships both its own call and the listed atom', async () => {
    const built = await run(
      "import { cx } from '@navecss/core/cx'\nimport { Button } from '@acme/ui'\nexport const a = [Button, cx('grid')]\n",
      pkg(),
      { keepFor: { '@acme/ui': ['flex'] } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
  }, 60_000)
})

describe('AC-used-atoms-52 - a listed dependency module that exports a cx the build does not follow', () => {
  const CALLS = '@acme/ui is a dependency, so its code is not yours to change.'
  const INTERNAL_FULL =
    "@acme/ui re-exports cx in a file that only the package itself imports, so your code has no specifier for it to list in cxModules, and the build does not read calls made through that cx. Where your code imports cx from @acme/ui or one of its subpaths, import it from @navecss/core/cx instead. For the package's own calls, list the atoms they can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry."
  const LASTING =
    "The lasting fix is the package's: make export { cx } from '@navecss/core/cx' the only export of cx in"
  const HOP = {
    'index.js': "export { cx } from './cx.js'\nexport const Button = 'b'\n",
    'cx.js': BARREL,
  }
  const OWN = {
    'index.js':
      "export const cx = (...a) => a.filter(Boolean).join(' ')\nexport const Button = 'b'\n",
  }
  const WRAP = {
    'index.js':
      "import { cx as n } from '@navecss/core/cx'\nexport const cx = (...a) => n(...a)\nexport const Button = 'b'\n",
  }
  const OWNER = "import { cx, Button } from '@acme/ui'\nexport const a = [Button, cx('grid')]\n"
  const NAVE =
    "import { cx } from '@navecss/core/cx'\nimport { Button } from '@acme/ui'\nexport const a = [Button, cx('grid')]\n"
  const run = async (
    code: string,
    modules: Record<string, string>,
    options: NonNullable<Parameters<typeof navePlugin>[0]>,
  ): Promise<Built> => {
    const app = makeUsedApp(appFiles({ 'src/App.ts': code }))
    addPackage(app, '@acme/ui', modules)
    try {
      return await buildUsed(app, { options })
    } finally {
      app.dispose()
    }
  }
  const remedies = (built: Built): string[] =>
    built.error!.split('\n').filter((line) => line.startsWith('@acme/ui'))

  it('a second hop: one line telling the reader to remove the entry, then the internal-file line in full', async () => {
    const built = await run(OWNER, HOP, { cxModules: ['@acme/ui'] })

    expect(remedies(built)).toEqual([
      `@acme/ui exports a cx the build does not follow from '@acme/ui', which is listed in cxModules. Remove it from cxModules in navePlugin(). ${LASTING} the module you list.`,
      INTERNAL_FULL,
    ])
    expect(built.error).not.toContain(CALLS)
    const followed = await run(NAVE, HOP, { keepFor: { '@acme/ui': ['flex'] } })

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('flex', 'grid'))
  }, 120_000)

  it('its own function: the line adds that the reader imports cx from Nave, and following it builds green', async () => {
    const built = await run(OWNER, OWN, { cxModules: ['@acme/ui'] })

    expect(remedies(built)).toEqual([
      `@acme/ui exports a cx the build does not follow from '@acme/ui', which is listed in cxModules. Remove it from cxModules in navePlugin(), and where your code imports cx from it, import cx from @navecss/core/cx instead. ${LASTING} the module you list.`,
    ])
    const followed = await run(NAVE, OWN, {})

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('grid'))
  }, 120_000)

  it('a wrapper: the declared line first, then the calls line for the wrapper’s own call', async () => {
    const built = await run(OWNER, WRAP, { cxModules: ['@acme/ui'] })
    const lines = remedies(built)

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("@acme/ui exports a cx the build does not follow from '@acme/ui'")
    expect(lines[1]).toContain(CALLS)
    const followed = await run(NAVE, WRAP, { keepFor: { '@acme/ui': ['flex'] } })

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('flex', 'grid'))
  }, 120_000)

  it('two entries naming modules of one package: the plural line names both', async () => {
    const built = await run(OWNER, HOP, { cxModules: ['@acme/ui', '@acme/ui/index.js'] })

    expect(remedies(built)[0]).toBe(
      `@acme/ui exports a cx the build does not follow from '@acme/ui', '@acme/ui/index.js', which are listed in cxModules. Remove them from cxModules in navePlugin(). ${LASTING} each module you list.`,
    )
  }, 60_000)

  it('every cxModules array in the failure leaves out the entry the line says to remove, and the paste builds green', async () => {
    const modules = {
      ...HOP,
      'index.js': "export { cx } from './cx.js'\nexport const Button = 'b'\nimport './menu.js'\n",
      'menu.js': `${IMPORT}export const M = (v) => cx(v)\n`,
      'public-cx.js': BARREL,
    }
    const code =
      "import { cx as k } from '@acme/ui/public-cx.js'\nimport { Button } from '@acme/ui'\nexport const a = [Button, k('block')]\n"
    const first = await run(code, modules, { cxModules: ['@acme/ui'] })
    const list = printedList(first.error)

    expect(first.error).toContain("cxModules: ['@acme/ui/public-cx.js']")
    expect(list).toEqual(['@acme/ui/public-cx.js'])
    const pasted = await run(
      "import { cx as k } from '@acme/ui/public-cx.js'\nimport { cx } from '@navecss/core/cx'\nimport { Button } from '@acme/ui'\nexport const a = [Button, k('block'), cx('grid')]\n",
      modules,
      { cxModules: list!, keepFor: { '@acme/ui': ['flex'] } },
    )

    expect(pasted.error).toBeUndefined()
    expect(atomLayerAtoms(pasted.css)).toEqual(atoms('block', 'flex', 'grid'))
  }, 120_000)
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
        "wide-lib also re-exports cx in a file that only the package itself imports; the keepFor entry above clears that too. The build does not read calls made through that cx: where your code imports cx from wide-lib or one of its subpaths, import it from @navecss/core/cx instead. The lasting fix there is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry.",
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
