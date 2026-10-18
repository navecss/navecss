import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { marked, partsNamed } from '../support/dom.ts'
import { EARLIER_SUBPATHS, isFeedbackPart } from '../support/feedback.ts'
import { isLeftOut } from '../support/left-out.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { topName } from '../support/subpaths.ts'
import { tableP, tablePClasses, tablePClassesFor, tablePFor } from '../support/table-p.ts'
import { isInT0 } from '../support/table-t0.ts'

const bare = await loadBare()
const nave = await loadNave()

afterEach(cleanup)

/**
 * Every key of every component that is in neither Table P nor Table T0, or in both.
 */
const unplaced = (keys: readonly string[]): string[] =>
  keys.filter((part) => (tableP.has(part) ? 1 : 0) + (isInT0(part) ? 1 : 0) !== 1)

const keysAt = (source: Source, subpath: string): string[] => {
  const ui = source(subpath)
  const top = topName(subpath)
  return typeof ui === 'object' &&
    Object.keys(ui).some((key) => /^[A-Z]/.test(key) || key === 'createHandle')
    ? Object.keys(ui)
        .map((key) => `${top}.${key}`)
        .filter((part) => !isLeftOut(part))
    : [top]
}

const naveClassesOf = (element: Element): string[] =>
  element.className.split(/\s+/).filter((name) => name.startsWith('nave-'))

type Expected = ReadonlyMap<string, readonly string[]>

interface Observed {
  readonly classes: readonly string[]
  readonly hasConsumerClass: boolean
  readonly part: string
}

interface Observation {
  /**
  Every Nave class on any element of any render, marked or not.
   */
  readonly anywhere: ReadonlySet<string>
  readonly parts: readonly Observed[]
}

const CONSUMER_CLASS = 'consumer'

/**
 * Renders every subpath's scene open through the wrapper, every part given a `className` when
 * `isConsumerClass` is set, and records the Nave classes of every marked part and of every element.
 * `tamper` runs on each marked element before it is read, for the controls.
 */
const observe = async (
  isConsumerClass: boolean,
  tamper: (part: string, element: Element) => void = () => {},
): Promise<Observation> => {
  const parts: Observed[] = []
  const anywhere = new Set<string>()
  for (const subpath of EARLIER_SUBPATHS) {
    const scene = scenes[subpath]
    if (scene === undefined) {
      throw new Error(`no scene for ${subpath}`)
    }
    const consumer = isConsumerClass
      ? Object.fromEntries(
          tableP.keys().map((part) => [part, { className: CONSUMER_CLASS }] as const),
        )
      : {}
    await render(
      scene.render(nave, {
        props: {
          ...openProps(),
          'Accordion.Root': { defaultValue: ['a'] },
          'Collapsible.Root': { defaultOpen: true },
          ...consumer,
        },
      }),
    )
    for (const { element, part } of marked()) {
      tamper(part, element)
      parts.push({
        classes: naveClassesOf(element),
        hasConsumerClass: element.classList.contains(CONSUMER_CLASS),
        part,
      })
    }
    for (const element of document.querySelectorAll('[class*="nave-"]')) {
      for (const name of naveClassesOf(element)) {
        anywhere.add(name)
      }
    }
  }
  return { anywhere, parts }
}

/**
 * Where an observation differs from a table: each marked part whose Nave classes are not exactly
 * its row (none, for a part the table does not list), and each Nave class on an element that no
 * row of the table names.
 */
const problemsAgainst = (observation: Observation, expected: Expected): string[] => {
  const named = new Set(expected.values().toArray().flat())
  return [
    ...observation.parts.flatMap(({ classes, part }) => {
      const row = expected.get(part) ?? []
      return classes.join(' ') === row.join(' ')
        ? []
        : [`${part}: classes [${classes.join(' ')}], expected [${row.join(' ')}]`]
    }),
    ...observation.anywhere
      .values()
      .filter((name) => !named.has(name))
      .map((name) => `${name} is on a rendered element and in no row`),
  ]
}

/**
 * The classes of the parts of the v1 package and the overlay completion: Table P without the
 * seven, whose scenes the files of their own render.
 */
const earlierClasses: ReadonlySet<string> = new Set(
  tableP
    .entries()
    .filter(([part]) => !isFeedbackPart(part))
    .flatMap(([, names]) => names),
)

const shipping = new Map<'render', Promise<Observation>>()

/**
 * The shipping render, made once: the controls compare it with other states' tables.
 */
const observeShipping = (): Promise<Observation> => {
  const made = shipping.get('render') ?? observe(false)
  shipping.set('render', made)
  return made
}

/**
 * The table's parts that this Base UI has and the scenes did not render, so no row passes
 * without being looked at.
 */
const unrendered = (observation: Observation): string[] => {
  const seen = new Set(observation.parts.map(({ part }) => part))
  const present = new Set(EARLIER_SUBPATHS.flatMap((subpath) => keysAt(bare, subpath)))
  return tableP
    .keys()
    .filter((part) => present.has(part) && !seen.has(part))
    .toArray()
}

