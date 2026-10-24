import { buildReport, REPORT_CAUSE } from '@navecss/core/collect'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

/**
 * What the promise rejects with, or `undefined` when it resolves.
 */
async function failureOf(task: Promise<void>): Promise<unknown> {
  try {
    await task
  } catch (error) {
    return error
  }
}

const CX_IMPORT = "import { cx } from '@navecss/core/cx'"
const POSITION = /^\S+:\d+:\d+: /u

// Lines 1 to 8 hold the imports, a multi-line type and a multi-line interface; the call is on line 9.
const CARD = [
  `${CX_IMPORT}; import { o } from '../components/Only'`,
  'type AtomName =',
  "  | 'flex'",
  "  | 'grid'",
  'interface Props {',
  '  variant: AtomName',
  '}',
  'export default function Card({ variant }: Props) { return (',
  '      <div className={cx(variant as AtomName)}>',
  '        {o}',
  '      </div>',
  '    )',
  '}',
  '',
].join('\n')

const ROW = `${CX_IMPORT}\n\nexport function row(...classes: string[]) {\n  return cx(...classes)\n}\n`
const ONLY = `${CX_IMPORT}\n\nexport const o = cx('interactve')\n`
const PAGE = [
  "import { t } from 'bad-lib'",
  "import Card from './Card'",
  "import { row } from './list/Row'",
  '',
  'export default function Page() {',
  "  return <Card variant=\"flex\" data-row={row('a')} data-t={t('b')} />",
  '}',
  '',
].join('\n')

const BAD_LIB = {
  'package.json': JSON.stringify({
    name: 'bad-lib',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dependencies: { '@navecss/core': '*' },
  }),
  'index.js': `${CX_IMPORT}\n\nexport const t = (v) => cx(v)\n`,
}

/**
 * The project of four problems: two in the application, one in a component only the card imports,
 * one in a dependency.
 */
function projectOfFour(): Project {
  const project = makeProject({
    'app/page.tsx': PAGE,
    'app/Card.tsx': CARD,
    'app/list/Row.tsx': ROW,
    'components/Only.tsx': ONLY,
  })
  project.install('bad-lib', BAD_LIB)
  return project
}

/**
 * A project with the row's problem alone.
 */
function projectOfOne(): Project {
  return makeProject({
    'app/page.tsx':
      "import { row } from './list/Row'\n\nexport default function Page() {\n  return <div data-row={row('a')} />\n}\n",
    'app/list/Row.tsx': ROW,
  })
}

interface Outcome {
  /**
   * What each `console.error` call was given, as text.
   */
  readonly errors: string[]
  readonly warnings: string[]
  /**
   * What the check threw, if it threw.
   */
  readonly thrown: unknown
}

/**
 * Runs the plugin for a build, writes the CSS it left as the build's, and runs the check.
 */
async function buildAndCheck(project: Project): Promise<Outcome> {
  const result = await runAtomic(project, [], { phase: 'phase-production-build' })
  writeBuildCss(project, result.css)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error.mockClear()
  warn.mockClear()
  const thrown = await failureOf(checkBuild(hookMetadata(project), {}, {}))
  return {
    errors: error.mock.calls.map((call) => call.map(String).join(' ')),
    warnings: warn.mock.calls.map((call) => call.map(String).join(' ')),
    thrown,
  }
}

