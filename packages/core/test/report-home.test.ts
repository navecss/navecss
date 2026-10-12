/**
 * AC-nextjs-used-atoms-10: the report takes the place the options live in as one parameter. The
 * Vite text is pinned from the report as it printed before the parameter existed, never from the
 * formatter under test, and the other host's text is that text with the one name swapped.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildReport } from '../src/vite-used-report.ts'
import { CONFIGURED_MODULES, HOME_REPORT_SET } from './helpers/report-home-set.ts'

const VITE_HOME = 'navePlugin()'
const NEXT_HOME = 'withNave()'

const SOURCES = path.join(import.meta.dirname, '..', 'src')

/**
 * The report as the Vite plugin printed it before the home was a parameter, for `HOME_REPORT_SET`.
 */
const VITE_REPORT = readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'report-home', 'vite.txt'),
  'utf8',
)

/**
 * The Vite report with every mention of its home replaced by the other host's.
 */
function withNextHome(report: string): string {
  return report.replaceAll(VITE_HOME, () => NEXT_HOME)
}

describe('AC-nextjs-used-atoms-10 — the report takes the option home as one parameter', () => {
  it('prints, for the Vite home, the bytes the Vite report printed before', () => {
    expect(buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, VITE_HOME)).toBe(VITE_REPORT)
  })

  it('prints, for the Next.js home, the Vite report with every navePlugin() replaced by withNave()', () => {
    const report = buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, NEXT_HOME)
    expect(report).toBe(withNextHome(VITE_REPORT))
    expect(report).not.toContain(VITE_HOME)
  })

  it('reaches one remedy sentence per place the old report named the home, ten of them', () => {
    expect(VITE_REPORT.split(VITE_HOME)).toHaveLength(11)
  })

  it('control: a formatter with the Vite home hard-coded in one remedy line fails the second clause', () => {
    const scratch = buildReport(HOME_REPORT_SET, CONFIGURED_MODULES, NEXT_HOME).replace(
      NEXT_HOME,
      () => VITE_HOME,
    )
    expect(scratch).not.toBe(withNextHome(VITE_REPORT))
  })

  it.each(['vite-used-report.ts', 'vite-used-package-lines.ts', 'vite-used-take-lines.ts'])(
    'keeps the Vite home out of the source of %s, so no remedy line can name it by hand',
    (file) => {
      expect(readFileSync(path.join(SOURCES, file), 'utf8')).not.toContain(VITE_HOME)
    },
  )
})
