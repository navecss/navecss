/**
 * A `.scss` stylesheet that holds a `//` comment and imports a plain `.css` file, on a real build
 * with both bundlers: Sass leaves the `@import` in its output, the bundler runs PostCSS over the
 * `.css` file on its own, and that file's `@nave` problem counts in the record. The run over the
 * atom layer cannot read Sass as CSS, so it cannot list what a Sass file imports.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, isBesideNext, SKIP_REASON } from '../helpers/next-app.ts'
import { skipReason } from '../helpers/preconditions.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const SKIP =
  SKIP_REASON ?? skipReason(isBesideNext('sass') ? undefined : 'sass is not installed beside next')

const LAYOUT = [
  "import './globals.css'",
  "import './main.scss'",
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

describe.skipIf(SKIP !== undefined)(
  `a stylesheet a .scss file imports, on a real build${SKIP === undefined ? '' : ` (skipped: ${SKIP})`}`,
  () => {
    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      '%s: its @nave problem counts in the record',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        app.linkBesideNext('sass')
        app.write({
          'app/layout.jsx': LAYOUT,
          'app/main.scss': "// theme\n@import './extra.css';\n.a {\n  color: red;\n}\n",
          'app/extra.css': '.extra {\n  @nave interactve;\n}\n',
        })
        const run = await app.next(['build', ...flags])
        // The problem stops the build from the hook, and the record names its stylesheet.
        expect(run.code, run.output).not.toBe(0)
        expect(run.output).toMatch(/^app\/extra\.css:\d+:\d+: /mu)
        const files = app.record()?.directiveProblems.map((problem) => problem.file) ?? []
        expect(files).toContain('app/extra.css')
      },
      TIMEOUT,
    )
  },
)
