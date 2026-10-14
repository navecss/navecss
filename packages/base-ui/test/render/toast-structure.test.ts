import { afterEach, describe, expect, it } from 'vitest'

import { partsNamed } from '../support/dom.ts'
import { focusRingClasses } from '../support/focus.ts'
import { cleanup, user } from '../support/react.ts'
import {
  addStyleSheet,
  BASE,
  type Feedback,
  inlineStyle,
  loadFeedback,
  naveClasses,
  nonTranslationStyles,
  removeStyleSheets,
  settle,
  until,
} from '../support/w10-feedback.ts'
import { additionsOf, recordMutations } from '../support/w10-recorder.ts'
import { renderToasts, rootTitles } from '../support/w10-toast-scene.ts'

const feedback: Feedback = await loadFeedback()

afterEach(async () => {
  removeStyleSheets()
  await cleanup()
})

const viewport = (): HTMLElement => partsNamed('Toast.Viewport')[0]!
const roots = (): HTMLElement[] => partsNamed('Toast.Root')

const ROOT_CLASSES = [`${BASE}toast-fade`, `${BASE}toast-limit`, `${BASE}toast-root`]

/**
The classes Table T2 gives `focusRing` to, with the one the navigation menu's trigger adds.
 */
const ringClasses: ReadonlySet<string> = new Set([
  ...focusRingClasses,
  `${BASE}navigation-menu-trigger`,
])

/**
The elements of a viewport that are toasts or anchored toasts' positioners: Base UI's focus
guards, which it adds once keyboard focus has entered the region, are not toasts.
 */
const listed = (element: HTMLElement): HTMLElement[] =>
  [...element.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter((child) => child.dataset.baseUiFocusGuard === undefined)

describe('AC-base-ui-feedback-navigation-11: toasts form a plain list, newest first (the render half of the first scenario)', () => {
  it('limit 5, four toasts added t1 to t4: the viewport lists the roots t4, t3, t2, t1, each role dialog and tabindex 0', async () => {
    const scene = await renderToasts(feedback, { limit: 5 })
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title })
    }
    expect(rootTitles()).toEqual(['t4', 't3', 't2', 't1'])
    // The children of the viewport are the roots themselves, in that order, and nothing else.
    expect(listed(viewport())).toEqual(roots())
    for (const root of roots()) {
      expect(root.getAttribute('role')).toBe('dialog')
      expect(root.getAttribute('tabindex')).toBe('0')
    }
  })

  it('limit 5, four toasts: the viewport carries aria-live polite and the class nave-base-ui-toast-viewport', async () => {
    const scene = await renderToasts(feedback, { limit: 5 })
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title })
    }
    expect(viewport().getAttribute('aria-live')).toBe('polite')
    expect(viewport().classList.contains(`${BASE}toast-viewport`)).toBe(true)
    // Base UI's own role and relevance on the region, measured with it.
    expect(viewport().getAttribute('role')).toBe('region')
    expect(viewport().getAttribute('aria-relevant')).toBe('additions text')
  })

  it('control: the list is newest first, not the order the toasts were added in', async () => {
    const scene = await renderToasts(feedback, { limit: 5 })
    const added: string[] = []
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title })
      added.push(title)
    }
    expect(rootTitles()).not.toEqual(added)
    expect(rootTitles()).toEqual(added.toReversed())
  })
})

describe('AC-base-ui-feedback-navigation-12: the card, and Toast.Root keeps the browser ring (Tier A)', () => {
  it('Toast.Root carries exactly nave-base-ui-toast-root, -toast-fade and -toast-limit, and no class of Table T2 (no focusRing)', async () => {
    const scene = await renderToasts(feedback, { withAction: true })
    await scene.add({ title: 'Saved' })
    const [root] = roots()
    expect(naveClasses(root)).toEqual(ROOT_CLASSES)
    expect(naveClasses(root).filter((name) => ringClasses.has(name))).toEqual([])
  })

  it('control: Toast.Close in the same render carries nave-base-ui-button, a class of Table T2, so the ring check can see one', async () => {
    const scene = await renderToasts(feedback, { withAction: true })
    await scene.add({ title: 'Saved' })
    const close = partsNamed('Toast.Close')[0]!
    expect(close.classList.contains(`${BASE}button`)).toBe(true)
    expect(naveClasses(close).filter((name) => ringClasses.has(name))).toEqual([`${BASE}button`])
  })

  it('the Content, the Title and the Description are not Toast.Root: the card is on the root alone', async () => {
    const scene = await renderToasts(feedback)
    await scene.add({ title: 'Saved', description: 'Your changes were saved.' })
    expect(naveClasses(partsNamed('Toast.Content')[0])).toEqual([])
    expect(naveClasses(partsNamed('Toast.Title')[0])).toEqual([`${BASE}title`])
    expect(naveClasses(partsNamed('Toast.Description')[0])).toEqual([`${BASE}description`])
  })
})

