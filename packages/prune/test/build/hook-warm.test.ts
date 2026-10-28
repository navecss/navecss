/**
 * AC-nextjs-used-atoms-31 and AC-nextjs-used-atoms-32 on a real build: a warm build after a change
 * to the code or the options ships the new set, a warm build after a change the plugin did not
 * read stays green, and an edit the record cannot account for fails from the hook.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'
import type { Cell } from '../helpers/next-cells.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { cells, nextRootOf } from '../helpers/next-cells.ts'
import { noteNextCrash, RETRY_ON_NEXT_CRASH } from '../helpers/next-crash.ts'
import {
  builtPage,
  scratchLogOf,
  scratchRuns,
  useScratchPluginKeepingHook,
} from '../helpers/s3-used-atoms.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) {
    await app.remove()
    rmSync(scratchLogOf(app), { force: true })
  }
  apps.length = 0
})

const PAGE = (atoms: string): string =>
  [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Page() {',
    `  return <div id="t" className={cx(${atoms})} />`,
    '}',
    '',
  ].join('\n')

const config = (keep: string): string =>
  `import { withNave } from '@navecss/prune'\n\nexport default withNave({}, { keep: ['${keep}'] })\n`

/**
 * Every JavaScript and HTML file the build wrote under `.next`, concatenated, but its cache.
 */
function builtScripts(app: NextApp): string {
  const root = path.join(app.dir, '.next')
  if (!existsSync(root)) return ''
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.js') || entry.name.endsWith('.html')) &&
        !entry.parentPath.includes(`${path.sep}cache`),
    )
    .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
}

/**
 * A card component whose class is the one atom.
 */
function cardUsing(atom: string): string {
  return `import { cx } from '@navecss/core/cx'\n\nexport const Card = () => <p className={cx('${atom}')}>card</p>\n`
}

/**
 * A new app on the cell's Next.js, with a README at its root, removed after the test.
 */
async function newApp(cell: Cell): Promise<NextApp> {
  const app = createNextApp(undefined, { nextRoot: await nextRootOf(cell) })
  app.write({ 'README.md': 'first\n' })
  apps.push(app)
  return app
}

/**
 * Builds the app on the cell's bundler and notes Next.js 16.2.0's crash if the build printed it.
 */
async function build(app: NextApp, cell: Cell): Promise<Run> {
  const run = await app.next(['build', ...cell.flags])
  noteNextCrash(run.output)
  return run
}

/**
 * The five changes of AC-nextjs-used-atoms-32, in its order: none the plugin read, and none the
 * record can be stale for.
 */
const UNREAD_CHANGES: readonly (readonly [string, (app: NextApp) => void])[] = [
  ['no change', () => {}],
  ['README.md edited', (app) => app.write({ 'README.md': 'notes\n' })],
  ['public/robots.txt added', (app) => app.write({ 'public/robots.txt': 'User-agent: *\n' })],
  [
    'app/page.jsx touched, its content unchanged',
    (app) =>
      app.write({ 'app/page.jsx': readFileSync(path.join(app.dir, 'app/page.jsx'), 'utf8') }),
  ],
  ['app/notes.txt added', (app) => app.write({ 'app/notes.txt': 'notes\n' })],
]

/**
 * How many of the changes in `UNREAD_CHANGES`, from the first, leave the CSS file name as it was.
 */
const NAME_KEPT_THROUGH = 3

/**
 * The modification time of the record the plugin left under `.next/cache`.
 */
function recordTime(app: NextApp): number {
  return statSync(path.join(app.dir, '.next/cache/navecss-prune.json')).mtimeMs
}

const CELLS = cells().map((cell) => [cell.name, cell] as const)
const WEBPACK_CELLS = cells()
  .filter((cell) => cell.bundler === 'webpack')
  .map((cell) => [cell.name, cell] as const)

const BUNDLERS: [string, string[]][] = [
  ['Turbopack', []],
  ['webpack', ['--webpack']],
]

