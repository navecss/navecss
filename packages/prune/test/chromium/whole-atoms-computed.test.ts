/**
 * AC-nextjs-used-atoms-33 in Chromium: served by `next start`, after Tab reaches the button and
 * the skip link, their computed `outline-style`, `outline-width`, `width` and `clip-path` equal the
 * every-atom build's. The control splits `focusRing` and `srOnlyFocusable` by a scratch plugin that
 * keeps only rules whose selector is exactly an emitted class, which turns the row red while the
 * hook's own check stays green.
 */
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'
import type { Cell } from '../helpers/next-cells.ts'
import type { Floor } from '../helpers/whole-atoms-app.ts'

import { checkBuild } from '../../src/hook.ts'
import { HAS_CHROMIUM, withPage } from '../helpers/chromium.ts'
import { SKIP_REASON } from '../helpers/next-app.ts'
import { cells } from '../helpers/next-cells.ts'
import { buildApp, createVariantApp, FLOORS, FOCUS_FILES } from '../helpers/whole-atoms-app.ts'
import {
  focusStatesAt,
  rewriteBuiltCss,
  splitByScratchPlugin,
} from '../helpers/whole-atoms-browser.ts'

const TIMEOUT = 900_000
const EMITTED = ['focusRing', 'srOnlyFocusable']

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const SKIP = SKIP_REASON ?? (HAS_CHROMIUM ? undefined : 'Chromium is not installed')

/**
 * Builds the variant, expects it to succeed, serves it with `next start` and returns the app and
 * the computed styles after Tab.
 */
async function builtApp(cell: Cell, floor: Floor, variant: 'every' | 'trimmed'): Promise<NextApp> {
  const app = await createVariantApp(cell, variant, floor, FOCUS_FILES)
  apps.push(app)
  const run = await buildApp(app, cell)
  expect(run.code, `${variant} on ${cell.name} at the ${floor.name}:\n${run.output}`).toBe(0)
  return app
}

/**
 * Serves the built app with `next start`, reads its states after Tab and stops the server.
 */
async function statesOf(app: NextApp): ReturnType<typeof focusStatesAt> {
  const server = await app.start()
  try {
    await server.get('/')
    return await withPage((page) => focusStatesAt(page, server.origin))
  } finally {
    await server.stop()
  }
}

describe.skipIf(SKIP !== undefined)(
  `computed style after Tab, served by next start${SKIP === undefined ? '' : ` (skipped: ${SKIP})`}`,
  () => {
    for (const cell of cells()) {
      for (const floor of FLOORS) {
        it(
          `${cell.name}, ${floor.name}: AC-nextjs-used-atoms-33: the button and the skip link compute what the every-atom build computes, and a scratch split reds it while the hook stays green`,
          async () => {
            const every = await builtApp(cell, floor, 'every')
            const trimmed = await builtApp(cell, floor, 'trimmed')
            const wanted = await statesOf(every)
            // The reference is not vacuous: the ring shows and the skip link is revealed.
            expect(wanted.button['outline-style']).toBe('solid')
            expect(wanted.skipLink['clip-path']).toBe('none')
            expect(wanted.skipLink.width).not.toBe('1px')

            expect(await statesOf(trimmed)).toEqual(wanted)

            // Control: the same trimmed build with the rules a scratch plugin would drop.
            rewriteBuiltCss(trimmed, (css) => splitByScratchPlugin(css, EMITTED))
            const split = await statesOf(trimmed)
            expect(() => expect(split).toEqual(wanted)).toThrow()
            expect(split.button['outline-style']).toBe('none')
            expect(split.skipLink['clip-path']).not.toBe('none')
            expect(split.skipLink.width).toBe('1px')
            // The hook's check sees an emitted atom with no rule, never an atom missing one of
            // its rules, so it stays green on the split output.
            await expect(
              checkBuild(
                { projectDir: trimmed.dir, distDir: path.join(trimmed.dir, '.next') },
                {},
                { recordDistDir: '.next' },
              ),
            ).resolves.toBeUndefined()
          },
          TIMEOUT,
        )
      }
    }
  },
)
