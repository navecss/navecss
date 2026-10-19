/**
 * AC-nextjs-used-atoms-29 on a real `next dev`: the report goes to the terminal, closed by one
 * line, while the page keeps serving; it is not printed again for an edit that leaves the problems
 * as they were, and one line says so when they are fixed.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { pause } from '../helpers/next-process.ts'

const TIMEOUT = 900_000
const FIRST_LINE = `1 problem in 1 file: ${REPORT_CAUSE}`
const CLOSING =
  'next build stops on these. The dev server keeps serving, without rules for atoms that only these calls apply.'
const FIXED = 'Nave: the problems listed earlier are fixed.'

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const page = (call: string, comment = ''): string =>
  [
    "import { cx } from '@navecss/core/cx'",
    comment,
    'export default function Page({ variant }) {',
    `  return <div id="t" className={${call}} />`,
    '}',
    '',
  ].join('\n')

/**
 * How many times `text` occurs in `output`.
 */
function occurrences(output: string, text: string): number {
  return output.split(text).length - 1
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the report in next dev${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      '%s: AC-nextjs-used-atoms-29: the report and its closing line are printed once, the page serves, and the fix is announced',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        app.write({ 'app/page.jsx': page('cx(variant)') })
        const server = await app.dev(flags)
        const served = await server.get('/')
        expect(served.status).toBe(200)
        expect(server.output()).toContain(FIRST_LINE)
        expect(server.output()).toContain(CLOSING)
        expect(occurrences(server.output(), FIRST_LINE)).toBe(1)
        app.write({ 'app/page.jsx': page('cx(variant)', '// a comment') })
        await server.get('/')
        await pause(3000)
        expect(occurrences(server.output(), FIRST_LINE)).toBe(1)
        app.write({ 'app/page.jsx': page("cx('flex')") })
        while (!server.output().includes(FIXED)) {
          await server.get('/')
          await pause(1000)
        }
        expect(occurrences(server.output(), FIXED)).toBe(1)
      },
      TIMEOUT,
    )
  },
)
