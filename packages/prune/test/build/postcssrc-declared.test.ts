/**
 * A PostCSS config named `.postcssrc.json`, the first name Next.js looks for, on webpack: webpack
 * reads a declared directory at every depth but skips each entry whose name begins with a dot, so
 * the config is declared by name, and an edit to it runs the plugin again instead of failing the
 * warm build.
 */
import { statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'
import type { Cell } from '../helpers/next-cells.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { cells, nextRootOf } from '../helpers/next-cells.ts'
import { noteNextCrash, RETRY_ON_NEXT_CRASH } from '../helpers/next-crash.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const WEBPACK_CELLS = cells()
  .filter((cell) => cell.bundler === 'webpack')
  .map((cell) => [cell.name, cell] as const)

const CONFIG = '{ "plugins": { "@navecss/prune/postcss": {} } }\n'
const CONFIG_ON_TWO_LINES = '{\n  "plugins": { "@navecss/prune/postcss": {} }\n}\n'

/**
 * The modification time of the record the plugin left under `.next/cache`.
 */
function recordTime(app: NextApp): number {
  return statSync(path.join(app.dir, '.next/cache/navecss-prune.json')).mtimeMs
}

/**
 * Builds the app on the cell's bundler and notes Next.js 16.2.0's crash if the build printed it.
 */
async function build(app: NextApp, cell: Cell): Promise<Run> {
  const run = await app.next(['build', ...cell.flags])
  noteNextCrash(run.output)
  return run
}

describe.skipIf(SKIP_REASON !== undefined)(
  `a PostCSS config named .postcssrc.json${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(WEBPACK_CELLS)('%s', { retry: RETRY_ON_NEXT_CRASH }, (_name, cell) => {
      it(
        'AC-nextjs-used-atoms-04: an edit to the config on a warm build runs the plugin again and the build exits 0, while a warm build with no edit does not run it',
        async () => {
          const app = createNextApp(undefined, { nextRoot: await nextRootOf(cell) })
          apps.push(app)
          app.delete('postcss.config.mjs')
          app.write({ '.postcssrc.json': CONFIG })
          const cold = await build(app, cell)
          expect(cold.code, cold.output).toBe(0)
          const written = recordTime(app)

          const control = await build(app, cell)
          expect(control.code, control.output).toBe(0)
          expect(recordTime(app), 'a warm build with no edit leaves the record as it was').toBe(
            written,
          )

          app.write({ '.postcssrc.json': CONFIG_ON_TWO_LINES })
          const edited = await build(app, cell)

          expect(edited.code, edited.output).toBe(0)
          expect(recordTime(app), 'the plugin ran again and wrote the record').not.toBe(written)
          expect(edited.output).not.toContain('changed after @navecss/prune/postcss read it')
        },
        TIMEOUT,
      )
    })
  },
)
