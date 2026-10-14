/**
 * AC-base-ui-feedback-navigation-11 (second scenario), -12 (Tier B clauses) and -13 (Tier B
 * clauses): the Toast list in a real engine, with the built tokens and stylesheet, through the
 * built wrappers.
 *
 * -11: three toasts added in order are a plain list, newest first and above the older, a
 * `--nave-spacing-content-sm` apart, none over another.
 * -12: a toast focused by F6 then Tab keeps the browser's own ring, a `Toast.Close` focused by Tab
 * draws `focusRing` inside the toast's padding, and every toast type is painted alike.
 * -13: the toast past the limit computes `display: none` and only that one, the viewport is
 * displayed with no toast at all, and with the draft unsigned (the class kept on the element, the
 * rule taken out of the sheet) the limited toast is visible but still inert.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { isReachedWithin, MAX_FRAMES } from './support/frames.ts'
import {
  byTestId,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'
import { colorOf, lengthOf, px, ring, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w8-actions.ts'
import { withoutClass } from './support/w10-sheets.ts'
import { closeOf, createManager, raise, toastRoot, toastScene } from './support/w10-toast.ts'

/**
Raises the toasts one after the other, each one on the page before the next is raised.
 */
const raiseInOrder = async (
  manager: ReturnType<typeof createManager>,
  names: readonly string[],
  options: Readonly<Record<string, unknown>> = {},
): Promise<void> => {
  for (const name of names) {
    raise(manager, name, options)
    await settled(() => byTestId(`toast-${name}`))
  }
}

/**
The paint of a toast that its type must not change.
 */
