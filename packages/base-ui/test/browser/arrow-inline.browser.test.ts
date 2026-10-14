/**
 * AC-base-ui-overlay-completion-22, second scenario: an Arrow on a logical side (`inline-start`,
 * `inline-end`) faces its trigger when the direction is set the README's way, `dir` on `<html>`
 * and a `DirectionProvider` of the same direction. The class keys the rotation on `data-side` and
 * on `:dir()`, which reads the document, while Base UI resolves the side from the provider, so the
 * two must agree. `side="left"` and `side="right"` are the controls: v1's physical rules.
 *
 * Read in a real engine, since only one resolves `:dir()` and lays the arrow out.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { DirectionProvider } from '@base-ui/react/direction-provider'
import { afterEach, describe, expect, it } from 'vitest'

import { Popover } from '../../dist/popover/index.js'
import { PreviewCard } from '../../dist/preview-card/index.js'
import { Tooltip } from '../../dist/tooltip/index.js'
import {
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { required } from './support/w8-actions.ts'

type Direction = 'ltr' | 'rtl'
type Side = 'inline-end' | 'inline-start' | 'left' | 'right'

const popup = { 'data-testid': 'popup' } as const
const arrow = { 'data-testid': 'arrow' } as const
const trigger = { 'data-testid': 'trigger' } as const

/**
 * Each component open on mount, its Positioner on the side asked for, with room around the trigger
 * so the side is not flipped.
 */
const components: Readonly<Record<string, (side: Side) => ReactNode>> = {
  Popover: (side) =>
    h(
      Popover.Root,
      { defaultOpen: true },
      h(Popover.Trigger, trigger, 'Open'),
      h(
        Popover.Portal,
        {},
        h(
          Popover.Positioner,
          { side, sideOffset: 12 },
          h(Popover.Popup, popup, h(Popover.Arrow, arrow), 'Content'),
        ),
      ),
    ),
  'Preview Card': (side) =>
    h(
      PreviewCard.Root,
      { defaultOpen: true },
      h(PreviewCard.Trigger, { ...trigger, href: '#' }, 'Link'),
      h(
        PreviewCard.Portal,
        {},
        h(
          PreviewCard.Positioner,
          { side, sideOffset: 12 },
          h(PreviewCard.Popup, popup, h(PreviewCard.Arrow, arrow), 'Preview'),
        ),
      ),
    ),
  Tooltip: (side) =>
    h(
      Tooltip.Root,
      { defaultOpen: true },
      h(Tooltip.Trigger, trigger, 'Hover'),
      h(
        Tooltip.Portal,
        {},
        h(
          Tooltip.Positioner,
          { side, sideOffset: 12 },
          h(Tooltip.Popup, popup, h(Tooltip.Arrow, arrow), 'Tip'),
        ),
      ),
    ),
}

/**
 * The rotation the arrow computes and which of the popup's edges faces the trigger, by side and
 * direction. `inline-start` is the left in left-to-right text and the right in right-to-left.
 */
const expectations: Readonly<
  Record<Side, Readonly<Record<Direction, { edge: 'left' | 'right'; rotate: string }>>>
> = {
  'inline-end': {
    ltr: { edge: 'left', rotate: '135deg' },
    rtl: { edge: 'right', rotate: '-45deg' },
  },
  'inline-start': {
    ltr: { edge: 'right', rotate: '-45deg' },
    rtl: { edge: 'left', rotate: '135deg' },
  },
  left: {
    ltr: { edge: 'right', rotate: '-45deg' },
    rtl: { edge: 'right', rotate: '-45deg' },
  },
  right: {
    ltr: { edge: 'left', rotate: '135deg' },
    rtl: { edge: 'left', rotate: '135deg' },
  },
}

describe.each(Object.keys(components))('AC-base-ui-overlay-completion-22: the %s arrow', (name) => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  afterEach(() => {
    page?.dispose()
    removeSheets?.()
    document.documentElement.removeAttribute('dir')
    page = undefined
    removeSheets = undefined
  })

  const render = async (side: Side, direction: Direction): Promise<void> => {
    document.documentElement.dir = direction
    removeSheets = useSheets(tokens, stylesheet)
    page = mount(
      h(
        DirectionProvider,
        { direction },
        h('div', { style: { padding: '80px 200px' } }, components[name]!(side)),
      ),
    )
    await settled(() => required('arrow'))
  }

  describe.each(['ltr', 'rtl'] as const)(
    'with %s on <html> and in DirectionProvider',
    (direction) => {
      it.each(['inline-start', 'inline-end'] as const)(
        'AC-base-ui-overlay-completion-22: side %s faces the trigger, rotated and straddling the popup edge',
        async (side) => {
          await render(side, direction)
          const { edge, rotate } = expectations[side][direction]
          const arrowElement = required('arrow')
          const popupBox = required('popup').getBoundingClientRect()
          const triggerBox = required('trigger').getBoundingClientRect()
          expect(arrowElement.dataset.side, 'data-side is the logical side verbatim').toBe(side)
          expect(getComputedStyle(arrowElement).rotate, 'rotate').toBe(rotate)
          // The popup is on the side of the trigger that the edge faces.
          const gap =
            edge === 'right' ? triggerBox.left - popupBox.right : popupBox.left - triggerBox.right
          expect(gap, 'the popup is clear of the trigger').toBeGreaterThanOrEqual(0)
          const box = arrowElement.getBoundingClientRect()
          const centre = box.left + box.width / 2
          expect(
            Math.abs(centre - popupBox[edge]),
            'the arrow straddles the facing edge',
          ).toBeLessThanOrEqual(1)
        },
      )

      it.each(['left', 'right'] as const)(
        'AC-base-ui-overlay-completion-22: side %s rotates the same under both directions (control)',
        async (side) => {
          await render(side, direction)
          const arrowElement = required('arrow')
          expect(arrowElement.dataset.side).toBe(side)
          expect(getComputedStyle(arrowElement).rotate).toBe(expectations[side][direction].rotate)
        },
      )
    },
  )
})
