/**
 * AC-base-ui-feedback-navigation-36, second scenario (which extends AC-base-ui-overlay-completion-19's
 * first scenario to the three transitions this spec adds): under `prefers-reduced-motion: reduce`
 * the transition of a `Toast.Root` with `-toast-fade`, of a `NavigationMenu.Popup` with
 * `-navigation-menu-fade` and of a `NavigationMenu.Icon` with `-navigation-menu-icon` runs for 0s,
 * and still does when a consumer re-tunes the motion tokens in a later layer. The tokens' own
 * reduced-motion rule sets the duration TOKENS, which a re-tune overrides; the stylesheet's guards
 * set the duration property itself, which it does not.
 *
 * Read in a real engine, since only one computes which declaration wins. The positive control comes
 * first in each pair of tests: the durations under no preference are the ones the tokens give (0.1s)
 * and the re-tune's (0.3s), so a reading of 0s under reduce is the guard's doing and not an element
 * that never transitioned.
 */
import type { ReactNode } from 'react'

import { afterEach, describe, expect, it } from 'vitest'

import {
  byTestId,
  emulateReducedMotion,
  el as h,
  mount,
  type Page,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'

const RE_TUNE = `@layer overrides { :root { --nave-motion-duration-fast: 300ms; --nave-motion-duration-base: 300ms } }`

/**
The three parts, by test id, the property each one transitions, and what each reads under no preference with the tokens as shipped.
 */
const PARTS = [
  { className: 'nave-base-ui-toast-fade', id: 'toast', property: 'opacity' },
  { className: 'nave-base-ui-navigation-menu-fade', id: 'popup', property: 'opacity' },
  { className: 'nave-base-ui-navigation-menu-icon', id: 'icon', property: 'rotate' },
] as const

const scene = (): ReactNode =>
  h('div', {}, ...PARTS.map(({ className, id }) => h('div', { className, 'data-testid': id })))

interface Reading {
  readonly duration: string
  readonly property: string
}

const readAll = (): Record<string, Reading> =>
  Object.fromEntries(
    PARTS.map(({ id }) => {
      const element = byTestId(id)
      if (element === undefined) {
        throw new Error(`no element with test id ${id}`)
      }
      const style = getComputedStyle(element)
      // A list of properties may carry one duration: what is compared is the set of distinct values.
      return [
        id,
        {
          duration: [...new Set(style.transitionDuration.split(', '))].join(', '),
          property: style.transitionProperty,
        },
      ] as const
    }),
  )

describe('AC-base-ui-feedback-navigation-36 (second scenario): reduced motion turns this spec transitions off, against a late re-tune', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  const open = (...consumerSheets: string[]): void => {
    removeSheets = useSheets(tokens, stylesheet, ...consumerSheets)
    page = mount(scene())
  }

  afterEach(async () => {
    page?.dispose()
    removeSheets?.()
    page = undefined
    await emulateReducedMotion('no-preference')
  })

  describe.each([
    { duration: '0.1s', label: 'the tokens as shipped', sheets: [] },
    { duration: '0.3s', label: 'a consumer re-tune in the overrides layer', sheets: [RE_TUNE] },
  ])('with $label', ({ duration, sheets }) => {
    it('AC-base-ui-feedback-navigation-36: under no-preference the three read the duration the tokens give (positive control)', async () => {
      open(...sheets)
      await emulateReducedMotion('no-preference')
      const readings = readAll()
      for (const { id, property } of PARTS) {
        expect(readings[id], id).toEqual({ duration, property })
      }
    })

    it('AC-base-ui-feedback-navigation-36: under reduce every reading is 0s and the properties are what no-preference reads', async () => {
      open(...sheets)
      await emulateReducedMotion('no-preference')
      const motion = readAll()
      await emulateReducedMotion('reduce')
      const reduced = readAll()
      for (const { id } of PARTS) {
        // The positive control, in the same test: the part transitions under no preference, so the
        // 0s under reduce is the guard's and not an element that never transitioned.
        expect(motion[id]?.duration, `${id} duration under no preference`).toBe(duration)
        expect(reduced[id]?.duration, `${id} duration`).toBe('0s')
        expect(reduced[id]?.property, `${id} property`).toBe(motion[id]?.property)
      }
    })
  })
})
