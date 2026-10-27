/**
 * A stylesheet the app stops importing stops counting in the record on the next build, on both
 * bundlers, while a stylesheet the app still imports keeps its problem. The bundler does not run
 * a stylesheet nothing imports, so only the run over the atom layer can tell the record which
 * stylesheets are still in the build.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const PROBLEM = '{\n  @nave interactve;\n}\n'

const LAYOUT = [
  "import './globals.css'",
  "import './kept.css'",
  '',
  'export default function RootLayout({ children }) {',
  '  return (',
  '    <html lang="en">',
  '      <body>{children}</body>',
  '    </html>',
  '  )',
  '}',
  '',
].join('\n')

const PAGE = [
  "import { cx } from '@navecss/core/cx'",
  '',
  'export default function Page() {',
  '  return <div id="t" className={cx(\'flex\')} />',
  '}',
  '',
].join('\n')

const PAGE_IMPORTING_OLD = `import './old.css'\n${PAGE}`

/**
 * The stylesheets the record's `@nave` problems are in.
 */
function problemSheets(app: NextApp): string[] {
  const files = app.record()?.directiveProblems.map((problem) => problem.file) ?? []
  return [...new Set(files)].toSorted((a, b) => a.localeCompare(b))
}

describe.skipIf(SKIP_REASON !== undefined)(
  `a stylesheet the app stops importing, on a real build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      '%s: the next build no longer counts its problem, and still counts the kept one',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        app.write({
          'app/layout.jsx': LAYOUT,
          'app/page.jsx': PAGE_IMPORTING_OLD,
          'app/kept.css': `.kept ${PROBLEM}`,
          'app/old.css': `.old ${PROBLEM}`,
        })
        // A `@nave` problem stops the build from the hook; the record is what these rows read.
        const first = await app.next(['build', ...flags])
        expect(first.code, first.output).not.toBe(0)
        expect(first.output).toMatch(/^app\/kept\.css:\d+:\d+: /mu)
        expect(problemSheets(app)).toEqual(['app/kept.css', 'app/old.css'])
        app.write({ 'app/page.jsx': PAGE })
        const second = await app.next(['build', ...flags])
        expect(second.code, second.output).not.toBe(0)
        expect(second.output).not.toMatch(/^app\/old\.css:/mu)
        expect(problemSheets(app)).toEqual(['app/kept.css'])
      },
      TIMEOUT,
    )
  },
)