describe('AC-nextjs-used-atoms-27: the hook prints one report, then throws one short line', () => {
  it('AC-nextjs-used-atoms-27: the fixture holds the four problems the criterion lists', async () => {
    const project = projectOfFour()
    await runAtomic(project, [], { phase: 'phase-production-build' })
    const places = recordOf(project).problems.map((problem) => `${problem.file}:${problem.line}`)
    expect(places).toEqual([
      'app/Card.tsx:9',
      'app/list/Row.tsx:4',
      'components/Only.tsx:3',
      'node_modules/bad-lib/index.js:3',
    ])
  })

  it('AC-nextjs-used-atoms-27: console.error is called once and the text opens with the counted first line', async () => {
    const { errors } = await buildAndCheck(projectOfFour())
    expect(errors).toHaveLength(1)
    expect(errors[0]!.startsWith(`4 problems in 4 files: ${REPORT_CAUSE}`)).toBe(true)
  })

  it('AC-nextjs-used-atoms-27: the first line occurs once, at the start of a line', async () => {
    const { errors } = await buildAndCheck(projectOfFour())
    const first = `4 problems in 4 files: ${REPORT_CAUSE}`
    const lines = (errors[0] ?? '').split('\n')
    expect(lines.filter((line) => line.includes('4 problems in 4 files'))).toEqual([first])
  })

  it('AC-nextjs-used-atoms-27: one line per problem, authored places, the dependency by its real path', async () => {
    const { errors } = await buildAndCheck(projectOfFour())
    const lines = (errors[0] ?? '').split('\n')
    expect(lines[1] ?? '').toMatch(/^app\/Card\.tsx:9:\d+: /u)
    expect(lines[2] ?? '').toMatch(/^app\/list\/Row\.tsx:4:\d+: /u)
    expect(lines[3] ?? '').toMatch(/^components\/Only\.tsx:3:\d+: /u)
    expect(lines[4] ?? '').toMatch(/^node_modules\/bad-lib\/index\.js:3:\d+: /u)
  })

  it('AC-nextjs-used-atoms-27: every problem line has the position prefix and the remedy block follows the last one', async () => {
    const { errors } = await buildAndCheck(projectOfFour())
    const lines = (errors[0] ?? '').split('\n')
    for (const line of lines.slice(1, 5)) expect(line).toMatch(POSITION)
    const remedy = lines.slice(5)
    expect(remedy.length).toBeGreaterThan(0)
    for (const line of remedy) expect(line).not.toMatch(POSITION)
  })

  it('AC-nextjs-used-atoms-27: the throw is the one short line and its stack is its message', async () => {
    const { thrown } = await buildAndCheck(projectOfFour())
    expect(thrown).toBeInstanceOf(Error)
    const { message, stack } = thrown as Error
    expect(message).toBe('Nave stopped the build: 4 problems, listed above.')
    expect(stack).toBe(message)
  })

  it('AC-nextjs-used-atoms-27: control, the report text is not part of the thrown message', async () => {
    const { errors, thrown } = await buildAndCheck(projectOfFour())
    expect(errors[0] ?? '').toContain(REPORT_CAUSE)
    expect((thrown as Error).message).not.toContain(REPORT_CAUSE)
    expect((thrown as Error).message).not.toContain('app/Card.tsx')
  })

  it("AC-nextjs-used-atoms-27: the printed text is core's report for the recorded problems (withNave() as home)", async () => {
    const project = projectOfFour()
    const { errors } = await buildAndCheck(project)
    const expected = buildReport(recordOf(project).problems, [], 'withNave()')
    const printed = (errors[0] ?? '').split('\n')
    expect(printed.slice(0, 5)).toEqual(expected.split('\n').slice(0, 5))
  })
})

describe('AC-nextjs-used-atoms-27: one problem counts as 1 problem in 1 file', () => {
  it('AC-nextjs-used-atoms-27: the first line is singular and the throw says 1 problem', async () => {
    const { errors, thrown } = await buildAndCheck(projectOfOne())
    expect(errors).toHaveLength(1)
    expect(errors[0]!.split('\n', 1)[0]).toBe(`1 problem in 1 file: ${REPORT_CAUSE}`)
    expect((thrown as Error).message).toBe('Nave stopped the build: 1 problem, listed above.')
    expect((thrown as Error).stack).toBe((thrown as Error).message)
  })
})

describe('AC-nextjs-used-atoms-27: a build without a problem prints no report and does not throw', () => {
  it('AC-nextjs-used-atoms-27: the green project prints nothing and the check resolves', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const { errors, warnings, thrown } = await buildAndCheck(project)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(thrown).toBeUndefined()
  })

  it('AC-nextjs-used-atoms-27: control, the green project differs from the failing one by the recorded problem alone', async () => {
    const green = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    await runAtomic(green, [], { phase: 'phase-production-build' })
    expect(recordOf(green).problems).toEqual([])
    const failing = projectOfOne()
    await runAtomic(failing, [], { phase: 'phase-production-build' })
    expect(recordOf(failing).problems).toHaveLength(1)
  })
})
