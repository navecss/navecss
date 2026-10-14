/**
 * AC-base-ui-feedback-navigation-16 (second scenario), -19 (Tier B clause) and -43 (Tier B
 * clause): where the Toast viewport sits, and what is above what, in a real engine with the built
 * tokens and stylesheet, through the built wrappers, in light and in dark.
 *
 * -16: with `vgiq` signed the viewport is fixed in the block-end and inline-end corner on
 * `layer.toast`, above a sticky header with a `z-index` of 10, above a Dialog and an Alert Dialog
 * opened after it, and above a Dialog a toast is raised from; its `Toast.Close` is clicked with a
 * real pointer and the dialog stays open. An anchored toast stays under its anchor, at most 20rem
 * wide, and is the hit at its centre too. One viewport holding a stacked and an anchored toast
 * keeps the stacked one in its corner. In right-to-left text the other physical corner is the one.
 * The control named by the scenario is the `vgiq`-unsigned build: the dialog's layer is what is at
 * the toast's centre and a click there closes the Dialog. A second control takes only the
 * `z-index` out of the placement rule, which is the stacking and nothing else.
 * -19: with `vgiq` unsigned the viewport computes `position: static` and `z-index: auto`.
 * -43: the anchored `Toast.Positioner`'s inline transform is a single `translate()`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'

import { AlertDialog } from '../../dist/alert-dialog/index.js'
import { Dialog } from '../../dist/dialog/index.js'
import { isReachedWithin, MAX_FRAMES } from './support/frames.ts'
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
import { lengthOf, px, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'
import { required } from './support/w8-actions.ts'
import { withoutClass } from './support/w10-sheets.ts'
import {
  closeOf,
  createManager,
  raise,
  type ToastManager,
  toastRoot,
  toastScene,
} from './support/w10-toast.ts'

type Kind = 'alert' | 'dialog' | 'header' | 'raised'

const KINDS: readonly { readonly kind: Kind; readonly name: string }[] = [
  { kind: 'header', name: 'a sticky header' },
  { kind: 'dialog', name: 'a Dialog opened after the toast' },
  { kind: 'alert', name: 'an Alert Dialog opened after the toast' },
  { kind: 'raised', name: 'a toast raised from a button inside an open Dialog' },
]

/**
A page tall enough that a sticky bar at the block-end of the window is pinned over the toast's corner.
 */
const TALL = '200vh'

/**
How many frames an Alert Dialog is watched for after a press outside it, which it does not close for.
 */
const ALERT_WATCHED_FRAMES = 30

/**
 * The z-index declaration of the placement rule, which the second control takes out. It is the
 * spec's own text (the rule printed in the stylesheet block).
 */
const STACKING = ' z-index: var(--nave-layer-toast);'

/**
 * The options of a toast anchored under an element, with a title long enough to want more room
 * than the toast area gives it.
 */
const anchoredOptions = (anchor: Element): Record<string, unknown> => ({
  positionerProps: { anchor, side: 'bottom', sideOffset: 10 },
  title: 'Copied with a long title that wants more room than the toast area gives a toast',
})

/**
 * The page the toast appears over: a sticky bar with a z-index of 10 pinned to the block-end of
 * the window, and the Dialog or Alert Dialog with the button that raises a toast inside it.
 */
const pageOf = (
  kind: Kind,
  manager: ToastManager,
  height: string,
  isAnchored: boolean,
): ReactNode => {
  const Namespace = kind === 'alert' ? AlertDialog : Dialog
  const dialog = h(
    Namespace.Root,
    {},
    h(Namespace.Trigger, { 'data-testid': 'open-dialog' }, 'Open'),
    h(
      Namespace.Portal,
      {},
      h(Namespace.Backdrop, { 'data-testid': 'backdrop' }),
      h(
        Namespace.Viewport,
        {},
        h(
          Namespace.Popup,
          { 'data-testid': 'dialog' },
          h(Namespace.Title, {}, 'Title'),
          h(Namespace.Description, {}, 'Description'),
          h(
            'button',
            {
              'data-testid': 'raise',
              onClick: (event: { currentTarget: Element }) => {
                raise(manager, 'raised', isAnchored ? anchoredOptions(event.currentTarget) : {})
              },
            },
            'Raise',
          ),
          h(Namespace.Close, { 'data-testid': 'dialog-close' }, 'Close'),
        ),
      ),
    ),
  )
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', minBlockSize: height } },
    kind === 'header' ? undefined : dialog,
    h(
      'div',
      {
        'data-testid': 'header',
        style: {
          background: 'rgb(255, 200, 0)',
          blockSize: 240,
          bottom: 0,
          marginBlockStart: 'auto',
          position: 'sticky',
          zIndex: 10,
        },
      },
      'Header',
    ),
  )
}

