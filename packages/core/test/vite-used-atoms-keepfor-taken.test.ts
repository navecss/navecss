/**
 * AC-used-atoms-52 covers: R17, as amended for `keepFor` and the exports of `cx` the application
 * takes (a real `vite build` of a scratch app and a dependency): a listed package's module that
 * gives out Nave's `cx` stays an error while a module the consumer can change takes one of those
 * exports, `keepFor` clears it otherwise, and each printed remedy is followed and the app rebuilt.
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

const KEEP_FLEX = { '@acme/ui': ['flex'] } as const
const KEEP_NONE = { '@acme/ui': [] } as const
const FORM = 'other than under the name cx (renamed, as a default or inside a namespace)'
const FIX =
  'import cx from @navecss/core/cx where it is called, and re-export it only under the name cx.'
const WHOLE =
  '; where a file takes such a module whole (a namespace import, export * or import()), import by name what it uses from the package, and cx from @navecss/core/cx'

/**
 * The remedy line for a listed package whose renamed re-export the application takes: `takes` is
 * the list of takers and what each takes, `files` the clause that points at them.
 */
function takenLine(takes: string, files = 'in that file', whole = ''): string {
  return `@acme/ui re-exports cx ${FORM}, and your code takes cx from a module that does, in ${takes}. The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: ${files}, import cx from @navecss/core/cx instead and call cx in its place${whole}. No cxModules entry clears this, since listing a module that gives cx out under another name fails the build; once no file of yours takes cx from there, the keepFor entry clears the re-export. The lasting fix is the package's: ${FIX}`
}

/**
 * Builds an app of `code` (`src/App.ts`, with more `app` files beside it) over the packages of
 * `packages`, `@acme/ui` among them.
 */
async function run(
  code: string,
  packages: Record<string, Record<string, string>>,
  options: BuildOptions['options'] = {},
  app: Record<string, string> = {},
): Promise<Built> {
  const scratch = makeUsedApp(appFiles({ 'src/App.ts': code, ...app }))
  for (const [name, files] of Object.entries(packages)) addPackage(scratch, name, files)
  try {
    return await buildUsed(scratch, { options })
  } finally {
    scratch.dispose()
  }
}

/**
 * A package whose entry exports `Menu`, which calls `cx('flex', v)` and imports `file`, holding
 * `text`, for its effect.
 */
function withMenu(file: string, text: string): Record<string, string> {
  return {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `${IMPORT}import './${file}'\nexport const Menu = (v) => cx('flex', v)\n`,
    [file]: text,
  }
}

const NAVE_APP =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"
const MENU_ONLY = "import { Menu } from '@acme/ui'\nexport const A = Menu\n"

