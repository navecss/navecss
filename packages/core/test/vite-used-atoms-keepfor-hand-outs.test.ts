/**
 * AC-used-atoms-52 covers: R17, as amended for a dependency module that hands Nave's `cx` out
 * without calling it (a real `vite build` of a scratch app and dependencies). A hand-out the build
 * reads to the export it leaves under (an alias chain) is judged by who takes that export, as any
 * `cx` export is; every other hand-out in a listed package stays an error whatever the application
 * imports, and no `keepFor` entry clears it.
 */
import { describe, expect, it } from 'vitest'

import { atomLayerAtoms, atoms } from './helpers/used-atoms-app.ts'
import { KEEP_FLEX, KEEP_NONE, NAVE_APP, run, takenLine } from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const INDEX = "export { Menu } from './menu.js'\n"
const APP_CN = "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n"
const APP_DEFAULT = "import cn from '@acme/ui/cn.js'\nexport const A = cn('block')\n"
const ONLY_MENU = "import { Menu } from '@acme/ui'\nexport const A = [Menu]\n"

/**
 * `@acme/ui` with `cn` as the text of its `cn.js` (or of `file`).
 */
function acme(text: string, file = 'cn.js'): Record<string, Record<string, string>> {
  return { '@acme/ui': { 'index.js': INDEX, 'menu.js': MENU_JS, [file]: text } }
}

/**
 * The lines of an error, or none when the build is green.
 */
function linesOf(error: string | undefined): string[] {
  return error === undefined ? [] : error.split('\n')
}

/**
 * The remedy lines of an error: those after the problem lines.
 */
function remediesOf(error: string | undefined): string[] {
  return linesOf(error).filter((line) => line.startsWith('@acme/ui'))
}

const HAND_OUTS: readonly (readonly [string, string, string, string])[] = [
  ['export const cn = cx', `${IMPORT}export const cn = cx\n`, APP_CN, 'cn'],
  ['const cn = cx; export { cn }', `${IMPORT}const cn = cx\nexport { cn }\n`, APP_CN, 'cn'],
  [
    'const cn = cx; export default cn',
    `${IMPORT}const cn = cx\nexport default cn\n`,
    APP_DEFAULT,
    'the default export',
  ],
]

