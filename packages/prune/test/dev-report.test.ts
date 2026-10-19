import { buildReport, REPORT_CAUSE } from '@navecss/core/collect'
import { describe, expect, it, vi } from 'vitest'

import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import {
  coreThrown,
  inProject,
  makeProject,
  PAGE_WITH_PROP,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const DEV = 'phase-development-server'
const BUILD = 'phase-production-build'
const CLOSING =
  'next build stops on these. The dev server keeps serving, without rules for atoms that only these calls apply.'
const FIXED = 'Nave: the problems listed earlier are fixed.'

/**
 * A stylesheet with an unknown atom on line 3, column 3.
 */
const GLOBALS: Sheet = {
  css: '/* styles */\n.card {\n  @nave interactve;\n}\n',
  file: 'app/globals.css',
}
const FIXED_GLOBALS: Sheet = { css: '.card {\n  @nave flex;\n}\n', file: 'app/globals.css' }

interface Call {
  readonly kind: 'error' | 'log' | 'warn'
  readonly args: readonly unknown[]
}

/**
 * Starts recording every console call, in order, and returns a function that reads them.
 */
function watchConsole(): () => Call[] {
  const calls: Call[] = []
  for (const kind of ['error', 'log', 'warn'] as const) {
    vi.spyOn(console, kind).mockImplementation((...args: unknown[]) => {
      calls.push({ kind, args })
    })
  }
  return () => [...calls]
}

function textOf(call: Call): string {
  return call.args.map(String).join(' ')
}

function textsOf(calls: readonly Call[]): string[] {
  return calls.map((call) => textOf(call))
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0]!
}

/**
 * The text of the one `console.error` call among `calls`.
 */
function reportIn(calls: readonly Call[]): string {
  const errors = errorsIn(calls)
  expect(errors).toHaveLength(1)
  return textOf(errors[0]!)
}

function errorsIn(calls: readonly Call[]): Call[] {
  return calls.filter((call) => call.kind === 'error')
}

/**
 * The lines of a report that follow its problem lines: its remedy block.
 */
function remedyLines(report: string): string[] {
  return report
    .split('\n')
    .slice(1)
    .filter((line) => !/^\S+:\d+:\d+: /u.test(line))
}

/**
 * A project whose page calls `cx(variant)`.
 */
function brokenProject(): Project {
  return makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
}

/**
 * The sheet, preceded by writing `files` to the project: the edit happens between two runs of one
 * plugin instance.
 */
function afterWriting(project: Project, files: Record<string, string>, sheet: Sheet): Sheet {
  return {
    file: sheet.file,
    get css() {
      project.write(files)
      return sheet.css
    },
  }
}

/**
 * Runs the broken project's stylesheets in the phase and returns what was printed.
 */
async function printedBy(phase: string | undefined): Promise<Call[]> {
  const project = brokenProject()
  const seen = watchConsole()
  await runSheets(project, [GLOBALS, ATOMIC_SHEET], phase === undefined ? {} : { phase })
  // Control: the project holds both problems, so a silent run is the plugin's choice.
  const record = recordOf(project)
  expect(record.problems).toHaveLength(1)
  expect(record.directiveProblems).toHaveLength(1)
  return seen()
}

describe('AC-nextjs-used-atoms-29: in next dev the report goes to the terminal, closed by one line', () => {
  it('AC-nextjs-used-atoms-29: one console.error call holds the report and the closing line', async () => {
    const errors = errorsIn(await printedBy(DEV))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.args).toHaveLength(1)
    const lines = textOf(errors[0]!).split('\n')
    expect(lines[0]).toBe(`2 problems in 2 files: ${REPORT_CAUSE}`)
    expect(lines.at(-1)).toBe(CLOSING)
  })

  it('AC-nextjs-used-atoms-29: the problems are in path order, the @nave problem with core text', async () => {
    const project = brokenProject()
    const seen = watchConsole()
    await runSheets(project, [GLOBALS, ATOMIC_SHEET], { phase: DEV })
    const thrown = await coreThrown(GLOBALS.css, inProject(project, GLOBALS.file))
    const lines = reportIn(seen()).split('\n')
    const page = lines.findIndex((line) => line.startsWith('app/page.tsx:4:'))
    const sheet = lines.indexOf(`app/globals.css:3:3: ${thrown.text}`)
    expect(sheet).toBeGreaterThan(0)
    expect(page).toBeGreaterThan(sheet)
  })

  it("AC-nextjs-used-atoms-29: the remedy block is core's, and the closing line follows it", async () => {
    const project = brokenProject()
    const seen = watchConsole()
    await runSheets(project, [GLOBALS, ATOMIC_SHEET], { phase: DEV })
    const text = reportIn(seen())
    const expected = remedyLines(buildReport(recordOf(project).problems, [], 'withNave()'))
    expect(expected.length).toBeGreaterThan(1)
    const printed = remedyLines(text)
    for (const line of expected) expect(printed).toContain(line)
    expect(text.endsWith(`\n${CLOSING}`)).toBe(true)
  })

  it('AC-nextjs-used-atoms-29: a second identical run in the same dev server life prints nothing more', async () => {
    const project = brokenProject()
    const seen = watchConsole()
    await runSheets(project, [GLOBALS, ATOMIC_SHEET, GLOBALS, ATOMIC_SHEET, ATOMIC_SHEET], {
      phase: DEV,
    })
    expect(errorsIn(seen())).toHaveLength(1)
    // Control: a new dev server life prints the report again.
    await runSheets(project, [GLOBALS, ATOMIC_SHEET], { phase: DEV })
    expect(errorsIn(seen())).toHaveLength(2)
  })
})

