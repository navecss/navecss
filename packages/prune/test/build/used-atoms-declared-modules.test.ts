/**
 * AC-nextjs-used-atoms-17, on a real `next build` of the newest Next.js on both bundlers: the
 * `cxModules` rows. The four barrels of AC-used-atoms-05 fail one report with one pasteable array;
 * with a list already present one paste is enough; and AC-used-atoms-47's declared modules and
 * every importer form build green with exactly the atoms the importers name. The modules are
 * `.js` files under `components/`, since the app has no type checker. The floor version is covered
 * by the other real-build files.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { builtAtoms, BUNDLERS, configText, TIMEOUT } from '../helpers/used-atoms-build.ts'
import { printedList } from '../helpers/used-atoms-fixture.ts'
import { BARREL, BARREL_FILES, IMPORT, REFERENCE_ROWS } from '../helpers/used-atoms-rows.ts'

const BARRELS = Object.fromEntries(
  REFERENCE_ROWS.filter(([, file]) => BARREL_FILES.includes(file as never)).map(
    ([, file, text]) => [file, text],
  ),
)

/**
 * A page importing each file for its effect.
 */
function pageImporting(files: Iterable<string>): string {
  return [
    ...[...files].map((file) => `import '../${file}'`),
    '',
    'export default function Page() {',
    '  return <main />',
    '}',
    '',
  ].join('\n')
}

const PAIR = {
  'components/ui/index.js': BARREL,
  'components/other.js': BARREL,
  'components/a.js': "import { cx } from './ui'\nexport const a = cx('flex')\n",
  'components/b.js': "import { cx } from './other'\nexport const b = cx('grid')\n",
}

const UI_FILES = {
  'components/ui/index.js': BARREL,
  'components/ui2.js': "export * from '@navecss/core/cx'\n",
  'components/ui3.js': `${IMPORT}export { cx }\n`,
  'components/ui4.js': "import { cx as c } from '@navecss/core/cx'\nexport { c as cx }\n",
  'components/a.js': "import { cx } from './ui'\nexport const a = cx('flex')\n",
  'components/b.js': "import { cx as k } from './ui/index.js'\nexport const b = k('grid')\n",
  'components/c.js': "import * as U from './ui2'\nexport const c = U.cx('block')\n",
  'components/d.js':
    "import { cx } from './ui3'\nexport const d = (on) => [cx.raw('x'), cx(on && 'gap')]\n",
  'components/e.js': "import { cx } from './ui4'\nexport const e = cx('hidden')\n",
  'components/f.js': "import { cx } from '@/components/ui'\nexport const f = cx('truncate')\n",
}
const UI_MODULES = [
  './components/ui/index.js',
  './components/ui2.js',
  './components/ui3.js',
  './components/ui4.js',
]

interface Builds {
  readonly alone: Run
  readonly app: NextApp
  readonly declaredThree: Run
  readonly green: Run
  readonly greenAtoms: string[]
  readonly pasted: Run
  readonly pastedAtoms: string[]
  readonly partial: Run
  readonly printed: string[] | undefined
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the cxModules rows of the used-atoms criteria on a real next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(BUNDLERS)('%s, newest', (_name, flags) => {
      let builds: Builds
      beforeAll(async () => {
        const app = createNextApp(configText())
        const build = (): Promise<Run> => app.next(['build', ...flags])
        app.write({ ...BARRELS, 'app/page.jsx': pageImporting(Object.keys(BARRELS)) })
        const alone = await build()
        app.write({
          'next.config.mjs': configText({
            cxModules: [
              './components/utils.js',
              './components/utils2.js',
              './components/utils3.js',
            ],
          }),
        })
        const declaredThree = await build()
        for (const file of Object.keys(BARRELS)) app.delete(file)
        app.write({ ...PAIR, 'app/page.jsx': pageImporting(Object.keys(PAIR)) })
        app.write({ 'next.config.mjs': configText({ cxModules: ['./components/ui/index.js'] }) })
        const partial = await build()
        const printed = printedList(partial.output)
        app.write({ 'next.config.mjs': configText({ cxModules: printed ?? [] }) })
        const pasted = await build()
        const pastedAtoms = builtAtoms(app)
        for (const file of Object.keys(PAIR)) app.delete(file)
        app.write({ ...UI_FILES, 'app/page.jsx': pageImporting(Object.keys(UI_FILES)) })
        app.write({ 'next.config.mjs': configText({ cxModules: UI_MODULES }) })
        const green = await build()
        builds = {
          alone,
          app,
          declaredThree,
          green,
          greenAtoms: builtAtoms(app),
          partial,
          pasted,
          pastedAtoms,
          printed,
        }
      }, TIMEOUT)
      afterAll(async () => {
        await builds.app.remove()
      })

      it('AC-used-atoms-05: the four barrels fail one report of four problems, with one cxModules array naming all four', () => {
        const { code, output } = builds.alone

        expect(code, output).not.toBe(0)
        expect(output).toContain(`4 problems in 4 files: ${REPORT_CAUSE}`)
        expect(output.split('\n').filter((line) => line.includes('cxModules: ['))).toHaveLength(1)
        expect(printedList(output)).toEqual([
          './components/utils.js',
          './components/utils2.js',
          './components/utils3.js',
          './components/utils4.js',
        ])
      })

      it('AC-used-atoms-05: declaring the first three leaves the namespace row as the one problem', () => {
        const { code, output } = builds.declaredThree

        expect(code, output).not.toBe(0)
        expect(output).toContain(`1 problem in 1 file: ${REPORT_CAUSE}`)
        expect(output).toMatch(/^components\/utils4\.js:1:1: /mu)
      })

      it('AC-used-atoms-05: with a list already present, one paste is enough: one problem in the other barrel, its printed array pasted builds green and ships both atoms', () => {
        const { code, output } = builds.partial

        expect(code, output).not.toBe(0)
        expect(output).toContain(`1 problem in 1 file: ${REPORT_CAUSE}`)
        expect(output).toMatch(/^components\/other\.js:1:1: /mu)
        expect(builds.printed).toEqual(['./components/ui/index.js', './components/other.js'])
        expect(builds.pasted.code, builds.pasted.output).toBe(0)
        expect(builds.pastedAtoms).toEqual(['flex', 'grid'])
      })

      it('AC-used-atoms-47: the declared modules and every importer form build green and ship exactly the atoms the importers name', () => {
        const { code, output } = builds.green

        expect(code, output).toBe(0)
        expect(output).not.toContain(REPORT_CAUSE)
        expect(builds.greenAtoms).toEqual(['block', 'flex', 'gap', 'grid', 'hidden', 'truncate'])
      })
    })
  },
)