describe('AC-base-ui-feedback-navigation-12: every toast type is painted alike (Tier A)', () => {
  it('an error toast, a success toast and a toast with no type carry the same nave- classes', async () => {
    const scene = await renderToasts(feedback)
    await scene.add({ title: 'untyped' })
    await scene.add({ title: 'success', type: 'success' })
    await scene.add({ title: 'error', type: 'error' })
    expect(roots()).toHaveLength(3)
    const classes = roots().map((root) => naveClasses(root))
    expect(classes).toEqual([ROOT_CLASSES, ROOT_CLASSES, ROOT_CLASSES])
  })

  it('control: the three toasts differ in type as Base UI reports it, so alike is not three of one kind', async () => {
    const scene = await renderToasts(feedback)
    await scene.add({ title: 'untyped' })
    await scene.add({ title: 'success', type: 'success' })
    await scene.add({ title: 'error', type: 'error' })
    expect(roots().map((root) => root.dataset.type)).toEqual(['error', 'success', undefined])
  })
})

describe('AC-base-ui-feedback-navigation-13: toasts over the limit are hidden, and only those (Tier A)', () => {
  it('default limit, four toasts with timeout 0: the oldest root carries data-limited and inert, the three newer neither', async () => {
    const scene = await renderToasts(feedback)
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title, timeout: 0 })
    }
    expect(rootTitles()).toEqual(['t4', 't3', 't2', 't1'])
    const [t4, t3, t2, t1] = roots() as [HTMLElement, HTMLElement, HTMLElement, HTMLElement]
    expect(t1.dataset.limited !== undefined).toBe(true)
    expect(t1.hasAttribute('inert')).toBe(true)
    for (const active of [t4, t3, t2]) {
      expect(active.dataset.limited !== undefined).toBe(false)
      expect(active.hasAttribute('inert')).toBe(false)
    }
  })

  it('every root carries nave-base-ui-toast-limit, the limited one and the three active ones', async () => {
    const scene = await renderToasts(feedback)
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title, timeout: 0 })
    }
    expect(roots()).toHaveLength(4)
    for (const root of roots()) {
      expect(root.classList.contains(`${BASE}toast-limit`)).toBe(true)
    }
  })

  it('control: three toasts under the limit, no root carries data-limited or inert', async () => {
    const scene = await renderToasts(feedback)
    for (const title of ['t1', 't2', 't3']) {
      await scene.add({ title, timeout: 0 })
    }
    for (const root of roots()) {
      expect(root.dataset.limited !== undefined).toBe(false)
      expect(root.hasAttribute('inert')).toBe(false)
    }
  })

  it('the DOM half of the Tier B clause: closing the newest toast takes data-limited and inert off the oldest', async () => {
    const scene = await renderToasts(feedback)
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title, timeout: 0 })
    }
    const oldest = roots().at(-1)!
    expect(oldest.dataset.limited !== undefined).toBe(true)
    await user().click(partsNamed('Toast.Close')[0]!)
    await until('the newest toast to leave', () => rootTitles().length === 3)
    expect(rootTitles()).toEqual(['t3', 't2', 't1'])
    expect(oldest.dataset.limited !== undefined).toBe(false)
    expect(oldest.hasAttribute('inert')).toBe(false)
  })
})

describe('AC-base-ui-feedback-navigation-16: placement and stacking ride the placement class, one shape for stacked and anchored toasts (Tier A)', () => {
  it('stacked toasts: Toast.Viewport carries nave-base-ui-toast-viewport and nave-base-ui-toast-placement', async () => {
    const scene = await renderToasts(feedback)
    await scene.add({ title: 'stacked' })
    expect(naveClasses(viewport())).toEqual([`${BASE}toast-placement`, `${BASE}toast-viewport`])
    expect(listed(viewport())).toEqual(roots())
  })

  it('an anchored toast, a Toast.Positioner inside the viewport: the viewport carries the same two classes', async () => {
    const scene = await renderToasts(feedback, { anchoredSide: 'bottom' })
    await scene.add({ title: 'anchored' })
    const positioner = partsNamed('Toast.Positioner')[0]!
    expect(positioner.parentElement).toBe(viewport())
    expect(naveClasses(viewport())).toEqual([`${BASE}toast-placement`, `${BASE}toast-viewport`])
  })

  it('control: Toast.Positioner and Toast.Content carry no nave- class, so the two classes are the viewport alone', async () => {
    const scene = await renderToasts(feedback, { anchoredSide: 'bottom' })
    await scene.add({ title: 'anchored' })
    expect(naveClasses(partsNamed('Toast.Positioner')[0])).toEqual([])
    expect(naveClasses(partsNamed('Toast.Content')[0])).toEqual([])
  })
})

