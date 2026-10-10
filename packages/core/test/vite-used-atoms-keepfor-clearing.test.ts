/**
 * AC-used-atoms-52 covers: R17, R19, as amended for `keepFor` (a real `vite build` of a scratch
 * app and a dependency): `keepFor` stands in for a package's own calls and never clears a problem
 * the consumer's own `cxModules` can, each printed remedy is followed and the app rebuilt, and an
 * empty `keepFor` list says the calls the build cannot read produce no atom.
 */
import { describe, expect, it } from 'vitest'

import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  type BuildOptions,
  buildUsed,
  type Built,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const BARREL = "export { cx } from '@navecss/core/cx'\n"
const KEEP_FLEX = { '@acme/ui': ['flex'] } as const

/**
 * Builds an app of `code` (`src/App.ts`) over the package `@acme/ui` made of `modules`.
 */
async function run(
  code: string,
  modules: Record<string, string>,
  options: BuildOptions['options'] = {},
): Promise<Built> {
  const app = makeUsedApp(appFiles({ 'src/App.ts': code }))
  addPackage(app, '@acme/ui', modules)
  try {
    return await buildUsed(app, { options })
  } finally {
    app.dispose()
  }
}

/**
 * The `cxModules` array a failure prints, as the list a reader would paste.
 */
function printedList(error: string | undefined): string[] {
  const array = /cxModules: (\[[^\]]*\])/.exec(error ?? '')?.[1] ?? '[]'
  return array
    .matchAll(/'([^']*)'/g)
    .map((entry) => entry[1]!)
    .toArray()
}

/**
 * A package whose entry exports `Menu`, and whose `Menu` module imports `file`, holding `text`.
 */
function withMenu(file: string, text: string): Record<string, string> {
  return {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `import './${file}'\nexport const Menu = 'm'\n`,
    [file]: text,
  }
}

const NAVE_APP =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"

