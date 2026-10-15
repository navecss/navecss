import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { describeDocument, marked, parityViolations, partsNamed } from '../support/dom.ts'
import {
  describeAtRest,
  fullProps,
  INDETERMINATE,
  overflowingLayout,
  settle,
  underSetups,
} from '../support/feedback-render.ts'
import { FEEDBACK_SUBPATHS, feedbackBare, feedbackNave } from '../support/feedback.ts'
import { cleanup, render, user } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { navigationMenuOpenProps } from '../support/states.ts'
import { tableP } from '../support/table-p.ts'

afterEach(cleanup)

const sceneOf = (subpath: string): NonNullable<(typeof scenes)[string]> => {
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  return scene
}

/**
 * The variant props the Button family of the seven is given in the comparison: the primary
 * variant with the small size, and the ghost variant with the small size.
 */
const variantProps = (variant: 'ghost' | 'primary'): Record<string, Props> => ({
  'Toast.Action': { size: 'sm', variant },
  'Toast.Close': { size: 'sm', variant },
})

interface State {
  /**
  What the wrapper alone is given: the props the bare part has no use for.
   */
  readonly extra?: Record<string, Props>
  readonly label: string
  readonly props: Record<string, Props>
}

const STATES: Readonly<Record<string, readonly State[]>> = {
  avatar: [
    { label: 'rendered', props: {} },
    { extra: { 'Avatar.Root': { size: 'lg' } }, label: 'rendered, with size="lg"', props: {} },
    { extra: { 'Avatar.Root': { size: 'sm' } }, label: 'rendered, with size="sm"', props: {} },
  ],
  meter: [{ label: 'rendered', props: {} }],
  'navigation-menu': [
    { label: 'closed', props: {} },
    { label: 'open', props: navigationMenuOpenProps() },
  ],
  progress: [
    { label: 'rendered', props: {} },
    { label: 'indeterminate', props: { 'Progress.Root': { value: INDETERMINATE } } },
  ],
  'scroll-area': [{ label: 'rendered', props: {} }],
  separator: [
    { label: 'horizontal', props: {} },
    { label: 'vertical', props: { Separator: { orientation: 'vertical' } } },
  ],
  toast: [
    { label: 'two toasts', props: {} },
    { label: 'four toasts open', props: { 'Toast.Adder': { count: 4 } } },
    {
      label: 'four toasts open, one over the limit',
      props: { 'Toast.Adder': { count: 4 }, 'Toast.Provider': { limit: 3 } },
    },
  ],
}

const VARIANT_SETS = [
  { label: '', props: {} },
  { label: ', with variant and size', props: variantProps('primary') },
  { label: ', with variant ghost and size', props: variantProps('ghost') },
] as const

/**
 * Every state of every component, with each variant set that means something there: the variant
 * props only mean something on the Toast's buttons.
 */
const CASES = FEEDBACK_SUBPATHS.flatMap((subpath) =>
  (STATES[subpath] ?? []).flatMap(({ extra, label, props }) =>
    VARIANT_SETS.filter(
      ({ label: variantLabel }) => subpath === 'toast' || variantLabel === '',
    ).map(({ label: variantLabel, props: variantSet }) => ({
      name: `${subpath}, ${label}${variantLabel}`,
      props,
      subpath,
      wrapperProps: { ...props, ...variantSet, ...extra },
    })),
  ),
)