describe('AC-base-ui-feedback-navigation-39: every new attribute the stylesheet keys on appears where its rule reaches (the Toast rows)', () => {
  it('Toast, limit 3, four toasts: data-limited on the oldest Toast.Root, nave-base-ui-toast-limit on the carrier, the carrier inert', async () => {
    const scene = await renderToasts(feedback, { limit: 3 })
    for (const title of ['t1', 't2', 't3', 't4']) {
      await scene.add({ title, timeout: 0 })
    }
    const carriers = roots().filter((root) => root.dataset.limited !== undefined)
    expect(carriers.map((carrier) => carrier.querySelector('h2')?.textContent)).toEqual(['t1'])
    expect(carriers[0]!.classList.contains(`${BASE}toast-limit`)).toBe(true)
    expect(carriers[0]!.hasAttribute('inert')).toBe(true)
  })

  it('Toast, add then close by Toast.Close with a literal-duration test sheet: data-ending-style on Toast.Root, nave-base-ui-toast-fade on the carrier', async () => {
    addStyleSheet('[data-part="Toast.Root"] { transition-duration: 50ms; }')
    const scene = await renderToasts(feedback)
    await scene.add({ title: 'closing' })
    const [root] = roots()
    expect(root!.classList.contains(`${BASE}toast-fade`)).toBe(true)
    const recorder = recordMutations()
    await user().click(partsNamed('Toast.Close')[0]!)
    await until('the closing toast to leave', () => roots().length === 0)
    recorder.stop()
    const carriers = additionsOf(recorder, 'data-ending-style').map((record) => record.target)
    expect(carriers).toEqual([root])
    expect(carriers[0]!.classList.contains(`${BASE}toast-fade`)).toBe(true)
  })

  for (const side of ['inline-start', 'inline-end']) {
    it(`Toast (anchored), side ${side}: data-side ${side} on Toast.Arrow, nave-base-ui-arrow-inline and nave-base-ui-arrow on the carrier`, async () => {
      const scene = await renderToasts(feedback, { anchoredSide: side })
      await scene.add({ title: 'anchored' })
      const arrow = partsNamed('Toast.Arrow')[0]!
      expect(arrow.dataset.side).toBe(side)
      expect(naveClasses(arrow)).toEqual([`${BASE}arrow`, `${BASE}arrow-inline`])
    })
  }
})

describe('AC-base-ui-feedback-navigation-43: positioners and popups carry translation only at rest (the anchored Toast)', () => {
  it('an anchored Toast.Positioner at rest has no inline opacity, filter, scale or rotate, and its transform is a single translate', async () => {
    const scene = await renderToasts(feedback, { anchoredSide: 'bottom' })
    await scene.add({ title: 'anchored' })
    await until('the positioner to come to rest', () => {
      const positioner = partsNamed('Toast.Positioner')[0]
      return (
        positioner !== undefined &&
        inlineStyle(positioner).has('--anchor-width') &&
        positioner.dataset.startingStyle === undefined &&
        positioner.dataset.endingStyle === undefined
      )
    })
    await settle()
    const positioner = partsNamed('Toast.Positioner')[0]!
    expect(nonTranslationStyles(positioner)).toEqual([])
    // The control that a real transform was examined: Base UI placed the positioner with one
    // single translation, which the check admits.
    expect(inlineStyle(positioner).get('transform')).toMatch(/^translate\(/)
  })

  it('control: a positioner still fading in, scaled or rotated is reported', () => {
    const element = document.createElement('div')
    element.setAttribute(
      'style',
      'opacity: 0; scale: 0.9; transform: scale(0.9) translate(1px, 2px)',
    )
    expect(nonTranslationStyles(element)).toEqual([
      'opacity',
      'scale',
      'transform: scale(0.9) translate(1px, 2px)',
    ])
  })
})
