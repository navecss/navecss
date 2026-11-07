/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-52, the judgement of a package's re-exports of `cx` on
 * the plugin run over core's own `atomic.css`: a package whose `exports` map resolves its name to
 * different files per condition, the words the take line uses for the directory a specifier
 * resolves from, takes by files the build's mode does not bundle, take forms written for the types
 * only, and what the stored record keeps of a problem. The application is `components/App.ts`,
 * imported by the page.
 */
import { describe, expect, it } from 'vitest'

import type { NaveOptions } from '../../src/options.ts'
import type { Read } from '../helpers/used-atoms-fixture.ts'

import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import { dependency, printedList, useUsedAtoms } from '../helpers/used-atoms-fixture.ts'
import { IMPORT } from '../helpers/used-atoms-rows.ts'

registerIsolation()
const { read } = useUsedAtoms()

const CN = "export { cx as cn } from '@navecss/core/cx'\n"
const KEEP_FLEX = { '@acme/ui': ['flex'] } as const
const REEXPORT = "export { cx } from '@navecss/core/cx'\nexport { Button } from './button.js'\n"
const BUTTON = "export const Button = 'b'\n"
const BY_CONDITION = {
  exports: { '.': { 'react-server': './server.js', default: './index.js' } },
}
const BY_CONDITION_FILES = {
  'index.js': REEXPORT,
  'server.js': "export { Button } from './button.js'\n",
  'button.js': BUTTON,
}
const UI = {
  'index.js': "export { Menu } from './menu.js'\n",
  'menu.js': `${IMPORT}export const Menu = (v) => cx('flex', v)\n`,
  'cn.js': CN,
}

type Packages = Record<string, Record<string, string>>

function app(
  code: string,
  packages: Packages,
  options?: NaveOptions,
  extra: Partial<Parameters<typeof read>[0]> = {},
): Promise<Read> {
  return read({
    modules: { 'components/App.ts': code },
    packages,
    importsPackages: false,
    options: options ?? { keepFor: KEEP_FLEX },
    ...extra,
  })
}

const onCn = (code: string): Promise<Read> => app(code, { '@acme/ui': dependency('@acme/ui', UI) })

const acme = (files: Record<string, string>, extra: Record<string, unknown> = {}): Packages => ({
  '@acme/ui': dependency('@acme/ui', files, extra),
})

describe('a package whose entry differs by condition', () => {
  const BUTTON_ONLY = "import { Button } from '@acme/ui'\nexport const A = [Button]\n"

  it('is clear under keepFor when the application takes only Button', async () => {
    const outcome = await app(BUTTON_ONLY, acme(BY_CONDITION_FILES, BY_CONDITION))

    expect(outcome.text).toBe('')
    expect(outcome.report).toBeUndefined()
  })

  it('prints the package name as the cxModules entry when it is not listed', async () => {
    const outcome = await app(BUTTON_ONLY, acme(BY_CONDITION_FILES, BY_CONDITION), {})

    expect(printedList(outcome.text)).toEqual(['@acme/ui'])
    expect(outcome.text).not.toContain('only the package itself imports')
  })

  it('stays an error under keepFor when the application takes cx, with the entry that clears it', async () => {
    const outcome = await app(
      "import { cx, Button } from '@acme/ui'\nexport const A = [Button, cx('grid')]\n",
      acme(BY_CONDITION_FILES, BY_CONDITION),
    )

    expect(outcome.report).toBeDefined()
    expect(printedList(outcome.text)).toEqual(['@acme/ui'])
  })
})

describe('the take line names the directory the host resolves from', () => {
  it('says the directory that holds next.config, never Vite', async () => {
    const outcome = await app(
      "import { cn } from '@acme/ui'\nexport const A = cn('grid')\n",
      acme({ 'index.js': CN }),
    )

    expect(outcome.text).toContain(
      'a specifier that resolves from the directory that holds next.config, from a module that re-exports cx from @navecss/core/cx itself',
    )
    expect(outcome.text).not.toContain('Vite')
  })
})

