/**
 * AC-nextjs-used-atoms-17, on a real `next build` of the newest Next.js on both bundlers: every
 * application row of AC-used-atoms-05 (other references to the `cx` binding), -10 (arguments that
 * cannot be read), -11 (a literal that is no atom) and -31 (a Nave class built from pieces) is
 * present in one app. The build fails from the hook with one report counting each row once, and
 * `onUnknown` softens none of them. The rows' own criteria run one module at a time in
 * test/used-atoms-on-next. The floor version is covered by the other real-build files.
 */
import { atoms as builtInAtoms } from '@navecss/core/atoms'
import { REPORT_CAUSE } from '@navecss/core/collect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { BUNDLERS, configText, TIMEOUT } from '../helpers/used-atoms-build.ts'
import {
  ARGUMENT_ROWS,
  argumentModule,
  EXTEND,
  IMPORT,
  LITERAL_ROWS,
  PIECED_CLASS_ROWS,
  pieceModule,
  REFERENCE_ROWS,
} from '../helpers/used-atoms-rows.ts'

/**
 * Every row of the four criteria as a module: the file and its text.
 */
const MODULES: Record<string, string> = {
  ...Object.fromEntries(REFERENCE_ROWS.map(([, file, text]) => [file, text])),
  ...Object.fromEntries(
    ARGUMENT_ROWS.map(([, body], index) => [
      `components/arg${index}.js`,
      argumentModule(body, true),
    ]),
  ),
  ...Object.fromEntries(
    PIECED_CLASS_ROWS.map(([expression], index) => [
      `components/piece${index}.js`,
      pieceModule(expression).text,
    ]),
  ),
  ...Object.fromEntries(
    LITERAL_ROWS.map(([literal], index) => [
      `components/lit${index}.js`,
      `${IMPORT}cx('${literal}')\n`,
    ]),
  ),
  'components/own.js': `${IMPORT}cx('brandBox')\n`,
}
const COUNT = Object.keys(MODULES).length
const PAGE = [
  ...Object.keys(MODULES).map((file) => `import '../${file}'`),
  '',
  'export default function Page() {',
  '  return <main />',
  '}',
  '',
].join('\n')

interface Builds {
  readonly app: NextApp
  readonly byDefault: Run
  readonly ignored: Run
  readonly warned: Run
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the application rows of the used-atoms criteria on a real next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(BUNDLERS)('%s, newest', (_name, flags) => {
      let builds: Builds
      beforeAll(async () => {
        const app = createNextApp(configText({ extend: EXTEND }))
        app.write({ ...MODULES, 'app/page.jsx': PAGE })
        const byDefault = await app.next(['build', ...flags])
        app.write({ 'next.config.mjs': configText({ extend: EXTEND, onUnknown: 'warn' }) })
        const warned = await app.next(['build', ...flags])
        app.write({ 'next.config.mjs': configText({ extend: EXTEND, onUnknown: 'ignore' }) })
        const ignored = await app.next(['build', ...flags])
        builds = { app, byDefault, ignored, warned }
      }, TIMEOUT)
      afterAll(async () => {
        await builds.app.remove()
      })

      it('AC-nextjs-used-atoms-17: the build fails from the hook with one report counting every row once, and one stop line', () => {
        const { output, code } = builds.byDefault

        expect(code, output).not.toBe(0)
        expect(output).toContain(`${COUNT} problems in ${COUNT} files: ${REPORT_CAUSE}`)
        expect(output).toContain(`Nave stopped the build: ${COUNT} problems, listed above.`)
        expect(output.split(REPORT_CAUSE)).toHaveLength(2)
      })

      it('AC-used-atoms-05, -10, -11 and -31: each row’s file carries exactly one problem line, positioned in it', () => {
        const { output } = builds.byDefault
        for (const file of Object.keys(MODULES)) {
          const lines = output.split('\n').filter((line) => line.startsWith(`${file}:`))
          expect(lines, file).toHaveLength(1)
          expect(lines[0], file).toMatch(/^\S+:\d+:\d+: /u)
        }
      })

      it('AC-used-atoms-31: a built class is positioned at the piece, on line 3', () => {
        for (const [index, [expression, offset]] of PIECED_CLASS_ROWS.entries()) {
          const { column } = pieceModule(expression)
          expect(builds.byDefault.output).toContain(
            `components/piece${index}.js:3:${column + offset}: `,
          )
        }
      })

      it('AC-used-atoms-11: the Available line appears once, last, lists every built-in atom and no atom of the consumer’s own', () => {
        const report = builds.byDefault.output.split('\n').filter((line) => line.length > 0)
        const lines = report.filter((line) => line.startsWith('Available: '))

        expect(lines).toEqual([`Available: ${Object.keys(builtInAtoms).join(', ')}`])
        // Last in the report: the next thing printed is the build's own failure line.
        expect(report[report.indexOf(lines[0]!) + 1]).toContain('Nave stopped the build')
        expect(lines[0]).not.toContain('brandBox')
        expect(builds.byDefault.output).toContain(
          '"brandBox" is an atom of your own, which has no class',
        )
      })

      it('the report names withNave() as the place for the options and never atomic: all', () => {
        expect(builds.byDefault.output).toContain('withNave()')
        expect(builds.byDefault.output).not.toContain('navePlugin()')
        expect(builds.byDefault.output).not.toContain("atomic: 'all'")
      })

      it.each([
        ['warn', 'warned'],
        ['ignore', 'ignored'],
      ] as const)(
        'AC-used-atoms-10: with onUnknown: %s the same rows fail the same way',
        (_value, key) => {
          const { output, code } = builds[key]

          expect(code, output).not.toBe(0)
          expect(output).toContain(`${COUNT} problems in ${COUNT} files: ${REPORT_CAUSE}`)
        },
      )
    })
  },
)