describe.skipIf(SKIP_REASON !== undefined)(
  `warm builds with the hook${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-31: a call added to the page ships its atom on the warm build',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        expect(app.builtCss()).not.toContain('.nave-grid')
        app.write({ 'app/page.jsx': PAGE("'flex', 'grid'") })
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-grid')
      },
      TIMEOUT,
    )

    describe.each(CELLS)('%s', { retry: RETRY_ON_NEXT_CRASH }, (_name, cell) => {
      it(
        'AC-nextjs-used-atoms-32: five warm builds after changes the plugin did not read stay green, and the first three keep the CSS file name',
        async () => {
          const app = await newApp(cell)
          const cold = await build(app, cell)
          expect(cold.code, cold.output).toBe(0)
          let previous = builtPage(app, '/').names
          for (const [index, [change, apply]] of UNREAD_CHANGES.entries()) {
            apply(app)
            const warm = await build(app, cell)
            expect(warm.code, `${change}: ${warm.output}`).toBe(0)
            expect(warm.output, change).not.toContain('Nave stopped')
            expect(app.builtCss(), change).toContain('.nave-flex')
            const { names } = builtPage(app, '/')
            expect(names, `${change}: the CSS file name`).toEqual(
              index < NAME_KEPT_THROUGH ? previous : names,
            )
            previous = names
          }
        },
        TIMEOUT,
      )
    })

    describe.each(WEBPACK_CELLS)('%s', { retry: RETRY_ON_NEXT_CRASH }, (_name, cell) => {
      it(
        'AC-nextjs-used-atoms-32: guard: the check passes against a record an earlier build wrote, and fails on it for a change it can see',
        async () => {
          const app = await newApp(cell)
          useScratchPluginKeepingHook(app, 'both')
          const cold = await build(app, cell)
          expect(cold.code, cold.output).toBe(0)
          const runs = scratchRuns(app).length
          expect(runs, 'the scratch copy ran over atomic.css in the cold build').toBeGreaterThan(0)
          const written = recordTime(app)
          for (const [change, apply] of UNREAD_CHANGES) {
            apply(app)
            const warm = await build(app, cell)
            expect(warm.code, `${change}: ${warm.output}`).toBe(0)
            expect(warm.output, change).not.toContain('Nave stopped the build')
            expect(warm.output, change).not.toContain(
              'changed after @navecss/prune/postcss read it',
            )
            expect(scratchRuns(app), `${change}: the plugin did not run`).toHaveLength(runs)
            expect(recordTime(app), `${change}: the record is the cold build's`).toBe(written)
          }

          app.write({ 'app/page.jsx': PAGE("'flex', 'grid'") })
          const control = await build(app, cell)

          expect(control.code, control.output).not.toBe(0)
          expect(control.output).toMatch(
            /app\/page\.jsx changed after @navecss\/prune\/postcss read it/u,
          )
          expect(recordTime(app), "the record is still the cold build's").toBe(written)
        },
        TIMEOUT,
      )
    })

    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-06: new options on the warm build ship the new set',
      async (_bundler, flags) => {
        const app = createNextApp(config('grid'))
        apps.push(app)
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-grid')
        app.write({ 'next.config.mjs': config('block') })
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-block')
        expect(app.builtCss()).not.toContain('.nave-grid')
      },
      TIMEOUT,
    )

    it(
      'Turbopack: AC-nextjs-used-atoms-31: a warm build after the jsconfig paths are remapped never ships the old layer',
      async () => {
        const app = createNextApp()
        apps.push(app)
        app.write({
          'app/page.jsx': `import { cx } from '@navecss/core/cx'\nimport { Card } from '@/ui/Card'\n\nexport default function Page() {\n  return <div id="t" className={cx('flex')}><Card /></div>\n}\n`,
          'ui/Card.jsx': cardUsing('flex'),
          'alt/ui/Card.jsx': cardUsing('grid'),
        })
        const cold = await app.next(['build'])
        expect(cold.code, cold.output).toBe(0)
        expect(app.builtCss()).not.toContain('.nave-grid')
        app.write({
          'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./alt/*'] } } }),
        })
        const warm = await app.next(['build'])
        // Control: the new build bundles the card whose atom has no rule in the old layer.
        expect(builtScripts(app), 'the new build ships the alt card').toContain('nave-grid')
        // Either the plugin ran again and the layer holds the rule, or the build stopped.
        expect(warm.code !== 0 || app.builtCss().includes('.nave-grid'), warm.output).toBe(true)
      },
      TIMEOUT,
    )
  },
)
