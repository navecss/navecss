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
      "listed in cxModules, but its cx is not Nave's cx re-exported: the build follows a listed module one step, to a cx it imports from @navecss/core/cx.",
    )
    expect(built.error).toContain(
      'Re-export cx from @navecss/core/cx in that module unchanged, or remove it from cxModules and import cx from @navecss/core/cx where it is called.',
    )
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
        '2 files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read their cx() calls.',
        "src/pages/Orders.tsx: imports './src/ui/index.ts' as '#ds'.",
        "src/pages/Users.tsx: imports './src/ui/index.ts' as '#ds'.",
        "Add each specifier, as written, to cxModules in navePlugin(): cxModules: ['./src/ui/index.ts', '#ds'].",
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

  it('(b) a typo fails on the undeclared barrel, whose remedy prints that barrel', async () => {
    const built = await build(files, { options: { cxModules: ['./src/ui/indx.ts'] } })

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/ui/index.ts:')
    expect(built.error).toContain("cxModules: ['./src/ui/index.ts']")
  }, 60_000)

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
      expect(built.error).toContain("cxModules: ['@acme/ui']")
      expect(built.error).not.toContain('keepFor')
    } finally {
      app.dispose()
    }
  }, 60_000)

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
      "To keep a module that re-exports cx, list it in navePlugin() as you import it: cxModules: ['./src/utils.js', './src/utils2.js', './src/utils3.js', './src/utils4.js']. Files that import cx from it are then read as if they imported it from @navecss/core/cx. Or import cx from @navecss/core/cx directly where it is called.",
    )
  }, 60_000)

  it('builds the first three green once declared, and the namespace row still fails', async () => {
    const built = await build(barrels, {
      options: { cxModules: ['./src/utils.js', './src/utils2.js', './src/utils3.js'] },
    })

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain('src/utils4.js:')
  }, 60_000)
})

describe('AC-used-atoms-43 and -55 — a dependency’s re-export gets the cxModules line', () => {
  it('prints the keepFor line for the calls and the cxModules line for the re-export, in that order', async () => {
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
      const modules = lines.findIndex((line) => line.includes("cxModules: ['wide-lib']"))

      expect(keepFor).toBeGreaterThan(-1)
      expect(modules).toBeGreaterThan(keepFor)
      expect(lines[modules]).toBe(
        "wide-lib re-exports cx. List the module you import cx from in navePlugin(): cxModules: ['wide-lib'].",
      )
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('prints the cxModules line alone for a package whose only problem is the re-export', async () => {
    const app = makeUsedApp(appFiles({ 'src/uses.ts': "import '@acme/ds'\n" }))
    addPackage(app, '@acme/ds', { 'index.js': BARREL })
    try {
      const built = await buildUsed(app)

      expect(built.error).toContain("cxModules: ['@acme/ds']")
      expect(built.error).not.toContain('keepFor')
    } finally {
      app.dispose()
    }
  }, 60_000)
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
