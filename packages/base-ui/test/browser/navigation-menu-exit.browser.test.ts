/**
 * AC-base-ui-feedback-navigation-24: the Navigation Menu panel leaves with no empty frame, never
 * strands, and never drops focus to the body (`panel fade` signed), in a real engine with the built
 * tokens and stylesheet, through the built wrappers, with a per-frame sampler recording the
 * popup's computed opacity, whether it has a painted child, and where focus is.
 *
 * `vitest.browser.config.ts` runs this file at the Base UI the package is developed against and at
 * every minor from the floor.
 *
 * Four cases: Escape after a settled open with focus on the trigger; Escape after a settled open
 * with focus on a link in the panel; Escape 30ms into the fade-in with focus on a link in the panel;
 * the pointer leaving during the fade-in. Each shows no empty frame (the popup mounted at an
 * opacity above 0.01 with no painted child) and the popup removed within two frames of the frame
 * its exit starts. In the Escape cases focus is never on `<body>` and ends on the trigger. On open
 * the popup is at opacity 0 in its first sampled frame, its last sampled frame short of full opacity
 * falls within the fast duration plus 50ms, a frame at full opacity follows, and the fade it
 * declares is no longer than the fast duration plus 50ms: the declared length is what a stalled
 * page cannot move. With reduced motion switched on 30ms into the fade-in, then Escape, the popup
 * is removed within two frames and focus ends on the trigger.
 *
 * Two controls. The hazard reproduced: the fade-both-ways form with `transition-property: none`
 * injected 30ms into its exit stays mounted after 700ms at 1.3.0, 1.5.0 and 1.6.0. The empty-frame
 * control: the fade-in-only form with no exit key shows an empty frame on the mid Escape. Each form
 * is checked against the byte count and hash the spec prints before it is used. Both run their
 * fade at `CONTROL_FADE_MS`, because neither hazard depends on how long the transition is and a
 * busy machine can delay the act by more than the fast duration. With `panel fade` unsigned the
 * popup has no transition, is removed within two frames on every Escape and is opaque in its first
 * painted frame.
 *
 * Two stall controls on the fade-in bound. A page that stalls for 90ms inside the frame the sampler
 * reads, ahead of it, must not make a correct 100ms fade fail; a 300ms fade that stalls the same
 * way must still fail, which only the declared length can see. Each checks that its stall ran.
 */

import type { ReactNode } from 'react'

