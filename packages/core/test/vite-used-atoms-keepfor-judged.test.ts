/**
 * AC-used-atoms-52 covers: R17, as amended for `keepFor` and the exports of `cx` the application
 * takes, for a dependency that only re-exports a `cx` export: it is never a take on the
 * `cxModules` route, and when it re-exports the `cx` of a module `cxModules` lists it is judged by
 * what takes it (a real `vite build` of a scratch app and dependencies).
 */
import { describe, expect, it } from 'vitest'

import { atomLayerAtoms, atoms } from './helpers/used-atoms-app.ts'
import {
  callsThroughLine,
  forwardLine,
  KEEP_FLEX,
  run,
  takenLine,
} from './helpers/used-atoms-keepfor.ts'
import { IMPORT } from './helpers/used-atoms-rows.ts'

const PLAIN = "export { cx } from '@navecss/core/cx'\n"
const MENU_JS = `${IMPORT}export const Menu = (v) => cx('flex', v)\n`
const FORWARD = "export { cx } from '@acme/ui'\n"
const KEEP_BOTH = { ...KEEP_FLEX, '@other/ui': [] } as const
const TAG = "export const Tag = 'tag'\n"

/**
 * The package `@acme/ui` whose entry exports `Menu` and then `extra`, with `files` beside it.
 */
function acme(extra: string, files: Record<string, string> = {}): Record<string, string> {
  return { 'index.js': `export { Menu } from './menu.js'\n${extra}`, 'menu.js': MENU_JS, ...files }
}

const TAKE_CX =
  "import { Menu } from '@acme/ui'\nimport { cx } from '@other/ui'\nexport const A = [Menu, cx('block')]\n"
const FOLLOWED =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"