describe('AC-used-atoms-52 - keepFor never clears a problem the consumer’s own cxModules can clear', () => {
  const MENU = {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `${IMPORT}export const Menu = (v) => cx('flex', v)\n`,
    'public-cx.js': BARREL,
  }
  const SUBPATH_APP =
    "import { cx as k } from '@acme/ui/public-cx.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, k('block')]\n"

  it('case 1: a re-export the app imports through a subpath fails beside keepFor, and the printed array, pasted, ships flex and block', async () => {
    const first = await run(SUBPATH_APP, MENU, { keepFor: KEEP_FLEX })

    expect(first.error).toBeDefined()
    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('@acme/ui/public-cx.js:')
    expect(first.error).toContain(
      "@acme/ui re-exports cx in '@acme/ui/public-cx.js'. List it in navePlugin(): cxModules: ['@acme/ui/public-cx.js'].",
    )
    const pasted = await run(SUBPATH_APP, MENU, {
      keepFor: KEEP_FLEX,
      cxModules: printedList(first.error),
    })

    expect(pasted.error).toBeUndefined()
    expect(atomLayerAtoms(pasted.css)).toEqual(atoms('flex', 'block'))
  }, 120_000)

  describe('case 2: the package’s entry re-exports cx and the app takes it from the package', () => {
    const entry = {
      'index.js': "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n",
      'button.js': "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
    }
    const app =
      "import { cx, Button } from '@acme/ui'\nexport const A = () => [Button, cx('grid')]\n"

    it('prints the cxModules line beside keepFor, and the array, pasted, ships flex and grid', async () => {
      const first = await run(app, entry, { keepFor: KEEP_FLEX })

      expect(first.error).toBeDefined()
      expect(first.error).toMatch(/^1 problem in 1 file/)
      expect(first.error).toContain("cxModules: ['@acme/ui']")
      const pasted = await run(app, entry, {
        keepFor: KEEP_FLEX,
        cxModules: printedList(first.error),
      })

      expect(pasted.error).toBeUndefined()
      expect(atomLayerAtoms(pasted.css)).toEqual(atoms('flex', 'grid'))
    }, 120_000)
  })

  describe('case 3: the entry names a module that exports the package’s own join function', () => {
    const own = {
      'index.js':
        "export const cx = (...a) => a.filter(Boolean).join(' ')\nexport const Button = 'b'\n",
    }
    const owner = "import { cx, Button } from '@acme/ui'\nexport const a = [Button, cx('grid')]\n"

    it('fails with the line that says to remove the entry, and builds green once it is removed', async () => {
      const first = await run(owner, own, { cxModules: ['@acme/ui'], keepFor: KEEP_FLEX })

      expect(first.error).toBeDefined()
      expect(first.error).toMatch(/^1 problem in 1 file/)
      expect(first.error).toContain(
        "@acme/ui exports a cx the build does not follow from '@acme/ui', which is listed in cxModules. Remove it from cxModules in navePlugin()",
      )
      const followed = await run(owner, own, { keepFor: KEEP_FLEX })

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('flex'))
    }, 120_000)
  })

  describe('case 4: a re-export of cx under another name', () => {
    const RENAMED =
      "@acme/ui re-exports cx other than under the name cx (renamed, as a default or inside a namespace), which the build does not follow even from a module listed in cxModules. Listing a module that does fails the build, so no entry there clears an export of cx from it, under the name cx or another, and the build does not read calls made through that export. Where your code imports that export from @acme/ui or one of its subpaths, import cx from @navecss/core/cx instead and call cx in its place. For the package's own calls, list the atoms they can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, and re-export it only under the name cx."
    // The same line for two re-exports in one file, which the line counts as exports.
    const RENAMED_TWO =
      "@acme/ui re-exports cx other than under the name cx (renamed, as a default or inside a namespace), which the build does not follow even from a module listed in cxModules. Listing a module that does fails the build, so no entry there clears an export of cx from it, under the name cx or another, and the build does not read calls made through those exports. Where your code imports those exports from @acme/ui or one of its subpaths, import cx from @navecss/core/cx instead and call cx in their place. For the package's own calls, list the atoms they can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, and re-export it only under the name cx."
    const ALSO =
      "@acme/ui also re-exports cx other than under the name cx (renamed, as a default or inside a namespace), and no cxModules entry clears an export of cx from a module that does, under the name cx or another; the keepFor entry above clears that export too. The build does not read calls made through it: where your code imports it from @acme/ui or one of its subpaths, import cx from @navecss/core/cx instead and call cx in its place. The lasting fix there is the package's: import cx from @navecss/core/cx where it is called, and re-export it only under the name cx."
    // The same line when the file holds a plain re-export and a renamed one, which it counts as two.
    const ALSO_TWO =
      "@acme/ui also re-exports cx other than under the name cx (renamed, as a default or inside a namespace), and no cxModules entry clears an export of cx from a module that does, under the name cx or another; the keepFor entry above clears those exports too. The build does not read calls made through them: where your code imports them from @acme/ui or one of its subpaths, import cx from @navecss/core/cx instead and call cx in their place. The lasting fix there is the package's: import cx from @navecss/core/cx where it is called, and re-export it only under the name cx."
    const CALLS =
      "@acme/ui is a dependency, so its code is not yours to change. List the atoms its calls can produce, from its documentation, under its name in navePlugin(): keepFor: { '@acme/ui': ['<atom>'] }. The lasting fix is the package's: names chosen at run time go through cx.dynamic()."
    const CN_APP =
      "import { cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n"
    const forms = [
      {
        name: 'renamed at the export',
        file: 'cn.js',
        text: "export { cx as cn } from '@navecss/core/cx'\n",
        app: CN_APP,
        count: 1,
      },
      {
        name: 'a local export under another name',
        file: 'cn.js',
        text: `${IMPORT}export { cx as cn }\n`,
        app: CN_APP,
        count: 1,
      },
      {
        name: 'a default export',
        file: 'def.js',
        text: `${IMPORT}export default cx\n`,
        app: "import k from '@acme/ui/def.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, k('block')]\n",
        count: 1,
      },
      {
        name: 'a namespace',
        file: 'ns.js',
        text: "export * as n from '@navecss/core/cx'\n",
        app: "import { n } from '@acme/ui/ns.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, n.cx('block')]\n",
        count: 1,
      },
      {
        name: 'the plain re-export and a renamed one in one file',
        file: 'cn.js',
        text: "export { cx } from '@navecss/core/cx'\nexport { cx as cn } from '@navecss/core/cx'\n",
        app: "import { cx, cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('block'), cx('grid')]\n",
        count: 2,
      },
    ]

    it.each(forms)(
      'for $name prints the package’s keepFor line and no cxModules line, and following it builds green',
      async ({ file, text, app, count }) => {
        const modules = withMenu(file, text)
        const first = await run(app, modules)

        expect(first.error).toMatch(new RegExp(`^${count} problems? in 1 file`))
        expect(first.error).toContain(`node_modules/@acme/ui/${file}:`)
        expect(first.error).not.toMatch(/cxModules: \[/)
        expect(first.error!.split('\n')).toContain(count === 1 ? RENAMED : RENAMED_TWO)
        expect(first.error).not.toContain('only the package itself imports')
        const followed = await run(NAVE_APP, modules, { keepFor: KEEP_FLEX })

        expect(followed.error).toBeUndefined()
        expect(atomLayerAtoms(followed.css)).toEqual(atoms('flex', 'block'))
      },
      120_000,
    )

    it('beside a package that also makes an unreadable call, the line is the shorter one that points at the keepFor entry above', async () => {
      const modules = {
        ...withMenu('cn.js', "export { cx as cn } from '@navecss/core/cx'\n"),
        'bar.js': `${IMPORT}export const bar = (v) => cx('grid', v)\n`,
        'index.js': "export { Menu } from './menu.js'\nexport { bar } from './bar.js'\n",
      }
      const first = await run(NAVE_APP, modules)
      const lines = first.error!.split('\n')

      expect(first.error).toMatch(/^2 problems in 2 files/)
      expect(lines.slice(lines.indexOf(CALLS))).toEqual([CALLS, ALSO])
      expect(first.error).not.toMatch(/cxModules: \[/)
    }, 60_000)

    it('beside a package that also makes an unreadable call, a file with a plain and a renamed re-export gets the plural line', async () => {
      const modules = {
        ...withMenu(
          'cn.js',
          "export { cx } from '@navecss/core/cx'\nexport { cx as cn } from '@navecss/core/cx'\n",
        ),
        'bar.js': `${IMPORT}export const bar = (v) => cx('grid', v)\n`,
        'index.js': "export { Menu } from './menu.js'\nexport { bar } from './bar.js'\n",
      }
      const first = await run(NAVE_APP, modules)
      const lines = first.error!.split('\n')

      expect(first.error).toMatch(/^3 problems in 2 files/)
      expect(lines.at(-1)).toBe(ALSO_TWO)
    }, 60_000)

    it('beside a re-export only the package imports, the renamed line comes last and points at the keepFor entry above', async () => {
      const modules = {
        'index.js': "export { Menu } from './menu.js'\n",
        'menu.js': "import './utils/cx.js'\nimport './cn.js'\nexport const Menu = 'm'\n",
        'utils/cx.js': BARREL,
        'cn.js': "export { cx as cn } from '@navecss/core/cx'\n",
      }
      const first = await run(NAVE_APP, modules)
      const lines = first.error!.split('\n')

      expect(first.error).toMatch(/^2 problems in 2 files/)
      expect(lines.at(-2)).toContain(
        '@acme/ui re-exports cx in a file that only the package itself imports, so your code has no specifier for it to list in cxModules',
      )
      expect(lines.at(-1)).toBe(ALSO)
    }, 60_000)

    it('control: listing the renamed module, as the old line said, only turns the problem into the one that says to remove the entry', async () => {
      const modules = withMenu('cn.js', "export { cx as cn } from '@navecss/core/cx'\n")
      const built = await run(CN_APP, modules, { cxModules: ['@acme/ui/cn.js'] })

      expect(built.error).toContain(
        "@acme/ui exports a cx the build does not follow from '@acme/ui/cn.js', which is listed in cxModules. Remove it from cxModules in navePlugin()",
      )
    }, 60_000)

    it('is cleared by keepFor when the package is already listed: nothing a cxModules entry could clear', async () => {
      const modules = withMenu('cn.js', "export { cx as cn } from '@navecss/core/cx'\n")
      const built = await run(NAVE_APP, modules, { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'block'))
    }, 60_000)

    it('does not print an entry for the package’s own entry re-exporting cx under another name', async () => {
      const modules = {
        'index.js': "export { cx as cn } from '@navecss/core/cx'\nexport const Button = 'b'\n",
      }
      const first = await run(
        "import { cn, Button } from '@acme/ui'\nexport const A = [Button, cn('block')]\n",
        modules,
      )

      expect(first.error).toMatch(/^1 problem in 1 file/)
      expect(first.error).not.toMatch(/cxModules: \[/)
      expect(first.error!.split('\n')).toContain(RENAMED)
    }, 60_000)
  })
})

describe('AC-used-atoms-52 - an empty keepFor list says the calls the build cannot read produce no atom', () => {
  const quiet = {
    'index.js': "export { Button } from './button.js'\n",
    'button.js': "import './utils/cx.js'\nexport const Button = 'b'\n",
    'utils/cx.js': BARREL,
  }
  const app = "import { Button } from '@acme/ui'\nexport const A = Button\n"

  it('fails with the keepFor line when the package is not listed, and is green with an empty list', async () => {
    const first = await run(app, quiet)

    expect(first.error).toMatch(/^1 problem in 1 file/)
    expect(first.error).toContain('node_modules/@acme/ui/utils/cx.js:')
    expect(first.error).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
    expect(first.error).not.toContain('[]')
    const listed = await run(app, quiet, { keepFor: { '@acme/ui': [] } })

    expect(listed.error).toBeUndefined()
    expect((listed.warnings ?? []).filter((message) => message.includes('nave'))).toEqual([])
    expect(atomLayerAtoms(listed.css)).toEqual([])
  }, 120_000)

  it('ships the atoms of the calls the build does read, as it does with no list', async () => {
    const reading = {
      'index.js': "export { Menu } from './menu.js'\n",
      'menu.js': `${IMPORT}import './utils/cx.js'\nexport const Menu = [cx('grid'), cx('flex')]\n`,
      'utils/cx.js': BARREL,
    }
    const code = "import { Menu } from '@acme/ui'\nexport const A = Menu\n"
    const first = await run(code, reading)

    expect(first.error).toMatch(/^1 problem in 1 file/)
    const listed = await run(code, reading, { keepFor: { '@acme/ui': [] } })

    expect(listed.error).toBeUndefined()
    expect(atomLayerAtoms(listed.css)).toEqual(atoms('flex', 'grid'))
  }, 120_000)

  it('is green under both values of atomic', async () => {
    for (const atomic of ['used', 'all'] as const) {
      const built = await run(app, quiet, { atomic, keepFor: { '@acme/ui': [] } })

      expect(built.error).toBeUndefined()
    }
  }, 120_000)

  it('does not clear a re-export that has a clearing specifier', async () => {
    const entry = { 'index.js': `${BARREL}export const Button = 'b'\n` }
    const code = "import { cx } from '@acme/ui'\nexport const a = cx('grid')\n"
    const built = await run(code, entry, { keepFor: { '@acme/ui': [] } })

    expect(built.error).toContain("cxModules: ['@acme/ui']")
  }, 60_000)
})
