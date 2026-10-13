/**
 * AC-base-ui-overlay-completion-15, second scenario: the ghost variant's states and the open
 * ghost trigger, read in a real engine with the built tokens and stylesheet, through the built
 * wrappers, in light and in dark, at both sizes. A ghost `Button` and a ghost `Menu.Trigger` in a
 * `Menubar` are put through rest, hover, a held Space, both ways of being disabled and an open menu.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Button } from '../../dist/button/index.js'
import { Menu } from '../../dist/menu/index.js'
import { Menubar } from '../../dist/menubar/index.js'
import {
  byTestId,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { colorOf, lengthOf, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w7-lists.ts'

type Size = 'md' | 'sm'

const SIZES: readonly Size[] = ['md', 'sm']
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const

const subject = (props: Record<string, unknown>): Record<string, unknown> => ({
  'data-testid': 'subject',
  ...props,
})

interface Subject {
  /**
  Whether the part holds `:active` while Space is down and takes `focusableWhenDisabled`: a
  `Button` does, a `Menu.Trigger` opens its menu on the key press and ignores the prop, so it is
  held by the pointer and disabled natively only.
   */
  readonly isButton: boolean
  readonly name: string
  /**
  The subject alone on the page, given the props of the part.
   */
  readonly scene: (props: Record<string, unknown>) => ReactNode
}

const away = (): ReactNode =>
  h('div', {
    'data-testid': 'away',
    style: { bottom: 0, height: 40, position: 'fixed', right: 0, width: 40 },
  })

const subjects: readonly Subject[] = [
  {
    isButton: true,
    name: 'Button',
    scene: (props) =>
      h(
        'div',
        { style: { padding: 48 } },
        h(Button, subject({ variant: 'ghost', ...props }), 'Save'),
        away(),
      ),
  },
  {
    isButton: false,
    name: 'Menu.Trigger in a Menubar',
    scene: (props) =>
      h(
        'div',
        { style: { padding: 48 } },
        h(
          Menubar,
          {},
          h(
            Menu.Root,
            {},
            h(Menu.Trigger, subject({ variant: 'ghost', ...props }), 'File'),
            h(
              Menu.Portal,
              {},
              h(
                Menu.Positioner,
                {},
                h(Menu.Popup, {}, h(Menu.Item, { 'data-testid': 'item' }, 'New')),
              ),
            ),
          ),
        ),
        away(),
      ),
  },
]

const sizeProps = (size: Size): Record<string, unknown> => (size === 'sm' ? { size: 'sm' } : {})

const border = (style: CSSStyleDeclaration): string[] =>
  SIDES.map((side) => style[`border${side}Color`])

const BLOCK_SIZE: Readonly<Record<Size, string>> = {
  md: 'var(--nave-size-control-md)',
  sm: 'var(--nave-size-control-sm)',
}