describe('takes by files the build’s mode does not bundle', () => {
  const MENU_WITH_CX = {
    ...UI,
    'menu.js': `${IMPORT}import './cx.js'\nexport const Menu = (v) => cx('flex', v)\n`,
    'cx.js': "export { cx } from '@navecss/core/cx'\n",
  }
  const APP =
    "import { Menu } from '@acme/ui'\nimport { X } from '@dev/lib'\nexport const A = [Menu, X]\n"
  const devLib = (source: string): Packages => ({
    '@acme/ui': dependency('@acme/ui', MENU_WITH_CX),
    '@dev/lib': {
      'package.json': JSON.stringify({
        name: '@dev/lib',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { development: './src/index.js', default: './dist/index.js' } },
        dependencies: { '@navecss/core': '*' },
      }),
      'dist/index.js': "export const X = 'x'\n",
      'src/index.js': source,
    },
  })
  const TAKES = "import { cx } from '@acme/ui/cx.js'\nexport const X = cx('block')\n"

  it('is clear in production when only the development file of a package takes cx', async () => {
    const outcome = await app(APP, devLib(TAKES))

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })

  it('is clear in production when an application file reached only from the development file takes cx', async () => {
    const outcome = await app(
      APP,
      devLib("import { D } from '../../../../components/devonly.ts'\nexport const X = D\n"),
      undefined,
      {
        files: {
          'components/devonly.ts':
            "import { cx } from '@acme/ui/cx.js'\nexport const D = cx('block')\n",
        },
      },
    )

    expect(outcome.report).toBeUndefined()
  })

  it('is an error in development, which bundles that file', async () => {
    const outcome = await app(APP, devLib(TAKES), undefined, { isDev: true })

    expect(outcome.report).toBeDefined()
  })

  it('is clear when no file takes cx at all', async () => {
    const outcome = await app(APP, devLib("export const X = 'x'\n"))

    expect(outcome.report).toBeUndefined()
  })
})

describe('a package name that resolves only under the development condition', () => {
  const FILES = {
    'a.js': "export { Button } from './button.js'\n",
    'b.js': REEXPORT,
    'button.js': BUTTON,
  }
  const BY_DEVELOPMENT = {
    exports: {
      '.': { development: { 'react-server': './a.js', default: './b.js' } },
      './b.js': './b.js',
    },
  }
  const APP = "import '@acme/ui/b.js'\nimport { cx } from '@acme/ui'\nexport const A = cx('grid')\n"

  it('is clear in production, which bundles no file the name resolves to', async () => {
    const outcome = await app(APP, acme(FILES, BY_DEVELOPMENT))

    expect(outcome.report).toBeUndefined()
  })

  it('is an error in development, which bundles them', async () => {
    const outcome = await app(APP, acme(FILES, BY_DEVELOPMENT), undefined, { isDev: true })

    expect(outcome.report).toBeDefined()
  })
})

