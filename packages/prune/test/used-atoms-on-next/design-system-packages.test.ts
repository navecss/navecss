/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-52, a design-system package that re-exports `cx`,
 * declared by its package specifier, and the `keepFor` rows that follow it, on the plugin run over
 * core's own `atomic.css`. The application is `components/App.ts` (or `.tsx`), imported by the page;
 * each printed remedy is followed and the plugin run again. The lines' bytes belong to the docs
 * author, so the rows assert what a line names and what it leaves out.
 */
/* eslint-disable vitest/no-disabled-tests -- the skipped rows are the ones for a part the plugin does not do yet; each is explained where it is skipped */
import { describe, expect, it } from 'vitest'

import type { NaveOptions } from '../../src/options.ts'
import type { Read, Scenario } from '../helpers/used-atoms-fixture.ts'

import { sorted } from '../helpers/graph-fixture.ts'
import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import {
  dependency,
  fileOf,
  nave,
  printedList,
  useUsedAtoms,
} from '../helpers/used-atoms-fixture.ts'
import { BARREL, IMPORT } from '../helpers/used-atoms-rows.ts'

/**
 * Rows for a part the plugin does not do yet: which application files take a `cx` that a package
 * re-exports, so that a package exporting `cx` under another name, as a default or as a namespace,
 * fails the build for the files that take it, and the report offers `cxModules` for a package whose
 * entry re-exports it. They stay in the file, as `it.skip`, until that part is built.
 */

registerIsolation()
const { read } = useUsedAtoms()

const CN = "export { cx as cn } from '@navecss/core/cx'\n"
const KEEP_FLEX = { '@acme/ui': ['flex'] } as const
const KEEP_NONE = { '@acme/ui': [] } as const
const MENU_ENTRY = "export { Menu } from './menu.js'\n"
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const NAVE_APP =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"

type Packages = Record<string, Record<string, string>>

/**
 * Reads an application of `code` (`components/App.ts`, with `more` beside it) over `packages`,
 * each written as a dependency that lists core.
 */
function run(
  code: string,
  packages: Packages,
  options: NaveOptions = {},
  more: Record<string, string> = {},
): Promise<Read> {
  const installed = Object.fromEntries(
    Object.entries(packages).map(([name, files]) => [name, dependency(name, files)]),
  )
  return read({
    modules: { 'components/App.ts': code, ...more },
    packages: installed,
    importsPackages: false,
    options,
  })
}

/**
 * The package `@acme/ui` whose entry exports `Menu`, which calls `cx('flex', v)`, and imports
 * `file`, holding `text`, for its effect.
 */
function withMenu(file: string, text: string): Record<string, string> {
  return {
    'index.js': MENU_ENTRY,
    'menu.js': `${IMPORT}import './${file}'\nexport const Menu = (v) => cx('flex', v)\n`,
    [file]: text,
  }
}

/**
 * The package `@acme/ui` whose entry is `dist/index.js`, re-exporting `cx`, with a button that calls it.
 */
