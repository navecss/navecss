/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-16 (a problem in dependency code names the package and
 * prints the consumer's `keepFor` line), -19 (`cx.dynamic()` with no list), -43 (what `keepFor`
 * covers), -44 (`keepFor` reaches `node_modules` only), -45 (its validation) and -55 (the remedy
 * block split by owner) on the plugin run over core's own `atomic.css`. The dev clauses read through
 * the dev report: `next dev` prints every problem the build reports, a dependency's included, so the
 * clauses "no dev error names <package>" are inverted here.
 */
/* eslint-disable vitest/no-disabled-tests -- the skipped rows are the ones for a part the plugin does not do yet; each is explained where it is skipped */
import { atoms as builtInAtoms } from '@navecss/core/atoms'
import { cx } from '@navecss/core/cx'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Scenario } from '../helpers/used-atoms-fixture.ts'

import { withNave } from '../../src/index.ts'
import { sorted } from '../helpers/graph-fixture.ts'
import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import {
  dependency,
  fileOf,
  nave,
  remedyLinesOf,
  useUsedAtoms,
} from '../helpers/used-atoms-fixture.ts'
import { IMPORT } from '../helpers/used-atoms-rows.ts'

/**
 * Rows for a part the plugin does not do yet: which application files take a `cx` that a package
 * re-exports, so that a package exporting `cx` under another name, as a default or as a namespace,
 * fails the build for the files that take it, and the report offers `cxModules` for a package whose
 * entry re-exports it. They stay in the file, as `it.skip`, until that part is built.
 */

registerIsolation()
const { read } = useUsedAtoms()

const ALL_ATOMS = Object.keys(builtInAtoms) as (keyof typeof builtInAtoms)[]
const DEV_CLOSING =
  'next build stops on these. The dev server keeps serving, without rules for atoms that only these calls apply.'