describe.each(subjects)('AC-base-ui-overlay-completion-15: ghost $name', ({ isButton, scene }) => {
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

  const show = async (
    scheme: (typeof SCHEMES)[number],
    props: Record<string, unknown>,
  ): Promise<HTMLElement> => {
    removeScheme?.()
    removeScheme = useScheme(scheme)
    page = mount(scene(props))
    const element = (await settled(() => byTestId('subject'))) as HTMLElement
    await userEvent.hover(required('away'))
    return element
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    describe.each(SIZES)('at size %s', (size) => {
      const props = sizeProps(size)

      it('AC-base-ui-overlay-completion-15: at rest it is transparent, in the primary text colour, as tall as a secondary button', async () => {
        const element = await show(scheme, props)
        expect(element.matches(':hover'), 'the pointer is away').toBe(false)
        const style = getComputedStyle(element)
        expect(style.backgroundColor).toBe(TRANSPARENT)
        expect(border(style)).toEqual(SIDES.map(() => TRANSPARENT))
        expect(style.color).toBe(colorOf('var(--nave-color-content-primary)'))
        // The control: the secondary button of the same size, mounted beside it.
        const reference = mount(h(Button, { 'data-testid': 'secondary', ...props }, 'Save'))
        try {
          const secondary = required('secondary')
          expect(getComputedStyle(secondary).backgroundColor, 'the secondary fills').not.toBe(
            TRANSPARENT,
          )
          const height = element.getBoundingClientRect().height
          expect(height, 'block size against a secondary button').toBeCloseTo(
            secondary.getBoundingClientRect().height,
            2,
          )
          expect(height, 'block size against the control size token').toBeCloseTo(
            lengthOf(BLOCK_SIZE[size]),
            2,
          )
        } finally {
          reference.dispose()
        }
      })

      it('AC-base-ui-overlay-completion-15: under :hover it fills with the highlight and keeps a transparent border', async () => {
        const element = await show(scheme, props)
        await userEvent.hover(element)
        expect(element.matches(':hover')).toBe(true)
        const style = getComputedStyle(element)
        expect(style.backgroundColor).toBe(colorOf('var(--nave-color-action-highlight)'))
        expect(border(style)).toEqual(SIDES.map(() => TRANSPARENT))
      })

      if (isButton) {
        it('AC-base-ui-overlay-completion-15: under :active with Space held on the focused button it fills with the highlight and keeps a transparent border', async () => {
          const element = await show(scheme, props)
          element.focus()
          await userEvent.keyboard('{Space>}')
          try {
            expect(element.matches(':active'), 'the button is active').toBe(true)
            expect(element.matches(':hover'), 'the pointer is away').toBe(false)
            const style = getComputedStyle(element)
            expect(style.backgroundColor).toBe(colorOf('var(--nave-color-action-highlight)'))
            expect(border(style)).toEqual(SIDES.map(() => TRANSPARENT))
          } finally {
            await userEvent.keyboard('{/Space}')
          }
        })
      }

      describe.each(
        [
          {
            how: 'natively disabled',
            isNative: true,
            props: { disabled: true },
          },
          {
            how: 'aria-disabled through focusableWhenDisabled',
            isNative: false,
            props: { disabled: true, focusableWhenDisabled: true },
          },
        ].filter(({ isNative }) => isButton || isNative),
      )('$how', ({ isNative, props: disabling }) => {
        it('AC-base-ui-overlay-completion-15: it is transparent in the disabled colour and a hover changes none of it, the enabled ghost filling on the same hover', async () => {
          const element = await show(scheme, { ...props, ...disabling })
          expect(
            element.matches(':disabled, [aria-disabled="true"]'),
            'disabled one way or the other',
          ).toBe(true)
          expect(element.matches(':disabled'), 'natively disabled').toBe(isNative)
          const read = (): string[] => {
            const style = getComputedStyle(element)
            return [style.backgroundColor, ...border(style), style.color]
          }
          const expected = [
            TRANSPARENT,
            ...SIDES.map(() => TRANSPARENT),
            colorOf('var(--nave-color-content-disabled)'),
          ]
          expect(read(), 'at rest').toEqual(expected)
          await userEvent.hover(element)
          expect(element.matches(':hover'), 'the pointer is over it').toBe(true)
          expect(read(), 'under hover').toEqual(expected)

          // The positive control: the enabled ghost fills on the same hover.
          page?.dispose()
          page = undefined
          const enabled = await show(scheme, props)
          await userEvent.hover(enabled)
          expect(getComputedStyle(enabled).backgroundColor, 'the enabled ghost on hover').toBe(
            colorOf('var(--nave-color-action-highlight)'),
          )
        })
      })
    })
  })
})

const menubar = (triggerProps: Record<string, unknown>): ReactNode =>
  h(
    'div',
    { style: { padding: 48 } },
    h(
      Menubar,
      {},
      h(
        Menu.Root,
        {},
        h(Menu.Trigger, subject({ variant: 'ghost', ...triggerProps }), 'File'),
        h(
          Menu.Portal,
          {},
          h(Menu.Positioner, {}, h(Menu.Popup, {}, h(Menu.Item, { 'data-testid': 'item' }, 'New'))),
        ),
      ),
    ),
    away(),
  )

describe('AC-base-ui-overlay-completion-15: the open ghost trigger', () => {
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
    describe.each(SIZES)('at size %s', (size) => {
      const props = size === 'sm' ? { size: 'sm' } : {}

      it('AC-base-ui-overlay-completion-15: a ghost trigger whose menu is open, the pointer inside the panel, computes the highlight fill', async () => {
        removeScheme = useScheme(scheme)
        page = mount(menubar(props))
        const trigger = (await settled(() => byTestId('subject'))) as HTMLElement
        await userEvent.hover(required('away'))
        expect(getComputedStyle(trigger).backgroundColor, 'closed').toBe(TRANSPARENT)
        await userEvent.click(trigger)
        const item = await settled(() => byTestId('item'))
        await userEvent.hover(item)
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(trigger.matches(':hover'), 'the pointer is inside the panel').toBe(false)
        expect(trigger.matches(':active'), 'the trigger is not pressed').toBe(false)
        expect(getComputedStyle(trigger).backgroundColor).toBe(
          colorOf('var(--nave-color-action-highlight)'),
        )
      })

      it('AC-base-ui-overlay-completion-15: a disabled ghost trigger forced open computes transparent', async () => {
        removeScheme = useScheme(scheme)
        page = mount(menubar({ ...props, 'aria-expanded': true, disabled: true }))
        const trigger = (await settled(() => byTestId('subject'))) as HTMLElement
        expect(trigger.getAttribute('aria-expanded'), 'forced open').toBe('true')
        expect(trigger.hasAttribute('disabled'), 'disabled').toBe(true)
        expect(getComputedStyle(trigger).backgroundColor).toBe(TRANSPARENT)
      })
    })
  })
})
