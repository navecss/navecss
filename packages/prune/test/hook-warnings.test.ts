/**
 * Warnings the check prints when the record is current: the build read no use of an atom, and the
 * build met Markdown or MDX files it does not read. Each is one call, printed before the check
 * fails or passes, and none is printed for a record that stopped the build earlier.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { atomsIn } from './helpers/layer.ts'
import {
  makeProject,
  pageCalling,
  registerIsolation,
  unreadableLibrary,
} from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const KF_PAGE =
  "import { look } from 'kf-lib'\n\nexport default function Page() {\n  return <div className={look('x')} />\n}\n"
const KEEP_FOR: NaveOptions = { keepFor: { 'kf-lib': ['block'] } }
const ACCESSIBILITY_WORDS = /focus|screen reader|accessib/iu

interface Printed {
  readonly error: Error | undefined
  readonly errors: string[]
  readonly warnings: string[]
  /**
   * The order of the calls to `console.warn` and `console.error`, as `warn` or `error`.
   */
  readonly order: string[]
}

/**
 * One text per call: the arguments of the call joined.
 */
function linesOf(calls: readonly (readonly unknown[])[]): string[] {
  return calls.map((call) => call.map(String).join(' '))
}

/**
 * Runs the check and returns what it threw and what it printed.
 */
async function check(project: Project, options: NaveOptions): Promise<Printed> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors.mockClear()
  warnings.mockClear()
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project), options, {})
  } catch (error_) {
    error = error_ as Error
  }
  const order = [
    ...warnings.mock.invocationCallOrder.map((at) => ({ at, name: 'warn' })),
    ...errors.mock.invocationCallOrder.map((at) => ({ at, name: 'error' })),
  ]
    .toSorted((a, b) => a.at - b.at)
    .map((call) => call.name)
  return {
    error,
    errors: linesOf(errors.mock.calls),
    warnings: linesOf(warnings.mock.calls),
    order,
  }
}

/**
 * Runs the plugin (its own printing is silenced) and writes the CSS it left as the build's output.
 * Returns the atoms the layer holds.
 */
async function built(
  project: Project,
  options: NaveOptions,
  others: readonly Sheet[] = [],
): Promise<string[]> {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const result = await runAtomic(project, others, { options })
  writeBuildCss(project, result.css)
  return atomsIn(result.css)
}

/**
 * A site that holds content only: a page that calls no `cx()` and imports one library whose only
 * call is `cx(v)`.
 */
function contentProject(files: Record<string, string> = {}): Project {
  const project = makeProject({ 'app/page.tsx': KF_PAGE, ...files })
  project.install('kf-lib', unreadableLibrary())
  return project
}

/**
 * Expects the one warning that says the build read no use of an atom.
 */
function expectReadsNoUseWarning(printed: Printed): void {
  expect(printed.warnings).toHaveLength(1)
  const [warning = ''] = printed.warnings
  expect(warning).toContain('read no use')
  expect(warning).toContain('#what-it-cannot-see')
  expect(warning).not.toMatch(ACCESSIBILITY_WORDS)
}

describe('AC-nextjs-used-atoms-30: a build that reads no use warns once', () => {
  it('AC-nextjs-used-atoms-30: the content-only site passes with one warning and a layer of block', async () => {
    const project = contentProject()
    expect(await built(project, KEEP_FOR)).toEqual(['block'])
    const printed = await check(project, KEEP_FOR)
    expectReadsNoUseWarning(printed)
    expect(printed.error).toBeUndefined()
    expect(printed.errors).toEqual([])
  })

  it('AC-nextjs-used-atoms-30: with the library and keepFor removed, the empty layer still warns', async () => {
    const project = makeProject({
      'app/page.tsx': 'export default function Page() {\n  return <div />\n}\n',
    })
    expect(await built(project, {})).toEqual([])
    const printed = await check(project, {})
    expectReadsNoUseWarning(printed)
    expect(printed.error).toBeUndefined()
  })

  it('AC-nextjs-used-atoms-30: keepFor srOnly holds srOnly and srOnlyFocusable and the warning still prints', async () => {
    const project = contentProject()
    const options: NaveOptions = { keepFor: { 'kf-lib': ['srOnly'] } }
    expect(await built(project, options)).toEqual(['srOnly', 'srOnlyFocusable'])
    const printed = await check(project, options)
    expectReadsNoUseWarning(printed)
    expect(printed.error).toBeUndefined()
  })
})

