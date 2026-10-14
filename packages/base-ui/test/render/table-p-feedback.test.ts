import { afterEach, describe, expect, it } from 'vitest'

import { marked } from '../support/dom.ts'
import { fullProps, naveClassesOf, settle, underSetups } from '../support/feedback-render.ts'
import {
  FEEDBACK_SINGLE_COMPONENT,
  FEEDBACK_SUBPATHS,
  feedbackBare,
  feedbackNave,
  type FeedbackSubpath,
  KEY_SETS,
  keysOf,
  qualified,
} from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { topName } from '../support/subpaths.ts'
import {
  FEEDBACK_DRAFTS,
  tableP,
  tablePClasses,
  tablePClassesFor,
  tablePFor,
} from '../support/table-p.ts'
import { isInT0 } from '../support/table-t0.ts'

afterEach(cleanup)

const C = 'nave-base-ui-'

/**
The subpaths whose export is a namespace of parts.
 */
const NAMESPACES = FEEDBACK_SUBPATHS.filter((name) => name !== FEEDBACK_SINGLE_COMPONENT)

/**
 * The classes of the seven in the signature state where every draft is signed, written out from
 * the spec's Table P delta: the 21 new classes and the 10 reused ones. Not read off Table P.
 */
const NEW_CLASSES = [
  'toast-viewport',
  'toast-placement',
  'toast-root',
  'toast-fade',
  'toast-limit',
  'navigation-menu-list',
  'navigation-menu-trigger',
  'navigation-menu-icon',
  'navigation-menu-fade',
  'current-link',
  'scroll-area',
  'scroll-area-viewport',
  'scroll-area-scrollbar',
  'scroll-area-thumb',
  'scroll-area-corner',
  'value-bar',
  'value-bar-track',
  'value-bar-indicator',
  'avatar',
  'avatar-image',
  'avatar-fallback',
]

const REUSED_CLASSES = [
  'title',
  'description',
  'button',
  'arrow',
  'arrow-inline',
  'toolbar-link',
  'popover-popup',
  'label',
  'slider-value',
  'toolbar-separator',
]

/**
 * The spec's Table P delta, row by row: the part and the classes it takes with every #789 draft
 * signed, and the draft the class waits on, if any.
 */
const DELTA: readonly (readonly [string, readonly (readonly [string, string?])[]])[] = [
  ['Toast.Viewport', [['toast-viewport'], ['toast-placement', 'toast-placement']]],
  ['Toast.Root', [['toast-root'], ['toast-fade', 'toast-fade'], ['toast-limit', 'toast-limit']]],
  ['Toast.Title', [['title']]],
  ['Toast.Description', [['description']]],
  ['Toast.Action', [['button']]],
  ['Toast.Close', [['button']]],
  ['Toast.Arrow', [['arrow'], ['arrow-inline']]],
  ['NavigationMenu.List', [['navigation-menu-list']]],
  ['NavigationMenu.Trigger', [['navigation-menu-trigger']]],
  ['NavigationMenu.Icon', [['navigation-menu-icon']]],
  ['NavigationMenu.Link', [['toolbar-link'], ['current-link']]],
  ['NavigationMenu.Popup', [['popover-popup'], ['navigation-menu-fade', 'navigation-menu-fade']]],
  ['NavigationMenu.Arrow', [['arrow'], ['arrow-inline']]],
  ['ScrollArea.Root', [['scroll-area']]],
  ['ScrollArea.Viewport', [['scroll-area-viewport']]],
  ['ScrollArea.Scrollbar', [['scroll-area-scrollbar']]],
  ['ScrollArea.Thumb', [['scroll-area-thumb']]],
  ['ScrollArea.Corner', [['scroll-area-corner']]],
  ['Meter.Root', [['value-bar']]],
  ['Progress.Root', [['value-bar']]],
  ['Meter.Label', [['label']]],
  ['Progress.Label', [['label']]],
  ['Meter.Value', [['slider-value']]],
  ['Progress.Value', [['slider-value']]],
  ['Meter.Track', [['value-bar-track']]],
  ['Progress.Track', [['value-bar-track']]],
  ['Meter.Indicator', [['value-bar-indicator']]],
  ['Progress.Indicator', [['value-bar-indicator']]],
  ['Avatar.Root', [['avatar']]],
  ['Avatar.Image', [['avatar-image']]],
  ['Avatar.Fallback', [['avatar-fallback']]],
  ['Separator', [['toolbar-separator']]],
]