describe('AC-used-atoms-52 - keepFor does not clear a renamed export of cx the application takes', () => {
  const forms = [
    {
      name: 'renamed at the export',
      text: "export { cx as cn } from '@navecss/core/cx'\n",
      app: "import { cn } from '@acme/ui/f.js'\nexport const A = [cn('block')]\n",
      takes: 'src/App.ts (cn)',
      count: 1,
    },
    {
      name: 'a default export of an import',
      text: `${IMPORT}export default cx\n`,
      app: "import k from '@acme/ui/f.js'\nexport const A = [k('block')]\n",
      takes: 'src/App.ts (the default export)',
      count: 1,
    },
    {
      name: 'a namespace export',
      text: "export * as n from '@navecss/core/cx'\n",
      app: "import { n } from '@acme/ui/f.js'\nexport const A = [n.cx('block')]\n",
      takes: 'src/App.ts (n)',
      count: 1,
    },
    {
      name: 'an import exported under another name',
      text: `${IMPORT}export { cx as cn }\n`,
      app: "import { cn } from '@acme/ui/f.js'\nexport const A = [cn('block')]\n",
      takes: 'src/App.ts (cn)',
      count: 1,
    },
    {
      name: 'cx as default',
      text: "export { cx as default } from '@navecss/core/cx'\n",
      app: "import k from '@acme/ui/f.js'\nexport const A = [k('block')]\n",
      takes: 'src/App.ts (the default export)',
      count: 1,
    },
    {
      name: 'a string name',
      text: "export { cx as 'c-x' } from '@navecss/core/cx'\n",
      app: "import { 'c-x' as k } from '@acme/ui/f.js'\nexport const A = [k('block')]\n",
      takes: "src/App.ts ('c-x')",
      count: 1,
    },
    {
      name: 'a namespace exported as cx',
      text: "export * as cx from '@navecss/core/cx'\n",
      app: "import { cx } from '@acme/ui/f.js'\nexport const A = [cx.cx('block')]\n",
      takes: 'src/App.ts (cx)',
      count: 1,
    },
    {
      name: 'the plain re-export beside a renamed one in one file',
      text: "export { cx } from '@navecss/core/cx'\nexport { cx as cn } from '@navecss/core/cx'\n",
      app: "import { cx } from '@acme/ui/f.js'\nexport const A = [cx('block')]\n",
      takes: 'src/App.ts (cx)',
      count: 2,
    },
    {
      name: 'a namespace import exported as cx',
      text: "import * as cx from '@navecss/core/cx'\nexport { cx }\n",
      app: "import { cx } from '@acme/ui/f.js'\nexport const A = [cx.cx('block')]\n",
      takes: 'src/App.ts (cx)',
      count: 1,
    },
  ]
  const lists = [
    ['one atom', KEEP_FLEX],
    ['an empty list', KEEP_NONE],
  ] as const

  describe.each(lists)('under keepFor with %s', (_, keepFor) => {
    it.each(forms)(
      'for $name the build fails with the line that names the file and the name, and importing cx from Nave builds green',
      async ({ text, app, takes, count }) => {
        const modules = withMenu('f.js', text)
        const first = await run(
          `import { Menu } from '@acme/ui'\n${app}`,
          { '@acme/ui': modules },
          { keepFor },
        )

        expect(first.error).toMatch(new RegExp(`^${count} problems? in 1 file`))
        expect(first.error).toContain('node_modules/@acme/ui/f.js:')
        expect(first.error).not.toMatch(/cxModules: \[/)
        expect(first.error!.split('\n')).toContain(takenLine(takes))
        const followed = await run(NAVE_APP, { '@acme/ui': modules }, { keepFor })

        expect(followed.error).toBeUndefined()
        expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
      },
      120_000,
    )
  })

  it('prints the worked line for a renamed export the application takes, word for word', async () => {
    const modules = withMenu('cn.js', "export { cx as cn } from '@navecss/core/cx'\n")
    const app =
      "import { cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n"
    const built = await run(app, { '@acme/ui': modules }, { keepFor: KEEP_FLEX })

    expect(built.error!.split('\n').at(-1)).toBe(
      "@acme/ui re-exports cx other than under the name cx (renamed, as a default or inside a namespace), and your code takes cx from a module that does, in src/App.ts (cn). The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: in that file, import cx from @navecss/core/cx instead and call cx in its place. No cxModules entry clears this, since listing a module that gives cx out under another name fails the build; once no file of yours takes cx from there, the keepFor entry clears the re-export. The lasting fix is the package's: import cx from @navecss/core/cx where it is called, and re-export it only under the name cx.",
    )
  }, 60_000)

  it('row 4 with only the keepFor line pasted and the import unchanged fails with the line that names the file', async () => {
    const modules = withMenu('cn.js', "export { cx as cn } from '@navecss/core/cx'\n")
    const app = "import { cn } from '@acme/ui/cn.js'\nexport const A = [cn('block')]\n"
    const first = await run(app, { '@acme/ui': modules })

    expect(first.error).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
    const pasted = await run(app, { '@acme/ui': modules }, { keepFor: KEEP_FLEX })

    expect(pasted.error).toContain(takenLine('src/App.ts (cn)'))
    expect(pasted.error).not.toMatch(/cxModules: \[/)
  }, 120_000)

  it('names every taker and every name, sorted, and points at the files', async () => {
    const modules = withMenu(
      'f.js',
      "export { cx as cn } from '@navecss/core/cx'\nexport { cx as default } from '@navecss/core/cx'\n",
    )
    const app = {
      'src/Page.ts': "import k, { cn } from '@acme/ui/f.js'\nexport const P = [k('a'), cn('b')]\n",
    }
    const first = await run(
      "import { cn } from '@acme/ui/f.js'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cn('block')]\n",
      { '@acme/ui': modules },
      { keepFor: KEEP_FLEX },
      app,
    )

    expect(first.error!.split('\n')).toContain(
      takenLine('src/App.ts (cn), src/Page.ts (cn, the default export)', 'in each of those files'),
    )
  }, 60_000)
})

describe('AC-used-atoms-52 - the name test: what the application takes, not what it imports a file from', () => {
  const CN = "export { cx as cn } from '@navecss/core/cx'\n"
  const ENTRY = {
    'index.js': `export { Menu } from './menu.js'\n${CN}`,
    'menu.js': `${IMPORT}export const Menu = (v) => cx('flex', v)\n`,
  }

  it('is green when the application takes only Menu from an entry that also re-exports cx as cn', async () => {
    const built = await run(MENU_ONLY, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(built.error).toBeUndefined()
    expect((built.warnings ?? []).filter((message) => message.includes('nave'))).toEqual([])
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
  }, 60_000)

  it('is green when a namespace import is read only as ui.Menu, and fails once ui.cn is called', async () => {
    const reading = "import * as ui from '@acme/ui'\nexport const A = ui.Menu\n"
    const green = await run(reading, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(green.error).toBeUndefined()
    const taking = "import * as ui from '@acme/ui'\nexport const A = [ui.Menu, ui.cn('block')]\n"
    const red = await run(taking, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(red.error!.split('\n')).toContain(
      takenLine('src/App.ts (a namespace import reading cn)', 'in that file', WHOLE),
    )
  }, 120_000)

  it('is green for a namespace destructured without a rest element, and fails with one', async () => {
    const plain = "import * as ui from '@acme/ui'\nconst { Menu } = ui\nexport const A = Menu\n"
    const green = await run(plain, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(green.error).toBeUndefined()
    const named =
      "import * as ui from '@acme/ui'\nconst { cn } = ui\nexport const A = cn('block')\n"
    const taken = await run(named, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(taken.error!.split('\n')).toContain(
      takenLine('src/App.ts (a namespace import reading cn)', 'in that file', WHOLE),
    )
    const rest =
      "import * as ui from '@acme/ui'\nconst { Menu, ...more } = ui\nexport const A = [Menu, more]\n"
    const whole = await run(rest, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(whole.error!.split('\n')).toContain(
      takenLine('src/App.ts (a namespace import)', 'in that file', WHOLE),
    )
  }, 120_000)

  it('counts a namespace that is passed on as taken', async () => {
    const passed = "import * as ui from '@acme/ui'\nexport const A = [ui.Menu, Object.keys(ui)]\n"
    const built = await run(passed, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(built.error!.split('\n')).toContain(
      takenLine('src/App.ts (a namespace import)', 'in that file', WHOLE),
    )
  }, 60_000)

  it('counts export * from the package, and import() of it, as taken', async () => {
    const star = await run(
      "export * from '@acme/ui'\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
    )

    expect(star.error!.split('\n')).toContain(
      takenLine('src/App.ts (export *)', 'in that file', WHOLE),
    )
    const lazy = await run(
      "export const A = () => import('@acme/ui')\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
    )

    expect(lazy.error!.split('\n')).toContain(
      takenLine('src/App.ts (import())', 'in that file', WHOLE),
    )
  }, 120_000)

  it('reads an import() destructured by static keys: other keys take nothing, a cx key takes it', async () => {
    const other =
      "export const A = async () => { const { Menu } = await import('@acme/ui'); return Menu }\n"
    const green = await run(other, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(green.error).toBeUndefined()
    const cx =
      "export const A = async () => { const { cn } = await import('@acme/ui'); return cn('block') }\n"
    const red = await run(cx, { '@acme/ui': ENTRY }, { keepFor: KEEP_FLEX })

    expect(red.error!.split('\n')).toContain(
      takenLine('src/App.ts (import() reading cn)', 'in that file', WHOLE),
    )
  }, 120_000)

  it('does not count a bare import, or a take of another name through export { Menu } from', async () => {
    const bare = await run(
      "import '@acme/ui'\nexport { Menu } from '@acme/ui'\n",
      { '@acme/ui': ENTRY },
      { keepFor: KEEP_FLEX },
    )

    expect(bare.error).toBeUndefined()
  }, 60_000)

  it('withdrawn cost: an entry that re-exports cx is cleared when the application takes only Button', async () => {
    const entry = {
      'index.js': "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n",
      'button.js': "import { cx } from './index.js'\nexport const Button = () => cx('flex')\n",
    }
    const built = await run(
      "import { Button } from '@acme/ui'\nexport const A = Button\n",
      { '@acme/ui': entry },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    const control = await run(
      "import { cx, Button } from '@acme/ui'\nexport const A = () => [Button, cx('grid')]\n",
      { '@acme/ui': entry },
      { keepFor: KEEP_FLEX },
    )

    expect(control.error).toContain("cxModules: ['@acme/ui']")
  }, 120_000)

  it('a dependency that takes cx as cx from a module with a clearing specifier keeps the cxModules line', async () => {
    const entry = {
      'index.js': "export { cx } from '@navecss/core/cx'\nexport const Button = 'b'\n",
    }
    const kit = { 'index.js': "import { cx } from '@acme/ui'\nexport const kit = cx('grid')\n" }
    const built = await run(
      "import { kit } from '@acme/kit'\nexport const A = kit\n",
      { '@acme/ui': entry, '@acme/kit': kit },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toContain("cxModules: ['@acme/ui']")
  }, 60_000)

  it('stated residual: a second dependency that takes a renamed export is the package’s own call', async () => {
    const modules = withMenu('cn.js', CN)
    const kit = {
      'index.js': "import { cn } from '@acme/ui/cn.js'\nexport const kit = cn('block')\n",
    }
    const built = await run(
      "import { kit } from '@acme/kit'\nexport const A = kit\n",
      { '@acme/ui': modules, '@acme/kit': kit },
      { keepFor: { '@acme/ui': ['block'] } },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('block'))
  }, 60_000)
})
