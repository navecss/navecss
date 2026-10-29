/**
 * AC-used-atoms-52 covers: R17, as amended for `keepFor` and the exports of `cx` the application
 * takes, for a dependency that only re-exports such an export (in the package or in another one,
 * any number of hops), a namespace held in a variable, a specifier that resolves only from the
 * importer, a name the module exports itself in place of a star-exported one, the cost of the
 * walk, and the routes a take can be on (a real `vite build` of a scratch app and dependencies).
 */
import { realpathSync } from 'node:fs'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { RenderContext } from '../src/vite-types.ts'

import { holdersOf } from '../src/vite-listed-holders.ts'
import { atomLayerAtoms, atoms } from './helpers/used-atoms-app.ts'
import {
  forwardLine,
  KEEP_FLEX,
  NAVE_APP,
  PASSED_ON,
  run,
  runScenario,
  runWithConfig,
  takenLine,
  WHOLE,
} from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const CN = "export { cx as cn } from '@navecss/core/cx'\n"
const PLAIN = "export { cx } from '@navecss/core/cx'\n"
const DEFAULT = `${IMPORT}export default cx\n`
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const MENU_ENTRY = "export { Menu } from './menu.js'\n"
const W4_LINE =
  "@acme/ui re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in src/App.ts (cn). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this. The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out."
const H1_LINE =
  "@acme/ui re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in packages/ws/index.js (cx). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this."
const Z1F_LINE =
  "@acme/ui re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in src/App.ts (cn). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place; where a file re-exports what it takes, import cx from @navecss/core/cx in the files that call it, call cx there in its place, and drop the re-export. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this. The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out."

/**
 * The package `@acme/ui`: an entry that exports `Menu` and then `extra`, with `files` beside it.
 */
function acme(extra: string, files: Record<string, string>): Record<string, string> {
  return { 'index.js': `${MENU_ENTRY}${extra}`, 'menu.js': MENU_JS, ...files }
}

/**
 * The app that calls `cn` of `from` and `Menu` of `@acme/ui`.
 */
function appOf(from: string): string {
  return `import { Menu } from '@acme/ui'\nimport { cn } from '${from}'\nexport const A = [Menu, cn('block')]\n`
}