const read = (root: HTMLElement): Record<string, string> => {
  const style = getComputedStyle(root)
  return {
    backgroundColor: style.backgroundColor,
    borderBottomColor: style.borderBottomColor,
    borderLeftColor: style.borderLeftColor,
    borderRightColor: style.borderRightColor,
    borderTopColor: style.borderTopColor,
    boxShadow: style.boxShadow,
    color: style.color,
  }
}
describe('AC-base-ui-feedback-navigation-11, -12 and -13: the Toast list', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  const show = async (
    scheme: (typeof SCHEMES)[number],
    options: Parameters<typeof toastScene>[0],
    sheet = stylesheet,
  ): Promise<void> => {
    removeSheets = useSheets(tokens, sheet)
    removeScheme = useScheme(scheme)
    page = mount(toastScene(options))
    await settled(() => byTestId('viewport'))
  }

  afterEach(() => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  beforeEach(() => {
    document.body.focus()
  })

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-11 (Tier B): each newer toast is above the older one, a --nave-spacing-content-sm apart, and none overlaps another', async () => {
      const manager = createManager()
      await show(scheme, { limit: 5, manager })
      await raiseInOrder(manager, ['t1', 't2', 't3'])
      const gap = lengthOf('var(--nave-spacing-content-sm)')
      expect(gap, 'the computed gap token').toBeGreaterThan(0)
      const boxes = ['t3', 't2', 't1'].map((name) => toastRoot(name).getBoundingClientRect())
      for (const box of boxes) {
        expect(box.height, 'a toast has a box').toBeGreaterThan(0)
        expect(box.width, 'a toast has a box').toBeGreaterThan(0)
      }
      for (let index = 0; index < boxes.length - 1; index += 1) {
        const newer = boxes[index]!
        const older = boxes[index + 1]!
        expect(newer.top, `toast ${String(index)} is above the older toast`).toBeLessThan(older.top)
        expect(newer.bottom, 'no overlap with the older toast').toBeLessThanOrEqual(older.top)
        expect(older.top - newer.bottom, 'the space between them').toBeCloseTo(gap, 1)
      }
    })

    it('AC-base-ui-feedback-navigation-12 (Tier B): a toast focused by F6 then Tab computes the browser ring (outline-style auto), a Toast.Close focused by Tab draws focusRing inside the toast padding', async () => {
      const manager = createManager()
      await show(scheme, { manager })
      await raiseInOrder(manager, ['one'])
      const root = toastRoot('one')
      const close = closeOf('one')
      document.body.focus()
      await userEvent.keyboard('{F6}')
      expect(document.activeElement, 'F6 moved focus to the viewport').toBe(required('viewport'))
      await userEvent.tab()
      expect(document.activeElement, 'Tab reached the toast').toBe(root)
      expect(root.matches(':focus-visible'), 'a keyboard focus').toBe(true)
      expect(getComputedStyle(root).outlineStyle, "the browser's own ring").toBe('auto')
      await userEvent.tab()
      expect(document.activeElement, 'Tab reached the Close button').toBe(close)
      expect(close.matches(':focus-visible'), 'a keyboard focus').toBe(true)
      const style = getComputedStyle(close)
      const { offset, width } = ring()
      expect({
        offset: px(style.outlineOffset),
        style: style.outlineStyle,
        width: px(style.outlineWidth),
      }).toEqual({ offset, style: 'solid', width })
      // The ring lies inside the toast's padding box: the button's box grown by the ring's reach
      // stays inside the toast's box less its border.
      const reach = width + offset
      const border = px(getComputedStyle(root).borderTopWidth)
      const ringBox = close.getBoundingClientRect()
      const toast = root.getBoundingClientRect()
      expect(ringBox.top - reach, 'top').toBeGreaterThanOrEqual(toast.top + border)
      expect(ringBox.left - reach, 'left').toBeGreaterThanOrEqual(toast.left + border)
      expect(ringBox.bottom + reach, 'bottom').toBeLessThanOrEqual(toast.bottom - border)
      expect(ringBox.right + reach, 'right').toBeLessThanOrEqual(toast.right - border)
    })

    it('AC-base-ui-feedback-navigation-12 (Tier B): the toast types error, success and none compute equal background-color, border-color, color and box-shadow', async () => {
      const manager = createManager()
      await show(scheme, { manager })
      raise(manager, 'bad', { type: 'error' })
      raise(manager, 'good', { type: 'success' })
      raise(manager, 'plain')
      await settled(() => byTestId('toast-plain'))
      const roots = ['bad', 'good', 'plain'].map((name) => toastRoot(name))
      // The positive control: the three are different toasts in the markup.
      expect(roots.map((root) => root.dataset.type)).toEqual(['error', 'success', undefined])
      expect(read(roots[1]!), 'success against error').toEqual(read(roots[0]!))
      expect(read(roots[2]!), 'no type against error').toEqual(read(roots[0]!))
      expect(read(roots[0]!).backgroundColor, 'painted as the overlay surface').toBe(
        colorOf('var(--nave-color-surface-overlay)'),
      )
    })
  })

  describe('AC-base-ui-feedback-navigation-13: toasts over the limit are hidden, and only those', () => {
    const FOUR = ['t1', 't2', 't3', 't4'] as const

    it('AC-base-ui-feedback-navigation-13 (Tier B, limit signed): the limited root computes display none, the three active roots (the positive control) do not, and closing the newest shows the oldest again', async () => {
      const manager = createManager()
      await show('light', { manager })
      await raiseInOrder(manager, FOUR)
      const oldest = toastRoot('t1')
      expect(Object.hasOwn(oldest.dataset, 'limited'), 'the oldest is limited').toBe(true)
      expect(oldest.hasAttribute('inert'), 'and inert').toBe(true)
      expect(oldest.classList.contains('nave-base-ui-toast-limit'), 'and carries the class').toBe(
        true,
      )
      expect(getComputedStyle(oldest).display).toBe('none')
      for (const name of ['t2', 't3', 't4']) {
        const active = toastRoot(name)
        expect(Object.hasOwn(active.dataset, 'limited'), `${name} is not limited`).toBe(false)
        expect(getComputedStyle(active).display, `${name} is displayed`).not.toBe('none')
        expect(active.getBoundingClientRect().height, `${name} has a box`).toBeGreaterThan(0)
      }
      expect(getComputedStyle(required('viewport')).display, 'the viewport is displayed').not.toBe(
        'none',
      )
      await userEvent.click(closeOf('t4'))
      const isRestored = await isReachedWithin(
        () => !Object.hasOwn(oldest.dataset, 'limited'),
        MAX_FRAMES,
      )
      expect(isRestored, 'closing the newest toast frees the oldest').toBe(true)
      expect(getComputedStyle(oldest).display, 'and it is displayed again').not.toBe('none')
      expect(oldest.getBoundingClientRect().height, 'with a box').toBeGreaterThan(0)
    })

    it('AC-base-ui-feedback-navigation-13 (Tier B): with no toast the viewport computes a display other than none', async () => {
      const manager = createManager()
      await show('light', { manager })
      const viewport = required('viewport')
      expect(viewport.querySelectorAll('[data-testid^="toast-"]')).toHaveLength(0)
      expect(getComputedStyle(viewport).display).not.toBe('none')
    })

    it('AC-base-ui-feedback-navigation-13 (Tier B, limit unsigned): the class kept on the element and its rule gone, the limited root computes a visible box and is still inert', async () => {
      const manager = createManager()
      await show('light', { manager }, withoutClass(stylesheet, 'toast-limit'))
      await raiseInOrder(manager, FOUR)
      const oldest = toastRoot('t1')
      expect(Object.hasOwn(oldest.dataset, 'limited'), 'the oldest is limited').toBe(true)
      expect(oldest.hasAttribute('inert'), 'and inert').toBe(true)
      expect(
        oldest.classList.contains('nave-base-ui-toast-limit'),
        'the wrapper still adds the class',
      ).toBe(true)
      expect(getComputedStyle(oldest).display, 'with no rule it is displayed').not.toBe('none')
      expect(oldest.getBoundingClientRect().height, 'with a box').toBeGreaterThan(0)
    })
  })
})