describe('AC-used-atoms-52 - a dependency that only re-exports a cx export is no take on the cxModules route', () => {
  const origins = [
    ['the entry of the package', { '@acme/ui': acme(PLAIN), '@other/ui': { 'index.js': FORWARD } }],
    [
      'a subpath of the package',
      {
        '@acme/ui': acme('', { 'cx.js': PLAIN }),
        '@other/ui': { 'index.js': "export { cx } from '@acme/ui/cx.js'\n" },
      },
    ],
  ] as const

  describe.each(origins)('when the origin is %s', (_, packages) => {
    it.each([
      ['not listed', KEEP_FLEX],
      ['listed with no atom', KEEP_BOTH],
    ] as const)(
      'fails with the line that names the application file when the forwarding package is %s, and builds green once cx comes from Nave',
      async (__, keepFor) => {
        const first = await run(TAKE_CX, packages, { keepFor })

        expect(first.error!.split('\n')).toContain(takenLine('src/App.ts (cx)'))
        expect(first.error).not.toMatch(/cxModules: \[/)
        const followed = await run(FOLLOWED, packages, { keepFor })

        expect(followed.error).toBeUndefined()
        expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex'))
      },
      120_000,
    )
  })

  it('keeps a dependency that calls through the origin on the cxModules route', async () => {
    const packages = {
      '@acme/ui': acme(PLAIN),
      '@kit/ui': { 'index.js': "import { cx } from '@acme/ui'\nexport const Pill = cx('grid')\n" },
    }
    const code =
      "import { Menu } from '@acme/ui'\nimport { Pill } from '@kit/ui'\nexport const A = [Menu, Pill]\n"
    const first = await run(code, packages, { keepFor: KEEP_FLEX })

    expect(first.error).toContain("cxModules: ['@acme/ui']")
    const pasted = await run(code, packages, { keepFor: KEEP_FLEX, cxModules: ['@acme/ui'] })

    expect(pasted.error).toBeUndefined()
    expect(atomLayerAtoms(pasted.css)).toEqual(atoms('flex', 'grid'))
  }, 120_000)

  it('takes nothing for a forward that nothing takes', async () => {
    const built = await run(
      "import { Menu } from '@acme/ui'\nimport { Tag } from '@other/ui'\nexport const A = [Menu, Tag]\n",
      { '@acme/ui': acme(PLAIN), '@other/ui': { 'index.js': `${FORWARD}${TAG}` } },
      { keepFor: KEEP_FLEX },
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex'))
    expect(built.warnings ?? []).toEqual([])
  }, 60_000)
})

describe('AC-used-atoms-52 - a dependency that re-exports the cx of a module cxModules lists is judged by what takes it', () => {
  const options = { keepFor: KEEP_FLEX, cxModules: ['@acme/ui'] }
  const packages = { '@acme/ui': acme(PLAIN), '@other/ui': { 'index.js': FORWARD } }

  it.each([
    ['not listed', options],
    ['listed with no atom', { ...options, keepFor: KEEP_BOTH }],
  ] as const)(
    'fails with the import line, and no keepFor or cxModules line, when the forwarding package is %s',
    async (_, settings) => {
      const code =
        "import { Menu, cx as k } from '@acme/ui'\nimport { cx } from '@other/ui'\nexport const A = [Menu, k('grid'), cx('block')]\n"
      const first = await run(code, packages, settings)

      expect(first.error!.split('\n')).toContain(
        forwardLine('@other/ui', { listed: 'src/App.ts (cx)' }),
      )
      expect(first.error).not.toContain('keepFor: {')
      expect(first.error).not.toMatch(/cxModules: \[/)
      const followed = await run(
        "import { Menu, cx as k } from '@acme/ui'\nimport { cx } from '@navecss/core/cx'\nexport const A = [Menu, k('grid'), cx('block')]\n",
        packages,
        settings,
      )

      expect(followed.error).toBeUndefined()
      expect(atomLayerAtoms(followed.css)).toEqual(atoms('block', 'flex', 'grid'))
    },
    120_000,
  )

  it('reports nothing for a forward that nothing takes', async () => {
    const built = await run(
      "import { Menu, cx as k } from '@acme/ui'\nimport { Tag } from '@other/ui'\nexport const A = [Menu, k('grid'), Tag]\n",
      { '@acme/ui': acme(PLAIN), '@other/ui': { 'index.js': `${FORWARD}${TAG}` } },
      options,
    )

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
    expect(built.warnings ?? []).toEqual([])
  }, 60_000)

  it('gives the forwarding package the keepFor line when another dependency calls through it', async () => {
    const withCaller = {
      ...packages,
      '@third/ui': {
        'index.js': "import { cx } from '@other/ui'\nexport const Chip = cx('grid')\n",
      },
    }
    const code =
      "import { Menu, cx as k } from '@acme/ui'\nimport { Chip } from '@third/ui'\nexport const A = [Menu, Chip, k('block')]\n"
    const first = await run(code, withCaller, options)

    expect(first.error!.split('\n')).toContain(
      callsThroughLine('@other/ui', ['node_modules/@third/ui/index.js']),
    )
    const listed = await run(code, withCaller, {
      ...options,
      keepFor: { ...KEEP_FLEX, '@other/ui': ['grid'] },
    })

    expect(listed.error).toBeUndefined()
    expect(atomLayerAtoms(listed.css)).toEqual(atoms('block', 'flex', 'grid'))
  }, 120_000)

  it('prints the position of a forward once when it has an application take and a calling dependency', async () => {
    const withCaller = {
      ...packages,
      '@third/ui': {
        'index.js': "import { cx } from '@other/ui'\nexport const Chip = cx('grid')\n",
      },
    }
    const code =
      "import { Menu, cx as k } from '@acme/ui'\nimport { cx } from '@other/ui'\nimport { Chip } from '@third/ui'\nexport const A = [Menu, Chip, k('block'), cx('grid')]\n"
    const built = await run(code, withCaller, options)
    const lines = built.error!.split('\n')

    expect(lines[0]).toMatch(/^1 problem in 1 file/)
    expect(
      lines.filter((line) => line.startsWith('node_modules/@other/ui/index.js:')),
    ).toHaveLength(1)
    expect(lines).toContain(forwardLine('@other/ui', { listed: 'src/App.ts (cx)' }))
    expect(lines).toContain(callsThroughLine('@other/ui', ['node_modules/@third/ui/index.js']))
  }, 60_000)
})