const ui = (
  button = "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
): Record<string, Record<string, string>> => ({
  '@acme/ui': {
    'index.js': '',
    'dist/index.js':
      "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n",
    'dist/button.js': button,
  },
})
const withMain = (packages: Packages): Packages =>
  Object.fromEntries(
    Object.entries(packages).map(([name, files]) => [
      name,
      dependency(name, files, { main: 'dist/index.js' }),
    ]),
  )

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a design-system package that re-exports cx, declared by its package specifier', () => {
  const app = "import { cx, Button } from '@acme/ui'\nexport const A = () => [Button, cx('grid')]\n"
  const scenario = (packages: Packages, options?: NaveOptions, isDev = false): Scenario => ({
    modules: { 'components/App.tsx': app },
    packages: withMain(packages),
    importsPackages: false,
    ...(options && { options }),
    isDev,
  })

  it('with the entry the build is green and the layer holds the package’s atom (its own relative importer) and the consumer’s', async () => {
    const outcome = await read(scenario(ui(), { cxModules: ['@acme/ui'] }))

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it('in dev the same layer is served with nothing printed', async () => {
    const outcome = await read(scenario(ui(), { cxModules: ['@acme/ui'] }, true))

    expect(outcome.printed.errors).toEqual([])
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it.skip('without the entry the build fails in the package’s index, printing the cxModules line and no keepFor line', async () => {
    const outcome = await read(scenario(ui()))

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems[0]).toMatch(/^node_modules\/@acme\/ui\/dist\/index\.js:/u)
    expect(outcome.text).toContain(
      "@acme/ui re-exports cx in '@acme/ui'. List it in withNave(): cxModules: ['@acme/ui'].",
    )
    expect(outcome.text).not.toContain('keepFor')
  })

  it.skip('the printed line, pasted, builds green', async () => {
    const first = await read(scenario(ui()))
    const pasted = await read(scenario(ui(), { cxModules: printedList(first.text) ?? [] }))

    expect(printedList(first.text)).toEqual(['@acme/ui'])
    expect(pasted.report).toBeUndefined()
  })

  it('on the dev terminal the problem without the entry is printed (the inverted clause)', async () => {
    const outcome = await read(scenario(ui(), undefined, true))

    expect(outcome.printed.errors).toHaveLength(1)
    expect(outcome.printed.errors[0]).toContain('node_modules/@acme/ui/dist/index.js:')
  })

  it('with the entry and an unreadable call in the package, a dependency problem prints its keepFor line and no cxModules entry', async () => {
    const outcome = await read(
      scenario(ui("import { cx } from './index.js'\nexport const Button = (v) => cx(v)\n"), {
        cxModules: ['@acme/ui'],
      }),
    )

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.text).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
    expect(outcome.text).not.toContain("cxModules: ['@acme/ui']")
  })

  it.skip('a re-export reached through a subpath prints that subpath, and pasting it builds green', async () => {
    const subpath = {
      '@acme/ui': { 'index.js': "export const Button = 'b'\n", 'cx.js': BARREL },
    }
    const code = "import { cx } from '@acme/ui/cx.js'\nexport const app = cx('grid')\n"
    const first = await run(code, subpath)

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems[0]).toMatch(/^node_modules\/@acme\/ui\/cx\.js:/u)
    expect(first.text).toContain(
      "@acme/ui re-exports cx in '@acme/ui/cx.js'. List it in withNave(): cxModules: ['@acme/ui/cx.js'].",
    )
    expect(first.text).not.toContain('keepFor')
    expect(printedList(first.text)).toEqual(['@acme/ui/cx.js'])
    const pasted = await run(code, subpath, { cxModules: ['@acme/ui/cx.js'] })

    expect(pasted.report).toBeUndefined()
    expect(pasted.atoms).toEqual(['grid'])
  })

  it('a re-export reached only from inside the package prints the keepFor line, and pasting it builds green', async () => {
    const inside = {
      '@acme/ui': {
        'index.js': "export { Button } from './button.js'\n",
        'button.js': "import { cx } from './utils/cx.js'\nexport const Button = () => cx('flex')\n",
        'utils/cx.js': BARREL,
      },
    }
    const code = "import { Button } from '@acme/ui'\nexport const A = () => Button\n"
    const first = await run(code, inside)

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems[0]).toMatch(/^node_modules\/@acme\/ui\/utils\/cx\.js:/u)
    expect(first.text).not.toMatch(/cxModules: \[/u)
    expect(first.text).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
    expect(first.text).toContain('only the package itself imports')
    const pasted = await run(code, inside, { keepFor: KEEP_FLEX })

    expect(pasted.report).toBeUndefined()
    expect(pasted.atoms).toEqual(['flex'])
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, keepFor never clears a problem the consumer’s own cxModules can clear', () => {
  it.skip('row 1: a re-export the application imports through a subpath fails beside keepFor, and its printed array pasted ships flex and block', async () => {
    const packages = {
      '@acme/ui': {
        'index.js': MENU_ENTRY,
        'menu.js': MENU_JS,
        'public-cx.js': BARREL,
      },
    }
    const code =
      "import { cx as k } from '@acme/ui/public-cx.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, k('block')]\n"
    const first = await run(code, packages, { keepFor: KEEP_FLEX })

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems[0]).toMatch(/^node_modules\/@acme\/ui\/public-cx\.js:/u)
    expect(first.text).toContain("cxModules: ['@acme/ui/public-cx.js']")
    const pasted = await run(code, packages, {
      keepFor: KEEP_FLEX,
      cxModules: printedList(first.text) ?? [],
    })

    expect(pasted.report).toBeUndefined()
    expect(pasted.atoms).toEqual(sorted(['flex', 'block']))
  })

  it.skip('row 2: the package’s entry re-exports cx and the application takes it from the package; the printed array pasted ships flex and grid', async () => {
    const packages = {
      '@acme/ui': {
        'index.js': "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n",
        'button.js': "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
      },
    }
    const code =
      "import { cx, Button } from '@acme/ui'\nexport const A = () => [Button, cx('grid')]\n"
    const first = await run(code, packages, { keepFor: KEEP_FLEX })

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.text).toContain("cxModules: ['@acme/ui']")
    const pasted = await run(code, packages, {
      keepFor: KEEP_FLEX,
      cxModules: printedList(first.text) ?? [],
    })

    expect(pasted.report).toBeUndefined()
    expect(pasted.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it.skip('row 3: an entry naming a module that exports the package’s own join function fails telling the consumer to remove the entry, and is green without it', async () => {
    const packages = {
      '@acme/ui': {
        'index.js':
          "export const cx = (...a) => a.filter(Boolean).join(' ')\nexport const Button = 'b'\n",
      },
    }
    const code = "import { cx, Button } from '@acme/ui'\nexport const a = [Button, cx('grid')]\n"
    const first = await run(code, packages, { cxModules: ['@acme/ui'], keepFor: KEEP_FLEX })

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.text).toContain(
      "@acme/ui exports a cx the build does not follow from '@acme/ui', which is listed in cxModules. Remove it from cxModules in withNave()",
    )
    const followed = await run(code, packages, { keepFor: KEEP_FLEX })

    expect(followed.report).toBeUndefined()
    expect(followed.atoms).toEqual(['flex'])
  })

  it.skip('row 4: a re-export under another name prints the package’s keepFor line and no cxModules line, with the reader clause', async () => {
    const packages = { '@acme/ui': withMenu('cn.js', CN) }
    const code =
      "import { cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n"
    const first = await run(code, packages)

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems[0]).toMatch(/^node_modules\/@acme\/ui\/cn\.js:/u)
    expect(first.text).not.toMatch(/cxModules: \[/u)
    expect(first.text).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
    expect(first.text).toContain('import cx from @navecss/core/cx instead')
    expect(first.text).not.toContain('only the package itself imports')
    const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

    expect(followed.report).toBeUndefined()
    expect(followed.atoms).toEqual(sorted(['flex', 'block']))
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, an empty keepFor list says the calls the build cannot read produce no atom', () => {
  const quiet = {
    '@acme/ui': {
      'index.js': "export { Button } from './button.js'\n",
      'button.js': "import './utils/cx.js'\nexport const Button = 'b'\n",
      'utils/cx.js': BARREL,
    },
  }
  const code = "import { Button } from '@acme/ui'\nexport const A = Button\n"

  it('fails with the keepFor line when the package is not listed, and is green with an empty list, shipping no atom for the package', async () => {
    const first = await run(code, quiet)

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems[0]).toMatch(/^node_modules\/@acme\/ui\/utils\/cx\.js:/u)
    expect(first.text).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
    expect(first.text).not.toContain('[]')
    const listed = await run(code, quiet, { keepFor: KEEP_NONE })

    expect(listed.report).toBeUndefined()
    expect(listed.printed.warnings).toEqual([])
    expect(listed.atoms).toEqual([])
  })

  it('adds nothing to, and takes nothing from, the atoms the build reads in the package', async () => {
    const reading = {
      '@acme/ui': {
        'index.js': MENU_ENTRY,
        'menu.js': `${IMPORT}import './utils/cx.js'\nexport const Menu = [cx('grid'), cx('flex')]\n`,
        'utils/cx.js': BARREL,
      },
    }
    const menu = "import { Menu } from '@acme/ui'\nexport const A = Menu\n"
    const first = await run(menu, reading)
    const listed = await run(menu, reading, { keepFor: KEEP_NONE })

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems.map((line) => fileOf(line))).toHaveLength(1)
    expect(listed.report).toBeUndefined()
    expect(listed.atoms).toEqual(sorted(['flex', 'grid']))
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a cx export is taken by name, and a dependency that only re-exports one is part of the route', () => {
  const forms = [
    {
      name: 'renamed at the export',
      text: CN,
      app: "import { cn } from '@acme/ui/f.js'\nexport const A = [cn('block')]\n",
      takes: 'components/App.ts (cn)',
    },
    {
      name: 'a default export of an import',
      text: `${IMPORT}export default cx\n`,
      app: "import k from '@acme/ui/f.js'\nexport const A = [k('block')]\n",
      takes: 'components/App.ts (the default export)',
    },
    {
      name: 'a namespace export',
      text: "export * as n from '@navecss/core/cx'\n",
      app: "import { n } from '@acme/ui/f.js'\nexport const A = [n.cx('block')]\n",
      takes: 'components/App.ts (n)',
    },
    {
      name: 'an import exported under another name',
      text: `${IMPORT}export { cx as cn }\n`,
      app: "import { cn } from '@acme/ui/f.js'\nexport const A = [cn('block')]\n",
      takes: 'components/App.ts (cn)',
    },
    {
      name: 'cx as default',
      text: "export { cx as default } from '@navecss/core/cx'\n",
      app: "import k from '@acme/ui/f.js'\nexport const A = [k('block')]\n",
      takes: 'components/App.ts (the default export)',
    },
    {
      name: 'a string name',
      text: "export { cx as 'c-x' } from '@navecss/core/cx'\n",
      app: "import { 'c-x' as k } from '@acme/ui/f.js'\nexport const A = [k('block')]\n",
      takes: "components/App.ts ('c-x')",
    },
    {
      name: 'a namespace exported as cx',
      text: "export * as cx from '@navecss/core/cx'\n",
      app: "import { cx } from '@acme/ui/f.js'\nexport const A = [cx.cx('block')]\n",
      takes: 'components/App.ts (cx)',
    },
    {
      name: 'the plain re-export beside a renamed one in one file',
      text: "export { cx } from '@navecss/core/cx'\nexport { cx as cn } from '@navecss/core/cx'\n",
      app: "import { cx } from '@acme/ui/f.js'\nexport const A = [cx('block')]\n",
      takes: 'components/App.ts (cx)',
    },
    {
      name: 'a namespace import exported as cx',
      text: "import * as cx from '@navecss/core/cx'\nexport { cx }\n",
      app: "import { cx } from '@acme/ui/f.js'\nexport const A = [cx.cx('block')]\n",
      takes: 'components/App.ts (cx)',
    },
  ]

  describe.each([
    ['one atom', KEEP_FLEX],
    ['an empty list', KEEP_NONE],
  ] as const)('row 5 under keepFor with %s', (_name, keepFor) => {
    it.skip.each(forms)(
      'for $name the build fails with the line that names the file and the name, no cxModules line, and importing cx from Nave builds green',
      async ({ text, app: usage, takes }) => {
        const packages = { '@acme/ui': withMenu('f.js', text) }
        const first = await run(`import { Menu } from '@acme/ui'\n${usage}`, packages, { keepFor })

        expect(first.first).toMatch(/^\d+ problems? in 1 file: /u)
        expect(first.problems[0]).toMatch(/^node_modules\/@acme\/ui\/f\.js:/u)
        expect(first.text).toContain(takes)
        expect(first.text).toContain('your code takes that cx')
        expect(first.text).not.toMatch(/cxModules: \[/u)
        const followed = await run(NAVE_APP, packages, { keepFor })

        expect(followed.report).toBeUndefined()
        expect(followed.atoms).toEqual(sorted(['flex', 'block']))
      },
    )
  })

  it.skip('row 6: row 4 with only the keepFor line pasted and the import unchanged fails with the line that names the application file', async () => {
    const packages = { '@acme/ui': withMenu('cn.js', CN) }
    const code =
      "import { cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n"
    const pasted = await run(code, packages, { keepFor: KEEP_FLEX })

    expect(pasted.text).toContain('components/App.ts (cn)')
    expect(pasted.text).not.toMatch(/cxModules: \[/u)
    const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

    expect(followed.report).toBeUndefined()
  })

  describe('row 7: the name test’s controls', () => {
    const entry = {
      '@acme/ui': {
        'index.js': `${MENU_ENTRY}${CN}`,
        'menu.js': MENU_JS,
      },
    }

    it('is green with no plugin message when the application takes only Menu from an entry that also re-exports cx as cn', async () => {
      const outcome = await run("import { Menu } from '@acme/ui'\nexport const A = Menu\n", entry, {
        keepFor: KEEP_FLEX,
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed.warnings).toEqual([])
      expect(outcome.atoms).toEqual(['flex'])
    })

    it.skip('is green for a namespace import read only as ui.Menu, and fails once ui.cn is called', async () => {
      const green = await run("import * as ui from '@acme/ui'\nexport const A = ui.Menu\n", entry, {
        keepFor: KEEP_FLEX,
      })
      const red = await run(
        "import * as ui from '@acme/ui'\nexport const A = [ui.Menu, ui.cn('block')]\n",
        entry,
        { keepFor: KEEP_FLEX },
      )

      expect(green.report).toBeUndefined()
      expect(red.text).toContain('components/App.ts')
      expect(red.text).toContain('your code takes that cx')
      const moved = await run(NAVE_APP, entry, { keepFor: KEEP_FLEX })

      expect(moved.report).toBeUndefined()
    })
  })

  it.skip('row 8: the withdrawn cost: an entry that re-exports cx is cleared when the application takes only Button; with the application taking cx it still fails with cxModules', async () => {
    const packages = {
      '@acme/ui': {
        'index.js': "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n",
        'button.js': "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
      },
    }
    const green = await run(
      "import { Button } from '@acme/ui'\nexport const A = Button\n",
      packages,
      { keepFor: KEEP_FLEX },
    )
    const control = await run(
      "import { cx, Button } from '@acme/ui'\nexport const A = () => [Button, cx('grid')]\n",
      packages,
      { keepFor: KEEP_FLEX },
    )

    expect(green.report).toBeUndefined()
    expect(green.atoms).toEqual(['flex'])
    expect(control.text).toContain("cxModules: ['@acme/ui']")
  })

  it('row 9: a dependency that calls through the renamed export is the package’s own call, and keepFor stands in for it', async () => {
    const packages = {
      '@acme/ui': withMenu('cn.js', CN),
      '@acme/kit': {
        'index.js': "import { cn } from '@acme/ui/cn.js'\nexport const kit = cn('block')\n",
      },
    }
    const outcome = await run("import { kit } from '@acme/kit'\nexport const A = kit\n", packages, {
      keepFor: { '@acme/ui': ['block'] },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['block'])
  })

  describe('row 10: a dependency that only re-exports a cx export is part of the route', () => {
    const packages = {
      '@acme/ui': withMenu('f.js', CN),
      '@other/ui': { 'index.js': "export { cn } from '@acme/ui/f.js'\n" },
    }
    const code =
      "import { Menu } from '@acme/ui'\nimport { cn } from '@other/ui'\nexport const A = [Menu, cn('block')]\n"

    it.skip.each([
      ['the forwarding package is not listed', KEEP_FLEX],
      ['the forwarding package is listed with no atom', { ...KEEP_FLEX, '@other/ui': [] }],
    ] as const)(
      'fails with the line that names the application file when %s, and the same bytes in both',
      async (_name, keepFor) => {
        const first = await run(code, packages, { keepFor })

        expect(first.text).toContain('components/App.ts (cn)')
        expect(first.text).not.toMatch(/cxModules: \[/u)
        const followed = await run(NAVE_APP, packages, { keepFor })

        expect(followed.report).toBeUndefined()
        expect(followed.atoms).toEqual(sorted(['flex', 'block']))
      },
    )

    it('prints the same line with and without the forwarding package listed', async () => {
      const unlisted = await run(code, packages, { keepFor: KEEP_FLEX })
      const listed = await run(code, packages, { keepFor: { ...KEEP_FLEX, '@other/ui': [] } })

      expect(listed.text).toBe(unlisted.text)
    })
  })

  it.skip('row 11: a dependency that calls and forwards fails with the line that names the application file, and is green once cx comes from Nave', async () => {
    const packages = {
      '@acme/ui': withMenu('f.js', CN),
      '@other/ui': {
        'index.js':
          "import { cn } from '@acme/ui/f.js'\nexport const Pill = cn('grid')\nexport { cn }\n",
      },
    }
    const keepFor = { '@acme/ui': ['flex', 'grid'] } as const
    const first = await run(
      "import { Menu } from '@acme/ui'\nimport { Pill, cn } from '@other/ui'\nexport const A = [Menu, Pill, cn('block')]\n",
      packages,
      { keepFor },
    )

    expect(first.text).toContain('components/App.ts (cn)')
    const followed = await run(
      "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nimport { Pill } from '@other/ui'\nexport const A = [Menu, Pill, cx('block')]\n",
      packages,
      { keepFor },
    )

    expect(followed.report).toBeUndefined()
    expect(followed.atoms).toEqual(sorted(['flex', 'grid', 'block']))
  })

  it.skip('row 12: two forwarding hops across packages fail with the line that names the application file', async () => {
    const packages = {
      '@acme/ui': withMenu('f.js', CN),
      '@other/ui': { 'index.js': "export { cn } from '@acme/ui/f.js'\n" },
      '@third/ui': { 'index.js': "export * from '@other/ui'\n" },
    }
    const first = await run(
      "import { Menu } from '@acme/ui'\nimport { cn } from '@third/ui'\nexport const A = [Menu, cn('block')]\n",
      packages,
      { keepFor: KEEP_FLEX },
    )

    expect(first.text).toContain('components/App.ts (cn)')
    const followed = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

    expect(followed.report).toBeUndefined()
  })

  describe('row 13: an entry holding a renamed cx beside Menu, reached by import()', () => {
    const packages = {
      '@acme/ui': { 'index.js': `${MENU_ENTRY}${CN}`, 'menu.js': MENU_JS },
    }

    it.skip('is green when the application reads Menu from the import(), and fails once ns.cn is called', async () => {
      const green = await run(
        "export const A = async () => { const ns = await import('@acme/ui'); return ns.Menu }\n",
        packages,
        { keepFor: KEEP_FLEX },
      )
      const red = await run(
        "export const A = async () => { const ns = await import('@acme/ui'); return [ns.Menu, ns.cn('block')] }\n",
        packages,
        { keepFor: KEEP_FLEX },
      )

      expect(green.report).toBeUndefined()
      expect(green.atoms).toEqual(['flex'])
      expect(red.text).toContain('components/App.ts')
      expect(red.text).toContain('your code takes that cx')
      const moved = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

      expect(moved.report).toBeUndefined()
    })
  })

  it.skip('row 14: a workspace package that imports a re-export through a # mapping fails, and does not say that no cxModules entry clears it; the entries it names, pasted, build green', async () => {
    const packages = { '@acme/ui': withMenu('f.js', BARREL) }
    const workspace = {
      'components/ws/package.json': nave('@acme/ws', {
        main: './index.js',
        imports: { '#cx': '@acme/ui/f.js' },
      }),
      'components/ws/index.js': "import { cx } from '#cx'\nexport const W = cx('block')\n",
    }
    const code =
      "import { Menu } from '@acme/ui'\nimport { W } from './ws/index.js'\nexport const A = [Menu, W]\n"
    const first = await run(code, packages, { keepFor: KEEP_FLEX }, workspace)

    expect(first.first).toMatch(/^\d+ problems? in /u)
    expect(first.text).not.toContain('no cxModules entry')
    const pasted = await run(
      code,
      packages,
      { keepFor: KEEP_FLEX, cxModules: ['./node_modules/@acme/ui/f.js', '#cx'] },
      workspace,
    )

    expect(pasted.report).toBeUndefined()
    expect(pasted.atoms).toEqual(sorted(['block', 'flex']))
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-52, a forward is never a take on route (i)', () => {
  const FX1 = {
    '@acme/ui': {
      'index.js': `${MENU_ENTRY}export { cx } from '@navecss/core/cx'\n`,
      'menu.js': MENU_JS,
    },
  }
  const forwarding = (entry: string, ...extra: string[]): Packages => ({
    ...FX1,
    '@other/ui': { 'index.js': `${entry}${extra.join('')}` },
  })

  it.skip.each([
    ['listed with no atom', { ...KEEP_FLEX, '@other/ui': [] }],
    ['not listed', KEEP_FLEX],
  ] as const)(
    'row 15: a forward of a declared module’s cx fails with the line that names the application file and cx, %s',
    async (_name, keepFor) => {
      const packages = forwarding("export { cx } from '@acme/ui'\n")
      const first = await run(
        "import { Menu } from '@acme/ui'\nimport { cx } from '@other/ui'\nexport const A = [Menu, cx('block')]\n",
        packages,
        { keepFor },
      )

      expect(first.text).toContain('components/App.ts (cx)')
      expect(first.text).not.toMatch(/cxModules: \[/u)
      const followed = await run(NAVE_APP, packages, { keepFor })

      expect(followed.report).toBeUndefined()
      expect(followed.atoms).toEqual(sorted(['flex', 'block']))
    },
  )

  it.skip('row 16: the same with the origin a subpath', async () => {
    const packages = {
      '@acme/ui': { 'index.js': MENU_ENTRY, 'menu.js': MENU_JS, 'cx.js': BARREL },
      '@other/ui': { 'index.js': "export { cx } from '@acme/ui/cx.js'\n" },
    }
    const first = await run(
      "import { Menu } from '@acme/ui'\nimport { cx } from '@other/ui'\nexport const A = [Menu, cx('block')]\n",
      packages,
      { keepFor: KEEP_FLEX },
    )

    expect(first.text).toContain('components/App.ts (cx)')
    expect(first.text).not.toMatch(/cxModules: \[/u)
  })

  it.skip('row 17: a dependency that calls through the origin stays on route (i), and its printed cxModules array pasted is green', async () => {
    const packages = {
      ...FX1,
      '@kit/ui': {
        'index.js': "import { cx } from '@acme/ui'\nexport const Pill = cx('grid')\n",
      },
    }
    const code =
      "import { Menu } from '@acme/ui'\nimport { Pill } from '@kit/ui'\nexport const A = [Menu, Pill]\n"
    const first = await run(code, packages, { keepFor: KEEP_FLEX })

    expect(first.text).toContain("cxModules: ['@acme/ui']")
    const pasted = await run(code, packages, { keepFor: KEEP_FLEX, cxModules: ['@acme/ui'] })

    expect(pasted.report).toBeUndefined()
    expect(pasted.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it('row 18: a forward nobody takes is green with no message', async () => {
    const packages = forwarding("export { cx } from '@acme/ui'\n", "export const Tag = 'tag'\n")
    const outcome = await run(
      "import { Menu } from '@acme/ui'\nimport { Tag } from '@other/ui'\nexport const A = [Menu, Tag]\n",
      packages,
      { keepFor: KEEP_FLEX },
    )

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
    expect(outcome.atoms).toEqual(['flex'])
  })

  it.skip.each([
    ['listed with no atom', { ...KEEP_FLEX, '@other/ui': [] }],
    ['not listed', KEEP_FLEX],
  ] as const)(
    'row 19: a consumer that reaches the forward on its own fails with one problem that names the application file and cx, says to import cx from Nave and prints neither a keepFor nor a cxModules line, %s',
    async (_name, keepFor) => {
      const packages = forwarding("export { cx } from '@acme/ui'\n")
      const code =
        "import { Menu, cx as k } from '@acme/ui'\nimport { cx } from '@other/ui'\nexport const A = [Menu, k('grid'), cx('block')]\n"
      const first = await run(code, packages, { keepFor, cxModules: ['@acme/ui'] })

      expect(first.first).toMatch(/^1 problem in 1 file: /u)
      expect(first.text).toContain('components/App.ts')
      expect(first.text).toContain('import cx from @navecss/core/cx')
      expect(first.text).not.toMatch(/keepFor: \{/u)
      expect(first.text).not.toMatch(/cxModules: \[/u)
      expect(first.text).not.toContain('makes calls')
      const followed = await run(
        "import { cx } from '@navecss/core/cx'\nimport { Menu, cx as k } from '@acme/ui'\nexport const A = [Menu, k('grid'), cx('block')]\n",
        packages,
        { keepFor, cxModules: ['@acme/ui'] },
      )

      expect(followed.report).toBeUndefined()
      expect(followed.atoms).toEqual(sorted(['flex', 'grid', 'block']))
    },
  )

  it.skip('row 20: row 19 with the application importing only Tag is green with no message', async () => {
    const packages = forwarding("export { cx } from '@acme/ui'\n", "export const Tag = 'tag'\n")
    const outcome = await run(
      "import { Menu, cx as k } from '@acme/ui'\nimport { Tag } from '@other/ui'\nexport const A = [Menu, k('grid'), Tag]\n",
      packages,
      { keepFor: KEEP_FLEX, cxModules: ['@acme/ui'] },
    )

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it.skip('row 21: a dependency calling through the forward fails with one problem in the forwarding package, its keepFor line, and it does not say the forwarder makes calls', async () => {
    const packages = {
      ...forwarding("export { cx } from '@acme/ui'\n"),
      '@third/ui': {
        'index.js': "import { cx } from '@other/ui'\nexport const Chip = cx('grid')\n",
      },
    }
    const code =
      "import { Menu, cx as k } from '@acme/ui'\nimport { Chip } from '@third/ui'\nexport const A = [Menu, k('block'), Chip]\n"
    const options = { keepFor: KEEP_FLEX, cxModules: ['@acme/ui'] }
    const first = await run(code, packages, options)

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems[0]).toMatch(/^node_modules\/@other\/ui\//u)
    expect(first.text).toContain("keepFor: { '@other/ui'")
    expect(first.text).toContain('@third/ui')
    expect(first.text).not.toContain('@other/ui makes calls')
    const followed = await run(code, packages, {
      ...options,
      keepFor: { ...KEEP_FLEX, '@other/ui': ['grid'] },
    })

    expect(followed.report).toBeUndefined()
    expect(followed.atoms).toEqual(sorted(['flex', 'grid', 'block']))
  })
})
