/**
 * The boxes of the Combobox and Autocomplete parts, read in a real engine with the built tokens
 * and stylesheet, through the built wrappers, in light and in dark.
 *
 * AC-base-ui-overlay-completion-23, second scenario: the field box (the group's border at rest,
 * invalid and disabled, and the focused input's ring crossing it).
 * AC-base-ui-overlay-completion-24, second scenario: the trigger and the clear button in the
 * standard layout, and the trigger in the input-inside-popup layout against a `Select` trigger.
 * AC-base-ui-overlay-completion-25, browser clause: a chip focused by ArrowLeft draws the ring and
 * has its block size.
 * AC-base-ui-overlay-completion-26, browser clause: the empty message is padded only when empty.
 */
import type { ReactNode } from 'react'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Autocomplete } from '../../dist/autocomplete/index.js'
import { Combobox } from '../../dist/combobox/index.js'
import {
  byTestId,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { chips, type FieldState, insidePopup, standard } from './support/w7-combobox-scenes.ts'
import { colorOf, lengthOf, px, ring, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w7-lists.ts'

const components = [
  { name: 'Combobox', parts: Combobox },
  { name: 'Autocomplete', parts: Autocomplete },
] as const

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const
const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

const token = (name: string): string => `var(--nave-${name})`

/**
 * Mounts a scene in the colour scheme and removes it, the scheme and the sheets again afterwards.
 */
const useScene = (): {
  readonly show: (
    scheme: (typeof SCHEMES)[number],
    scene: () => ReactNode,
    wait?: string,
  ) => Promise<void>
} => {
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
  return {
    show: async (scheme, scene, wait = 'group') => {
      removeScheme = useScheme(scheme)
      page = mount(scene())
      await settled(() => byTestId(wait))
    },
  }
}

const borderOf = (
  style: CSSStyleDeclaration,
  side: (typeof SIDES)[number],
): { color: string; style: string; width: number } => ({
  color: style[`border${side}Color`],
  style: style[`border${side}Style`],
  width: px(style[`border${side}Width`]),
})

describe.each(components)(
  'AC-base-ui-overlay-completion-23: the field box of $name',
  ({ parts }) => {
    const scene = useScene()

    describe.each(SCHEMES)('in %s', (scheme) => {
      const group = (state: FieldState): Promise<void> =>
        scene.show(scheme, () => standard(parts, state))

      it('AC-base-ui-overlay-completion-23: at rest the group has the control border at the small width and the control size', async () => {
        await group({})
        const element = required('group')
        const style = getComputedStyle(element)
        for (const side of SIDES) {
          expect(borderOf(style, side), side).toEqual({
            color: colorOf(token('color-border-control')),
            style: 'solid',
            width: lengthOf(token('border-width-sm')),
          })
        }
        expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(
          lengthOf(token('size-control-md')) - 0.005,
        )
      })

      it('AC-base-ui-overlay-completion-23: invalid, the group has the danger border at the mark width', async () => {
        await group({ invalid: true })
        const element = required('group')
        expect(element.dataset.invalid !== undefined, 'the group is invalid').toBe(true)
        const style = getComputedStyle(element)
        for (const side of SIDES) {
          expect(borderOf(style, side), side).toEqual({
            color: colorOf(token('color-feedback-danger')),
            style: 'solid',
            width: lengthOf(token('border-width-mark')),
          })
        }
        expect(colorOf(token('color-feedback-danger'))).not.toBe(
          colorOf(token('color-border-control')),
        )
      })

      describe.each([
        { how: 'the Root disabled', state: { rootDisabled: true } },
        { how: 'the Field disabled', state: { fieldDisabled: true } },
        {
          how: 'the Root disabled and the Field invalid',
          state: { invalid: true, rootDisabled: true },
        },
        { how: 'the Field disabled and invalid', state: { fieldDisabled: true, invalid: true } },
      ])('with $how', ({ state }) => {
        it('AC-base-ui-overlay-completion-23: the group has the disabled border at the small width and the disabled text colour', async () => {
          await group(state)
          const element = required('group')
          expect(element.dataset.disabled !== undefined, 'the group is disabled').toBe(true)
          const style = getComputedStyle(element)
          for (const side of SIDES) {
            expect(borderOf(style, side), side).toEqual({
              color: colorOf(token('color-border-disabled')),
              style: 'solid',
              width: lengthOf(token('border-width-sm')),
            })
          }
          expect(style.color).toBe(colorOf(token('color-content-disabled')))
        })
      })

      it('AC-base-ui-overlay-completion-23: the focused input draws the ring, which crosses the group border onto the surface', async () => {
        await group({})
        const input = required('input')
        input.focus()
        expect(input.matches(':focus-visible'), 'the input shows focus').toBe(true)
        const { offset, width } = ring()
        const style = getComputedStyle(input)
        expect(style.outlineStyle).toBe('solid')
        expect(px(style.outlineWidth)).toBeCloseTo(width, 2)
        expect(px(style.outlineOffset)).toBeCloseTo(offset, 2)
        expect(style.outlineColor).toBe(colorOf(token('color-border-focus')))
        const outer = input.getBoundingClientRect()
        const box = required('group').getBoundingClientRect()
        const out = width + offset
        expect(outer.top - out, 'the ring passes the top of the group').toBeLessThan(box.top)
        expect(outer.bottom + out, 'the ring passes the bottom of the group').toBeGreaterThan(
          box.bottom,
        )
        expect(
          getComputedStyle(required('group')).overflow,
          'the group does not clip the ring',
        ).toBe('visible')
      })
    })
  },
)

describe.each(components)('AC-base-ui-overlay-completion-24: the buttons of $name', ({ parts }) => {
  const scene = useScene()

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-overlay-completion-24: in the standard layout the trigger and the clear button are the small control size wide, as tall as the group content, transparent and borderless', async () => {
      await scene.show(scheme, () => standard(parts))
      const group = required('group')
      const groupStyle = getComputedStyle(group)
      const inner =
        group.getBoundingClientRect().height -
        px(groupStyle.borderTopWidth) -
        px(groupStyle.borderBottomWidth) -
        px(groupStyle.paddingTop) -
        px(groupStyle.paddingBottom)
      for (const id of ['trigger', 'clear']) {
        const element = required(id)
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        expect(rect.width, `${id} width`).toBeCloseTo(lengthOf(token('size-control-sm')), 2)
        expect(rect.height, `${id} height`).toBeCloseTo(inner, 2)
        expect(style.backgroundColor, `${id} background`).toBe(TRANSPARENT)
        for (const side of SIDES) {
          expect(px(style[`border${side}Width`]), `${id} border, ${side}`).toBe(0)
        }
      }
    })
  })
})

