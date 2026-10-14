/**
 * AC-base-ui-overlay-completion-21, Tier B: the tab indicator slides on `left`, `top`, `width` and
 * `height` only, over `motion.duration.base` on the standard easing, and unmounts nothing while it
 * does; under `prefers-reduced-motion: reduce` the same selection runs no animation.
 *
 * Read in a real engine, since only one runs a transition and reports it through `getAnimations()`.
 */

import type { ReactNode } from 'react'

import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Tabs } from '../../dist/tabs/index.js'
import {
  emulateReducedMotion,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { required } from './support/w8-actions.ts'
import { tokenEasing, tokenMilliseconds } from './support/w8-tokens.ts'

const pixels = (text: string): number => Number(text.replace(/px$/u, ''))

type Orientation = 'horizontal' | 'vertical'

const scene = (orientation: Orientation): ReactNode =>
  h(
    Tabs.Root,
    { defaultValue: 'one', orientation },
    h(
      Tabs.List,
      { 'data-testid': 'list' },
      h(Tabs.Tab, { 'data-testid': 'tab-one', value: 'one' }, 'One'),
      h(Tabs.Tab, { 'data-testid': 'tab-two', value: 'two' }, 'A longer second tab'),
      h(Tabs.Indicator, { 'data-testid': 'indicator' }),
    ),
    h(Tabs.Panel, { value: 'one' }, 'First'),
    h(Tabs.Panel, { value: 'two' }, 'Second'),
  )

/**
The properties the indicator may transition: the ones that move and size its box.
 */
const SLIDING = new Set(['height', 'left', 'top', 'width'])

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

/**
 * Selects the second tab and records what the indicator's animations are the moment Base UI
 * rewrites its style, and which nodes the tab list lost: a transition begins on the style
 * recalculation after that write, which `getAnimations()` forces, so the callback sees it
 * however slow the machine is.
 */
const selectSecond = async (
  indicator: HTMLElement,
): Promise<{ readonly animations: Animation[]; readonly removed: number }> => {
  let removed = 0
  const animations = new Set<Animation>()
  const lost = new MutationObserver((records) => {
    for (const record of records) {
      removed += record.removedNodes.length
    }
  })
  lost.observe(required('list'), { childList: true, subtree: true })
  const rewritten = new MutationObserver(() => {
    for (const animation of indicator.getAnimations()) {
      animations.add(animation)
    }
  })
  rewritten.observe(indicator, { attributeFilter: ['style'], attributes: true })
  await userEvent.click(required('tab-two'))
  await nextFrame()
  for (const animation of indicator.getAnimations()) {
    animations.add(animation)
  }
  lost.disconnect()
  rewritten.disconnect()
  return { animations: [...animations], removed }
}

describe.each<Orientation>(['horizontal', 'vertical'])(
  'AC-base-ui-overlay-completion-21: the %s tab indicator',
  (orientation) => {
    let page: Page | undefined
    let removeSheets: (() => void) | undefined

    afterEach(async () => {
      page?.dispose()
      removeSheets?.()
      page = undefined
      removeSheets = undefined
      await emulateReducedMotion('no-preference')
    })

    const start = async (): Promise<HTMLElement> => {
      removeSheets = useSheets(tokens, stylesheet)
      await emulateReducedMotion('no-preference')
      page = mount(scene(orientation))
      return (await settled(() => required('indicator'))) as HTMLElement
    }

    /**
     * The indicator at rest sits at the selected tab's box: Base UI writes that box into
     * `--active-tab-*`, and the stylesheet places the indicator by it, so the computed offsets
     * equal both the variables and the tab's own box in the list.
     */
    const expectAtTab = (indicator: HTMLElement): void => {
      const style = getComputedStyle(indicator)
      const tab = required('tab-two').getBoundingClientRect()
      const list = required('list').getBoundingClientRect()
      const variable = (name: string): number =>
        pixels(indicator.style.getPropertyValue(`--active-tab-${name}`))
      if (orientation === 'horizontal') {
        expect(pixels(style.left), 'left').toBeCloseTo(variable('left'), 3)
        expect(pixels(style.width), 'width').toBeCloseTo(variable('width'), 3)
        expect(variable('left'), '--active-tab-left').toBeCloseTo(tab.left - list.left, 1)
        expect(variable('width'), '--active-tab-width').toBeCloseTo(tab.width, 1)
      } else {
        expect(pixels(style.top), 'top').toBeCloseTo(variable('top'), 3)
        expect(pixels(style.height), 'height').toBeCloseTo(variable('height'), 3)
        expect(variable('top'), '--active-tab-top').toBeCloseTo(tab.top - list.top, 1)
        expect(variable('height'), '--active-tab-height').toBeCloseTo(tab.height, 1)
      }
    }

    it('AC-base-ui-overlay-completion-21: selecting another tab runs transitions on left, top, width and height only, over the base duration and the standard easing, and unmounts nothing', async () => {
      const indicator = await start()
      const { animations, removed } = await selectSecond(indicator)
      const base = tokenMilliseconds('--nave-motion-duration-base')
      expect(animations.length, 'the indicator runs a transition').toBeGreaterThan(0)
      const properties = animations.map((animation) =>
        animation instanceof CSSTransition
          ? animation.transitionProperty
          : animation.constructor.name,
      )
      for (const property of properties) {
        expect(SLIDING.has(property), `${property} is a sliding property`).toBe(true)
      }
      // The axis the indicator travels along is among them.
      expect(properties).toContain(orientation === 'horizontal' ? 'left' : 'top')
      for (const animation of animations) {
        const timing = animation.effect?.getTiming()
        expect(timing?.duration, 'duration').toBe(base)
        expect(timing?.easing, 'easing').toBe(tokenEasing('--nave-motion-easing-standard'))
      }
      expect(
        getComputedStyle(indicator).transitionProperty,
        'the properties it may transition',
      ).toBe('left, top, width, height')
      expect(removed, 'nodes removed from the tab list').toBe(0)
      expect(required('indicator'), 'the same indicator element').toBe(indicator)
      await Promise.all(animations.map((animation) => animation.finished))
      await nextFrame()
      expect(indicator.getAnimations(), 'nothing is left running').toEqual([])
      expectAtTab(indicator)
    })

    it('AC-base-ui-overlay-completion-21: under reduce the same selection runs no animation', async () => {
      const indicator = await start()
      await emulateReducedMotion('reduce')
      const { animations, removed } = await selectSecond(indicator)
      expect(animations).toEqual([])
      expect(removed, 'nodes removed from the tab list').toBe(0)
      expectAtTab(indicator)
    })
  },
)