describe('take forms written for the types only', () => {
  it.each([
    [
      'an import type beside a value import of the module',
      "import type { cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui/cn.js'\nexport type T = typeof cn\nexport { Menu }\n",
    ],
    [
      'an export type from beside a value import of the module',
      "export type { cn } from '@acme/ui/cn.js'\nimport { Menu } from '@acme/ui/cn.js'\nexport { Menu }\n",
    ],
    [
      'an import used only in a type position',
      "import { cn } from '@acme/ui/cn.js'\nexport type T = typeof cn\n",
    ],
  ])('takes nothing in %s', async (_name, code) => {
    const outcome = await onCn(code)

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })

  it.each([
    ['an import', "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n"],
    ['a require()', "const { cn } = require('@acme/ui/cn.js')\nexport const A = cn('block')\n"],
    [
      'a require() beside an import type of the module',
      "import type { Menu } from '@acme/ui/cn.js'\nconst { cn } = require('@acme/ui/cn.js')\nexport const A = cn('block')\nexport type M = typeof Menu\n",
    ],
    [
      'an import = require() beside an import type of the module',
      "import type { Menu } from '@acme/ui/cn.js'\nimport k = require('@acme/ui/cn.js')\nexport const A = k.cn('block')\nexport type M = typeof Menu\n",
    ],
  ])('still takes cx in %s', async (_name, code) => {
    const outcome = await onCn(code)

    expect(outcome.report).toBeDefined()
    expect(outcome.text).toContain('components/App.ts')
  })

  it('names the take the build cannot read when a require() sits beside an import type', async () => {
    const outcome = await onCn(
      "import type { Menu } from '@acme/ui/cn.js'\nconst { cn } = require('@acme/ui/cn.js')\nexport const A = cn('block')\nexport type M = typeof Menu\n",
    )

    expect(outcome.text).toContain('a require() or other import the build cannot read')
  })
})

describe('a JSX element name is a use of the value it names', () => {
  const CAPITAL = {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `${IMPORT}export const Menu = (v) => cx('flex', v)\n`,
    'cx.js': "export { cx as Cx } from '@navecss/core/cx'\n",
  }
  const onCx = (code: string): Promise<Read> =>
    app(code, acme(CAPITAL), undefined, { modules: { 'components/App.tsx': code } })
  const TYPED = "import { Cx } from '@acme/ui/cx.js'\nexport type T = typeof Cx\n"

  it.each([
    ['an element', `${TYPED}export const A = <Cx />\n`],
    ['an element with children', `${TYPED}export const A = <Cx>x</Cx>\n`],
    ['the object of a member tag', `${TYPED}export const A = <Cx.Sub />\n`],
    [
      'a type reference beside an element',
      "import { Cx } from '@acme/ui/cx.js'\nlet v: Cx\nexport const A = [v, <Cx />]\n",
    ],
    [
      'an element with no type position',
      "import { Cx } from '@acme/ui/cx.js'\nexport const A = <Cx />\n",
    ],
    ['a call beside a type position', `${TYPED}export const A = Cx('block')\n`],
  ])('still takes cx in %s', async (_name, code) => {
    const outcome = await onCx(code)

    expect(outcome.report).toBeDefined()
  })

  it('takes nothing when a type position is the only use', async () => {
    const outcome = await onCx(TYPED)

    expect(outcome.report).toBeUndefined()
  })
})

describe('a member tag written on a namespace import takes that member', () => {
  const CAPITAL = {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `${IMPORT}export const Menu = (v) => cx('flex', v)\n`,
    'cx.js': "export { cx as Cx } from '@navecss/core/cx'\n",
  }
  const NAMESPACE = "import * as UI from '@acme/ui/cx.js'\n"
  const onNamespace = (use: string): Promise<Read> => {
    const code = `${NAMESPACE}export const A = ${use}\n`
    return app(code, acme(CAPITAL), undefined, { modules: { 'components/App.tsx': code } })
  }

  it.each([
    ['a member tag', '<UI.Cx />'],
    ['a member tag of a member', '<UI.Cx.Sub />'],
    ['a call', "UI.Cx('a')"],
  ])('still takes cx in %s', async (_name, use) => {
    const outcome = await onNamespace(use)

    expect(outcome.report).toBeDefined()
  })

  it('takes nothing for a member tag of another member', async () => {
    const outcome = await onNamespace('<UI.Menu />')

    expect(outcome.report).toBeUndefined()
  })
})

