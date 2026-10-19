/**
 * What the plugin prints in `next dev`, where the build's check does not run: the whole report,
 * once per state, closed by a line that says nothing stops, and a line when the problems it
 * listed are gone; and the Markdown files the graph met and did not read.
 */
import type { Handoff } from './handoff.ts'

import { isDevelopmentRun } from './phase.ts'
import { printEachRun, printError, printOnce } from './print.ts'
import { readRecord } from './record.ts'
import { reportOf } from './report.ts'
import { DEV_CLOSING_LINE, DEV_FIXED_LINE, markdownWarning } from './texts.ts'

/**
 * The report this process printed last, while its problems last.
 */
const printed: { report?: string } = {}

/**
 * Prints what the record holds that the terminal has not seen, when the run is the development
 * server's.
 * @param handoff What `withNave()` handed over, with the project directory this run reads.
 */
export function reportInDev(handoff: Handoff): void {
  if (!isDevelopmentRun(handoff)) return
  const record = readRecord(handoff)
  if (record === undefined) return
  if (record.markdown.length > 0) {
    printOnce(`markdown:${record.markdown.join('\n')}`, markdownWarning(record.markdown))
  }
  const report = reportOf(record, handoff.options, handoff.dir)
  if (report === undefined) {
    if (printed.report !== undefined) printEachRun(DEV_FIXED_LINE)
    delete printed.report
    return
  }
  if (report.text === printed.report) return
  printed.report = report.text
  printError(`${report.text}\n${DEV_CLOSING_LINE}`)
}