describe('AC-used-atoms-52 - a hand-out of cx the build reads to its export is judged by who takes the export', () => {
  describe('row 27: listed', () => {
    it.each(HAND_OUTS)('%s fails the application that takes it', async (_, text, app, name) => {
      for (const keepFor of [KEEP_FLEX, KEEP_NONE]) {
        const built = await run(app, acme(text), { keepFor })

        expect(built.error).toMatch(/^1 problem in 1 file/)
        expect(built.error).toContain('node_modules/@acme/ui/cn.js:')
        expect(linesOf(built.error)).toContain(takenLine(`src/App.ts (${name})`))
        expect(built.error).not.toMatch(/cxModules: \[/)
      }
    })

    it.each(HAND_OUTS)('%s builds green once the application calls Nave’s cx', async (_, text) => {
      const flex = await run(NAVE_APP, acme(text), { keepFor: KEEP_FLEX })
      const none = await run(NAVE_APP, acme(text), { keepFor: KEEP_NONE })

      expect(flex.error).toBeUndefined()
      expect(atomLayerAtoms(flex.css)).toEqual(atoms('block', 'flex'))
      // An empty list stands in for calls the build cannot read: the literal call in Menu ships.
      expect(none.error).toBeUndefined()
      expect(atomLayerAtoms(none.css)).toEqual(atoms('block', 'flex'))
    })
  })

  describe('row 28: not listed', () => {
    it.each(HAND_OUTS)(
      '%s carries the import clause beside the keepFor line',
      async (_, text, app) => {
        const built = await run(app, acme(text))
        const line = remediesOf(built.error).find((one) => one.includes('is a dependency'))

        expect(built.error).toMatch(/^1 problem in 1 file/)
        expect(line).toContain("keepFor: { '@acme/ui': ['<atom>'] }")
        expect(line).toContain('@acme/ui also gives cx out under another name')
        expect(line).toContain('import cx from @navecss/core/cx instead and call cx in its place')
      },
    )

    it.each(HAND_OUTS)(
      '%s, with only the keepFor line pasted, fails as row 27 does',
      async (_, text, app) => {
        const listed = await run(app, acme(text), { keepFor: KEEP_FLEX })
        const pasted = await run(app, acme(text), { keepFor: { '@acme/ui': ['flex'] } })

        expect(pasted.error).toBe(listed.error)
        expect(listed.error).toBeDefined()
      },
    )
  })

  describe('row 29: the controls, listed', () => {
    it('is green, with no plugin message, when the application takes only Menu from an entry that also holds export const cn = cx', async () => {
      const packages = {
        '@acme/ui': {
          'index.js': `${IMPORT}export { Menu } from './menu.js'\nexport const cn = cx\n`,
          'menu.js': MENU_JS,
        },
      }
      const built = await run(ONLY_MENU, packages, { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(built.warnings).toEqual([])
    })

    it('fails with the take line when cn.js re-exports cx by name', async () => {
      const built = await run(APP_CN, acme("export { cx as cn } from '@navecss/core/cx'\n"), {
        keepFor: KEEP_FLEX,
      })

      expect(linesOf(built.error)).toContain(takenLine('src/App.ts (cn)'))
    })
  })

  describe('row 30: the stated residual, a wrapper', () => {
    const wrapper = acme(`${IMPORT}export const cn = (...a) => cx(...a)\n`)

    it('is green and ships the listed atom only', async () => {
      const built = await run(APP_CN, wrapper, { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    })

    it('ships the atom once the list holds it', async () => {
      const built = await run(APP_CN, wrapper, { keepFor: { '@acme/ui': ['flex', 'block'] } })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex'))
    })
  })

  describe('row 31: a dependency forwards a cx export through an alias', () => {
    const packages = {
      '@acme/ui': {
        'index.js': INDEX,
        'menu.js': MENU_JS,
        'f.js': "export { cx as cn } from '@navecss/core/cx'\n",
      },
      '@other/ui': {
        'index.js': "import { cn } from '@acme/ui/f.js'\nconst k = cn\nexport { k }\n",
      },
    }
    const app = "import { k } from '@other/ui'\nexport const A = k('block')\n"

    it('fails with the take line naming the application file and k', async () => {
      const built = await run(app, packages, { keepFor: KEEP_FLEX })

      expect(linesOf(built.error)).toContain(takenLine('src/App.ts (k)'))
    })

    it('is green once the application calls Nave’s cx', async () => {
      const built = await run(NAVE_APP, packages, { keepFor: KEEP_FLEX })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('block', 'flex'))
    })
  })

  describe('a hand-out that stays inside the module is the package’s own call', () => {
    it('is green under keepFor, and the application ships what the list names', async () => {
      const built = await run(
        ONLY_MENU,
        {
          '@acme/ui': {
            'index.js': "export { Menu } from './menu.js'\n",
            'menu.js': `${IMPORT}const own = cx\nexport const Menu = (v) => own('flex', v)\n`,
          },
        },
        { keepFor: KEEP_FLEX },
      )

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    })
  })
})

const UNBOUND: readonly (readonly [string, string, string])[] = [
  [
    'obj.cn = cx, obj imported',
    `${IMPORT}import obj from './obj.js'\nobj.cn = cx\nexport { obj }\n`,
    "import { obj } from '@acme/ui/cn.js'\nexport const A = obj.cn('block')\n",
  ],
  [
    'memo(cx)',
    `${IMPORT}const memo = (f) => f\nexport const m = memo(cx)\n`,
    "import { m } from '@acme/ui/cn.js'\nexport const A = m('block')\n",
  ],
  [
    '{ cn: cx }',
    `${IMPORT}export const ui = { cn: cx }\n`,
    "import { ui } from '@acme/ui/cn.js'\nexport const A = ui.cn('block')\n",
  ],
  [
    'cx.bind(null)',
    `${IMPORT}export const cn = cx.bind(null)\n`,
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
  [
    'await import(cx)',
    "const { cx } = await import('@navecss/core/cx')\nexport const cn = cx\n",
    "import { cn } from '@acme/ui/cn.js'\nexport const A = cn('block')\n",
  ],
]

/**
 * The package files an unbound form needs beside its `cn.js`.
 */
const WITH_OBJ = { 'obj.js': 'export default {}\n' }

/**
 * Builds the unbound form with `app` over `@acme/ui`, whose entry also imports `cn.js` for its
 * effect, so the module is in the build whatever the application takes.
 */
function runUnbound(
  text: string,
  app: string,
  options: Parameters<typeof run>[2],
): ReturnType<typeof run> {
  const packages = acme(text)
  Object.assign(packages['@acme/ui']!, WITH_OBJ, {
    'index.js': `import './cn.js'\n${INDEX}`,
  })
  return run(app, packages, options)
}

describe('AC-used-atoms-52 - a hand-out the build cannot read to an export fails closed in a listed package', () => {
  describe('row 32: the application calls through it', () => {
    it.each(UNBOUND)(
      '%s fails with the line that leads to a route the consumer can take',
      async (_, text, app) => {
        const built = await runUnbound(text, app, { keepFor: KEEP_FLEX })
        const problems = linesOf(built.error).filter((line) =>
          line.startsWith('node_modules/@acme/ui/cn.js'),
        )
        const [line] = remediesOf(built.error)

        expect(built.error).toMatch(/^1 problem in 1 file/)
        expect(problems).toHaveLength(1)
        expect(remediesOf(built.error)).toHaveLength(1)
        expect(line).toContain('node_modules/@acme/ui/cn.js')
        expect(line).toContain('the keepFor entry does not stand in for that')
        expect(line).toContain('export it by name')
        expect(line).toContain('whatever your code takes from @acme/ui')
        expect(line).toContain('patched copy')
        expect(line).toMatch(
          /ship every atom: see "Which atoms the build ships" in node_modules\/@navecss\/core\/README\.md\.$/,
        )
        expect(built.error).not.toContain('keepFor: {')
        expect(built.error).not.toContain('cxModules: [')
        expect(built.error).not.toContain("atomic: 'all'")
      },
    )

    it.each(UNBOUND)('%s is green with atomic: all set', async (_, text, app) => {
      const built = await runUnbound(text, app, { keepFor: KEEP_FLEX, atomic: 'all' })

      expect(built.error).toBeUndefined()
    })

    it.each(UNBOUND)('%s names the form it found', async (_, text, app) => {
      const built = await runUnbound(text, app, { keepFor: KEEP_FLEX })
      const [line] = remediesOf(built.error)
      const problem = linesOf(built.error).find((one) =>
        one.startsWith('node_modules/@acme/ui/cn.js'),
      )
      const form = problem!.replace(/^[^ ]+ /, '').replace(/\.(\s.*)?$/su, '')

      expect(line).toContain(`(${form})`)
    })
  })

  describe('row 33: the accepted cost, the application imports only Menu', () => {
    it.each(UNBOUND)('%s fails with the same line', async (_, text, app) => {
      const through = await runUnbound(text, app, { keepFor: KEEP_FLEX })
      const only = await runUnbound(text, ONLY_MENU, { keepFor: KEEP_FLEX })

      expect(only.error).toBeDefined()
      expect(remediesOf(only.error)).toEqual(remediesOf(through.error))
    })
  })

  describe('row 34: the controls, listed', () => {
    it('is green, with no plugin message, for typeof cx and { ...cx }', async () => {
      const built = await runUnbound(
        `${IMPORT}export const kind = typeof cx\nexport const copy = { ...cx }\n`,
        ONLY_MENU,
        { keepFor: KEEP_FLEX },
      )

      expect(built.error).toBeUndefined()
      expect(built.warnings).toEqual([])
    })

    it('gives cx as Cx the result of row 27 for its export', async () => {
      const text = `${IMPORT}type Cx = typeof cx\nexport const cn = cx as Cx\n`
      const built = await run(
        "import { cn } from '@acme/ui/cn.ts'\nexport const A = cn('block')\n",
        acme(text, 'cn.ts'),
        { keepFor: KEEP_FLEX },
      )

      expect(linesOf(built.error)).toContain(takenLine('src/App.ts (cn)'))
    })

    it('gives a two-step alias the result of row 27 for its export', async () => {
      const built = await run(
        "import { b } from '@acme/ui/cn.js'\nexport const A = b('block')\n",
        acme(`${IMPORT}const a = cx\nconst b = a\nexport { b }\n`),
        { keepFor: KEEP_FLEX },
      )

      expect(linesOf(built.error)).toContain(takenLine('src/App.ts (b)'))
    })

    it('is green when a listed package imports cx dynamically and only calls it: the calls are its own', async () => {
      const built = await runUnbound(
        "const { cx } = await import('@navecss/core/cx')\nexport const f = (v) => cx('grid', v)\n",
        ONLY_MENU,
        { keepFor: KEEP_FLEX },
      )

      expect(built.error).toBeUndefined()
      expect(built.warnings).toEqual([])
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    })

    it('fails closed for an alias that is written to after its declaration', async () => {
      const built = await runUnbound(
        `${IMPORT}let a = cx\na = 'x'\nexport { a }\n`,
        "import { a } from '@acme/ui/cn.js'\nexport const A = a('block')\n",
        { keepFor: KEEP_FLEX },
      )

      expect(remediesOf(built.error)).toHaveLength(1)
      expect(remediesOf(built.error)[0]).toContain('does not stand in')
    })
  })

  describe('the application’s own use of cx is printed as before', () => {
    it.each([
      ['an assignment', `${IMPORT}export const cn = cx\n`, 'cx is assigned to cn.'],
      [
        'a value passed',
        `${IMPORT}export const m = [1].map(cx)\n`,
        'cx is passed to map() as a value instead of being called.',
      ],
    ])('for %s', async (_, text, phrase) => {
      const built = await run(text, {}, { keepFor: KEEP_FLEX })
      const lines = linesOf(built.error)

      expect(lines[0]).toMatch(/^1 problem in 1 file/)
      expect(lines[1]).toMatch(/^src\/App\.ts:\d+:\d+: /)
      expect(lines[1]!.endsWith(phrase)).toBe(true)
      expect(lines.join('\n')).not.toContain('node_modules')
    })
  })
})
