/**
 * AC-nextjs-used-atoms-28: a host adds the remedy lines only it can write, and the formatter
 * places them: once, after the lines of the application's kinds and before any package's line.
 * Left out, the report keeps the bytes it printed before the parameter existed.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { LocatedProblem } from '../src/vite-used-report.ts'

import { buildReport } from '../src/vite-used-report.ts'
import { CONFIGURED_MODULES, HOME_REPORT_SET } from './helpers/report-home-set.ts'

const HOME = 'navePlugin()'
const HOST_LINE = 'A line only this host can write.'
const LAST_APPLICATION_LINE = 'List the atoms those calls can take in keep in navePlugin().'
const FIRST_PACKAGE_LINE = 'calls-lib is a dependency, so'

const VITE_REPORT = readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'report-home', 'vite.txt'),
  'utf8',
)

/**
 * The report for the set with a host remedy that always returns `HOST_LINE`.
 */
function withHostLine(problems: readonly LocatedProblem[]): string[] {
  return buildReport(problems, CONFIGURED_MODULES, HOME, () => [HOST_LINE]).split('\n')
}

describe('AC-nextjs-used-atoms-28 — a host adds remedy lines the formatter places', () => {
  it('prints the bytes the report printed before when the parameter is left out or undefined', () => {
    expect(buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, HOME)).toBe(VITE_REPORT)
    expect(buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, HOME, undefined)).toBe(VITE_REPORT)
  })

  it('prints the host line once, right after the application lines and before the first package line', () => {
    const lines = withHostLine(HOME_REPORT_SET)
    expect(lines.filter((line) => line === HOST_LINE)).toHaveLength(1)
    const at = lines.indexOf(HOST_LINE)
    expect(lines[at - 1]).toBe(LAST_APPLICATION_LINE)
    expect(lines[at + 1]?.startsWith(FIRST_PACKAGE_LINE)).toBe(true)
  })

  it('changes no other line of the report', () => {
    const lines = withHostLine(HOME_REPORT_SET)
    expect(lines.filter((line) => line !== HOST_LINE)).toEqual(VITE_REPORT.split('\n'))
  })

  it("hands the host only the application's problems", () => {
    const seen = vi.fn((application: readonly LocatedProblem[]) => {
      void application
      return [] as string[]
    })
    buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, HOME, seen)
    expect(seen).toHaveBeenCalledOnce()
    const application = seen.mock.calls[0]![0]
    expect(application.map((problem) => problem.file)).toEqual([
      'src/Card.tsx',
      'src/Tone.tsx',
      'src/ui.ts',
    ])
  })

  it('prints no host line when the host returns none', () => {
    expect(buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, HOME, () => [])).toBe(VITE_REPORT)
  })

  it('places the host line before the first package line when only dependencies have problems', () => {
    const dependencies = HOME_REPORT_SET.filter((problem) => problem.pkg !== undefined)
    const lines = withHostLine(dependencies)
    const at = lines.indexOf(HOST_LINE)
    expect(at).toBeGreaterThan(0)
    expect(lines[at + 1]?.startsWith(FIRST_PACKAGE_LINE)).toBe(true)
  })
})