const centreOf = (element: Element): { readonly x: number; readonly y: number } => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

const hitAtCentre = (element: Element): Element | null => {
  const { x, y } = centreOf(element)
  return document.elementFromPoint(x, y)
}

const isInside = (outer: Element, inner: Element | null): boolean =>
  inner !== null && outer.contains(inner)

/**
 * A click where the toast's centre is, delivered to whatever is there, the way a pointer's is
 * (the layer of a modal is not the toast, and Playwright would refuse to click the toast itself).
 */
const clickAtCentre = async (element: Element): Promise<void> => {
  const { x, y } = centreOf(element)
  const hit = document.elementFromPoint(x, y)
  if (hit === null) {
    throw new Error('nothing at the centre of the toast')
  }
  const box = hit.getBoundingClientRect()
  await userEvent.click(hit, { position: { x: x - box.left, y: y - box.top } })
}

describe('AC-base-ui-feedback-navigation-16 (second scenario), -19 and -43: placement and stacking', () => {
  let mounted: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(() => {
    mounted?.dispose()
    removeScheme?.()
    removeSheets?.()
    mounted = undefined
    document.documentElement.removeAttribute('dir')
  })

  /**
   * Mounts the composition, raises the toast the kind calls for and opens what it is under, and
   * returns the manager and the name of the toast to measure.
   */
  const compose = async (
    kind: Kind,
    scheme: Scheme,
    options: {
      readonly height?: string
      readonly isAnchored?: boolean
      readonly sheet?: string
    } = {},
  ): Promise<{ readonly manager: ToastManager; readonly name: string }> => {
    const { height = TALL, isAnchored = false, sheet = stylesheet } = options
    removeSheets = useSheets(tokens, sheet)
    removeScheme = useScheme(scheme)
    const manager = createManager()
    mounted = mount(toastScene({ children: pageOf(kind, manager, height, isAnchored), manager }))
    await settled(() => byTestId('viewport'))
    if (kind !== 'raised') {
      raise(manager, 'one')
      await settled(() => byTestId('toast-one'))
    }
    if (kind !== 'header') {
      await userEvent.click(required('open-dialog'))
      await settled(() => byTestId('dialog'))
    }
    if (kind === 'raised') {
      await userEvent.click(required('raise'))
      await settled(() => byTestId('toast-raised'))
    }
    return { manager, name: kind === 'raised' ? 'raised' : 'one' }
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-16 (Tier B, vgiq signed): the viewport is fixed on layer.toast, 24px from the block-end and inline-end edges, 320px wide', async () => {
      await compose('header', scheme)
      const style = getComputedStyle(required('viewport'))
      const box = required('viewport').getBoundingClientRect()
      const { clientHeight, clientWidth } = document.documentElement
      const inset = lengthOf('var(--nave-spacing-content-lg)')
      expect(inset, 'the inset token').toBe(24)
      expect(style.position).toBe('fixed')
      expect(style.zIndex, 'the computed layer token').toBe(
        getComputedStyle(document.documentElement).getPropertyValue('--nave-layer-toast').trim(),
      )
      expect(style.zIndex).toBe('500')
      expect(clientHeight - box.bottom, 'from the block-end edge').toBeCloseTo(24, 1)
      expect(clientWidth - box.right, 'from the inline-end edge').toBeCloseTo(24, 1)
      expect(box.width, 'inline size').toBeCloseTo(Math.min(320, clientWidth - 48), 1)
    })

    describe.each(KINDS)('over $name', ({ kind }) => {
      it('AC-base-ui-feedback-navigation-16 (Tier B, vgiq signed): the toast is the hit at its centre and its Toast.Close, clicked with a real pointer, closes it and leaves the dialog open', async () => {
        const { name } = await compose(kind, scheme)
        const root = toastRoot(name)
        expect(isInside(root, hitAtCentre(root)), 'the hit at the toast centre').toBe(true)
        await userEvent.click(closeOf(name))
        const isClosed = await isReachedWithin(() => !root.isConnected, MAX_FRAMES)
        expect(isClosed, 'the toast closed').toBe(true)
        const dialog = byTestId('dialog')
        const isDialogOpen =
          kind === 'header' ||
          (dialog?.isConnected === true && !Object.hasOwn(dialog.dataset, 'endingStyle'))
        expect(isDialogOpen, 'the dialog is still open, and not closing').toBe(true)
      }, 30_000)

      it('AC-base-ui-feedback-navigation-16 (Tier B, control): without the z-index the header or the dialog is what is at the toast centre', async () => {
        const isRule = stylesheet.includes(STACKING)
        expect(isRule, 'the stacking declaration is in the built sheet to take out').toBe(true)
        const { name } = await compose(kind, scheme, {
          sheet: stylesheet.replace(STACKING, ''),
        })
        const root = toastRoot(name)
        expect(isInside(root, hitAtCentre(root)), 'the hit at the toast centre').toBe(false)
      }, 30_000)

      it.runIf(kind !== 'header')(
        'AC-base-ui-feedback-navigation-16 (Tier B, vgiq unsigned): the dialog layer is what is at the toast centre, and the click there closes a Dialog (control)',
        async () => {
          const { name } = await compose(kind, scheme, {
            height: '320px',
            sheet: withoutClass(stylesheet, 'toast-placement'),
          })
          const root = toastRoot(name)
          const hit = hitAtCentre(root)
          expect(isInside(root, hit), 'the hit at the toast centre').toBe(false)
          expect(hit, 'something is there').not.toBeNull()
          const dialog = required('dialog')
          await clickAtCentre(root)
          // An Alert Dialog is not dismissed by a press outside it: it is given a few frames to
          // show it, where a Dialog is given as many as a close takes.
          const isClosed = await isReachedWithin(
            () => !dialog.isConnected,
            kind === 'alert' ? ALERT_WATCHED_FRAMES : MAX_FRAMES,
          )
          expect(isClosed, 'the click closed the dialog').toBe(kind !== 'alert')
          expect(root.isConnected, 'the toast was not reached').toBe(true)
        },
        30_000,
      )
    })
  })

  it('AC-base-ui-feedback-navigation-16 (Tier B): in a window narrower than 20rem plus the insets the inline size is the window width less 48px', async () => {
    const original = { height: window.innerHeight, width: window.innerWidth }
    try {
      await browserPage.viewport(300, original.height)
      const isNarrow = await isReachedWithin(() => window.innerWidth === 300, MAX_FRAMES)
      expect(isNarrow, 'the window took its new width').toBe(true)
      await compose('header', 'light')
      const box = required('viewport').getBoundingClientRect()
      const { clientWidth } = document.documentElement
      expect(box.width, 'inline size').toBeCloseTo(clientWidth - 48, 1)
      expect(clientWidth - box.right, 'from the inline-end edge').toBeCloseTo(24, 1)
    } finally {
      await browserPage.viewport(original.width, original.height)
    }
  })

  it('AC-base-ui-feedback-navigation-16 (Tier B): with dir="rtl" on <html> the viewport sits against the opposite physical edge, still 24px from the block-end edge (the insets are logical)', async () => {
    document.documentElement.dir = 'rtl'
    await compose('header', 'light')
    const box = required('viewport').getBoundingClientRect()
    const { clientHeight } = document.documentElement
    expect(box.left, 'the physical left edge is the one 24px from the window').toBeCloseTo(24, 1)
    expect(clientHeight - box.bottom, 'from the block-end edge').toBeCloseTo(24, 1)
    expect(
      document.documentElement.clientWidth - box.right,
      'not from the physical right',
    ).toBeGreaterThan(24)
  })

  describe.each(SCHEMES)('anchored toasts in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-16 (Tier B, vgiq signed): an anchored toast near the inline-end edge stays under its anchor, at most 20rem wide and inside the window', async () => {
      removeSheets = useSheets(tokens, stylesheet)
      removeScheme = useScheme(scheme)
      const manager = createManager()
      mounted = mount(
        toastScene({
          children: h(
            'button',
            {
              'data-testid': 'anchor',
              style: { position: 'fixed', right: 8, top: 100 },
            },
            'Copy',
          ),
          manager,
        }),
      )
      await settled(() => byTestId('viewport'))
      const anchor = required('anchor')
      raise(manager, 'anchored', anchoredOptions(anchor))
      const root = (await settled(() => byTestId('toast-anchored'))) as HTMLElement
      const positioner = required('positioner-anchored')
      const gap = positioner.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom
      expect(gap, 'the sideOffset between the anchor and the toast').toBeCloseTo(10, 0)
      const box = root.getBoundingClientRect()
      expect(box.width, 'at most 20rem wide').toBeLessThanOrEqual(320.5)
      expect(box.right, 'inside the window').toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      )
      expect(getComputedStyle(required('viewport')).position, 'the viewport stays fixed').toBe(
        'fixed',
      )
    })

    it('AC-base-ui-feedback-navigation-16 (Tier B, vgiq signed): an anchored toast raised from a button inside an open Dialog is the hit at its centre', async () => {
      await compose('raised', scheme, { isAnchored: true })
      const root = toastRoot('raised')
      expect(isInside(root, hitAtCentre(root)), 'the hit at the toast centre').toBe(true)
      expect(root.getBoundingClientRect().width, 'at most 20rem wide').toBeLessThanOrEqual(320.5)
    }, 30_000)
  })

  it('AC-base-ui-feedback-navigation-16 (Tier B, vgiq signed): one viewport holding a stacked toast and an anchored toast keeps the stacked toast in its corner while the anchored one is open', async () => {
    removeSheets = useSheets(tokens, stylesheet)
    removeScheme = useScheme('light')
    const manager = createManager()
    mounted = mount(
      toastScene({
        children: h(
          'button',
          { 'data-testid': 'anchor', style: { position: 'fixed', right: 8, top: 100 } },
          'Copy',
        ),
        manager,
      }),
    )
    await settled(() => byTestId('viewport'))
    raise(manager, 'stacked')
    const stacked = (await settled(() => byTestId('toast-stacked'))) as HTMLElement
    const before = stacked.getBoundingClientRect()
    raise(manager, 'anchored', {
      positionerProps: { anchor: required('anchor'), side: 'bottom', sideOffset: 10 },
    })
    await settled(() => byTestId('toast-anchored'))
    const after = stacked.getBoundingClientRect()
    const { clientHeight, clientWidth } = document.documentElement
    expect(clientWidth - after.right, 'from the inline-end edge').toBeCloseTo(24, 1)
    expect(clientHeight - after.bottom, 'from the block-end edge').toBeCloseTo(24, 1)
    expect([after.left, after.top], 'the stacked toast did not move').toEqual([
      before.left,
      before.top,
    ])
    expect(getComputedStyle(required('viewport')).position).toBe('fixed')
  })

  it('AC-base-ui-feedback-navigation-19 (Tier B, vgiq unsigned): the viewport computes position static and z-index auto, the signed sheet fixed and 500 (control)', async () => {
    await compose('header', 'light', { sheet: withoutClass(stylesheet, 'toast-placement') })
    const unsigned = getComputedStyle(required('viewport'))
    expect({ position: unsigned.position, zIndex: unsigned.zIndex }).toEqual({
      position: 'static',
      zIndex: 'auto',
    })
    expect(
      required('viewport').classList.contains('nave-base-ui-toast-placement'),
      'the wrapper still adds the class',
    ).toBe(true)
    mounted?.dispose()
    removeSheets?.()
    removeScheme?.()
    await compose('header', 'light')
    const signed = getComputedStyle(required('viewport'))
    expect({ position: signed.position, zIndex: signed.zIndex }).toEqual({
      position: 'fixed',
      zIndex: '500',
    })
  })

  it('AC-base-ui-feedback-navigation-43 (Tier B): the anchored Toast.Positioner inline transform is a single translate()', async () => {
    removeSheets = useSheets(tokens, stylesheet)
    removeScheme = useScheme('light')
    const manager = createManager()
    mounted = mount(
      toastScene({
        children: h(
          'button',
          { 'data-testid': 'anchor', style: { left: 200, position: 'fixed', top: 100 } },
          'Copy',
        ),
        manager,
      }),
    )
    await settled(() => byTestId('viewport'))
    raise(manager, 'anchored', {
      positionerProps: { anchor: required('anchor'), side: 'bottom', sideOffset: 10 },
    })
    await settled(() => byTestId('toast-anchored'))
    const transform = required('positioner-anchored').style.transform
    const functions = transform
      .matchAll(/([a-z0-9]+)\(/gi)
      .map((match) => match[1])
      .toArray()
    expect(functions, `the inline transform "${transform}"`).toEqual(['translate'])
    const [x, y] = transform
      .matchAll(/(-?\d+(?:\.\d+)?)px/g)
      .map((match) => px(`${match[1]}px`))
      .toArray()
    expect(Number.isFinite(x) && Number.isFinite(y), 'in two lengths').toBe(true)
  })
})
