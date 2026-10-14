/**
 * The active option of a Combobox and an Autocomplete, read in a real engine with the built tokens
 * and stylesheet, through the built wrappers, in light and in dark.
 *
 * AC-base-ui-overlay-completion-11, second scenario: the band drawn on the highlighted option is
 * `focusRing`'s geometry (its width W and offset O), in the focus border colour, with a radius
 * that follows the option's, survives forced colours and takes no clicks.
 *
 * AC-base-ui-overlay-completion-12, the browser clause: a highlighted disabled option draws the
 * band and no fill, while a highlighted enabled option in the same page draws the fill.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Autocomplete } from '../../dist/autocomplete/index.js'
import { Combobox } from '../../dist/combobox/index.js'
import { type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import {
  colorOf,
  emulateForcedColors,
  lengthOf,
  px,
  ring,
  SCHEMES,
  useScheme,
} from './support/w7-css.ts'
import { comboboxLike, highlight, openCombobox, required } from './support/w7-lists.ts'

const components = [
  { name: 'Combobox', parts: Combobox },
  { name: 'Autocomplete', parts: Autocomplete },
] as const

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const
const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const

/**
 * How far the option's `::before` reaches beyond the option's border box on each side. The
 * pseudo-element is positioned against the option's padding box, so its border box is found from
 * the option's rect, the option's own borders and the pseudo-element's computed offsets and size.
 */
const reach = (option: HTMLElement): Record<'bottom' | 'left' | 'right' | 'top', number> => {
  const rect = option.getBoundingClientRect()
  const own = getComputedStyle(option)
  const band = getComputedStyle(option, '::before')
  const extra =
    band.boxSizing === 'border-box'
      ? { x: 0, y: 0 }
      : {
          x:
            px(band.paddingLeft) +
            px(band.paddingRight) +
            px(band.borderLeftWidth) +
            px(band.borderRightWidth),
          y:
            px(band.paddingTop) +
            px(band.paddingBottom) +
            px(band.borderTopWidth) +
            px(band.borderBottomWidth),
        }
  const left = rect.left + px(own.borderLeftWidth) + px(band.left)
  const top = rect.top + px(own.borderTopWidth) + px(band.top)
  const right = left + px(band.width) + extra.x
  const bottom = top + px(band.height) + extra.y
  return {
    bottom: bottom - rect.bottom,
    left: rect.left - left,
    right: right - rect.right,
    top: rect.top - top,
  }
}

describe.each(components)('$name', ({ name, parts }) => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens, stylesheet)
  })

  afterEach(async () => {
    await emulateForcedColors('none')
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  describe.each(SCHEMES)('in %s', (scheme) => {
    /**
    The component open with three enabled items and its second item highlighted by ArrowDown.
     */
    const withSecondHighlighted = async (): Promise<HTMLElement> => {
      removeScheme = useScheme(scheme)
      page = await openCombobox(() => comboboxLike(parts, {}, []))
      await highlight('banana')
      return required('banana')
    }

    it(`AC-base-ui-overlay-completion-11: ${name}'s highlighted option sits in a band ring W + O out on every side, W wide`, async () => {
      const option = await withSecondHighlighted()
      const { offset, width } = ring()
      expect(width, 'the ring width read from focusRing').toBeGreaterThan(0)
      expect(offset, 'the ring offset read from focusRing').toBeGreaterThan(0)
      const band = getComputedStyle(option, '::before')
      expect(band.content, 'the band is generated').not.toBe('none')
      const edges = reach(option)
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(edges[side], `the band's reach beyond the option, ${side}`).toBeCloseTo(
          width + offset,
          2,
        )
      }
      for (const side of SIDES) {
        expect(px(band[`border${side}Width`]), `border width, ${side}`).toBeCloseTo(width, 2)
        expect(band[`border${side}Style`], `border style, ${side}`).toBe('solid')
      }
    })

    it(`AC-base-ui-overlay-completion-11: ${name}'s band is in the focus border colour and its radius is the option's plus W + O`, async () => {
      const option = await withSecondHighlighted()
      const { offset, width } = ring()
      const band = getComputedStyle(option, '::before')
      const focusColor = colorOf('var(--nave-color-border-focus)')
      for (const side of SIDES) {
        expect(band[`border${side}Color`], `border colour, ${side}`).toBe(focusColor)
      }
      const radius = lengthOf('var(--nave-radius-sm)')
      for (const corner of CORNERS) {
        expect(px(band[`border${corner}Radius`]), `radius, ${corner}`).toBeCloseTo(
          radius + width + offset,
          2,
        )
      }
    })

    it(`AC-base-ui-overlay-completion-11: ${name}'s band survives forced colours, solid and not transparent`, async () => {
      const option = await withSecondHighlighted()
      await emulateForcedColors('active')
      const band = getComputedStyle(option, '::before')
      for (const side of SIDES) {
        expect(band[`border${side}Style`], `border style, ${side}`).toBe('solid')
        expect(band[`border${side}Color`], `border colour, ${side}`).not.toBe('transparent')
        expect(band[`border${side}Color`], `border colour, ${side}`).not.toBe('rgba(0, 0, 0, 0)')
      }
    })

    it(`AC-base-ui-overlay-completion-11: ${name}'s band takes no clicks, a point in it hits the option above`, async () => {
      const option = await withSecondHighlighted()
      const { offset, width } = ring()
      const rect = option.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const inBand = document.elementFromPoint(x, rect.top - (width + offset - 1))
      expect(inBand, 'the element at a point inside the band').toBe(required('apple'))
      // The control: the option answers inside its own box, so the band is what the point sits in.
      const inside = document.elementFromPoint(x, rect.top + rect.height / 2)
      expect(inside, 'the element inside the option').toBe(option)
    })
  })

  describe.each(SCHEMES)('with a disabled option, in %s', (scheme) => {
    it(`AC-base-ui-overlay-completion-12: ${name}'s highlighted disabled option draws the band and no fill, an enabled one the fill`, async () => {
      removeScheme = useScheme(scheme)
      page = await openCombobox(() => comboboxLike(parts, {}))
      await highlight('apple')
      const fill = colorOf('var(--nave-color-action-highlight)')
      expect(getComputedStyle(required('apple')).backgroundColor, 'the enabled option').toBe(fill)
      await highlight('banana')
      const disabled = required('banana')
      expect(disabled.getAttribute('aria-disabled'), 'the option is disabled').toBe('true')
      expect(disabled.dataset.disabled !== undefined, 'the option is disabled').toBe(true)
      const band = getComputedStyle(disabled, '::before')
      expect(band.borderTopStyle, 'the band is drawn').toBe('solid')
      expect(getComputedStyle(disabled).backgroundColor, 'no fill').toBe('rgba(0, 0, 0, 0)')
    })
  })
})