describe('AC-nextjs-used-atoms-30: each single use of an atom silences the warning', () => {
  const globals: Sheet = { css: '.card { @nave flex; }\n', file: 'app/globals.css' }
  const cases: [string, NaveOptions, Record<string, string>, Sheet[]][] = [
    ['keep: ["flex"]', { ...KEEP_FOR, keep: ['flex'] }, {}, []],
    [
      'a page calling cx("flex")',
      KEEP_FOR,
      {
        'app/page.tsx': `import { look } from 'kf-lib'\nimport { cx } from '@navecss/core/cx'\n\nexport default function Page() {\n  return <div className={cx('flex', look('x'))} />\n}\n`,
      },
      [],
    ],
    [
      'a module holding the text "nave-flex"',
      KEEP_FOR,
      {
        'app/label.ts': "export const label = 'nave-flex'\n",
        'app/page.tsx': `import './label'\n${KF_PAGE}`,
      },
      [],
    ],
    ['an @nave use in a stylesheet', KEEP_FOR, {}, [globals]],
  ]

  it.each(cases)(
    'AC-nextjs-used-atoms-30: %s prints no warning',
    async (_name, options, files, others) => {
      const project = contentProject(files)
      await built(project, options, others)
      expect(recordOf(project).readsNoUse).toBe(false)
      const printed = await check(project, options)
      expect(printed).toMatchObject({ error: undefined, errors: [], warnings: [] })
    },
  )
})

describe('AC-nextjs-used-atoms-16: Markdown and MDX files met are listed in one warning', () => {
  const FILES = {
    'app/page.tsx': `import { cx } from '@navecss/core/cx'\nimport Note from '@/components/Note.mdx'\nimport Read from '@/components/Read.md'\n\nvoid Note\nvoid Read\n\nexport default function Page() {\n  return <div className={cx('flex')} />\n}\n`,
    'app/docs/page.mdx': "import OnlyMdx from '@/components/OnlyMdx'\n\n# Docs\n\n<OnlyMdx />\n",
    'components/Note.mdx': '# Note\n',
    'components/Read.md': '# Read\n',
    'components/OnlyMdx.tsx': pageCalling("'grid'"),
  }

  it('AC-nextjs-used-atoms-16: one warning lists the three files, root-relative and sorted, and no other file', async () => {
    const project = makeProject(FILES)
    expect(await built(project, {})).toEqual(['flex'])
    expect(recordOf(project).markdown).toEqual([
      'app/docs/page.mdx',
      'components/Note.mdx',
      'components/Read.md',
    ])
    const printed = await check(project, {})
    expect(printed.error).toBeUndefined()
    expect(printed.warnings).toHaveLength(1)
    const [warning = ''] = printed.warnings
    const listed = ['app/docs/page.mdx', 'components/Note.mdx', 'components/Read.md']
    const places = listed.map((file) => warning.indexOf(file))
    expect(places.every((place) => place >= 0)).toBe(true)
    expect(places).toEqual(places.toSorted((a, b) => a - b))
    expect(warning).not.toContain('components/OnlyMdx.tsx')
    expect(warning).not.toContain('app/page.tsx')
    expect(printed.errors).toEqual([])
  })

  it('AC-nextjs-used-atoms-16: control, without any Markdown or MDX file no warning prints', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    await built(project, {})
    expect(recordOf(project).markdown).toEqual([])
    expect(await check(project, {})).toMatchObject({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-16: a build that also reads no use prints two warnings, one call each', async () => {
    const project = contentProject({
      'app/page.tsx': `import Note from '@/components/Note.mdx'\n${KF_PAGE}\nvoid Note\n`,
      'components/Note.mdx': '# Note\n',
    })
    await built(project, KEEP_FOR)
    expect(recordOf(project).markdown).toEqual(['components/Note.mdx'])
    const printed = await check(project, KEEP_FOR)
    expect(printed.warnings).toHaveLength(2)
    expect(printed.warnings.filter((warning) => warning.includes('read no use'))).toHaveLength(1)
    expect(
      printed.warnings.filter((warning) => warning.includes('components/Note.mdx')),
    ).toHaveLength(1)
  })
})

describe('AC-nextjs-used-atoms-30: when the warnings print', () => {
  it('AC-nextjs-used-atoms-30: a stale record prints no warning, only the message that stops the build', async () => {
    const project = contentProject()
    await built(project, KEEP_FOR)
    expectReadsNoUseWarning(await check(project, KEEP_FOR))

    appendFileSync(path.join(project.dir, 'app/page.tsx'), '\n// changed\n')
    const printed = await check(project, KEEP_FOR)
    expect(printed.error).toBeInstanceOf(Error)
    expect(printed.warnings).toEqual([])
    expect(printed.errors).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-30: the warning is printed before the report that fails the build', async () => {
    // The library's call cannot be read and nothing is listed for it: a problem, and no use read.
    const project = contentProject()
    await built(project, {})
    expect(recordOf(project).problems.length).toBeGreaterThan(0)

    const printed = await check(project, {})
    expect(printed.error).toBeInstanceOf(Error)
    expectReadsNoUseWarning(printed)
    expect(printed.errors).toHaveLength(1)
    expect(printed.errors[0]).toContain(REPORT_CAUSE)
    expect(printed.order).toEqual(['warn', 'error'])
  })
})