describe('AC-nextjs-used-atoms-29: the report is cleared when fixed and comes back with what comes back', () => {
  it('AC-nextjs-used-atoms-29: each fix reprints what is left, the last one says the problems are fixed, and a further run prints nothing', async () => {
    const project = brokenProject()
    const seen = watchConsole()
    const fixPage = afterWriting(project, { 'app/page.tsx': pageCalling("'flex'") }, GLOBALS)
    const fixSheet = afterWriting(project, {}, FIXED_GLOBALS)
    await runSheets(
      project,
      [GLOBALS, ATOMIC_SHEET, fixPage, ATOMIC_SHEET, fixSheet, ATOMIC_SHEET, ATOMIC_SHEET],
      { phase: DEV },
    )
    const printed = textsOf(seen())
    expect(printed).toHaveLength(3)
    expect(firstLine(printed[0]!)).toBe(`2 problems in 2 files: ${REPORT_CAUSE}`)
    expect(firstLine(printed[1]!)).toBe(`1 problem in 1 file: ${REPORT_CAUSE}`)
    expect(printed[1]).toContain('app/globals.css:3:3: ')
    expect(printed[2]).toBe(FIXED)
    // Control: the fixed project holds no problem.
    expect(recordOf(project).problems).toEqual([])
    expect(recordOf(project).directiveProblems).toEqual([])
  })

  it('AC-nextjs-used-atoms-29: reintroducing one problem prints the report again with that one problem', async () => {
    const project = brokenProject()
    const seen = watchConsole()
    const fixPage = afterWriting(project, { 'app/page.tsx': pageCalling("'flex'") }, GLOBALS)
    const fixSheet = afterWriting(project, {}, FIXED_GLOBALS)
    const back = afterWriting(project, { 'app/page.tsx': PAGE_WITH_PROP }, FIXED_GLOBALS)
    await runSheets(
      project,
      [GLOBALS, ATOMIC_SHEET, fixPage, ATOMIC_SHEET, fixSheet, ATOMIC_SHEET, back, ATOMIC_SHEET],
      { phase: DEV },
    )
    const printed = textsOf(seen())
    expect(printed).toHaveLength(4)
    expect(printed[2]).toBe(FIXED)
    expect(firstLine(printed[3]!)).toBe(`1 problem in 1 file: ${REPORT_CAUSE}`)
    expect(printed[3]).toContain('app/page.tsx:4:')
    expect(printed[3]).not.toContain('app/globals.css')
    expect(printed[3]!.endsWith(`\n${CLOSING}`)).toBe(true)
  })
})

describe('AC-nextjs-used-atoms-29: only a development run prints the report', () => {
  it('AC-nextjs-used-atoms-29: with no phase, NODE_ENV "development" prints it', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const errors = errorsIn(await printedBy(undefined))
    expect(errors).toHaveLength(1)
    expect(textOf(errors[0]!).endsWith(`\n${CLOSING}`)).toBe(true)
  })

  it.each(['production', undefined])(
    'AC-nextjs-used-atoms-29: with no phase, NODE_ENV %s prints nothing',
    async (value) => {
      vi.stubEnv('NODE_ENV', value)
      expect(await printedBy(undefined)).toEqual([])
    },
  )

  it('AC-nextjs-used-atoms-29: a production-build phase prints no report even with problems', async () => {
    expect(await printedBy(BUILD)).toEqual([])
  })

  it('AC-nextjs-used-atoms-29: a phase decides over NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(await printedBy(BUILD)).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-29: in a webpack build only the client compilation prints', () => {
  it('AC-nextjs-used-atoms-29: the "server" compilation prints nothing', async () => {
    vi.stubEnv('NEXT_COMPILER_NAME', 'server')
    expect(await printedBy(DEV)).toEqual([])
  })

  it('AC-nextjs-used-atoms-29: the "client" compilation prints once across two runs', async () => {
    vi.stubEnv('NEXT_COMPILER_NAME', 'client')
    const project = brokenProject()
    const seen = watchConsole()
    await runSheets(project, [GLOBALS, ATOMIC_SHEET, ATOMIC_SHEET], { phase: DEV })
    expect(errorsIn(seen())).toHaveLength(1)
  })
})

describe('AC-nextjs-used-atoms-03: in dev, @nave problems with onUnknown "warn" are not in the report', () => {
  it('AC-nextjs-used-atoms-03: the report counts the page problem alone and the warning names the rest', async () => {
    const project = brokenProject()
    const seen = watchConsole()
    await runSheets(project, [GLOBALS, ATOMIC_SHEET], {
      phase: DEV,
      options: { onUnknown: 'warn' },
    })
    const calls = seen()
    const errors = errorsIn(calls)
    expect(errors).toHaveLength(1)
    expect(firstLine(textOf(errors[0]!))).toBe(`1 problem in 1 file: ${REPORT_CAUSE}`)
    expect(textOf(errors[0]!)).not.toContain('interactve')
    // Control: the @nave problem is said, as a warning of its own.
    const warned = calls.filter(
      (call) => call.kind === 'warn' && textOf(call).includes('interactve'),
    )
    expect(warned).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-03: a project whose only problem is a warned @nave one prints no report', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const seen = watchConsole()
    await runSheets(project, [GLOBALS, ATOMIC_SHEET], {
      phase: DEV,
      options: { onUnknown: 'warn' },
    })
    expect(errorsIn(seen())).toEqual([])
    // Control: under the default the same project prints a report of its one problem.
    const other = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const again = watchConsole()
    await runSheets(other, [GLOBALS, ATOMIC_SHEET], { phase: DEV })
    expect(errorsIn(again()).some((call) => textOf(call).startsWith('1 problem in 1 file: '))).toBe(
      true,
    )
  })
})