/**
 * Every Backdrop key of every component, as `Namespace.Backdrop`.
 */
const backdropKeys = (): string[] =>
  EARLIER_SUBPATHS.flatMap((subpath) => keysAt(bare, subpath)).filter((part) =>
    part.endsWith('.Backdrop'),
  )

describe('AC-base-ui-overlay-completion-08: every part of every subpath is either styled or deliberately not', () => {
  it('places every key of Base UI at this run in exactly one of the two tables', () => {
    expect(EARLIER_SUBPATHS.flatMap((subpath) => unplaced(keysAt(bare, subpath)))).toEqual([])
  })

  it('control: a part added to a namespace and absent from both tables is reported', () => {
    expect(unplaced([...keysAt(bare, 'dialog'), 'Dialog.Drawer'])).toEqual(['Dialog.Drawer'])
    expect(unplaced([...keysAt(bare, 'combobox'), 'Combobox.Virtualized'])).toEqual([
      'Combobox.Virtualized',
    ])
  })

  it('places the six: each namespace has a styled and an unstyled part, and Menubar is styled', () => {
    for (const subpath of [
      'alert-dialog',
      'context-menu',
      'preview-card',
      'combobox',
      'autocomplete',
    ]) {
      const keys = keysAt(bare, subpath)
      expect(
        keys.some((part) => tableP.has(part)),
        `${subpath} has a styled part`,
      ).toBe(true)
      expect(
        keys.some((part) => isInT0(part)),
        `${subpath} has an unstyled part`,
      ).toBe(true)
    }
    expect(keysAt(bare, 'menubar')).toEqual(['Menubar'])
    expect(tableP.has('Menubar')).toBe(true)
  })

  it('gives every rendered part exactly its row, and every unstyled part no Nave class', async () => {
    const observation = await observeShipping()
    expect(problemsAgainst(observation, tableP)).toEqual([])
    expect(unrendered(observation)).toEqual([])
  })

  it('keeps the row exact when the consumer passes a className to every styled part', async () => {
    const observation = await observe(true)
    expect(problemsAgainst(observation, tableP)).toEqual([])
    const lost = observation.parts
      .filter(({ part }) => tableP.has(part))
      .filter(({ hasConsumerClass }) => !hasConsumerClass)
      .map(({ part }) => part)
    expect(lost).toEqual([])
  })

  it('gives AlertDialog.Backdrop the class and Dialog.Backdrop none, under the scrim at scope (i)', async () => {
    expect(tableP.get('AlertDialog.Backdrop')).toEqual(['nave-base-ui-backdrop'])
    expect(tableP.has('Dialog.Backdrop')).toBe(false)
    expect(isInT0('Dialog.Backdrop')).toBe(true)
    expect(isInT0('AlertDialog.Backdrop')).toBe(false)
    const { parts } = await observeShipping()
    const classesOf = (name: string): string[] | undefined =>
      parts.find(({ part }) => part === name)?.classes.slice()
    expect(classesOf('AlertDialog.Backdrop')).toEqual(['nave-base-ui-backdrop'])
    expect(classesOf('Dialog.Backdrop')).toEqual([])
  })

  it('reads the Backdrops from the scrim state: scope (i), scope (ii) and unsigned', () => {
    const backdrops = backdropKeys()
    expect(backdrops).toContain('Dialog.Backdrop')
    expect(backdrops).toContain('AlertDialog.Backdrop')
    const styled = (unsigned: readonly 'scrim'[], scope: 'i' | 'ii'): string[] =>
      backdrops.filter((part) => tablePFor(unsigned, scope).has(part))
    expect(styled([], 'i')).toEqual(['AlertDialog.Backdrop'])
    expect(styled([], 'ii').toSorted((a, b) => a.localeCompare(b))).toEqual([
      'AlertDialog.Backdrop',
      'Dialog.Backdrop',
    ])
    expect(styled(['scrim'], 'i')).toEqual([])
    // In each state every Backdrop is in exactly one of the two tables.
    for (const [unsigned, scope] of [
      [[], 'i'],
      [[], 'ii'],
      [['scrim'], 'i'],
    ] as const) {
      const counts = backdrops.map(
        (part) =>
          (tablePFor(unsigned, scope).has(part) ? 1 : 0) + (isInT0(part, unsigned, scope) ? 1 : 0),
      )
      expect(counts.every((count) => count === 1)).toBe(true)
    }
  })

  it('control: a Dialog.Backdrop carrying the class under scope (i) reds the rendered half, naming it', async () => {
    const observation = await observe(false, (part, element) => {
      if (part === 'Dialog.Backdrop') {
        element.classList.add('nave-base-ui-backdrop')
      }
    })
    expect(problemsAgainst(observation, tableP)).toEqual([
      'Dialog.Backdrop: classes [nave-base-ui-backdrop], expected []',
    ])
  })

  it('control: an AlertDialog.Backdrop without the class under scope (i) reds the rendered half', async () => {
    const observation = await observe(false, (part, element) => {
      if (part === 'AlertDialog.Backdrop') {
        element.classList.remove('nave-base-ui-backdrop')
      }
    })
    expect(problemsAgainst(observation, tableP)).toEqual([
      'AlertDialog.Backdrop: classes [], expected [nave-base-ui-backdrop]',
    ])
  })
})

