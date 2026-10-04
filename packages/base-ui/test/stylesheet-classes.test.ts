import type { AtomName } from '@navecss/core/atoms'

import { atomClassMap, atoms as coreAtoms, toClassName } from '@navecss/core/atoms'
import { describe, expect, it } from 'vitest'

import { atoms } from '../styles/atoms.ts'
import { attributeReads, selectorNodes } from './support/selector.ts'
import { classesOf, flatten, flattenRules, readStylesheet } from './support/stylesheet.ts'
import { sliderClasses, tablePClasses } from './support/table-p.ts'

const PREFIX = 'nave-base-ui-'
const DEFERRED = /(?:item-highlight|backdrop|slider-indicator)$/

const planted = (css: string): string => `${readStylesheet()}\n${css}`

/**
 * The `data-nave-*` attribute selectors of a stylesheet, each with the class that owns it.
 */
const dataNaveSelectors = (css: string): string[] =>
  flattenRules(css).flatMap((item) =>
    item.selectors.flatMap((selector) =>
      selectorNodes(selector)
        .filter(({ node }) => node.type === 'attribute' && node.toString().includes('data-nave-'))
        .map(({ node }) => `${item.owner} ${node.toString().trim()}`),
    ),
  )

/**
 * The values the arrow's selectors give `data-side`, read from the attribute selector itself.
 */
const arrowSides = (css: string): Set<string> =>
  new Set(
    flattenRules(css)
      .filter((item) => item.owner === `${PREFIX}arrow`)
      .flatMap((item) => item.selectors)
      .flatMap((selector) => attributeReads(selector))
      .filter((read) => read.name === 'data-side' && read.value !== undefined)
      .map((read) => read.value ?? ''),
  )

const deferredClasses = (css: string): string[] =>
  classesOf(css)
    .values()
    .filter((name) => DEFERRED.test(name))
    .toArray()

describe('AC-base-ui-bridge-05: the class set is Table P, and it is internal', () => {
  it("is the set Table P names: 47 classes, 51 with the Slider's", () => {
    const built = classesOf(readStylesheet())

    expect(built).toEqual(tablePClasses)
    expect(built.size).toBe(51)
    expect(tablePClasses.difference(new Set(sliderClasses)).size).toBe(47)
  })

  it('is, for each class, toClassName of one role atom', () => {
    const fromAtoms = Object.keys(atoms).map((name) => toClassName(name as AtomName))

    expect(new Set(fromAtoms)).toEqual(tablePClasses)
    expect(fromAtoms).toHaveLength(tablePClasses.size)
  })

  it('has no class outside the nave-base-ui- prefix', () => {
    const outside = classesOf(readStylesheet())
      .values()
      .filter((name) => !name.startsWith(PREFIX))
      .toArray()

    expect(outside).toEqual([])
  })

  it('has no value of atomClassMap in the workspace core starting with nave-base-ui-', () => {
    expect(Object.values(atomClassMap).filter((name) => name.startsWith(PREFIX))).toEqual([])
  })

  it('reds on a class outside Table P (control)', () => {
    expect(classesOf(planted('.nave-base-ui-extra { color: red }'))).not.toEqual(tablePClasses)
  })
})

describe('AC-base-ui-bridge-06: the Slider ships exactly when its signature does (stylesheet half)', () => {
  it('has the four nave-base-ui-slider-* rules and the thumb focus rule', () => {
    const built = classesOf(readStylesheet())

    expect(sliderClasses.every((name) => built.has(name))).toBe(true)
    expect(readStylesheet()).toContain(':has(:focus-visible)')
  })
})

