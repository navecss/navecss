/**
 * AC-nextjs-used-atoms-35 on a real build: the CSS file name follows the emitted set. A page that
 * calls `flex`, then `flex` and `grid`, then `flex` again is built in turn on one `.next`, beside
 * the same app built with every atom, and the file `next start` links for `/` changes with the
 * set, comes back with it, and is never the every-atom build's.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { cells, nextRootOf } from '../helpers/next-cells.ts'
import {
  cssNameOf,
  isBuiltFile,
  layerAtoms,
  pageCalling,
  stylesheetHrefs,
} from '../helpers/s3-used-atoms.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const WITHOUT_WRAPPER = 'export default {}\n'

interface Served {
  /**
   * The CSS file names the HTML `next start` serves for `/` links, sorted.
   */
  readonly names: string[]
  /**
   * The text of those files, as the server serves them.
   */
  readonly css: string
}

/**
 * Builds the app, serves it with `next start`, and reads what `/` links.
 */
async function builtAndServed(app: NextApp, flags: readonly string[]): Promise<Served> {
  const build = await app.next(['build', ...flags])
  expect(build.code, build.output).toBe(0)
  const server = await app.start()
  try {
    const page = await server.get('/')
    expect(page.status).toBe(200)
    const hrefs = stylesheetHrefs(page.text)
    expect(hrefs.length, 'the page links a stylesheet').toBeGreaterThan(0)
    const sheets = await Promise.all(hrefs.map((href) => server.get(href)))
    for (const sheet of sheets) expect(sheet.status).toBe(200)
    const names = hrefs.map((href) => cssNameOf(href)).toSorted((a, b) => a.localeCompare(b))
    // The files the served HTML links are in this build's static directory.
    for (const name of names) expect(isBuiltFile(app, name), name).toBe(true)
    return { names, css: sheets.map((sheet) => sheet.text).join('\n') }
  } finally {
    await server.stop()
  }
}

const CELLS = cells().map((cell) => [cell.name, cell] as const)

describe.skipIf(SKIP_REASON !== undefined)(
  `the CSS file name follows the emitted set${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(CELLS)(
      '%s: AC-nextjs-used-atoms-35: the file name changes with the emitted set and returns with it',
      async (_name, cell) => {
        const nextRoot = await nextRootOf(cell)
        const app = createNextApp(undefined, { nextRoot })
        apps.push(app)
        const every = createNextApp(WITHOUT_WRAPPER, { nextRoot })
        apps.push(every)

        // A, then B, then A again, on one `.next`.
        app.write({ 'app/page.jsx': pageCalling("'flex'") })
        const a = await builtAndServed(app, cell.flags)
        app.write({ 'app/page.jsx': pageCalling("'flex', 'grid'") })
        const b = await builtAndServed(app, cell.flags)
        app.write({ 'app/page.jsx': pageCalling("'flex'") })
        const c = await builtAndServed(app, cell.flags)

        // A's every-atom build.
        every.write({ 'app/page.jsx': pageCalling("'flex'") })
        const all = await builtAndServed(every, cell.flags)

        expect(a.names, "A's CSS file names").not.toEqual(b.names)
        expect(c.names, "C's CSS file names equal A's").toEqual(a.names)
        expect(all.names, "the every-atom build's CSS file names").not.toEqual(a.names)
        expect(all.names).not.toEqual(b.names)

        expect(layerAtoms(b.css), "B's layer has the grid rule").toContain('grid')
        expect(layerAtoms(a.css), "A's layer has no grid rule").not.toContain('grid')
        expect(layerAtoms(c.css), "C's layer has no grid rule").not.toContain('grid')
        expect(layerAtoms(a.css)).toContain('flex')
        // The control: the every-atom build's layer holds the rule A's lacks, so the comparison
        // can see a layer that was not trimmed.
        expect(layerAtoms(all.css), "the every-atom build's layer").toContain('grid')
      },
      TIMEOUT,
    )
  },
)
