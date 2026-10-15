/**
 * AC-base-ui-feedback-navigation-21 (the trigger's states), -22 (Tier B clauses: the Icon turns on
 * its trigger's `aria-expanded`) and -25 (Tier B clause: the list's computed layout), in a real
 * engine with the built tokens and stylesheet, through the built wrappers.
 *
 * -21 runs in light and in dark, at Base UI 1.3.0 and at the version the package is developed
 * against: `vitest.browser.config.ts` runs this file at the floor as well as at the current
 * version. A trigger is transparent at rest and as tall as a secondary medium button; it fills with
 * `action.highlight` under `:hover` and `:active`; open with the pointer moved into the panel it is
 * transparent again (the hovered state of the same trigger is the positive control); a disabled
 * trigger does not fill on hover (the enabled trigger's fill is the positive control); a trigger
 * focused by keyboard draws `focusRing`, and the list's gap is at least the ring's reach.
 */
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
import { colorOf, lengthOf, px, ring, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { parkPointer, required } from './support/w8-actions.ts'
import { tokenMilliseconds } from './support/w8-tokens.ts'
import { navScene, type NavSceneOptions } from './support/w10-nav.ts'
import { dragTo, pressOn, releaseOn } from './support/w10-pointer.ts'

const BASE_UI = inject('baseUi')
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const

const border = (style: CSSStyleDeclaration): string[] =>
  SIDES.map((side) => style[`border${side}Color`])

/**
Waits for the transitions on the element to end, so what is read is where the element rests.
 */
const rested = async (element: HTMLElement): Promise<void> => {
  await isReachedWithin(() => element.getAnimations().length === 0, MAX_FRAMES)
}

describe(`AC-base-ui-feedback-navigation-21, -22 and -25: the Navigation Menu trigger, icon and list, at Base UI ${BASE_UI}`, () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  const show = async (scheme: Scheme, options: NavSceneOptions = {}): Promise<void> => {
    removeSheets = useSheets(tokens, stylesheet)
    removeScheme = useScheme(scheme)
    page = mount(
      h(
        'div',
        { style: { padding: 48 } },
        navScene(options),
        h('div', {
          'data-testid': 'away',
          style: { bottom: 0, height: 40, position: 'fixed', right: 0, width: 40 },
        }),
      ),
    )
    await settled(() => byTestId('trigger-guides'))
    await parkPointer()
  }

  beforeEach(() => {
    document.body.focus()
  })

  afterEach(async () => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
    await emulateReducedMotion('no-preference')
  })

  it('AC-base-ui-feedback-navigation-21: the Base UI under test is the version this run names', () => {
    expect(baseUiPackage.version).toBe(BASE_UI)
  })

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-21 (Tier B): at rest a trigger is transparent, in the primary text colour, as tall as a secondary medium button', async () => {
      await show(scheme)
      const trigger = required('trigger-guides')
      expect(trigger.matches(':hover'), 'the pointer is away').toBe(false)
      const style = getComputedStyle(trigger)
      expect(style.backgroundColor).toBe(TRANSPARENT)
      expect(border(style)).toEqual(SIDES.map(() => TRANSPARENT))
      expect(style.color).toBe(colorOf('var(--nave-color-content-primary)'))
      // A secondary medium Button is Base UI's button with this class and nothing else, so the
      // reference is the plain element: no Base UI subpath beyond the Navigation Menu's is loaded
      // at the minors this file runs at.
      const reference = mount(
        h('button', { className: 'nave-base-ui-button', 'data-testid': 'secondary' }, 'Save'),
      )
      try {
        const secondary = required('secondary')
        expect(getComputedStyle(secondary).backgroundColor, 'the secondary fills').not.toBe(
          TRANSPARENT,
        )
        const height = trigger.getBoundingClientRect().height
        expect(height, 'block size against a secondary button').toBeCloseTo(
          secondary.getBoundingClientRect().height,
          2,
        )
        expect(height, 'block size').toBeCloseTo(40, 2)
        expect(height, 'block size against the control size token').toBeCloseTo(
          lengthOf('var(--nave-size-control-md)'),
          2,
        )
      } finally {
        reference.dispose()
      }
    })

    it('AC-base-ui-feedback-navigation-21 (Tier B): under :hover it fills with the highlight', async () => {
      await show(scheme)
      const trigger = required('trigger-guides')
      await userEvent.hover(trigger)
      expect(trigger.matches(':hover')).toBe(true)
      const style = getComputedStyle(trigger)
      expect(style.backgroundColor).toBe(colorOf('var(--nave-color-action-highlight)'))
      expect(border(style)).toEqual(SIDES.map(() => TRANSPARENT))
    })

    it('AC-base-ui-feedback-navigation-21 (Tier B): under :active, the button held down and the pointer moved away, it fills with the highlight', async () => {
      await show(scheme)
      const trigger = required('trigger-guides')
      await pressOn(trigger)
      try {
        await dragTo(required('away'))
        expect(trigger.matches(':active'), 'the trigger is active').toBe(true)
        expect(trigger.matches(':hover'), 'the pointer is away').toBe(false)
        expect(getComputedStyle(trigger).backgroundColor).toBe(
          colorOf('var(--nave-color-action-highlight)'),
        )
      } finally {
        await releaseOn(required('away'))
      }
      expect(trigger.matches(':active'), 'released').toBe(false)
      expect(getComputedStyle(trigger).backgroundColor, 'and transparent again').toBe(TRANSPARENT)
    })

    it('AC-base-ui-feedback-navigation-21 (Tier B): open, with the pointer moved into the panel, it is transparent; hovered it was filled (the positive control)', async () => {
      await show(scheme)
      const trigger = required('trigger-guides')
      await userEvent.click(trigger)
      await settled(() => byTestId('panel-link-0'))
      expect(trigger.matches(':hover'), 'the pointer is over the trigger').toBe(true)
      expect(getComputedStyle(trigger).backgroundColor, 'hovered').toBe(
        colorOf('var(--nave-color-action-highlight)'),
      )
      await userEvent.hover(required('panel-link-0'))
      expect(trigger.getAttribute('aria-expanded'), 'open').toBe('true')
      expect(trigger.matches(':hover'), 'the pointer is inside the panel').toBe(false)
      expect(trigger.matches(':active'), 'the trigger is not pressed').toBe(false)
      expect(getComputedStyle(trigger).backgroundColor, 'open, pointer away').toBe(TRANSPARENT)
    })

    it('AC-base-ui-feedback-navigation-21 (Tier B): a disabled trigger stays transparent on hover, the enabled trigger filling on the same hover (the positive control)', async () => {
      await show(scheme, { isReferenceDisabled: true })
      const enabled = required('trigger-guides')
      const disabled = required('trigger-reference')
      expect(
        disabled.matches(':disabled, [aria-disabled="true"]'),
        'disabled one way or the other',
      ).toBe(true)
      await userEvent.hover(enabled)
      expect(getComputedStyle(enabled).backgroundColor, 'the enabled trigger on hover').toBe(
        colorOf('var(--nave-color-action-highlight)'),
      )
      // The enabled trigger's hover may have opened its menu, and a hover-opened menu blocks pointer
      // events on the page at some versions: the pointer leaves by force, and the next hover waits
      // until the menu is gone and the page takes pointer events again.
      await userEvent.hover(required('away'), { force: true })
      await userEvent.keyboard('{Escape}')
      const isQuiet = await isReachedWithin(
        () =>
          byTestId('popup') === undefined &&
          getComputedStyle(document.body).pointerEvents !== 'none' &&
          getComputedStyle(document.documentElement).pointerEvents !== 'none',
        MAX_FRAMES,
      )
      expect(isQuiet, 'the menu is gone and the page takes pointer events').toBe(true)
      expect(getComputedStyle(enabled).backgroundColor, 'the enabled trigger once away').toBe(
        TRANSPARENT,
      )
      await userEvent.hover(disabled)
      expect(disabled.matches(':hover'), 'the pointer is over the disabled trigger').toBe(true)
      expect(getComputedStyle(disabled).backgroundColor).toBe(TRANSPARENT)
    })

    it('AC-base-ui-feedback-navigation-21 (Tier B): a trigger focused by keyboard draws focusRing, and the list gap is at least the ring reach', async () => {
      await show(scheme)
      document.body.focus()
      await userEvent.tab()
      const trigger = required('trigger-guides')
      expect(document.activeElement, 'Tab reached the first trigger').toBe(trigger)
      expect(trigger.matches(':focus-visible')).toBe(true)
      const style = getComputedStyle(trigger)
      const { offset, width } = ring()
      expect({
        offset: px(style.outlineOffset),
        style: style.outlineStyle,
        width: px(style.outlineWidth),
      }).toEqual({ offset, style: 'solid', width })
      const gap = px(getComputedStyle(required('list')).columnGap)
      expect(gap, 'the list gap').toBe(4)
      expect(gap, 'the gap against the ring reach').toBeGreaterThanOrEqual(width + offset)
    })
  })

  describe('the Icon', () => {
    it('AC-base-ui-feedback-navigation-22 (Tier B): the Icon computes rotate 180deg while its trigger is open and none when closed, in one rotate transition of 100ms', async () => {
      await show('light')
      const trigger = required('trigger-guides')
      const icon = required('icon-guides')
      expect(icon.parentElement, 'the Icon is a direct child of its trigger').toBe(trigger)
      expect(getComputedStyle(icon).rotate, 'closed').toBe('none')
      let transitions: { duration: number; property: string }[] = []
      const observer = new MutationObserver(() => {
        if (trigger.getAttribute('aria-expanded') === 'true' && transitions.length === 0) {
          transitions = icon.getAnimations().map((animation) => ({
            duration: Number(animation.effect?.getTiming().duration),
            property: animation instanceof CSSTransition ? animation.transitionProperty : '',
          }))
        }
      })
      observer.observe(trigger, { attributeFilter: ['aria-expanded'], attributes: true })
      await userEvent.click(trigger)
      await isReachedWithin(() => trigger.getAttribute('aria-expanded') === 'true', MAX_FRAMES)
      observer.disconnect()
      expect(transitions, 'the transition the opening began').toEqual([
        { duration: tokenMilliseconds('--nave-motion-duration-fast'), property: 'rotate' },
      ])
      expect(transitions[0]?.duration, 'in 100ms').toBe(100)
      await rested(icon)
      expect(getComputedStyle(icon).rotate, 'open').toBe('180deg')
      expect(Object.hasOwn(trigger.dataset, 'popupOpen'), 'data-popup-open').toBe(true)
      expect(Object.hasOwn(trigger.dataset, 'pressed'), 'data-pressed').toBe(true)
      await userEvent.keyboard('{Escape}')
      await isReachedWithin(() => trigger.getAttribute('aria-expanded') === 'false', MAX_FRAMES)
      await rested(icon)
      expect(getComputedStyle(icon).rotate, 'closed again').toBe('none')
    })

    it('AC-base-ui-feedback-navigation-22 (Tier B): under prefers-reduced-motion: reduce the Icon computes a transition-duration of 0s, and 0.1s under no preference (the positive control)', async () => {
      await show('light')
      const icon = required('icon-guides')
      await emulateReducedMotion('no-preference')
      expect(getComputedStyle(icon).transitionDuration, 'under no preference').toBe('0.1s')
      expect(getComputedStyle(icon).transitionProperty).toBe('rotate')
      await emulateReducedMotion('reduce')
      expect(getComputedStyle(icon).transitionDuration, 'under reduce').toBe('0s')
    })

    it('AC-base-ui-feedback-navigation-22 (Tier B): an Icon wrapped in another element inside the trigger computes rotate none, open and closed (the direct child turns)', async () => {
      await show('light', { isIconWrapped: true })
      const trigger = required('trigger-guides')
      const icon = required('icon-guides')
      expect(icon.parentElement, 'the Icon is not a direct child').not.toBe(trigger)
      expect(getComputedStyle(icon).rotate, 'closed').toBe('none')
      await userEvent.click(trigger)
      await isReachedWithin(() => trigger.getAttribute('aria-expanded') === 'true', MAX_FRAMES)
      await framesLater(30)
      expect(getComputedStyle(icon).rotate, 'open').toBe('none')
      // The positive control: the Icon that is a direct child of its trigger turns in the same page.
      page?.dispose()
      removeSheets?.()
      removeScheme?.()
      await show('light')
      const direct = required('icon-guides')
      await userEvent.click(required('trigger-guides'))
      await isReachedWithin(
        () => required('trigger-guides').getAttribute('aria-expanded') === 'true',
        MAX_FRAMES,
      )
      await rested(direct)
      expect(getComputedStyle(direct).rotate, 'a direct child, open').toBe('180deg')
    })
  })

  it('AC-base-ui-feedback-navigation-25 (Tier B): the list computes list-style-type none, flex-direction row and a column-gap of 4px', async () => {
    await show('light')
    const style = getComputedStyle(required('list'))
    expect(style.listStyleType).toBe('none')
    expect(style.flexDirection).toBe('row')
    expect(style.columnGap).toBe('4px')
  })
})