describe('AC-nextjs-used-atoms-17: AC-used-atoms-16, a problem in dependency code names the package and prints the keepFor line', () => {
  const badLib = [
    IMPORT.trim(),
    '',
    'export const t = (v) => cx(v)',
    '',
    "export const u = cx('interactve')",
    '',
    'export const w = [1].map(cx)',
    '',
  ].join('\n')
  const scenario: Scenario = {
    packages: { 'bad-lib': dependency('bad-lib', { 'index.js': badLib }) },
  }

  it('fails with three problems in the package’s file and one line for bad-lib, ready to paste', async () => {
    const outcome = await read(scenario)
    const line = outcome.remedies.find((text) => text.startsWith('bad-lib is a dependency'))

    expect(outcome.first).toMatch(/^3 problems in 1 file: /u)
    expect(outcome.problems).toHaveLength(3)
    expect(outcome.problems.map((text) => text.split(': ', 1)[0])).toEqual([
      'node_modules/bad-lib/index.js:3:28',
      'node_modules/bad-lib/index.js:5:21',
      'node_modules/bad-lib/index.js:7:26',
    ])
    expect(line).toContain("keepFor: { 'bad-lib': ['<atom>'] }")
    expect(line).toContain('not yours to change')
    expect(line).toContain("The lasting fix is the package's")
    expect(line).toContain('cx.dynamic()')
    expect(outcome.text).not.toContain('keep alone')
    expect(outcome.text).not.toContain('navePlugin()')
  })

  it('with keep listing every built-in atom, the same three problems stand (keep is not the remedy)', async () => {
    const outcome = await read({ ...scenario, options: { keep: ALL_ATOMS } })

    expect(outcome.first).toMatch(/^3 problems in 1 file: /u)
  })

  it('the printed line pasted unchanged fails withNave() with the unknown-atom text, and with the placeholder filled it is green', async () => {
    expect(() => withNave({}, { keepFor: { 'bad-lib': ['<atom>' as never] } })).toThrow(
      'withNave(): keepFor["bad-lib"] names an unknown atom "<atom>"',
    )
    const outcome = await read({ ...scenario, options: { keepFor: { 'bad-lib': ['flex'] } } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })

  it('in dev the terminal prints bad-lib’s three problems in one report (the clause read through the dev report)', async () => {
    const outcome = await read({ ...scenario, isDev: true })

    expect(outcome.printed.errors).toHaveLength(1)
    expect(outcome.printed.errors[0]).toMatch(/^3 problems in 1 file: /u)
    expect(outcome.printed.errors[0]).toContain('node_modules/bad-lib/index.js:3:')
    expect(outcome.printed.errors[0]!.endsWith(DEV_CLOSING)).toBe(true)
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-19, cx.dynamic() with no list is a build error, split by owner', () => {
  const tone = [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export function Tone(tone) {',
    '  const a = cx.dynamic(tone)',
    '  return a',
    '}',
    'export function Tone2(tone) {',
    '  return cx.dynamic(tone)',
    '}',
    '',
  ].join('\n')
  const scenario: Scenario = {
    modules: { 'components/Tone.tsx': tone },
    packages: {
      'dyn-lib': dependency('dyn-lib', {
        'index.js': `${IMPORT}export const x = (t) => cx.dynamic(t)\n`,
      }),
    },
  }
  const app = 'cx.dynamic() is called in 2 places in your code, but keep is empty'

  it.each([
    ['keep absent', {}],
    ['keep: []', { keep: [] }],
  ])(
    'with %s the application problem counts 2 calls, one line each, none in dyn-lib',
    async (_name, options) => {
      const outcome = await read({ ...scenario, options })

      expect(outcome.text).toContain(app)
      expect(
        outcome.problems.filter((line) => line.startsWith('components/Tone.tsx:')),
      ).toHaveLength(2)
      expect(
        outcome.problems.filter((line) => line.startsWith('components/Tone.tsx:4:')),
      ).toHaveLength(1)
      expect(
        outcome.problems.filter((line) => line.startsWith('components/Tone.tsx:8:')),
      ).toHaveLength(1)
      expect(outcome.problems.some((line) => line.startsWith('node_modules/dyn-lib/'))).toBe(true)
    },
  )

  it('gives dyn-lib the consumer’s remedy alone, and clears each half with its own list', async () => {
    const keepOnly = await read({ ...scenario, options: { keep: ['flex'] } })
    const keepForOnly = await read({ ...scenario, options: { keepFor: { 'dyn-lib': ['flex'] } } })
    const both = await read({
      ...scenario,
      options: { keep: ['flex'], keepFor: { 'dyn-lib': ['flex'] } },
    })

    expect(keepOnly.text).toMatch(
      /dyn-lib calls cx\.dynamic\(\) in 1 place, and keepFor lists no atoms for it, so none of them applies a class\./u,
    )
    expect(keepOnly.problems.every((line) => line.startsWith('node_modules/dyn-lib/'))).toBe(true)
    expect(keepOnly.text).not.toContain('lasting fix')
    expect(keepOnly.text).not.toContain('in your code')
    expect(keepForOnly.text).toContain(app.replace('Tone', 'Tone'))
    expect(keepForOnly.text).not.toContain('dyn-lib calls')
    expect(both.report).toBeUndefined()
  })

  it('reads an empty keepFor list as no entry: the dependency problem stays, as with no entry', async () => {
    const withoutEntry = await read({ ...scenario, options: { keep: ['flex'] } })
    const emptyList = await read({
      ...scenario,
      options: { keep: ['flex'], keepFor: { 'dyn-lib': [] } },
    })

    expect(emptyList.first).toMatch(/^1 problem in 1 file: /u)
    expect(emptyList.text).toBe(withoutEntry.text)
    expect(emptyList.text).toMatch(/dyn-lib calls cx\.dynamic\(\) in 1 place/u)
    expect(emptyList.text).not.toContain('in your code')
  })

  it('a report holding only the dyn-lib problem does not open its remedy block with an application line; with both problems it does', async () => {
    const dependencyOnly = await read({ ...scenario, options: { keep: ['flex'] } })
    const both = await read(scenario)

    expect(dependencyOnly.remedies[0]).toMatch(/^dyn-lib /u)
    expect(dependencyOnly.text).not.toContain('Name the atoms at the call')
    expect(both.remedies[0]).toMatch(/^cx\.dynamic\(\) is called in 2 places in your code/u)
  })

  it('on the dev terminal, the application problem and dyn-lib’s are in one report (the clause read through the dev report)', async () => {
    const outcome = await read({ ...scenario, isDev: true })

    expect(outcome.printed.errors).toHaveLength(1)
    expect(outcome.printed.errors[0]).toContain(app)
    expect(outcome.printed.errors[0]).toContain('node_modules/dyn-lib/index.js:')
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-43, what listing a package in keepFor covers, and what stays an error', () => {
  const rows: Record<string, string> = {
    'index.js':
      "import './unreadable.js'\nimport './typo.js'\nimport './passed.js'\nimport './dist/cx.js'\nimport './dyn-import.js'\nimport './pieces.js'\nimport './readable.js'\nimport './literal.js'\n",
    'unreadable.js': `${IMPORT}export const a = (v) => cx(v)\n`,
    'typo.js': `${IMPORT}export const b = cx('interactve')\n`,
    'passed.js': `${IMPORT}export const c = [1].map(cx)\n`,
    'dist/cx.js': "export { cx } from '@navecss/core/cx'\n",
    'dyn-import.js': "import '@navecss/core/cx'\nexport const d = import('@navecss/core/cx')\n",
    'pieces.js': `${IMPORT}export const e = (t) => 'nave-' + t\nexport const f = cx('flex')\n`,
    'readable.js': `${IMPORT}export const g = cx('gap')\n`,
    'literal.js': "export const h = 'nave-truncate'\n",
  }
  const scenario: Scenario = {
    modules: { 'components/App.ts': `${IMPORT}export const own = cx('flex')\n` },
    packages: { 'wide-lib': dependency('wide-lib', rows) },
  }

  it('without the entry it fails with six dependency problems, the re-export row printing no cxModules line and the package its keepFor line once', async () => {
    const outcome = await read(scenario)

    expect(outcome.first).toMatch(/^6 problems in 6 files: /u)
    expect(outcome.text).toContain('wide-lib')
    expect(outcome.text).not.toMatch(/cxModules: \[/u)
    expect(outcome.text.match(/keepFor: \{ 'wide-lib'/gu)).toHaveLength(1)
    expect(outcome.problems.every((line) => line.startsWith('node_modules/wide-lib/'))).toBe(true)
  })

  it('with the entry it is green and the layer holds block, gap and truncate besides the application’s own', async () => {
    const outcome = await read({ ...scenario, options: { keepFor: { 'wide-lib': ['block'] } } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(['flex', 'block', 'gap', 'truncate']))
  })

  it('in the browser, cx(interactve) from wide-lib passes the name through, as without the plugin', () => {
    expect(cx('interactve' as never)).toBe('interactve')
  })

  it('a keepFor entry that names an unknown atom still fails withNave() with the hint', () => {
    expect(() => withNave({}, { keepFor: { 'wide-lib': ['interactve' as never] } })).toThrow(
      'keepFor["wide-lib"] names an unknown atom "interactve". Did you mean "interactive"?',
    )
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-44, keepFor reaches packages under node_modules only', () => {
  const unreadable = `${IMPORT}export const u = (v) => cx(v)\n`

  /**
   * `@acme/ui` laid out as pnpm lays it out, `plain-lib`, and a workspace package linked into
   * `node_modules`; the page imports all three.
   */
  const scenario: Scenario = {
    packages: { 'plain-lib': dependency('plain-lib', { 'index.js': unreadable }) },
    imports: ['@acme/ui', '@acme/ws-ui'],
    setup(project) {
      const pnpm = path.join(project.dir, 'node_modules/.pnpm/@acme+ui@1.2.0/node_modules/@acme/ui')
      mkdirSync(path.join(pnpm, 'dist'), { recursive: true })
      writeFileSync(
        path.join(pnpm, 'package.json'),
        JSON.stringify({
          name: '@acme/ui',
          version: '1.2.0',
          type: 'module',
          main: './dist/index.js',
          dependencies: { '@navecss/core': '*' },
        }),
      )
      writeFileSync(path.join(pnpm, 'dist/package.json'), '{ "type": "module" }')
      writeFileSync(path.join(pnpm, 'dist/index.js'), unreadable)
      mkdirSync(path.join(project.dir, 'node_modules/@acme'), { recursive: true })
      symlinkSync(pnpm, path.join(project.dir, 'node_modules/@acme/ui'), 'dir')
      const workspace = path.join(project.dir, 'packages/ws-ui')
      mkdirSync(workspace, { recursive: true })
      writeFileSync(
        path.join(workspace, 'package.json'),
        nave('@acme/ws-ui', { main: './index.js' }),
      )
      writeFileSync(path.join(workspace, 'index.js'), unreadable)
      symlinkSync(workspace, path.join(project.dir, 'node_modules/@acme/ws-ui'), 'dir')
    },
  }

  it('names @acme/ui and plain-lib as dependencies, and the workspace package as the application’s with no keepFor line', async () => {
    const outcome = await read(scenario)

    expect(outcome.first).toMatch(/^3 problems in 3 files: /u)
    expect(outcome.remedies.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(true)
    expect(outcome.remedies.some((line) => line.startsWith('plain-lib is a dependency'))).toBe(true)
    expect(outcome.problems.some((line) => line.startsWith('packages/ws-ui/index.js:'))).toBe(true)
    expect(outcome.text).not.toContain('.pnpm/@acme+ui@1.2.0 is a dependency')
    expect(
      outcome.remedies.filter((line) => line.includes('keepFor') && line.includes('ws-ui')),
    ).toEqual([])
    expect(outcome.problems.some((line) => line.includes('/dist/'))).toBe(true)
  })

  it('control: the same pnpm layout without the nested dist/package.json names @acme/ui as a dependency', async () => {
    const outcome = await read({
      ...scenario,
      setup(project) {
        scenario.setup!(project)
        rmSync(
          path.join(
            project.dir,
            'node_modules/.pnpm/@acme+ui@1.2.0/node_modules/@acme/ui/dist/package.json',
          ),
        )
      },
    })

    expect(outcome.remedies.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(true)
  })

  it('a nested manifest with an empty name is no more the package than one with no name', async () => {
    const emptyName: Scenario = {
      ...scenario,
      setup(project) {
        scenario.setup!(project)
        writeFileSync(
          path.join(
            project.dir,
            'node_modules/.pnpm/@acme+ui@1.2.0/node_modules/@acme/ui/dist/package.json',
          ),
          '{ "name": "", "type": "module" }',
        )
      },
    }
    const outcome = await read(emptyName)
    const listed = await read({ ...emptyName, options: { keepFor: { '@acme/ui': ['flex'] } } })

    expect(outcome.remedies.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(true)
    expect(listed.problems.some((line) => line.includes('/dist/'))).toBe(false)
  })

  it('listing all three stops the two dependencies’ problems and never the workspace package’s', async () => {
    const listed = await read({
      ...scenario,
      options: {
        keepFor: { '@acme/ui': ['flex'], 'plain-lib': ['flex'], '@acme/ws-ui': ['flex'] },
      },
    })

    expect(listed.first).toMatch(/^1 problem in 1 file: /u)
    expect(listed.problems.map((line) => fileOf(line))).toEqual(['packages/ws-ui/index.js'])
  })

  it('keyed by the root package’s own name, every application problem stands', async () => {
    const rooted = await read({ ...scenario, options: { keepFor: { app: ['flex'] } } })

    expect(rooted.problems.some((line) => line.startsWith('packages/ws-ui/index.js:'))).toBe(true)
  })

  it('a mistyped key is not validated: no message names it and the @acme/ui problem stands', async () => {
    const wrongKey = await read({ ...scenario, options: { keepFor: { '@acme/uii': ['flex'] } } })

    expect(wrongKey.remedies.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(true)
    expect(wrongKey.text).not.toContain('@acme/uii')
    expect(wrongKey.printed.warnings).toEqual([])
  })

  it('on the dev terminal, the report names @acme/ui, plain-lib and the workspace package (the inverted clause)', async () => {
    const outcome = await read({ ...scenario, isDev: true })

    expect(outcome.printed.errors).toHaveLength(1)
    const [printed] = outcome.printed.errors
    expect(printed).toMatch(/^3 problems in 3 files: /u)
    expect(printed).toContain('@acme/ui is a dependency')
    expect(printed).toContain('plain-lib is a dependency')
    expect(printed).toContain('packages/ws-ui/index.js:')
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-45, keepFor entries are validated as keep is, and typed readonly', () => {
  const extend = { brandBox: { declarations: { color: 'red' } } }

  it('an empty list is accepted, and a build with it is green with no plugin message', async () => {
    expect(() => withNave({}, { keepFor: { '@acme/ui': [] } })).not.toThrow()
    const outcome = await read({ options: { keepFor: { '@acme/ui': [] } } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.errors).toEqual([])
    expect(outcome.printed.warnings).toEqual([])
  })

  it.each([
    [
      'names an unknown atom',
      ['sr-only'],
      'withNave(): keepFor["@acme/ui"] names an unknown atom "sr-only". Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.',
    ],
    [
      'names an atom of the consumer’s own',
      ['brandBox'],
      'withNave(): keepFor["@acme/ui"] names "brandBox", an atom of your own; those have no class, so there is nothing to keep.',
    ],
  ])('an entry that %s fails when withNave() is called', (_name, list, text) => {
    expect(() => withNave({}, { extend, keepFor: { '@acme/ui': list as never } })).toThrow(text)
  })

  it('a key naming no package anywhere builds green with no plugin message', async () => {
    const outcome = await read({ options: { keepFor: { '@acme/ui': ['flex'] } } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
    expect(outcome.printed.errors).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-55, the remedy block is split by owner', () => {
  const scenario: Scenario = {
    modules: {
      'components/Card.tsx': `${IMPORT}export const v = (variant) => cx(variant)\n`,
      'components/U.tsx': `${IMPORT}export const u = cx('legacy-card')\n`,
    },
    packages: {
      'zz-lib': dependency('zz-lib', { 'index.js': `${IMPORT}export const z = (v) => cx(v)\n` }),
      'aa-lib': dependency('aa-lib', { 'index.js': `${IMPORT}export const a = [1].map(cx)\n` }),
      '@acme/ds': dependency('@acme/ds', {
        'index.js': "export { cx } from '@navecss/core/cx'\n",
      }),
    },
  }

  it('prints the application lines, then each package’s in name order, then Available last', async () => {
    const outcome = await read(scenario)
    const owners = outcome.remedies.map((line) => line.split(' ', 1)[0])

    expect(outcome.first).toMatch(
      /^5 problems in 5 files: the build cannot tell which atoms these apply/u,
    )
    expect(outcome.first).not.toMatch(/atomic|'used'|keepFor/u)
    expect(outcome.remedies[0]).toMatch(/^Name the atoms at the call/u)
    expect(owners.indexOf('@acme/ds')).toBeGreaterThan(0)
    expect(owners.indexOf('@acme/ds')).toBeLessThan(owners.indexOf('aa-lib'))
    expect(owners.indexOf('aa-lib')).toBeLessThan(owners.indexOf('zz-lib'))
    expect(outcome.remedies.at(-1)).toMatch(/^Available: /u)
    expect(outcome.remedies.slice(0, 3).join('\n')).not.toContain('keepFor')
    expect(outcome.text).not.toContain("atomic: 'all'")
    expect(outcome.remedies.find((line) => line.startsWith('aa-lib'))).toContain(
      "keepFor: { 'aa-lib': ['<atom>'] }",
    )
    expect(outcome.remedies.find((line) => line.startsWith('zz-lib'))).toContain(
      "keepFor: { 'zz-lib': ['<atom>'] }",
    )
  })

  it.skip('a package whose entry re-exports cx gets its cxModules line, not a keepFor line', async () => {
    const outcome = await read(scenario)

    expect(outcome.remedies.find((line) => line.startsWith('@acme/ds'))).toBe(
      "@acme/ds re-exports cx in '@acme/ds'. List it in withNave(): cxModules: ['@acme/ds'].",
    )
  })

  it('with the two application modules removed, the block opens with @acme/ds’s line and holds no application line', async () => {
    const outcome = await read({ packages: scenario.packages! })

    expect(outcome.first).toMatch(/^3 problems in 3 files: /u)
    expect(remedyLinesOf(outcome.text)[0]).toMatch(/^@acme\/ds /u)
    expect(outcome.text).not.toContain('Name the atoms at the call')
  })

  it('with U removed Available is absent, and with aa-lib calling cx(legacy-card) instead it stays absent', async () => {
    const { 'components/U.tsx': _removed, ...withoutU } = scenario.modules!
    const noU = await read({ ...scenario, modules: withoutU })
    const inDependency = await read({
      modules: withoutU,
      packages: {
        ...scenario.packages,
        'aa-lib': dependency('aa-lib', {
          'index.js': `${IMPORT}export const a = cx('legacy-card')\n`,
        }),
      },
    })

    expect(noU.text).not.toContain('Available:')
    expect(inDependency.text).not.toContain('Available:')
    expect(inDependency.first).toMatch(/^4 problems in 4 files: /u)
  })

  it('control: the full report holds the Available line and the application line', async () => {
    const outcome = await read(scenario)

    expect(outcome.text).toContain('Available: ')
    expect(outcome.text).toContain('Name the atoms at the call')
  })
})
