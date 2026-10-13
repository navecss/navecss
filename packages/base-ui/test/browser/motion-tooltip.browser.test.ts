/**
 * AC-base-ui-overlay-completion-18, second scenario: the tooltip fades in and out over
 * `motion.duration.fast` in one opacity transition, and a second tooltip that opens from the first
 * inside the delay group computes a `transition-duration` of 0s while `data-instant` is present.
 *
 * Read in a real engine, since only one runs a transition and reports it through `getAnimations()`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Tooltip } from '../../dist/tooltip/index.js'
import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { required } from './support/w8-actions.ts'
import { tokenEasing, tokenMilliseconds } from './support/w8-tokens.ts'
import { appears, atRest, goneAt, MOUNT, type Watch, watchPopup } from './support/w8-watch.ts'

const tip = (number: number): ReactNode =>
  h(
    Tooltip.Root,
    { key: number },
    h(Tooltip.Trigger, { 'data-testid': `trigger-${String(number)}`, delay: 0 }, `Hover ${number}`),
    h(
      Tooltip.Portal,
      {},
      h(
        Tooltip.Positioner,
        {},
        h(Tooltip.Popup, { 'data-testid': `popup-${String(number)}` }, `Tip ${number}`),
      ),
    ),
  )

const scene = (): ReactNode => h('div', {}, h(Tooltip.Provider, { delay: 0 }, tip(1), tip(2)))

const opacity = (easing: string, fast: number): object[] => [
  { duration: fast, easing: tokenEasing(easing), kind: 'CSSTransition', property: 'opacity' },
]

describe('AC-base-ui-overlay-completion-18: the tooltip fades, and is instant inside the delay group', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  const watches: Watch[] = []

  afterEach(() => {
    for (const watch of watches) {
      watch.stop()
    }
    watches.length = 0
    page?.dispose()
    removeSheets?.()
    page = undefined
    removeSheets = undefined
  })

  const start = (...ids: string[]): Watch[] => {
    removeSheets = useSheets(tokens, stylesheet)
    const made = ids.map((id) => watchPopup(id))
    watches.push(...made)
    page = mount(scene())
    return made
  }

  it('AC-base-ui-overlay-completion-18: the first opens on hover and closes on pointer leave, each in one opacity transition of the fast duration', async () => {
    const [first] = start('popup-1')
    const fast = tokenMilliseconds('--nave-motion-duration-fast')
    await userEvent.hover(required('trigger-1'))
    await appears('popup-1')
    const popup = await atRest('popup-1')
    const [opening] = first!.of('data-starting-style', false)
    expect(opening, 'data-starting-style was removed').toBeDefined()
    expect(opening?.instant, 'the first tooltip is not instant').toBeUndefined()
    expect(opening?.animations, 'opening').toEqual(opacity('--nave-motion-easing-decelerate', fast))
    await userEvent.unhover(required('trigger-1'))
    const [closing] = first!.of('data-ending-style', true)
    expect(closing, 'data-ending-style was set').toBeDefined()
    expect(closing?.animations, 'closing').toEqual(opacity('--nave-motion-easing-accelerate', fast))
    expect(await goneAt(popup, fast + 200), 'the popup left the page').toBeDefined()
  })

  it('AC-base-ui-overlay-completion-18: the second, opened from the first inside the delay group, computes a transition-duration of 0s while data-instant is present', async () => {
    const [, second] = start('popup-1', 'popup-2')
    await userEvent.hover(required('trigger-1'))
    await appears('popup-1')
    await atRest('popup-1')
    await userEvent.hover(required('trigger-2'))
    await appears('popup-2')
    const withInstant = second!.moments.filter((moment) => moment.instant === 'delay')
    expect(withInstant.length, 'data-instant "delay" was seen on the second').toBeGreaterThan(0)
    for (const moment of withInstant) {
      expect(moment.duration, `at ${moment.attribute}`).toBe('0s')
      expect(moment.animations, `at ${moment.attribute}`).toEqual([])
    }
    expect(second!.moments.some((moment) => moment.attribute === MOUNT)).toBe(true)
  })
})