describe('a barrel that stars the module and a package that resolves to a file per condition', () => {
  const BARREL = "export * from './cn.js'\nexport * from '@acme/rival'\n"
  const EXPORTS_CN = 'export const cn = 1\n'
  const EXPORTS_OTHER = 'export const other = 1\n'
  const BY_ENVIRONMENT = {
    exports: { '.': { 'react-server': './server.js', default: './client.js' } },
  }
  const CALL = "import { cn } from '@acme/ui'\nexport const A = cn('grid')\n"
  const over = (rival: Record<string, string>, extra: Record<string, unknown>): Packages => ({
    '@acme/ui': dependency('@acme/ui', { 'index.js': BARREL, 'cn.js': CN }),
    '@acme/rival': dependency('@acme/rival', rival, extra),
  })

  it.each([
    [
      'only the file of the default condition',
      { 'client.js': EXPORTS_CN, 'server.js': EXPORTS_OTHER },
    ],
    [
      'only the file of the react-server condition',
      { 'client.js': EXPORTS_OTHER, 'server.js': EXPORTS_CN },
    ],
    ['neither file', { 'client.js': EXPORTS_OTHER, 'server.js': EXPORTS_OTHER }],
  ])('still takes cx when %s exports the name', async (_name, rival) => {
    const outcome = await app(CALL, over(rival, BY_ENVIRONMENT))

    expect(outcome.report).toBeDefined()
  })

  it.each([
    ['every file', BY_ENVIRONMENT, { 'client.js': EXPORTS_CN, 'server.js': EXPORTS_CN }],
    ['the one file', { exports: './client.js' }, { 'client.js': EXPORTS_CN }],
  ])('takes nothing when %s exports the name with another binding', async (_name, extra, rival) => {
    const outcome = await app(CALL, over(rival, extra))

    expect(outcome.report).toBeUndefined()
  })

  describe('through a nested star', () => {
    const NESTED = "export * from './cn.js'\nexport * from './mid.js'\n"
    const nested = (rival: Record<string, string>): Packages => ({
      '@acme/ui': dependency('@acme/ui', {
        'index.js': NESTED,
        'cn.js': CN,
        'mid.js': "export * from '@acme/rival'\n",
      }),
      '@acme/rival': dependency('@acme/rival', rival, BY_ENVIRONMENT),
    })

    it('still takes cx when only one file exports the name', async () => {
      const outcome = await app(
        CALL,
        nested({ 'client.js': EXPORTS_CN, 'server.js': EXPORTS_OTHER }),
      )

      expect(outcome.report).toBeDefined()
    })

    it('takes nothing when every file exports the name with another binding', async () => {
      const outcome = await app(CALL, nested({ 'client.js': EXPORTS_CN, 'server.js': EXPORTS_CN }))

      expect(outcome.report).toBeUndefined()
    })

    it('takes nothing when every file stars a module that exports the name', async () => {
      const outcome = await app(
        CALL,
        nested({
          'client.js': "export * from './shared.js'\n",
          'server.js': "export * from './shared.js'\n",
          'shared.js': EXPORTS_CN,
        }),
      )

      expect(outcome.report).toBeUndefined()
    })
  })
})

describe('type forms beside a value import of the module', () => {
  it('takes nothing for an import of cn as a type that nothing references', async () => {
    const outcome = await onCn(
      "import { type cn, Menu } from '@acme/ui/cn.js'\nexport const A = [Menu]\n",
    )

    expect(outcome.report).toBeUndefined()
  })

  it('takes nothing when cn is used only as the start of a member type query', async () => {
    const outcome = await onCn(
      "import { cn, Menu } from '@acme/ui/cn.js'\nexport type T = typeof cn.x\nexport const A = [Menu]\n",
    )

    expect(outcome.report).toBeUndefined()
  })
})

describe('the stored record of a run', () => {
  it('keeps no module id on its problems', async () => {
    const outcome = await app(
      "import { cn } from '@acme/ui'\nexport const A = cn('grid')\n",
      acme({ 'index.js': CN }),
    )

    expect(outcome.record.problems.length).toBeGreaterThan(0)
    expect(outcome.record.problems.filter((problem) => 'moduleId' in problem)).toEqual([])
  })
})
