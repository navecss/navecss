import type { Page } from 'playwright'

/**
 * AC-nextjs-used-atoms-05 on a real build and a real browser: a warm build and a running dev
 * server follow the code, and each declaration the plugin gives the bundler is what makes them.
 *
 * - Warm: a page gains a call, a new route is added, a new component is added and imported. Each
 *   build is green and ships its atom under a new CSS file name.
 * - Dev: the same edits reach the open document with no reload and no restart.
 * - Controls: a scratch copy of the plugin that returns no `dependency` message, and one that
 *   returns no `dir-dependency` message, each with the hook dropped, ship the old layer.
 */
import { rmSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'
import type { Cell } from '../helpers/next-cells.ts'

import { HAS_CHROMIUM, withPage } from '../helpers/chromium.ts'
import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { cells, nextRootOf } from '../helpers/next-cells.ts'
import { pause } from '../helpers/next-process.ts'
import {
  builtPage,
  layerAtoms,
  pageCalling,
  scratchLogOf,
  scratchRuns,
  useScratchPlugin,
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

const NEW_ROUTE = [
  "import { cx } from '@navecss/core/cx'",
  '',
  'export default function New() {',
  '  return <p id="n" className={cx(\'block\')}>new</p>',
  '}',
  '',
].join('\n')

const EXTRA = [
  "import { cx } from '@navecss/core/cx'",
  '',
  'export function Extra() {',
  "  return <p className={cx('hidden')}>extra</p>",
  '}',
  '',
].join('\n')

const PAGE_WITH_EXTRA = [
  "import { cx } from '@navecss/core/cx'",
  "import { Extra } from '@/components/Extra'",
  '',
  'export default function Page() {',
  "  return <div id=\"t\" className={cx('flex', 'grid')}><Extra /></div>",
  '}',
  '',
].join('\n')

async function newApp(cell: Cell): Promise<NextApp> {
  const app = createNextApp(undefined, { nextRoot: await nextRootOf(cell) })
  apps.push(app)
  return app
}

/**
 * Builds the app, expecting it to be green.
 */
async function buildGreen(app: NextApp, cell: Cell): Promise<void> {
  const run = await app.next(['build', ...cell.flags])
  expect(run.code, run.output).toBe(0)
}

/**
 * Whether the document's stylesheets hold a rule for the atom's class, in the browser.
 */
async function isRuleIn(page: Page, className: string): Promise<boolean> {
  const source = String.raw`(() => {
    const pattern = new RegExp('\\.' + ${JSON.stringify(className)} + '(?![\\w-])')
    return [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) => pattern.test(rule.cssText))
      } catch {
        return false
      }
    })
  })()`
  return await page.evaluate<boolean>(source)
}

/**
 * Whether `isDone` holds; a check that throws (a document that is reloading) does not hold.
 */
async function isDoneOrFalse(isDone: () => Promise<boolean>): Promise<boolean> {
  try {
    return await isDone()
  } catch {
    return false
  }
}

/**
 * Waits until `isDone` holds.
 */
async function until(isDone: () => Promise<boolean>, what: string): Promise<void> {
  const end = Date.now() + 240_000
  while (Date.now() < end) {
    if (await isDoneOrFalse(isDone)) return
    await pause(1000)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const CELLS = cells().map((cell) => [cell.name, cell] as const)
// Turbopack runs the stylesheet again on every build, so the control for directories has nothing
// to show there: it runs on webpack.
const NEWEST = cells(['newest'])
  .filter((cell) => cell.bundler === 'webpack')
  .map((cell) => [cell.name, cell] as const)

describe.skipIf(SKIP_REASON !== undefined || !HAS_CHROMIUM)(
  `a warm build and a running dev server follow the code${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(CELLS)(
      '%s: AC-nextjs-used-atoms-05: each warm build ships its new atom under a new CSS file name',
      async (_name, cell) => {
        const app = await newApp(cell)
        await buildGreen(app, cell)
        let previous = builtPage(app, '/')
        expect(layerAtoms(previous.css)).toEqual(['flex'])

        // (a) the page gains `cx('grid')`.
        app.write({ 'app/page.jsx': pageCalling("'flex', 'grid'") })
        await buildGreen(app, cell)
        const a = builtPage(app, '/')
        expect(layerAtoms(a.css)).toContain('grid')
        expect(a.names, '(a) ships a new CSS file name').not.toEqual(previous.names)
        previous = a

        // (b) a new route calls `cx('block')`.
        app.write({ 'app/new/page.jsx': NEW_ROUTE })
        await buildGreen(app, cell)
        const b = builtPage(app, '/new')
        expect(layerAtoms(b.css)).toContain('block')
        expect(b.names, '(b) ships a new CSS file name').not.toEqual(previous.names)
        expect(builtPage(app, '/').names, 'both routes link the same file').toEqual(b.names)
        previous = b

        // (c) a new component calls `cx('hidden')`, and the page imports it.
        app.write({ 'components/Extra.jsx': EXTRA, 'app/page.jsx': PAGE_WITH_EXTRA })
        await buildGreen(app, cell)
        const c = builtPage(app, '/')
        expect(layerAtoms(c.css)).toContain('hidden')
        expect(layerAtoms(c.css)).toContain('block')
        expect(c.names, '(c) ships a new CSS file name').not.toEqual(previous.names)
      },
      TIMEOUT,
    )

    it.each(CELLS)(
      '%s: AC-nextjs-used-atoms-05: next dev gives the open document the new rules, with no reload and no restart',
      async (_name, cell) => {
        const app = await newApp(cell)
        const server = await app.dev(cell.flags)
        // The first request waits until the server answers and has compiled `/`.
        await server.css('/')
        // The browser uses `localhost`: the server refuses its hot-reload socket to `127.0.0.1`.
        const origin = server.origin.replace('127.0.0.1', 'localhost')
        await withPage(async (page) => {
          await page.goto(`${origin}/`, { waitUntil: 'load' })
          await page.evaluate('window.__mark = 1')
          expect(await isRuleIn(page, 'nave-flex')).toBe(true)
          expect(await isRuleIn(page, 'nave-grid')).toBe(false)

          // (a) the page gains `cx('grid')`: the same document gets the rule.
          app.write({ 'app/page.jsx': pageCalling("'flex', 'grid'") })
          await until(
            async () =>
              (await isRuleIn(page, 'nave-grid')) &&
              (await page.evaluate<boolean>(
                "document.querySelector('#t').className.includes('nave-grid')",
              )),
            'the nave-grid rule on #t in the open document',
          )
          expect(
            await page.evaluate<number>('window.__mark'),
            'the document was not reloaded',
          ).toBe(1)

          // (b) a new route is requested and has its rule.
          app.write({ 'app/new/page.jsx': NEW_ROUTE })
          await until(async () => {
            await page.goto(`${origin}/new`, { waitUntil: 'load' })
            return isRuleIn(page, 'nave-block')
          }, 'the nave-block rule on /new')
          expect(server.output(), 'the server was not restarted').not.toMatch(/restart/i)
        })
      },
      TIMEOUT,
    )

    it.each(CELLS)(
      '%s: AC-nextjs-used-atoms-05: control (dependency messages): without them a warm build keeps the previous layer',
      async (_name, cell) => {
        const app = await newApp(cell)
        useScratchPlugin(app, 'both')
        await buildGreen(app, cell)
        // The scratch copy removed messages the real plugin returned, so the fixture reaches the case.
        const cold = scratchRuns(app)
        expect(cold.length).toBeGreaterThan(0)
        expect(cold.at(-1)).toBeGreaterThan(0)
        const before = builtPage(app, '/')
        expect(layerAtoms(before.css)).toEqual(['flex'])

        app.write({ 'app/page.jsx': pageCalling("'flex', 'grid'") })
        await buildGreen(app, cell)
        const after = builtPage(app, '/')
        const isRanAgain = scratchRuns(app).length > cold.length
        const isStale = !layerAtoms(after.css).includes('grid')
        const isSameName = after.names.join(',') === before.names.join(',')
        // On Turbopack the stylesheet runs again on every build once the hand-off variable is set
        // (measured on 16.2.0 and on 16.4.1, with every message dropped), so there the control
        // cannot show a stale layer: the row accepts either outcome, as long as the file name and
        // the layer agree with whether the plugin ran. Webpack serves the stylesheet from its
        // cache, and the control shows the stale layer there.
        const isRerunCell = cell.bundler === 'turbopack'
        expect(isStale, 'the layer is the previous one exactly when the plugin did not run').toBe(
          !isRanAgain,
        )
        expect(isSameName, 'the CSS file name is the previous one exactly when the layer is').toBe(
          isStale,
        )
        expect(
          isRanAgain && !isRerunCell,
          'the stylesheet was served from the bundler cache, so the plugin did not run again',
        ).toBe(false)
      },
      TIMEOUT,
    )

    it.each(NEWEST)(
      '%s: AC-nextjs-used-atoms-05: control (directories): without them a new route from a cold first build ships without its atom',
      async (_name, cell) => {
        const app = await newApp(cell)
        useScratchPlugin(app, 'dir-dependency')
        await buildGreen(app, cell)
        const cold = scratchRuns(app)
        expect(cold.length).toBeGreaterThan(0)
        expect(cold.at(-1)).toBeGreaterThan(0)
        const before = builtPage(app, '/')

        app.write({ 'app/new/page.jsx': NEW_ROUTE })
        await buildGreen(app, cell)
        const route = builtPage(app, '/new')
        expect(scratchRuns(app), 'the plugin did not run again').toHaveLength(cold.length)
        expect(layerAtoms(route.css), '/new is built and links the old layer').toEqual(['flex'])
        expect(route.names).toEqual(before.names)
      },
      TIMEOUT,
    )
  },
)
