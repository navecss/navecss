import type { AtomName } from '@navecss/core/atoms'

import { atomClassMap, atoms as coreAtoms, toClassName } from '@navecss/core/atoms'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildStyles } from '../scripts/build-styles.ts'
import { atoms } from '../styles/atoms.ts'
import { deriveState, DRAFT_CLASSES, DRAFTS, stateKey } from './support/draft-states.ts'
import { attributeReads, selectorNodes } from './support/selector.ts'
import {
  classesOf,
  flatten,
  flattenRules,
  PACKAGE_DIR,
  readStylesheet,
} from './support/stylesheet.ts'
import { sliderClasses, tablePClasses, tablePClassesFor } from './support/table-p.ts'

const PREFIX = 'nave-base-ui-'
const DEFERRED = /(?:slider-indicator|item-expanded)$/

// The all-signed stylesheet as derived independently of this package's atoms, to give the controls
// a state to plant a class into without a build.
const allSigned = readFileSync(
  path.join(PACKAGE_DIR, 'test/fixtures/generated/independent-build.css'),
  'utf8',
)

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

const popupOpen = (sheet: string): string[] =>
  flattenRules(sheet)
    .flatMap((item) => item.selectors)
    .filter((selector) => selector.includes('data-popup-open'))

const highlightOwners = (sheet: string): string[] =>
  flatten(sheet)
    .filter(
      (item) =>
        item.property === 'background-color' &&
        item.selectors.some((selector) => selector.includes('[data-highlighted]')),
    )
    .map((item) => item.owner)

const deferredClasses = (css: string): string[] =>
  classesOf(css)
    .values()
    .filter((name) => DEFERRED.test(name))
    .toArray()

describe('AC-base-ui-overlay-completion-07: the class set is Table P for the signature state (stylesheet half)', () => {
  it("is the set Table P names: 65 classes with every draft signed, 53 with none, the Slider's four included", () => {
    const built = classesOf(readStylesheet())

    expect(built).toEqual(tablePClasses)
    expect(built.size).toBe(65)
    expect(tablePClassesFor([...DRAFTS]).size).toBe(53)
    expect(tablePClasses.difference(new Set(sliderClasses)).size).toBe(61)
  })

  it('is, for each class, toClassName of one role atom', () => {
    const fromAtoms = Object.keys(atoms).map((name) => toClassName(name as AtomName))

    expect(new Set(fromAtoms)).toEqual(tablePClasses)
    expect(fromAtoms).toHaveLength(tablePClasses.size)
  })

  it.each(
    [...DRAFTS.map((draft) => [draft]), [...DRAFTS]].map(
      (unsigned) => [stateKey(unsigned), unsigned] as const,
    ),
  )(
    'is Table P for the state with %s unsigned, and has no class of an unsigned draft',
    async (_key, unsigned) => {
      const built = classesOf(await buildStyles({ unsigned }))
      const unsignedClasses = unsigned.flatMap((draft) => DRAFT_CLASSES[draft])

      expect(built).toEqual(tablePClassesFor(unsigned))
      expect(unsignedClasses.filter((name) => built.has(name))).toEqual([])
    },
  )

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

  it('reds on the class of an unsigned draft left in its state, and not on the state itself (control)', () => {
    const state = deriveState(allSigned, ['2uuv'])
    const kept = `${state}\n.nave-base-ui-item-highlight { }`

    expect(classesOf(state)).toEqual(tablePClassesFor(['2uuv']))
    expect(classesOf(kept)).not.toEqual(tablePClassesFor(['2uuv']))
  })

  it('reds on an unsigned draft whose class no table row removes (control)', () => {
    const state = deriveState(allSigned, ['pdy1'])

    expect(classesOf(`${state}\n.nave-base-ui-chip { }`)).not.toEqual(tablePClassesFor(['pdy1']))
  })
})

describe('AC-base-ui-bridge-06: the Slider ships exactly when its signature does (stylesheet half)', () => {
  it('has the four nave-base-ui-slider-* rules and the thumb focus rule', () => {
    const built = classesOf(readStylesheet())

    expect(sliderClasses.every((name) => built.has(name))).toBe(true)
    expect(readStylesheet()).toContain(':has(:focus-visible)')
  })
})

describe('AC-base-ui-overlay-completion-48: what stays deferred is absent, and what ships appears only with its signature (stylesheet half)', () => {
  const css = readStylesheet()
  const motionless = new Set(
    ['list-popup', 'popover-popup', 'dialog-popup', 'tooltip-popup', 'tab-indicator'].map(
      (name) => `${PREFIX}${name}`,
    ),
  )

  it('has no class ending slider-indicator or item-expanded, and no selector naming data-popup-open', () => {
    expect(deferredClasses(css)).toEqual([])
    expect(popupOpen(css)).toEqual([])
  })

  it('has the backdrop class only if qglc is signed', async () => {
    expect(classesOf(css).has(`${PREFIX}backdrop`)).toBe(true)
    expect(classesOf(await buildStyles({ unsigned: ['qglc'] })).has(`${PREFIX}backdrop`)).toBe(
      false,
    )
  })

  it('sets background-color under [data-highlighted] only in item-highlight, and only if 2uuv is signed', async () => {
    expect(new Set(highlightOwners(css))).toEqual(new Set([`${PREFIX}item-highlight`]))
    expect(highlightOwners(await buildStyles({ unsigned: ['2uuv'] }))).toEqual([])
  })

  it('sets no transition-* on a popup or the tab indicator themselves', () => {
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

  it('has data-nave-variant only as primary and ghost, and data-nave-size only as sm', () => {
    const attributes = dataNaveSelectors(css).map((entry) => entry.split(' ', 2)[1])

    expect(new Set(attributes)).toEqual(
      new Set([
        '[data-nave-size="sm"]',
        '[data-nave-variant="ghost"]',
        '[data-nave-variant="primary"]',
      ]),
    )
  })

  it('would see a slider-indicator or item-expanded class if one were added (control)', () => {
    expect(deferredClasses(planted('.nave-base-ui-slider-indicator { }'))).toEqual([
      `${PREFIX}slider-indicator`,
    ])
    expect(deferredClasses(planted('.nave-base-ui-item-expanded { }'))).toEqual([
      `${PREFIX}item-expanded`,
    ])
  })

  it('would see a data-popup-open selector if one were added (control)', () => {
    expect(
      popupOpen(planted('.nave-base-ui-list-popup[data-popup-open] { color: red }')),
    ).toHaveLength(1)
  })

  it('would see a highlight background outside item-highlight, and one in a state without 2uuv (control)', () => {
    const outside = planted('.nave-base-ui-item[data-highlighted] { background-color: red }')
    const withoutSignature = deriveState(allSigned, ['2uuv'])

    expect(highlightOwners(outside)).toContain(`${PREFIX}item`)
    expect(highlightOwners(withoutSignature)).toEqual([])
    expect(highlightOwners(allSigned)).toEqual([`${PREFIX}item-highlight`])
  })
})

describe('AC-base-ui-overlay-completion-49: data-nave-* is variants only', () => {
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

  it('is exactly size sm on the button and toggle, and variant primary and ghost on the button', () => {
    const found = new Set(dataNaveSelectors(readStylesheet()))

    expect(found).toEqual(
      new Set([
        `${PREFIX}button [data-nave-size="sm"]`,
        `${PREFIX}button [data-nave-variant="ghost"]`,
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