/**
 * What a trigger's box is made of, to be compared with another's: its block size, borders,
 * padding and corner radii as the engine computes them.
 */
const boxOf = (element: HTMLElement): Record<string, unknown> => {
  const style = getComputedStyle(element)
  return {
    borders: SIDES.map((side) => borderOf(style, side)),
    height: element.getBoundingClientRect().height,
    padding: SIDES.map((side) => style[`padding${side}`]),
    radii: CORNERS.map((corner) => style[`border${corner}Radius`]),
  }
}

describe('AC-base-ui-overlay-completion-24: the trigger of the input-inside-popup layout', () => {
  const scene = useScene()

  describe.each(SCHEMES)('in %s', (scheme) => {
    describe.each([
      {
        border: { color: 'color-border-control', width: 'border-width-sm' },
        isInvalid: false,
        state: {},
        which: 'at rest',
      },
      {
        border: { color: 'color-feedback-danger', width: 'border-width-mark' },
        isInvalid: true,
        state: { invalid: true },
        which: 'invalid',
      },
      {
        border: { color: 'color-border-disabled', width: 'border-width-sm' },
        isInvalid: false,
        state: { rootDisabled: true },
        which: 'disabled',
      },
    ])('$which', ({ border, isInvalid, state }) => {
      it('AC-base-ui-overlay-completion-24: it computes the block size, border, radius and padding of a Select trigger', async () => {
        await scene.show(scheme, () => insidePopup(state), 'trigger')
        const trigger = required('trigger')
        const select = required('select')
        expect(trigger.getAttribute('aria-haspopup'), 'the layout').toBe('dialog')
        expect(trigger.getAttribute('aria-invalid') === 'true', 'the trigger is invalid').toBe(
          isInvalid,
        )
        expect(
          select.getAttribute('aria-invalid') === 'true',
          'the Select trigger is invalid',
        ).toBe(isInvalid)
        expect(boxOf(trigger)).toEqual(boxOf(select))
        const style = getComputedStyle(trigger)
        expect(style.borderTopColor, 'border colour').toBe(colorOf(token(border.color)))
        expect(px(style.borderTopWidth), 'border width').toBe(lengthOf(token(border.width)))
      })
    })
  })
})

