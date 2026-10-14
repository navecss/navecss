/**
 * AC-base-ui-feedback-navigation-15, fourth clause: a button-closed toast whose exit is running
 * when the reduced-motion setting flips still unmounts, at Base UI 1.6.0 and at the version the
 * package is developed against.
 *
 * Base UI at 1.5.0 and 1.6.0 never counts an aborted exit transition as finished. The stylesheet's
 * guard sets `transition-duration` to 0s, which leaves the transition that is already running to
 * finish; the property form (`transition-property: none` in its place) cancels it, and at 1.6.0 the
 * closed toast then stays mounted. That form is run here as the control: a check that the real
 * guard leaves nothing behind proves nothing unless the form it rules out is seen to leave
 * something. It uses the method of the overlay completion's reduced-motion file: an exit made
 * long enough to still be running at the flip, so no stall of the page can finish it first, and the
 * time that would pass passed by finishing the running animations.
 *
 * `vitest.browser.config.ts` runs this file at the Base UI the package is developed against and at
 * every minor it lists for it.
 */
import baseUiPackage from '@base-ui/react/package.json' with { type: 'json' }
import { afterEach, describe, expect, inject, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { framesLater, isReachedWithin, MAX_FRAMES } from './support/frames.ts'
import {
  byTestId,
  emulateReducedMotion,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { atRest } from './support/w8-watch.ts'
import { GUARD, GUARDS, PROPERTY_FORM } from './support/w10-sheets.ts'
import { closeOf, createManager, raise, toastScene } from './support/w10-toast.ts'

const BASE_UI = inject('baseUi')

/**
Long enough that the exit is still running whenever the flip is made.
 */
const LONG_EXIT = `@layer overrides { :root { --nave-motion-duration-fast: 60000ms; --nave-motion-duration-base: 60000ms } }`

/**
Frames given to Base UI, once an exit has started, to begin waiting for its transition to finish.
 */
const STARTED_FRAMES = 5

/**
Frames for the page to recalculate its styles under a changed setting.
 */
const STYLE_FRAMES = 3

/**
The most the spec gives a closed toast to leave the page after the flip.
 */
const REMOVED_WITHIN_MS = 500

const isReduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

describe(`AC-base-ui-feedback-navigation-15: a reduced-motion flip during a toast's exit, at Base UI ${BASE_UI}`, () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  afterEach(async () => {
    page?.dispose()
    removeSheets?.()
    page = undefined
    await emulateReducedMotion('no-preference')
  })

  /**
   * Closes the toast with its button, flips to reduce while its exit runs, lets the running
   * transition finish, and reports whether the root is gone 500ms after that.
   */
  const closeThenFlip = async (
    sheet: string,
  ): Promise<{ readonly isEnding: boolean; readonly isMounted: boolean; readonly ms: number }> => {
    const removeBase = useSheets(tokens, sheet)
    removeSheets = removeBase
    await emulateReducedMotion('no-preference')
    const manager = createManager()
    page = mount(toastScene({ manager }))
    raise(manager, 'flipped')
    const root = (await settled(() => byTestId('toast-flipped'))) as HTMLElement
    await atRest('toast-flipped')
    // Only the exit is made long: the toast came in at the usual speed.
    const removeLong = useSheets(LONG_EXIT)
    removeSheets = () => {
      removeBase()
      removeLong()
    }
    await userEvent.click(closeOf('flipped'))
    const isRunning = await isReachedWithin(
      () => Object.hasOwn(root.dataset, 'endingStyle') && root.getAnimations().length > 0,
      MAX_FRAMES,
    )
    expect(isRunning, 'the exit is running when the flip is made').toBe(true)
    await framesLater(STARTED_FRAMES)
    await emulateReducedMotion('reduce')
    expect(await isReachedWithin(isReduced, MAX_FRAMES), 'the page took the setting').toBe(true)
    await framesLater(STYLE_FRAMES)
    for (const animation of root.getAnimations()) {
      animation.finish()
    }
    const flippedAt = performance.now()
    await isReachedWithin(
      () => !root.isConnected || performance.now() - flippedAt > REMOVED_WITHIN_MS,
      MAX_FRAMES,
    )
    return {
      isEnding: Object.hasOwn(root.dataset, 'endingStyle'),
      isMounted: root.isConnected,
      ms: performance.now() - flippedAt,
    }
  }

  it('AC-base-ui-feedback-navigation-15: the Base UI under test is the version this run names', () => {
    expect(baseUiPackage.version).toBe(BASE_UI)
  })

  it('AC-base-ui-feedback-navigation-15 (Tier B): the guard leaves the running exit to finish and the root is removed within 500ms', async () => {
    const outcome = await closeThenFlip(stylesheet)
    expect(outcome.isMounted, 'the root is still in the document').toBe(false)
    expect(outcome.ms, 'removed within 500ms of the flip').toBeLessThanOrEqual(REMOVED_WITHIN_MS)
  })

  it.runIf(BASE_UI === '1.6.0')(
    'AC-base-ui-feedback-navigation-15 (Tier B): the property form leaves the root mounted after 500ms (control)',
    async () => {
      expect(stylesheet.split(GUARD).length - 1, 'guards in the built stylesheet').toBe(GUARDS)
      const outcome = await closeThenFlip(stylesheet.split(GUARD).join(PROPERTY_FORM))
      expect(outcome.isMounted, 'the root is still in the document').toBe(true)
      expect(outcome.isEnding, 'with data-ending-style').toBe(true)
    },
  )
})