describe('AC-used-atoms-52 - a dependency that only re-exports a cx export is part of the route', () => {
  const OTHER = { 'index.js': "export { cn } from '@acme/ui/f.js'\n" }
  const base = { '@acme/ui': acme('', { 'f.js': CN }), '@other/ui': OTHER }

  it.each([
    ['the forwarding package is not listed', KEEP_FLEX],
    ['the forwarding package is listed with no atom', { ...KEEP_FLEX, '@other/ui': [] }],
  ] as const)(
    'fails with the line that names the application file when %s, and builds green once cx comes from Nave',
    async (_, keepFor) => {
      const first = await run(appOf('@other/ui'), base, { keepFor })

      expect(first.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
      expect(first.error).not.toMatch(/cxModules: \[/)
      const followed = await run(NAVE_APP, base, { keepFor })

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
    },
  )

  it('prints the line word for word', async () => {
    const built = await run(appOf('@other/ui'), base, { keepFor: KEEP_FLEX })

    expect(built.error!.split('\n').at(-1)).toBe(W4_LINE)
  })

  it('counts a dependency that calls and forwards on both sides', async () => {
    const both = {
      '@acme/ui': acme('', { 'f.js': CN }),
      '@other/ui': {
        'index.js':
          "import { cn } from '@acme/ui/f.js'\nexport const Pill = cn('grid')\nexport { cn }\n",
      },
    }
    const keepFor = { '@acme/ui': ['flex', 'grid'] } as const
    const code =
      "import { Menu } from '@acme/ui'\nimport { Pill, cn } from '@other/ui'\nexport const A = [Menu, Pill, cn('block')]\n"
    const first = await run(code, both, { keepFor })

    expect(first.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
    const followed = await run(
      "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nimport { Pill } from '@other/ui'\nexport const A = [Menu, Pill, cx('block')]\n",
      both,
      { keepFor },
    )

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex', 'grid'))
  })

  it('follows two forwarding hops across packages', async () => {
    const hops = { ...base, '@third/ui': { 'index.js': "export * from '@other/ui'\n" } }
    const first = await run(appOf('@third/ui'), hops, { keepFor: KEEP_FLEX })

    expect(first.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
    const followed = await run(NAVE_APP, hops, { keepFor: KEEP_FLEX })

    expect(followed.error).toBeUndefined()
    expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
  })

  it('is green when the application takes only Menu, though another package forwards a cx export', async () => {
    const built = await run("import { Menu } from '@acme/ui'\nexport const A = Menu\n", base, {
      keepFor: KEEP_FLEX,
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it('leaves a dependency that calls through what it takes to the package that is listed', async () => {
    const kit = {
      'index.js': "import { cn } from '@acme/ui/f.js'\nexport const kit = cn('block')\n",
    }
    const built = await run(
      "import { kit } from '@other/ui'\nexport const A = kit\n",
      { '@acme/ui': acme('', { 'f.js': CN }), '@other/ui': kit },
      { keepFor: { '@acme/ui': ['block'] } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('block'))
  })

  it('ends the walk at a dependency that wraps what it takes', async () => {
    const wrapped = {
      'index.js': "import { cn } from '@acme/ui/f.js'\nexport const wrapped = (...a) => cn(...a)\n",
    }
    const built = await run(
      "import { Menu } from '@acme/ui'\nimport { wrapped } from '@other/ui'\nexport const A = [Menu, wrapped('block')]\n",
      { '@acme/ui': acme('', { 'f.js': CN }), '@other/ui': wrapped },
      { keepFor: { '@acme/ui': ['flex', 'block'] } },
    )

    expect(built.error).toBeUndefined()
  })
})

/**
 * An application module that holds the awaited module in `ns` and then runs `use`.
 */
function lazy(use: string): string {
  return `export const A = async () => { const ns = await import('@acme/ui'); ${use} }\n`
}

describe('AC-used-atoms-52 - a namespace held in a variable', () => {
  const packages = { '@acme/ui': acme(CN, {}) }

  it('takes nothing when every use is a member read of another export', async () => {
    const built = await run(lazy('return ns.Menu'), packages, { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it('takes the module whole when the variable that holds it is exported', async () => {
    const built = await run("export const ns = await import('@acme/ui')\n", packages, {
      keepFor: KEEP_FLEX,
    })

    expect(built.error!.split('\n')).toContain(
      takenLine('src/App.ts (import())', 'in that file', WHOLE),
    )
  })

  it('takes the cx export it reads, and the module whole for any other use', async () => {
    const read = await run(lazy("return [ns.Menu, ns.cn('block')]"), packages, {
      keepFor: KEEP_FLEX,
    })

    expect(read.error!.split('\n')).toContain(
      takenLine('src/App.ts (import() reading cn)', 'in that file', WHOLE),
    )
    const passed = await run(lazy('return [ns.Menu, Object.keys(ns)]'), packages, {
      keepFor: KEEP_FLEX,
    })

    expect(passed.error!.split('\n')).toContain(
      takenLine('src/App.ts (import())', 'in that file', WHOLE),
    )
  })
})

describe('AC-used-atoms-52 - a specifier that resolves only from the importer', () => {
  const WORKSPACE = {
    'packages/ws/package.json': JSON.stringify({
      name: 'ws',
      version: '1.0.0',
      type: 'module',
      imports: { '#cx': '@acme/ui/f.js' },
    }),
    'packages/ws/index.js': "import { cx } from '#cx'\nexport const w = cx('block')\n",
  }
  const code =
    "import { Menu } from '@acme/ui'\nimport { w } from '../packages/ws/index.js'\nexport const A = [Menu, w]\n"
  const packages = { '@acme/ui': acme('', { 'f.js': PLAIN }) }
  const scenario = { app: WORKSPACE, code, imports: ['src/App.ts'], packages }

  it('prints a line that claims nothing about what no entry could clear', async () => {
    const built = await runScenario({ ...scenario, options: { keepFor: KEEP_FLEX } })

    expect(built.error!.split('\n').at(-1)).toBe(H1_LINE)
    expect(built.error).not.toContain('No cxModules entry clears')
  })

  it('is green once the entries the build asks for are listed', async () => {
    const built = await runScenario({
      ...scenario,
      options: {
        keepFor: KEEP_FLEX,
        cxModules: ['./node_modules/@acme/ui/f.js', '#cx'],
      },
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex'))
  })
})

describe('AC-used-atoms-52 - a name the module exports itself in place of a star-exported one', () => {
  const app = "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n"
  const local = [
    [
      'a local export',
      acme("export * from './f.js'\nexport const cn = (x) => x\n", { 'f.js': CN }),
    ],
    [
      'a destructured export',
      acme("export * from './f.js'\nexport const { cn } = { cn: (x) => x }\n", { 'f.js': CN }),
    ],
    [
      'a function',
      acme("export * from './f.js'\nexport function cn(x) { return x }\n", { 'f.js': CN }),
    ],
    [
      'an explicit re-export of another module',
      acme("export * from './f.js'\nexport { cn } from './g.js'\n", {
        'f.js': CN,
        'g.js': 'export const cn = (x) => x\n',
      }),
    ],
  ] as const

  it.each(local)('is not a cx export when %s wins over the star', async (_, files) => {
    const built = await run(app, { '@acme/ui': files }, { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it('is not a cx export when a namespace export of the same name wins over the star', async () => {
    const files = acme("export * from './f.js'\nexport * as cn from './g.js'\n", {
      'f.js': CN,
      'g.js': 'export const x = 1\n',
    })
    const built = await run(
      "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn.x]\n",
      { '@acme/ui': files },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it('is a cx export of neither star when two stars export a name with different bindings', async () => {
    const files = acme("export * from './f.js'\nexport * from './g.js'\n", {
      'f.js': CN,
      'g.js': 'export const cn = (x) => x\n',
    })
    const built = await run(
      "export * from '@acme/ui'\n",
      { '@acme/ui': files },
      { keepFor: KEEP_FLEX },
      { 'src/B.ts': "import { Menu } from './App.ts'\nexport const B = Menu\n" },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it('stays a cx export when two stars export the same binding of cx', async () => {
    const files = acme("export * from './f.js'\nexport * from './g.js'\n", {
      'f.js': CN,
      'g.js': CN,
    })
    const built = await run(
      "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      { '@acme/ui': files },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
  })

  it('is not a cx export when a name declared by an array pattern wins over the star', async () => {
    const files = acme("export * from './f.js'\nexport const [, cn] = [0, (x) => x]\n", {
      'f.js': CN,
    })
    const built = await run(
      "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      { '@acme/ui': files },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })

  it('keeps the default export of a star-exported module out of the star', async () => {
    const files = acme("export * from './f.js'\nexport default function K(x) { return x }\n", {
      'f.js': DEFAULT,
    })
    const built = await run(
      "import K, { Menu } from '@acme/ui'\nexport const A = [Menu, K('block')]\n",
      { '@acme/ui': files },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  })
})

describe('AC-used-atoms-52 - the cost of following re-exports', () => {
  it('resolves a number of specifiers that grows with the modules, not with their square', async () => {
    const count = 100
    const files: Record<string, string> = {}
    let entry = MENU_ENTRY
    for (let index = 0; index < count; index += 1) {
      files[`c${index}.js`] = `export { cx as cn${index} } from '@navecss/core/cx'\n`
      entry += `export { cn${index} } from './c${index}.js'\n`
    }
    let resolved = 0
    const counter = {
      name: 'count-resolutions',
      enforce: 'pre' as const,
      resolveId() {
        resolved += 1
        // eslint-disable-next-line unicorn/no-null -- `null` is what a resolveId hook returns to pass on
        return null
      },
    }
    const built = await runScenario({
      app: {},
      code: "import { Menu, cn0 } from '@acme/ui'\nexport const A = [Menu, cn0('block')]\n",
      options: { keepFor: KEEP_FLEX },
      packages: { '@acme/ui': { ...files, 'index.js': entry, 'menu.js': MENU_JS } },
      plugins: [counter],
    })

    expect(built.error!.split('\n')).toContain(takenLine('src/App.ts (cn0)'))
    expect(resolved).toBeLessThanOrEqual(10 * count)
  })
})

/**
 * The Vite config that makes `@ui` an alias for the plain file of the installed `@acme/ui`.
 */
function aliasTo(root: string): Record<string, unknown> {
  return {
    resolve: { alias: { '@ui': `${realpathSync(root)}/node_modules/@acme/ui/f.js` } },
  }
}

describe('AC-used-atoms-52 - the walk ends, and the routes a take can be on', () => {
  const app = "import { Menu, cn } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n"
  const cycles = [
    [
      'a module that re-exports back from the entry',
      acme("export { cn } from './f.js'\n", { 'f.js': `${CN}export * from './index.js'\n` }),
    ],
    [
      'a cycle between modules that give out nothing themselves',
      acme("export * from './mid.js'\n", {
        'mid.js': "export * from './f.js'\nexport * from './index.js'\n",
        'f.js': CN,
      }),
    ],
    [
      'a cycle that renames the export at each step',
      acme("export { k as cn } from './b.js'\n", {
        'a.js': "export { cn as k } from './f.js'\nexport { j } from './b.js'\n",
        'b.js': "export { k } from './a.js'\nexport { cn as j } from './f.js'\n",
        'f.js': CN,
      }),
    ],
  ] as const

  it.each(cycles)('ends for %s, and fails with the line that names the file', async (_, files) => {
    const built = await run(app, { '@acme/ui': files }, { keepFor: KEEP_FLEX })

    expect(built.error!.split('\n')).toContain(takenLine('src/App.ts (cn)'))
  })

  it('visits each module of a cycle of forwards a bounded number of times', async () => {
    const DIR = '/project/node_modules/@acme/ui/'
    const code: Record<string, string> = {
      [`${DIR}a.js`]: "export * from './f.js'\nexport * from './b.js'\n",
      [`${DIR}b.js`]: "export * from './a.js'\n",
    }
    const importers: Record<string, string[]> = {
      [`${DIR}f.js`]: [`${DIR}a.js`],
      [`${DIR}a.js`]: [`${DIR}b.js`],
      [`${DIR}b.js`]: [`${DIR}a.js`],
    }
    let asked = 0
    const ctx = {
      getModuleInfo(id: string) {
        asked += 1
        if (asked > 500) throw new Error('the walk does not end')
        return { code: code[id], importers: importers[id], dynamicImporters: [] }
      },
      parse: (text: string) => parseAst(text),
      resolve: (specifier: string) => Promise.resolve({ id: `${DIR}${specifier.slice(2)}` }),
    } as unknown as RenderContext
    const holders = await holdersOf(ctx, {
      cxExports: new Map(),
      id: `${DIR}f.js`,
      names: new Set(['cn']),
      resolutions: new Map(),
    })

    expect(holders.map(({ id }) => id)).toEqual([`${DIR}f.js`, `${DIR}a.js`, `${DIR}b.js`])
    expect(asked).toBeLessThan(50)
  })

  it('keeps the cxModules line for a dependency that requires a module with a clearing specifier', async () => {
    const other = {
      'index.js': "import { x } from './impl.cjs'\nexport { x }\n",
      'impl.cjs': "const { cx } = require('@acme/ui')\nexports.x = cx('grid')\n",
    }
    const built = await run(
      "import { Menu } from '@acme/ui'\nimport { x } from '@other/x'\nexport const A = [Menu, x]\n",
      { '@acme/ui': acme(PLAIN, {}), '@other/x': other },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toContain("cxModules: ['@acme/ui']")
    expect(built.error).not.toContain('your code takes that cx')
  })

  describe('with takes on both routes', () => {
    const packages = {
      '@acme/ui': acme("export { cx } from './f.js'\n", { 'f.js': PLAIN }),
      '@other/x': {
        'index.js': "import { cx } from '@acme/ui/f.js'\nexport const x = cx('grid')\n",
      },
    }
    const code =
      "import { cx, Menu } from '@acme/ui'\nimport { x } from '@other/x'\nexport const A = [Menu, x, cx('block')]\n"

    it('prints the cxModules line first, and the other line once that one is followed', async () => {
      const first = await run(code, packages, { keepFor: KEEP_FLEX })

      expect(first.error).toContain("cxModules: ['@acme/ui/f.js']")
      expect(first.error).not.toContain('your code takes that cx')
      const pasted = await run(code, packages, {
        keepFor: KEEP_FLEX,
        cxModules: ['@acme/ui/f.js'],
      })

      expect(pasted.error!.split('\n')).toContain(
        forwardLine('@acme/ui', { listed: 'src/App.ts (cx)' }),
      )
      const followed = await run(
        "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nimport { x } from '@other/x'\nexport const A = [Menu, x, cx('block')]\n",
        packages,
        { keepFor: KEEP_FLEX, cxModules: ['@acme/ui/f.js'] },
      )

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex', 'grid'))
    })
  })

  it('prints the lasting fix when one take is of the module and another through a forward', async () => {
    const built = await run(
      "import { cx as direct } from '../node_modules/@acme/ui/f.js'\nimport { cx, Menu } from '@acme/ui'\nexport const A = [Menu, direct('grid'), cx('block')]\n",
      { '@acme/ui': acme("export { cx } from './f.js'\n", { 'f.js': PLAIN }) },
      { keepFor: { '@acme/ui': ['flex', 'grid'] } },
    )

    expect(built.error!.split('\n')).toContain(takenLine('src/App.ts (cx)'))
  })

  it('prints the cxModules line for an unlisted package behind an alias, and is green once it is listed', async () => {
    const ui = {
      'index.js': MENU_ENTRY,
      'menu.js': "import { cx } from '@navecss/core/cx'\nexport const Menu = () => cx('flex')\n",
      'f.js': PLAIN,
    }
    const code =
      "import { Menu } from '@acme/ui'\nimport { cx } from '@ui'\nexport const A = [Menu, cx('block')]\n"
    const first = await runWithConfig(aliasTo, code, { '@acme/ui': ui })

    expect(first.error!.split('\n')).toContain(
      "@acme/ui re-exports cx in '@ui'. List it in navePlugin(): cxModules: ['@ui'].",
    )
    const pasted = await runWithConfig(aliasTo, code, { '@acme/ui': ui }, { cxModules: ['@ui'] })

    expect(pasted.error).toBeUndefined()
    expect(atomLayerAtoms(pasted.css)).toEqual(atoms('block', 'flex'))
  })
})

describe('AC-used-atoms-52 - a file that only passes what it takes on', () => {
  const packages = { '@acme/ui': acme('', { 'f.js': CN }) }
  const caller = { 'src/B.ts': "import { cn } from './App.ts'\nexport const B = cn('block')\n" }

  it('is told to import cx from Nave in the files that call it', async () => {
    const built = await run(
      "import { Menu } from '@acme/ui'\nexport { cn } from '@acme/ui/f.js'\nexport const A = Menu\n",
      packages,
      { keepFor: KEEP_FLEX },
      caller,
    )

    expect(built.error!.split('\n').at(-1)).toBe(Z1F_LINE)
  })

  it('is told the same when it imports the export and then exports it unchanged', async () => {
    const built = await run(
      "import { Menu } from '@acme/ui'\nimport { cn } from '@acme/ui/f.js'\nexport { cn }\nexport const A = Menu\n",
      packages,
      { keepFor: KEEP_FLEX },
      caller,
    )

    expect(built.error!.split('\n')).toContain(
      takenLine('src/App.ts (cn)', 'in that file', PASSED_ON),
    )
  })
})