describe('AC-base-ui-overlay-completion-25: a focused chip', () => {
  const scene = useScene()

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-overlay-completion-25: a chip focused by ArrowLeft draws the ring and is the control size tall plus its borders', async () => {
      await scene.show(scheme, chips, 'chips')
      await userEvent.click(required('input'))
      await userEvent.keyboard('{ArrowLeft}')
      const chip = required('chip-cherry')
      expect(document.activeElement, 'the last chip has focus').toBe(chip)
      expect(chip.matches(':focus-visible'), 'the chip shows focus').toBe(true)
      const { offset, width } = ring()
      const style = getComputedStyle(chip)
      expect(style.outlineStyle).toBe('solid')
      expect(px(style.outlineWidth)).toBeCloseTo(width, 2)
      expect(px(style.outlineOffset)).toBeCloseTo(offset, 2)
      expect(style.outlineColor).toBe(colorOf(token('color-border-focus')))
      expect(chip.getBoundingClientRect().height).toBeCloseTo(
        lengthOf(token('size-control-xs')) + 2 * lengthOf(token('border-width-sm')),
        2,
      )
    })
  })
})

describe.each(components)(
  'AC-base-ui-overlay-completion-26: the empty message of $name',
  ({ parts }) => {
    const scene = useScene()

    describe.each(SCHEMES)('in %s', (scheme) => {
      it('AC-base-ui-overlay-completion-26: with results the message has no padding, with none it has the control padding and is visible', async () => {
        await scene.show(scheme, () => standard(parts, {}, { hasEmpty: true, hasValue: false }))
        await userEvent.click(required('input'))
        await userEvent.keyboard('ap')
        const empty = await settled(() => byTestId('empty'))
        const withResults = getComputedStyle(empty)
        for (const side of SIDES) {
          expect(px(withResults[`padding${side}`]), `padding, ${side}, with results`).toBe(0)
        }
        expect(required('popup').dataset.empty !== undefined, 'the popup has results').toBe(false)

        await userEvent.clear(required('input'))
        await userEvent.keyboard('zzz')
        await settled(() =>
          byTestId('popup')?.dataset.empty === undefined ? undefined : byTestId('popup'),
        )
        const none = getComputedStyle(empty)
        const block = lengthOf(token('spacing-control-sm'))
        const inline = lengthOf(token('spacing-control-md'))
        expect(px(none.paddingTop)).toBeCloseTo(block, 2)
        expect(px(none.paddingBottom)).toBeCloseTo(block, 2)
        expect(px(none.paddingLeft)).toBeCloseTo(inline, 2)
        expect(px(none.paddingRight)).toBeCloseTo(inline, 2)
        const rect = empty.getBoundingClientRect()
        expect(none.display, 'displayed').not.toBe('none')
        expect(none.visibility, 'visible').toBe('visible')
        expect(none.opacity, 'opaque').toBe('1')
        expect(rect.width, 'wide').toBeGreaterThan(0)
        expect(rect.height, 'tall').toBeGreaterThan(0)
        expect(empty.textContent, 'with its text').not.toBe('')
      })
    })
  },
)