type Expected = ReadonlyMap<string, readonly string[]>

/**
 * The delta as a part-to-classes map for a state, with the classes of each unsigned draft left out.
 */
const deltaFor = (unsigned: readonly string[]): Expected =>
  new Map(
    DELTA.map(
      ([part, entries]) =>
        [
          part,
          entries
            .filter(([, draft]) => draft === undefined || !unsigned.includes(draft))
            .map(([name]) => `${C}${name}`),
        ] as const,
    ),
  )

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
 * Renders the seven's scenes in their fullest state through the wrapper, every styled part given a
 * `className` when `isConsumerClass` is set, and records the Nave classes of every marked part and
 * of every element. `tamper` runs on each marked element before it is read, for the controls.
 */
const observe = async (
  isConsumerClass: boolean,
  tamper: (part: string, element: Element) => void = () => {},
): Promise<Observation> => {
  const nave = await feedbackNave()
  const parts: Observed[] = []
  const anywhere = new Set<string>()
  for (const subpath of FEEDBACK_SUBPATHS) {
    const scene = scenes[subpath]
    if (scene === undefined) {
      throw new Error(`no scene for ${subpath}`)
    }
    const consumer = isConsumerClass
      ? Object.fromEntries(
          tableP.keys().map((part) => [part, { className: CONSUMER_CLASS }] as const),
        )
      : {}
    await underSetups(subpath, async () => {
      await render(scene.render(nave, { props: { ...fullProps(), ...consumer } }))
      await settle(10)
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
    })
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
 * Every key of every one of the seven that is in neither Table P nor Table T0, or in both.
 */
const unplaced = (keys: readonly string[]): string[] =>
  keys.filter((part) => (tableP.has(part) ? 1 : 0) + (isInT0(part) ? 1 : 0) !== 1)

const everyKey = async (): Promise<string[]> => {
  const bare = await feedbackBare()
  return FEEDBACK_SUBPATHS.flatMap((subpath) => keysOf(bare, subpath))
}

describe('AC-base-ui-feedback-navigation-08: every part of every subpath is either styled or deliberately not', () => {
  it('has the key sets the spec measured: Toast 13, Navigation Menu 13, Scroll Area 6, Meter 5, Progress 5, Avatar 3, Separator 1', async () => {
    const bare = await feedbackBare()
    const counts = FEEDBACK_SUBPATHS.map((subpath) => [subpath, keysOf(bare, subpath).length])
    expect(counts).toEqual([
      ['toast', 13],
      ['navigation-menu', 13],
      ['scroll-area', 6],
      ['meter', 5],
      ['progress', 5],
      ['avatar', 3],
      ['separator', 1],
    ])
    for (const subpath of NAMESPACES) {
      const { styled, unstyled } = KEY_SETS[subpath]
      const expected = [...styled, ...unstyled].map((key) => qualified(subpath, key))
      expect(new Set(keysOf(bare, subpath)), subpath).toEqual(new Set(expected))
    }
  })

  it('places every key of Base UI at this run in exactly one of the two tables', async () => {
    expect(unplaced(await everyKey())).toEqual([])
  })

  it('splits each namespace as the spec counts: Toast 7 + 6, Navigation Menu 6 + 7, Scroll Area 5 + 1, Meter 5, Progress 5, Avatar 3, Separator 1', async () => {
    const bare = await feedbackBare()
    const split = (subpath: FeedbackSubpath): [number, number] => {
      const keys = keysOf(bare, subpath)
      return [
        keys.filter((key) => tableP.has(key)).length,
        keys.filter((key) => isInT0(key)).length,
      ]
    }
    expect(FEEDBACK_SUBPATHS.map((subpath) => split(subpath))).toEqual([
      [7, 6],
      [6, 7],
      [5, 1],
      [5, 0],
      [5, 0],
      [3, 0],
      [1, 0],
    ])
  })

  it('control: a part added to a namespace and absent from both tables is reported', async () => {
    const bare = await feedbackBare()
    expect(unplaced([...keysOf(bare, 'toast'), 'Toast.Stack'])).toEqual(['Toast.Stack'])
    expect(unplaced([...keysOf(bare, 'scroll-area'), 'ScrollArea.Rail'])).toEqual([
      'ScrollArea.Rail',
    ])
  })

  it('gives every rendered part exactly its row, and every unstyled part no Nave class', async () => {
    const observation = await observeShipping()
    expect(problemsAgainst(observation, tableP)).toEqual([])
    // Every styled key of the seven was rendered, so no row passes without being looked at.
    const seen = new Set(observation.parts.map(({ part }) => part))
    const styled = FEEDBACK_SUBPATHS.flatMap((subpath) =>
      subpath === FEEDBACK_SINGLE_COMPONENT
        ? [topName(subpath)]
        : KEY_SETS[subpath].styled.map((key) => qualified(subpath, key)),
    )
    expect(styled.filter((part) => !seen.has(part))).toEqual([])
  })

  it('renders the unstyled parts that make an element with no Nave class', async () => {
    const { parts } = await observeShipping()
    const rendered = new Set(parts.map(({ part }) => part))
    const unstyled = FEEDBACK_SUBPATHS.flatMap((subpath) =>
      KEY_SETS[subpath].unstyled.map((key) => qualified(subpath, key)),
    )
    const looked = unstyled.filter((part) => rendered.has(part))
    // The positive control: the scenes did render the unstyled parts that make an element.
    expect(looked).toEqual(
      expect.arrayContaining([
        'Toast.Positioner',
        'Toast.Content',
        'NavigationMenu.Root',
        'NavigationMenu.Item',
        'NavigationMenu.Positioner',
        'NavigationMenu.Viewport',
        'ScrollArea.Content',
      ]),
    )
    expect(
      parts.filter(({ classes, part }) => looked.includes(part) && classes.length > 0),
    ).toEqual([])
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

  it('carries the same classes on the Meter and the Progress, part for part: one value-bar set', async () => {
    const { parts } = await observeShipping()
    const classesOf = (name: string): string | undefined =>
      parts.find(({ part }) => part === name)?.classes.join(' ')
    for (const key of KEY_SETS.meter.styled) {
      const meter = classesOf(`Meter.${key}`)
      expect(meter, `Meter.${key} rendered`).toBeDefined()
      expect(classesOf(`Progress.${key}`), key).toBe(meter)
    }
    expect(classesOf('Meter.Root')).toBe(`${C}value-bar`)
    expect(classesOf('Meter.Track')).toBe(`${C}value-bar-track`)
    expect(classesOf('Meter.Indicator')).toBe(`${C}value-bar-indicator`)
    expect(classesOf('Meter.Label')).toBe(`${C}label`)
    expect(classesOf('Meter.Value')).toBe(`${C}slider-value`)
  })

  it('carries -toolbar-separator on Separator and no other Nave class', async () => {
    const { parts } = await observeShipping()
    expect(parts.find(({ part }) => part === 'Separator')?.classes).toEqual([
      `${C}toolbar-separator`,
    ])
  })

  it('control: NavigationMenu.Content carrying a Nave class reds the rendered half, naming it', async () => {
    const observation = await observe(false, (part, element) => {
      if (part === 'NavigationMenu.Content') {
        element.classList.add(`${C}popover-popup`)
      }
    })
    expect(problemsAgainst(observation, tableP)).toEqual([
      `NavigationMenu.Content: classes [${C}popover-popup], expected []`,
    ])
  })

  it('control: a Table P part without its class reds the rendered half, naming it', async () => {
    const observation = await observe(false, (part, element) => {
      if (part === 'Progress.Indicator') {
        element.classList.remove(`${C}value-bar-indicator`)
      }
    })
    expect(problemsAgainst(observation, tableP)).toContain(
      `Progress.Indicator: classes [], expected [${C}value-bar-indicator]`,
    )
  })
})

describe('AC-base-ui-feedback-navigation-07: the rendered classes are Table P, for the signature state', () => {
  it("has the spec's Table P delta in the instrument: 31 classes, 21 new and 10 reused, and the class totals 86 and 82", () => {
    expect(tablePClassesFor().size).toBe(86)
    expect(tablePClassesFor(FEEDBACK_DRAFTS).size).toBe(82)
    expect(tablePClasses.size).toBe(86)
    const seven = new Set(
      tablePFor()
        .entries()
        .filter(([part]) => DELTA.some(([name]) => name === part))
        .flatMap(([, names]) => names),
    )
    expect(seven).toEqual(new Set([...NEW_CLASSES, ...REUSED_CLASSES].map((name) => `${C}${name}`)))
    expect(NEW_CLASSES).toHaveLength(21)
    expect(REUSED_CLASSES).toHaveLength(10)
  })

  it('agrees with the spec row for row, in the shipping state and with every #789 draft unsigned', () => {
    for (const unsigned of [[], [...FEEDBACK_DRAFTS]] as const) {
      const table = tablePFor(unsigned)
      for (const [part, names] of deltaFor(unsigned)) {
        expect(table.get(part), `${part} with ${unsigned.join('+') || 'none signed away'}`).toEqual(
          names,
        )
      }
    }
  })

  it('puts a Nave class on no rendered element but the ones Table P names for the shipping state', async () => {
    const { anywhere } = await observeShipping()
    const seven = new Set([...NEW_CLASSES, ...REUSED_CLASSES].map((name) => `${C}${name}`))
    expect(anywhere.difference(tablePClasses).size).toBe(0)
    // Every class of the seven's delta is on some rendered element, so none passes unlooked at.
    expect(seven.difference(anywhere).size).toBe(0)
  })

  it('carries no class of an unsigned draft: each draft owns exactly its class, rendered while it is signed', async () => {
    const { anywhere } = await observeShipping()
    for (const draft of FEEDBACK_DRAFTS) {
      const owned = tablePClasses.difference(tablePClassesFor([draft]))
      expect([...owned], draft).toEqual([`${C}${draft}`])
      expect(owned.difference(anywhere).size, `${draft}'s class is rendered`).toBe(0)
    }
  })

  it('control: a wrapper still adding -toast-fade to Toast.Root in the toast-fade-unsigned build reds the rendered half, naming the part', async () => {
    // The shipping wrapper puts the class on every toast; the build without `toast-fade` has
    // Table P without it, so the rendered half reds on each.
    const unsignedBuild = tablePFor(['toast-fade'])
    expect(unsignedBuild.get('Toast.Root')).toEqual([`${C}toast-root`, `${C}toast-limit`])
    const problems = problemsAgainst(await observeShipping(), unsignedBuild)
    expect(problems).toContain(
      `Toast.Root: classes [${C}toast-root ${C}toast-fade ${C}toast-limit], expected [${C}toast-root ${C}toast-limit]`,
    )
  })

  it('control: each draft left unsigned reds the rendered half on the part that owns its class', async () => {
    const observation = await observeShipping()
    const owner = {
      'navigation-menu-fade': 'NavigationMenu.Popup',
      'toast-fade': 'Toast.Root',
      'toast-limit': 'Toast.Root',
      'toast-placement': 'Toast.Viewport',
    } as const
    for (const draft of FEEDBACK_DRAFTS) {
      const problems = problemsAgainst(observation, tablePFor([draft]))
      expect(
        problems.some(
          (problem) => problem.startsWith(`${owner[draft]}:`) && problem.includes(draft),
        ),
        draft,
      ).toBe(true)
    }
  })
})