describe("AC-base-ui-feedback-navigation-46 (AC-12): a wrapper renders exactly the bare part's DOM, plus its class and data-nave-*", () => {
  it.each(CASES)('$name', async ({ props, subpath, wrapperProps }) => {
    const scene = sceneOf(subpath)
    // The Scroll Area is read overflowing and the Avatar with its image loaded as well.
    await underSetups(subpath, async () => {
      await render(scene.render(await feedbackBare(), { props }))
      const expected = await describeAtRest()
      await render(scene.render(await feedbackNave(), { props: wrapperProps }))
      expect(parityViolations(expected, await describeAtRest())).toEqual([])
    })
  })

  it('lists a state for each of the seven, so none is skipped', () => {
    expect(Object.keys(STATES).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...FEEDBACK_SUBPATHS].toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it('gives Avatar.Root alone a data-nave-size="lg", and no part of the seven any other data-nave-*', async () => {
    const carriers = new Map<string, string>()
    const nave = await feedbackNave()
    for (const subpath of FEEDBACK_SUBPATHS) {
      for (const variants of [variantProps('primary'), variantProps('ghost')]) {
        await render(
          sceneOf(subpath).render(nave, {
            props: { ...fullProps(), ...variants, 'Avatar.Root': { size: 'lg' } },
          }),
        )
        for (const { element, part } of marked()) {
          const names = element
            .getAttributeNames()
            .filter((name) => name.startsWith('data-nave-'))
            .join(' ')
          carriers.set(part, names || (carriers.get(part) ?? ''))
        }
        await cleanup()
      }
    }
    const offenders = carriers
      .entries()
      .filter(
        ([part, names]) =>
          names !== '' && !['Avatar.Root', 'Toast.Action', 'Toast.Close'].includes(part),
      )
      .map(([part, names]) => `${part}: ${names}`)
      .toArray()
    expect(offenders).toEqual([])
    // The positive control: the three parts the criterion names did carry one.
    expect(
      ['Toast.Action', 'Toast.Close', 'Avatar.Root'].filter(
        (part) => (carriers.get(part) ?? '') === '',
      ),
    ).toEqual([])
  })

  it('control: a part that gains an aria-label is reported, naming its element', async () => {
    const scene = sceneOf('avatar')
    await render(scene.render(await feedbackBare()))
    const expected = describeDocument()
    await render(scene.render(await feedbackNave()))
    const wrapped = describeDocument()
    const at = wrapped.findIndex((record) => record.tag === 'span')
    const tampered = wrapped.map((record, index) =>
      index === at
        ? { ...record, attributes: new Map([...record.attributes, ['aria-label', 'x']]) }
        : record,
    )
    expect(parityViolations(expected, tampered)).toEqual([
      `element ${at} <span> aria-label: x, the bare render has absent`,
    ])
  })
})

/**
 * What each state change leaves alone: the class and `data-nave-*` of every marked element,
 * keyed by marker and by which of its occurrences the element is.
 */
const ownAttributes = (): Map<string, string> => {
  const seen = new Map<string, number>()
  return new Map(
    marked().map(({ element, part }) => {
      const index = seen.get(part) ?? 0
      seen.set(part, index + 1)
      const dataNave = [...element.attributes]
        .filter(({ name }) => name.startsWith('data-nave-'))
        .map(({ name, value }) => `${name}=${value}`)
        .join(' ')
      return [`${part}#${index}`, `${element.getAttribute('class') ?? ''} | ${dataNave}`] as const
    }),
  )
}

const CONSUMER = 'consumer'

const C = 'nave-base-ui-'

/**
 * Every styled part of a component given a consumer class, so a class a state might drop shows.
 */
const consumerClasses = (subpath: string): Record<string, Props> => {
  const top = sceneOf(subpath).subpath
  return Object.fromEntries(
    tableP
      .keys()
      .filter((part) => part.toLowerCase().replaceAll('-', '').startsWith(top.replaceAll('-', '')))
      .map((part) => [part, { className: CONSUMER }] as const),
  )
}

describe("AC-base-ui-feedback-navigation-46 (AC-37): Nave's contribution is chosen by the consumer's props, never by state", () => {
  it('Toast: a limited toast, an ending toast and a toast under the limit carry the same classes', async () => {
    const nave = await feedbackNave()
    const scene = sceneOf('toast')
    await render(
      scene.render(nave, {
        props: {
          ...consumerClasses('toast'),
          'Toast.Adder': { count: 4 },
          'Toast.Provider': { limit: 3 },
        },
      }),
    )
    await settle(60)
    const roots = partsNamed('Toast.Root').slice(0, 4)
    // The control: one of the four really is limited, and one is not.
    expect(roots.filter((root) => Object.hasOwn(root.dataset, 'limited'))).toHaveLength(1)
    const classes = roots.map((root) => root.getAttribute('class'))
    expect(new Set(classes).size).toBe(1)
    expect(classes[0]).toContain(CONSUMER)
    const before = ownAttributes()
    // Closing a toast puts it in its ending state; the others keep what they had.
    const ending: string[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const { target } = record
        if (
          record.type === 'attributes' &&
          record.attributeName === 'data-ending-style' &&
          target instanceof Element
        ) {
          ending.push(target.getAttribute('class') ?? '')
        }
      }
    })
    observer.observe(document.body, {
      attributeFilter: ['data-ending-style'],
      attributes: true,
      subtree: true,
    })
    await user().click(partsNamed('Toast.Close')[0]!)
    await settle(60)
    observer.disconnect()
    expect(ending.length, 'a toast was seen in its ending state').toBeGreaterThan(0)
    expect(new Set(ending)).toEqual(new Set(classes))
    // Nothing that stayed changed.
    const after = ownAttributes()
    const differing = [...after].filter(
      ([key, value]) => before.has(key) && before.get(key) !== value,
    )
    expect(differing.map(([key]) => key)).toEqual([])
  })

  it('Navigation Menu: opening the item changes no class of the trigger, the icon or a link', async () => {
    const nave = await feedbackNave()
    const scene = sceneOf('navigation-menu')
    const props = consumerClasses('navigation-menu')
    await render(scene.render(nave, { props }))
    const closed = ownAttributes()
    expect(partsNamed('NavigationMenu.Trigger')[0]?.getAttribute('aria-expanded')).toBe('false')
    await render(scene.render(nave, { props: { ...props, ...navigationMenuOpenProps() } }))
    await settle(60)
    expect(partsNamed('NavigationMenu.Trigger')[0]?.getAttribute('aria-expanded')).toBe('true')
    const open = ownAttributes()
    const differing = [...open].filter(
      ([key, value]) => closed.has(key) && closed.get(key) !== value,
    )
    expect(differing.map(([key]) => key)).toEqual([])
    // Opening by a click gives the same classes as opening by the prop.
    await render(scene.render(nave, { props }))
    await user().click(partsNamed('NavigationMenu.Trigger')[0]!)
    await settle(60)
    expect(partsNamed('NavigationMenu.Trigger')[0]?.getAttribute('aria-expanded')).toBe('true')
    expect(ownAttributes().get('NavigationMenu.Trigger#0')).toBe(
      open.get('NavigationMenu.Trigger#0'),
    )
    expect(ownAttributes().get('NavigationMenu.Icon#0')).toBe(open.get('NavigationMenu.Icon#0'))
  })

  it('Navigation Menu: the current link and a link that is not current carry the same classes', async () => {
    const nave = await feedbackNave()
    const props = { ...consumerClasses('navigation-menu'), ...navigationMenuOpenProps() }
    await render(sceneOf('navigation-menu').render(nave, { props }))
    await settle(60)
    const links = partsNamed('NavigationMenu.Link')
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page')
    const others = links.filter((link) => !link.hasAttribute('aria-current'))
    // The control: the scene renders one of each.
    expect(current).toHaveLength(1)
    expect(others.length).toBeGreaterThan(0)
    for (const link of others) {
      expect(link.getAttribute('class')).toBe(current[0]?.getAttribute('class'))
    }
  })

  it('Progress: an indeterminate bar and a determinate one carry the same classes on every part', async () => {
    const nave = await feedbackNave()
    const scene = sceneOf('progress')
    const props = consumerClasses('progress')
    await render(scene.render(nave, { props }))
    const determinate = ownAttributes()
    await render(
      scene.render(nave, {
        props: { ...props, 'Progress.Root': { className: CONSUMER, value: INDETERMINATE } },
      }),
    )
    expect(partsNamed('Progress.Indicator')[0]?.hasAttribute('data-indeterminate')).toBe(true)
    expect([...ownAttributes()]).toEqual([...determinate])
    expect(determinate.size).toBeGreaterThan(0)
  })

  it('Scroll Area: scrollbars of both orientations and an overflowing viewport carry classes chosen by props alone', async () => {
    const nave = await feedbackNave()
    const scene = sceneOf('scroll-area')
    const props = consumerClasses('scroll-area')
    await render(scene.render(nave, { props }))
    const fitting = ownAttributes()
    const [vertical, horizontal] = partsNamed('ScrollArea.Scrollbar')
    expect(vertical?.dataset.orientation).toBe('vertical')
    expect(horizontal?.dataset.orientation).toBe('horizontal')
    expect(vertical?.getAttribute('class')).toBe(horizontal?.getAttribute('class'))
    // Content that overflows: jsdom has no layout, so the sizes are the ones the page would measure.
    const restore = overflowingLayout()
    try {
      await render(scene.render(nave, { props }))
      await settle(60)
      const viewport = partsNamed('ScrollArea.Viewport')[0]
      // The control: the viewport really is in the overflowing state.
      expect(viewport?.hasAttribute('data-has-overflow-y')).toBe(true)
      const overflowing = ownAttributes()
      // Every part the viewport shows with nothing to scroll keeps its classes (the corner shows only now).
      expect([...overflowing].filter(([key]) => fitting.has(key))).toEqual([...fitting])
      expect(overflowing.get('ScrollArea.Corner#0')).toBe(`${C}scroll-area-corner ${CONSUMER} | `)
    } finally {
      restore()
    }
  })

  it('every component: two renders with the same props give the same classes (nothing reads state)', async () => {
    const nave = await feedbackNave()
    for (const subpath of FEEDBACK_SUBPATHS) {
      const props = { ...fullProps(), ...consumerClasses(subpath) }
      await render(sceneOf(subpath).render(nave, { props }))
      await settle(30)
      const first = ownAttributes()
      await settle(60)
      expect([...ownAttributes()], subpath).toEqual([...first])
    }
  })
})