import baseUiPackage from '@base-ui/react/package.json' with { type: 'json' }
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { framesLater, isReachedWithin, MAX_FRAMES } from './support/frames.ts'
import {
  byTestId,
  emulateReducedMotion,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { parkPointer, required } from './support/w8-actions.ts'
import { tokenMilliseconds } from './support/w8-tokens.ts'
import { appears, atRest } from './support/w8-watch.ts'
import {
  forMilliseconds,
  type Frame,
  isEmptyFrame,
  navScene,
  sampleFrames,
  type Sampler,
  waitUntilSince,
} from './support/w10-nav.ts'
import {
  FADE_BOTH_WAYS,
  FADE_IN_ONLY,
  printedForm,
  withoutClass,
  withRule,
} from './support/w10-sheets.ts'

const BASE_UI = inject('baseUi')

/**
The versions at which the fade-both-ways form strands once a running exit is cancelled.
 */
const VERSIONS_THAT_STRAND = new Set(['1.3.0', '1.5.0', '1.6.0'])

/**
How many frames the popup may take to leave once its exit has started.
 */
const LEAVES_WITHIN_FRAMES = 2

/**
How long the two controls' fade runs, in place of the fast duration. The hazards they reproduce (an
exit cancelled while it runs, a panel emptied while it fades in) do not depend on the length of the
transition, but each control must act while the transition is running, "30ms into" it. On a busy
machine the act can come a few hundred milliseconds late, and at the fast duration (100ms) it then
lands after the transition and proves nothing. Under the 700ms the strand control waits: 400ms
leaves 300ms before that wait ends, so a form that did not strand is gone by then.
 */
const CONTROL_FADE_MS = 400

/**
How long the slow fade of the second stall control runs, past the fast duration plus 50ms.
 */
const SLOW_FADE_MS = 300

/**
The sheet with the fast duration token overridden for a control, in the layer that wins, so the
control's form is used byte for byte and only the length it runs at changes.
 */
const withControlFade = (sheet: string): string =>
  `${sheet}\n@layer overrides { :root { --nave-motion-duration-fast: ${String(CONTROL_FADE_MS)}ms } }\n`

/**
A time as the page computes it (`0.1s`, `100ms`), in milliseconds; anything else throws.
 */
const toMilliseconds = (time: string): number => {
  const parts = /^(-?\d*\.?\d+)(ms|s)$/.exec(time)
  if (parts === null) {
    throw new Error(`"${time}" is not a time`)
  }
  return Number(parts[1]) * (parts[2] === 'ms' ? 1 : 1000)
}

/**
The length of the fade the popup declares at rest: the delay plus the duration of its `opacity` (or
`all`) transition, found by position in the transition lists, which repeat to the length of the
property list. Throws when the popup transitions no opacity, so no length is ever guessed.
 */
const declaredFadeMilliseconds = (popup: Element): number => {
  const style = getComputedStyle(popup)
  const properties = style.transitionProperty.split(',').map((name) => name.trim())
  const index = properties.findLastIndex((name) => name === 'opacity' || name === 'all')
  if (index === -1) {
    throw new Error(
      `the popup transitions no opacity: transition-property is "${style.transitionProperty}"`,
    )
  }
  const at = (list: string): number => {
    const times = list.split(',').map((time) => time.trim())
    return toMilliseconds(times[index % times.length]!)
  }
  return at(style.transitionDelay) + at(style.transitionDuration)
}

/**
 * The fade-in checks of the opacity row, shared with the stall controls: the declared fade length
 * is within `fast + 50`; opacity is 0 in the first sampled frame; a frame reaches full opacity;
 * and the last sampled frame short of full opacity is within `fast + 50` of the first. Each frame
 * is stamped with the time its opacity was read at, so a callback that runs late cannot make a
 * short frame look late. A stall between frames can still hide how long the fade took, because the
 * next sampled frame is already opaque; the declared length covers that, so it is checked first.
 */
const expectFadeIn = (frames: readonly Frame[], popup: Element, fast: number): void => {
  expect(declaredFadeMilliseconds(popup), 'the declared fade-in length').toBeLessThanOrEqual(
    fast + 50,
  )
  const mounted = frames.filter((frame) => frame.isMounted)
  const [first] = mounted
  expect(first?.opacity, 'opacity in the first sampled frame').toBeLessThanOrEqual(0.01)
  expect(
    mounted.find((frame) => frame.opacity >= 0.999),
    'a frame at full opacity',
  ).toBeDefined()
  const lastShort = mounted.findLast((frame) => frame.opacity < 0.999)
  expect(
    lastShort!.time - first!.time,
    'to the last frame short of full opacity',
  ).toBeLessThanOrEqual(fast + 50)
}

/**
Blocks the page's main thread for the given milliseconds.
 */
const blockFor = (milliseconds: number): void => {
  const until = performance.now() + milliseconds
  while (performance.now() < until) {
    // Busy: nothing else on the page runs meanwhile.
  }
}

/**
 * A stall, registered before the sampler so it runs ahead of it in the same animation frame: the
 * first frame in which the popup's computed opacity is above `above`, it blocks the page once for
 * `milliseconds`. `landedAt` is the opacity it blocked at, or `undefined` while it has not run.
 */
const stallInFrame = (
  milliseconds: number,
  above: number,
): { readonly landedAt: () => number | undefined; readonly stop: () => void } => {
  let landedAt: number | undefined
  let handle = 0
  const tick = (): void => {
    const popup = byTestId('popup')
    const opacity = popup === undefined ? 0 : Number(getComputedStyle(popup).opacity)
    if (opacity > above) {
      landedAt = opacity
      blockFor(milliseconds)
      return
    }
    handle = requestAnimationFrame(tick)
  }
  handle = requestAnimationFrame(tick)
  return {
    landedAt: () => landedAt,
    stop: () => {
      cancelAnimationFrame(handle)
    },
  }
}

const scene = (): ReactNode =>
  h(
    'div',
    {},
    navScene(),
    h('div', {
      'data-testid': 'away',
      style: { bottom: 0, height: 40, position: 'fixed', right: 0, width: 40 },
    }),
  )

/**
 * What the sampler saw of one run: the frame at which the exit started (the first frame at or
 * after the act that has the popup ending or gone) and the frame at which it was gone.
 */
interface Run {
  readonly empty: readonly Frame[]
  readonly exitFrame: number | undefined
  readonly frames: readonly Frame[]
  readonly goneFrame: number | undefined
}

const summarise = (sampler: Sampler, actedAt: number): Run => {
  const frames = [...sampler.frames]
  const exit = frames.find(
    (frame) => frame.index >= actedAt && (frame.isEnding || !frame.isMounted),
  )
  const gone = frames.find((frame) => frame.index >= actedAt && !frame.isMounted)
  return {
    empty: frames.filter((frame) => isEmptyFrame(frame)),
    exitFrame: exit?.index,
    frames,
    goneFrame: gone?.index,
  }
}

const untilGone = async (): Promise<void> => {
  await isReachedWithin(() => byTestId('popup') === undefined, MAX_FRAMES)
  await framesLater(5)
}

const expectClean = (run: Run): void => {
  expect(run.empty.length, 'frames with the popup mounted, visible and empty').toBe(0)
  expect(run.exitFrame, 'the exit started').toBeDefined()
  expect(run.goneFrame, 'the popup was removed').toBeDefined()
  expect(
    run.goneFrame! - run.exitFrame!,
    'frames from the start of the exit to the popup being gone',
  ).toBeLessThanOrEqual(LEAVES_WITHIN_FRAMES)
}

const expectFocusStayedOffTheBody = (run: Run): void => {
  expect(
    run.frames.filter((frame) => frame.isBodyFocused).map((frame) => frame.index),
    'frames with focus on the body',
  ).toEqual([])
  expect(document.activeElement, 'focus ends on the trigger').toBe(required('trigger-guides'))
}

describe(`AC-base-ui-feedback-navigation-24: the panel's exit, at Base UI ${BASE_UI}`, () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let sampler: Sampler | undefined

  const start = (sheet = stylesheet): void => {
    removeSheets = useSheets(tokens, sheet)
    page = mount(scene())
  }

  beforeEach(async () => {
    await emulateReducedMotion('no-preference')
  })

  afterEach(async () => {
    sampler?.stop()
    page?.dispose()
    removeSheets?.()
    page = undefined
    sampler = undefined
    await emulateReducedMotion('no-preference')
  })

  /**
   * Opens the menu by keyboard from its trigger. The sampler runs from before the key, with focus
   * on the trigger, so no frame before the open counts against focus.
   */
  const openByKeyboard = async (): Promise<{ readonly mountedAt: number }> => {
    await settled(() => byTestId('trigger-guides'))
    required('trigger-guides').focus()
    sampler = sampleFrames()
    await userEvent.keyboard('{Enter}')
    await appears('popup')
    const first = sampler.frames.find((frame) => frame.isMounted)
    return { mountedAt: first?.time ?? performance.now() }
  }

  /**
   * Presses Escape and waits for the popup to go. The frame index just before the key is where
   * the exit is looked for from.
   */
  const pressEscape = async (): Promise<number> => {
    const actedAt = sampler!.frames.length
    await userEvent.keyboard('{Escape}')
    await untilGone()
    return actedAt
  }

  /**
   * Escape a given time into the fade-in, with focus put on the first link of the panel partway,
   * as a person tabbing in would.
   */
  const escapeDuringFadeIn = async (milliseconds: number): Promise<Run> => {
    const { mountedAt } = await openByKeyboard()
    await waitUntilSince(mountedAt, milliseconds - 10)
    required('panel-link-0').focus()
    await waitUntilSince(mountedAt, milliseconds)
    const actedAt = sampler!.frames.length
    await userEvent.keyboard('{Escape}')
    await untilGone()
    sampler!.stop()
    const run = summarise(sampler!, actedAt)
    // The case happened: the panel was part-way through its fade when the exit began.
    const before = run.frames.filter(
      (frame) => frame.index < (run.exitFrame ?? 0) && frame.isMounted,
    )
    const last = before.at(-1)
    expect(last, 'a sampled frame before the exit').toBeDefined()
    expect(last!.opacity, 'the fade-in was still running when the exit began').toBeLessThan(0.99)
    return run
  }

  describe('with panel fade signed', () => {
    it('AC-base-ui-feedback-navigation-24 (Tier B): Escape after a settled open with focus on the trigger shows no empty frame and the popup is gone within two frames', async () => {
      start()
      await openByKeyboard()
      await atRest('popup')
      required('trigger-guides').focus()
      const actedAt = await pressEscape()
      sampler!.stop()
      const run = summarise(sampler!, actedAt)
      expect(run.frames.length, 'frames were sampled').toBeGreaterThan(0)
      expectClean(run)
      expectFocusStayedOffTheBody(run)
    }, 30_000)

    it('AC-base-ui-feedback-navigation-24 (Tier B): Escape after a settled open with focus on a link shows no empty frame, never puts focus on the body and ends on the trigger', async () => {
      start()
      await openByKeyboard()
      await atRest('popup')
      required('panel-link-0').focus()
      const actedAt = await pressEscape()
      sampler!.stop()
      const run = summarise(sampler!, actedAt)
      expect(run.frames.length, 'frames were sampled').toBeGreaterThan(0)
      expectClean(run)
      expectFocusStayedOffTheBody(run)
    }, 30_000)

    it('AC-base-ui-feedback-navigation-24 (Tier B): Escape 30ms into the fade-in with focus on a link shows no empty frame, never puts focus on the body and ends on the trigger', async () => {
      start()
      const run = await escapeDuringFadeIn(30)
      expect(run.frames.length, 'frames were sampled').toBeGreaterThan(0)
      expectClean(run)
      expectFocusStayedOffTheBody(run)
    }, 30_000)

    it('AC-base-ui-feedback-navigation-24 (Tier B): the pointer leaving during the fade-in shows no empty frame and focus stays where it was', async () => {
      start()
      await settled(() => byTestId('trigger-guides'))
      await parkPointer()
      const before = document.activeElement
      sampler = sampleFrames()
      await userEvent.hover(required('trigger-guides'))
      await appears('popup')
      const actedAt = sampler.frames.length
      // Forced: a hover-opened menu blocks pointer events on the rest of the page at some versions,
      // and a pointer that leaves is what the case is about.
      await userEvent.hover(required('away'), { force: true })
      await untilGone()
      sampler.stop()
      expectClean(summarise(sampler, actedAt))
      expect(document.activeElement, 'after a pointer close focus stays where it was').toBe(before)
    }, 30_000)

    it('AC-base-ui-feedback-navigation-24 (Tier B): on open the popup is at opacity 0 in its first sampled frame and opaque within the fast duration plus 50ms', async () => {
      start()
      const fast = tokenMilliseconds('--nave-motion-duration-fast')
      await openByKeyboard()
      const popup = await atRest('popup')
      sampler!.stop()
      expect(sampler!.frames.length, 'frames were sampled').toBeGreaterThan(0)
      expectFadeIn(sampler!.frames, popup, fast)
    }, 30_000)

    it('AC-base-ui-feedback-navigation-24 (Tier B): with reduced motion switched on 30ms into the fade-in, then Escape, the popup is removed within two frames and focus ends on the trigger', async () => {
      start()
      const { mountedAt } = await openByKeyboard()
      await waitUntilSince(mountedAt, 30)
      await emulateReducedMotion('reduce')
      const actedAt = sampler!.frames.length
      await userEvent.keyboard('{Escape}')
      await untilGone()
      sampler!.stop()
      const run = summarise(sampler!, actedAt)
      expect(run.exitFrame, 'the exit started').toBeDefined()
      expect(run.goneFrame! - run.exitFrame!, 'frames to be gone').toBeLessThanOrEqual(
        LEAVES_WITHIN_FRAMES,
      )
      expect(document.activeElement, 'focus ends on the trigger').toBe(required('trigger-guides'))
    }, 30_000)
  })

  describe('the controls', () => {
    it.runIf(VERSIONS_THAT_STRAND.has(BASE_UI))(
      'AC-base-ui-feedback-navigation-24 (Tier B, strand control): the fade-both-ways form with transition-property none injected 30ms into its exit stays mounted after 700ms',
      async () => {
        const bothWays = await printedForm(FADE_BOTH_WAYS, {
          bytes: 480,
          hash: '571e1cc6666d29ab',
        })
        start(withControlFade(withRule(stylesheet, 'navigation-menu-fade', bothWays)))
        expect(
          tokenMilliseconds('--nave-motion-duration-fast'),
          'the control fade is in force',
        ).toBe(CONTROL_FADE_MS)
        await openByKeyboard()
        await atRest('popup')
        const popup = required('popup')
        await userEvent.keyboard('{Escape}')
        const isEnding = await isReachedWithin(
          () => Object.hasOwn(popup.dataset, 'endingStyle'),
          MAX_FRAMES,
        )
        expect(isEnding, 'the exit started').toBe(true)
        const endedAt = performance.now()
        await waitUntilSince(endedAt, 30)
        expect(
          popup.getAnimations().length,
          'the exit is running when the property is injected',
        ).toBeGreaterThan(0)
        const removeInjected = useSheets(
          `@layer overrides { .nave-base-ui-navigation-menu-fade { transition-property: none } }`,
        )
        try {
          await forMilliseconds(700)
          expect(popup.isConnected, 'the popup is stranded').toBe(true)
        } finally {
          removeInjected()
        }
      },
      30_000,
    )

    it('AC-base-ui-feedback-navigation-24 (Tier B, empty-frame control): the fade-in-only form with no exit key shows an empty frame on the Escape 30ms into the fade-in', async () => {
      const fadeInOnly = await printedForm(FADE_IN_ONLY, { bytes: 364, hash: 'ad98077420eeff98' })
      start(withControlFade(withRule(stylesheet, 'navigation-menu-fade', fadeInOnly)))
      expect(tokenMilliseconds('--nave-motion-duration-fast'), 'the control fade is in force').toBe(
        CONTROL_FADE_MS,
      )
      // Also checks that the fade-in was still running when the Escape came.
      const run = await escapeDuringFadeIn(30)
      expect(run.empty.length, 'frames with the popup mounted, visible and empty').toBeGreaterThan(
        0,
      )
    }, 30_000)
  })

  describe('the stall controls', () => {
    it('AC-base-ui-feedback-navigation-24 (Tier B, in-frame stall control): a 90ms stall late in the fade-in leaves the fade-in checks passing', async () => {
      start()
      const fast = tokenMilliseconds('--nave-motion-duration-fast')
      const stall = stallInFrame(90, 0.95)
      await openByKeyboard()
      const popup = await atRest('popup')
      sampler!.stop()
      stall.stop()
      expect(stall.landedAt(), 'the stall ran').toBeDefined()
      expect(stall.landedAt(), 'the stall ran inside the fade').toBeLessThan(0.999)
      expectFadeIn(sampler!.frames, popup, fast)
    }, 30_000)

    it('AC-base-ui-feedback-navigation-24 (Tier B, in-frame stall control, slow fade): a 300ms fade-in with a 250ms stall still fails the fade-in checks', async () => {
      start(
        `${stylesheet}\n@layer overrides { .nave-base-ui-navigation-menu-fade { transition-duration: ${String(SLOW_FADE_MS)}ms } }\n`,
      )
      const fast = tokenMilliseconds('--nave-motion-duration-fast')
      const stall = stallInFrame(250, 0.5)
      await openByKeyboard()
      const popup = await atRest('popup')
      sampler!.stop()
      stall.stop()
      expect(declaredFadeMilliseconds(popup), 'the slow fade is in force').toBe(SLOW_FADE_MS)
      expect(stall.landedAt(), 'the stall ran').toBeDefined()
      expect(stall.landedAt(), 'the stall ran inside the fade').toBeLessThan(0.999)
      // The stall starts past halfway and outlasts the fade, so the next sampled frame is already
      // opaque and the sampled frames cannot show how long the fade took: only the declared length
      // can fail it.
      expect(() => {
        expectFadeIn(sampler!.frames, popup, fast)
      }).toThrow('the declared fade-in length')
    }, 30_000)
  })

  describe('with panel fade unsigned', () => {
    it('AC-base-ui-feedback-navigation-24 (Tier B, panel fade unsigned): the popup has no transition, appears opaque in its first painted frame and is removed within two frames of every Escape', async () => {
      start(withoutClass(stylesheet, 'navigation-menu-fade'))
      const { mountedAt } = await openByKeyboard()
      const popup = required('popup')
      expect(
        popup.classList.contains('nave-base-ui-navigation-menu-fade'),
        'the wrapper still adds the class',
      ).toBe(true)
      expect(getComputedStyle(popup).transitionDuration, 'no transition').toBe('0s')
      const first = sampler!.frames.find((frame) => frame.isMounted)
      expect(first?.opacity, 'opaque in the first painted frame').toBe(1)
      await waitUntilSince(mountedAt, 30)
      const settledAt = sampler!.frames.length
      await userEvent.keyboard('{Escape}')
      await untilGone()
      sampler!.stop()
      const run = summarise(sampler!, settledAt)
      expect(run.exitFrame, 'the exit started').toBeDefined()
      expect(run.goneFrame! - run.exitFrame!, 'frames to be gone').toBeLessThanOrEqual(
        LEAVES_WITHIN_FRAMES,
      )
    }, 30_000)
  })

  it('AC-base-ui-feedback-navigation-24: the Base UI under test is the version this run names', () => {
    expect(baseUiPackage.version).toBe(BASE_UI)
  })
})
