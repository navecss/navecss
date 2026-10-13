/**
 * AC-base-ui-overlay-completion-14, second scenario: the highlight fill paints the enabled
 * highlighted item of every list and no disabled one, and every item has the small radius. Menu
 * (standalone and in a Menubar), Context Menu, Select, Combobox and Autocomplete are opened in a
 * real engine with the built tokens and stylesheet, through the built wrappers, in light and in
 * dark, and walked with ArrowDown.
 *
 * AC-base-ui-overlay-completion-35, the browser clause: at the default tint the engine computes
 * the two values the highlight token is specified to have.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { colorOf, lengthOf, px, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { highlight, ITEMS, lists, required } from './support/w7-lists.ts'

const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const HIGHLIGHT = 'var(--nave-color-action-highlight)'

/**
The token's value at the default tint, as the engine serialises it.
 */
const HIGHLIGHT_AT_DEFAULT_TINT: Readonly<Record<Scheme, string>> = {
  dark: 'oklch(0.37 0.0067 186.17)',
  light: 'oklch(0.965 0.0067 186.17)',
}

describe('the highlight fill', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens, stylesheet)
  })

  afterEach(() => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  describe.each(SCHEMES)('in %s', (scheme) => {
    it(`AC-base-ui-overlay-completion-35: action.highlight computes ${HIGHLIGHT_AT_DEFAULT_TINT[scheme]} at the default tint`, () => {
      removeScheme = useScheme(scheme)
      expect(colorOf(HIGHLIGHT)).toBe(HIGHLIGHT_AT_DEFAULT_TINT[scheme])
    })

    describe.each(lists)('$name', (list) => {
      it('AC-base-ui-overlay-completion-14: the highlighted enabled item computes the fill and the colour of its unhighlighted sibling', async () => {
        removeScheme = useScheme(scheme)
        page = await list.open()
        await highlight('apple')
        const fill = colorOf(HIGHLIGHT)
        const apple = getComputedStyle(required('apple'))
        expect(apple.backgroundColor, 'the highlighted enabled item').toBe(fill)
        expect(apple.color, 'its colour against the unhighlighted sibling').toBe(
          getComputedStyle(required('cherry')).color,
        )
        expect(
          getComputedStyle(required('cherry')).backgroundColor,
          'the unhighlighted sibling',
        ).toBe(TRANSPARENT)
      })

      it('AC-base-ui-overlay-completion-14: the highlighted disabled item computes no fill, the enabled one of the render being the control', async () => {
        removeScheme = useScheme(scheme)
        page = await list.open()
        await highlight('apple')
        expect(
          getComputedStyle(required('apple')).backgroundColor,
          'the enabled item, the positive control',
        ).toBe(colorOf(HIGHLIGHT))
        await highlight('banana')
        const banana = required('banana')
        expect(banana.dataset.highlighted !== undefined, 'the disabled item is highlighted').toBe(
          true,
        )
        expect(banana.getAttribute('aria-disabled'), 'the item is disabled').toBe('true')
        expect(getComputedStyle(banana).backgroundColor).toBe(TRANSPARENT)
      })

      it('AC-base-ui-overlay-completion-14: every item of the list computes the small radius on every corner', async () => {
        removeScheme = useScheme(scheme)
        page = await list.open()
        const radius = lengthOf('var(--nave-radius-sm)')
        for (const id of ITEMS) {
          const style = getComputedStyle(required(id))
          for (const corner of CORNERS) {
            expect(px(style[`border${corner}Radius`]), `${id}, ${corner}`).toBeCloseTo(radius, 2)
          }
        }
      })
    })
  })
})