describe('AC-base-ui-overlay-completion-07: the rendered classes are Table P, for the signature state', () => {
  it('puts a Nave class on no rendered element but the ones Table P names for the shipping state', async () => {
    const { anywhere } = await observeShipping()
    expect(anywhere.difference(tablePClasses).size).toBe(0)
    // Every class the table names is on some rendered element, so none passes unlooked at.
    expect(earlierClasses.difference(anywhere).size).toBe(0)
  })

  it('carries no class of an unsigned draft: the shipping render has each draft signed, none else', async () => {
    const { anywhere } = await observeShipping()
    for (const draft of [
      'combobox',
      'highlight-fill',
      'popup-fade',
      'tooltip-fade',
      'scrim',
    ] as const) {
      const owned = tablePClasses.difference(tablePClassesFor([draft]))
      expect(owned.size, `${draft} owns a class`).toBeGreaterThan(0)
      expect(owned.difference(anywhere).size, `${draft}'s classes are all rendered`).toBe(0)
    }
  })

  it('control: a wrapper still adding -item-highlight in the highlight-fill-unsigned build reds the rendered half, naming the part', async () => {
    // The shipping wrapper puts the class on every item; the build without `highlight-fill` has
    // Table P without it, so the rendered half reds on each.
    const unsignedBuild = tablePFor(['highlight-fill'])
    expect(unsignedBuild.get('Menu.Item')).toEqual(['nave-base-ui-item'])
    const problems = problemsAgainst(await observeShipping(), unsignedBuild)
    expect(problems).toContain(
      'Menu.Item: classes [nave-base-ui-item nave-base-ui-item-highlight], expected [nave-base-ui-item]',
    )
    expect(problems.filter((problem) => problem.includes('item-highlight')).length).toBeGreaterThan(
      1,
    )
  })

  it('control: each draft left unsigned reds the rendered half on the classes it owns', async () => {
    const observation = await observeShipping()
    for (const draft of [
      'combobox',
      'highlight-fill',
      'popup-fade',
      'tooltip-fade',
      'scrim',
    ] as const) {
      const owned = tablePClasses.difference(tablePClassesFor([draft]))
      const problems = problemsAgainst(observation, tablePFor([draft]))
      expect(
        owned.values().every((name) => problems.some((problem) => problem.includes(name))),
        draft,
      ).toBe(true)
    }
  })
})

describe("AC-base-ui-overlay-completion-50: Menubar is v1's Toolbar", () => {
  it('takes the Toolbar root class, the same as Toolbar.Root', () => {
    expect(tableP.get('Menubar')).toEqual(['nave-base-ui-toolbar'])
    expect(tableP.get('Menubar')).toEqual(tableP.get('Toolbar.Root'))
  })

  for (const orientation of ['horizontal', 'vertical']) {
    it(`${orientation}: the root carries the Toolbar class and its orientation, each trigger the button class and the menu roles`, async () => {
      const scene = scenes.menubar
      if (scene === undefined) {
        throw new Error('no scene for menubar')
      }
      await render(scene.render(nave, { props: { Menubar: { orientation } } }))
      const [root] = partsNamed('Menubar')
      expect(root, 'Menubar rendered').toBeDefined()
      expect(root?.classList.contains('nave-base-ui-toolbar')).toBe(true)
      expect(root?.getAttribute('role')).toBe('menubar')
      expect(root?.getAttribute('aria-orientation')).toBe(orientation)
      expect(root?.dataset.orientation).toBe(orientation)
      const triggers = partsNamed('Menu.Trigger')
      // The control: the bar holds two menus, so the loop below looks at two triggers.
      expect(triggers).toHaveLength(2)
      for (const trigger of triggers) {
        expect(trigger.classList.contains('nave-base-ui-button')).toBe(true)
        expect(trigger.getAttribute('role')).toBe('menuitem')
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
      }
    })
  }

  it('control: the two orientations are told apart by the root', async () => {
    const scene = scenes.menubar
    if (scene === undefined) {
      throw new Error('no scene for menubar')
    }
    const orientationOf = async (orientation: string): Promise<string | null | undefined> => {
      await render(scene.render(nave, { props: { Menubar: { orientation } } }))
      return partsNamed('Menubar')[0]?.getAttribute('aria-orientation')
    }
    expect(await orientationOf('horizontal')).not.toBe(await orientationOf('vertical'))
  })
})