describe('AC-base-ui-bridge-07: the deferrals are absent (stylesheet half)', () => {
  const css = readStylesheet()
  const motionless = new Set(
    ['list-popup', 'popover-popup', 'dialog-popup', 'tooltip-popup', 'tab-indicator'].map(
      (name) => `${PREFIX}${name}`,
    ),
  )

  it('has no class ending item-highlight, backdrop or slider-indicator, and no backdrop rule', () => {
    const backdropRules = flattenRules(css).filter((item) =>
      item.selectors.some((selector) => /backdrop/i.test(selector)),
    )

    expect(deferredClasses(css)).toEqual([])
    expect(backdropRules).toEqual([])
  })

  it('sets no background-color under [data-highlighted]', () => {
    const highlighted = flatten(css).filter(
      (item) =>
        item.property === 'background-color' &&
        item.selectors.some((selector) => selector.includes('[data-highlighted]')),
    )

    expect(highlighted).toEqual([])
  })

  it('sets no transition-* on a popup or the tab indicator', () => {
    const moving = flatten(css).filter(
      (item) => motionless.has(item.owner) && item.property.startsWith('transition'),
    )

    expect(moving).toEqual([])
  })

  it("names only the physical data-side values in the arrow's selectors", () => {
    expect(arrowSides(css)).toEqual(new Set(['bottom', 'left', 'right', 'top']))
  })

  it.each(['&[data-side=inline-start]', "&[data-side='inline-end']", '&[data-side="block-start"]'])(
    'reads a logical side named by %s however it is quoted (control)',
    (key) => {
      const planted = `${css}\n@layer components.nave { .${PREFIX}arrow { ${key} { right: -4px } } }`

      expect(arrowSides(planted).difference(new Set(['bottom', 'left', 'right', 'top'])).size).toBe(
        1,
      )
    },
  )

  it('has data-nave-variant only as primary and data-nave-size only as sm', () => {
    const attributes = dataNaveSelectors(css).map((entry) => entry.split(' ', 2)[1])

    expect(new Set(attributes)).toEqual(
      new Set(['[data-nave-size="sm"]', '[data-nave-variant="primary"]']),
    )
  })

  it('would see a highlight deferral if one were added (control)', () => {
    expect(deferredClasses(planted('.nave-base-ui-item-highlight { }'))).toEqual([
      `${PREFIX}item-highlight`,
    ])
  })
})

describe('AC-base-ui-bridge-16: data-nave-* is variants only', () => {
  const STATES = [
    'open',
    'checked',
    'pressed',
    'disabled',
    'invalid',
    'expanded',
    'selected',
    'highlighted',
  ]

  it('is exactly size sm on the button and toggle, and variant primary on the button', () => {
    const found = new Set(dataNaveSelectors(readStylesheet()))

    expect(found).toEqual(
      new Set([
        `${PREFIX}button [data-nave-size="sm"]`,
        `${PREFIX}button [data-nave-variant="primary"]`,
        `${PREFIX}toggle [data-nave-size="sm"]`,
      ]),
    )
  })

  it('names no state', () => {
    const named = dataNaveSelectors(readStylesheet()).filter((entry) =>
      STATES.some((state) => entry.includes(`data-nave-${state}`)),
    )

    expect(named).toEqual([])
  })

  it('reds on a data-nave attribute that names a state (control)', () => {
    const css = planted('.nave-base-ui-button[data-nave-open] { color: red }')

    expect(dataNaveSelectors(css).some((entry) => entry.includes('data-nave-open'))).toBe(true)
  })
})

const shadowing = (keys: string[]): string[] => keys.filter((key) => key.startsWith('baseUi'))

describe('AC-base-ui-bridge-17: no core atom key is shadowed', () => {
  it('has no key of the workspace core atoms starting with baseUi, read at run time', () => {
    expect(shadowing(Object.keys(coreAtoms))).toEqual([])
  })

  it('reds on a planted baseUiListPopup (control)', () => {
    expect(shadowing([...Object.keys(coreAtoms), 'baseUiListPopup'])).toEqual(['baseUiListPopup'])
  })

  it("shares no name with this package's atoms, since a colliding extend name replaces core's whole", () => {
    const coreNames = new Set(Object.keys(coreAtoms))

    expect(Object.keys(atoms).filter((name) => coreNames.has(name))).toEqual([])
  })
})
