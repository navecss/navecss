import type { AtomName } from '@navecss/core/atoms'

import { atomClassMap, atoms as coreAtoms, toClassName } from '@navecss/core/atoms'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildStyles } from '../scripts/build-styles.ts'
import { atoms } from '../styles/atoms.ts'
import {
  deriveState,
  DRAFT_CLASSES,
  DRAFTS,
  stateKey,
  withoutRules,
} from './support/draft-states.ts'
import { buildState } from './support/feedback-build.ts'
import {
  allStatesFeedback,
  DRAFT_CLASSES_FEEDBACK,
  DRAFTS_FEEDBACK,
  expectedSheet,
  NEW_CLASSES_FEEDBACK,
  readOracle,
  stateKeyFeedback,
} from './support/feedback-states.ts'
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

// The two expected sets AC-35 names: the attribute forms alone (the check inside the deferred and
// shipped-with-signature criterion), and the same forms with the class that owns each.
const DATA_NAVE_FORMS = new Set([
  '[data-nave-size="lg"]',
  '[data-nave-size="sm"]',
  '[data-nave-variant="ghost"]',
  '[data-nave-variant="primary"]',
])

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

interface StateRow {
  readonly bytes: number
  readonly sha256: string
  readonly classes: number
}

// Appendix C.4: the class count of each of the 16 feedback states, at overlay all signed.
const feedbackRows = JSON.parse(readOracle('feedback-states.json')) as {
  states: Record<string, StateRow>
}

const pascal = (name: string): string =>
  name
    .split('-')
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join('')

const statesFeedback = allStatesFeedback().map(
  (unsigned) => [stateKeyFeedback(unsigned), unsigned] as const,
)

describe('AC-base-ui-feedback-navigation-07 and AC-base-ui-overlay-completion-07: the class set is Table P for the signature state (stylesheet half)', () => {
  it("is the set Table P names: 86 classes with every draft signed, the Slider's four included", () => {
    const built = classesOf(readStylesheet())

    expect(built).toEqual(tablePClasses)
    expect(built.size).toBe(86)
    expect(tablePClasses.difference(new Set(sliderClasses)).size).toBe(82)
    expect(tablePClasses.difference(new Set(sliderClasses)).size).toBe(built.size - 4)
  })

  it('is, for each class, toClassName of one role atom', () => {
    const fromAtoms = Object.keys(atoms).map((name) => toClassName(name as AtomName))

    expect(new Set(fromAtoms)).toEqual(tablePClasses)
    expect(fromAtoms).toHaveLength(tablePClasses.size)
  })

  it('names each of the 21 new classes as toClassName of the atom baseUi plus its name, and the atoms hold all 21', () => {
    const fromAtoms = new Set(Object.keys(atoms).map((name) => toClassName(name as AtomName)))
    const named = NEW_CLASSES_FEEDBACK.map((name) => `baseUi${pascal(name.slice(PREFIX.length))}`)

    expect(NEW_CLASSES_FEEDBACK).toHaveLength(21)
    expect(named.map((name) => toClassName(name as AtomName))).toEqual(NEW_CLASSES_FEEDBACK)
    expect(NEW_CLASSES_FEEDBACK.filter((name) => !fromAtoms.has(name))).toEqual([])
    expect(Object.keys(atoms).filter((name) => named.includes(name))).toHaveLength(21)
  })

  it('holds the table anchors: 86 classes all signed, 82 with the four drafts unsigned, from Appendix C.4', () => {
    expect(feedbackRows.states.none?.classes).toBe(86)
    expect(
      feedbackRows.states['toast-placement+toast-fade+toast-limit+navigation-menu-fade'],
    ).toMatchObject({
      classes: 82,
    })
    expect(classesOf(expectedSheet()).size).toBe(86)
    expect(classesOf(expectedSheet([], [...DRAFTS_FEEDBACK])).size).toBe(82)
  })

  it.each(
    [...DRAFTS.map((draft) => [draft]), [...DRAFTS]].map(
      (unsigned) => [stateKey(unsigned), unsigned] as const,
    ),
  )(
    'is Table P for the state with %s unsigned (the feedback drafts signed), and has no class of an unsigned draft',
    async (_key, unsigned) => {
      const built = classesOf(await buildStyles({ unsigned }))
      const unsignedClasses = unsigned.flatMap((draft) => DRAFT_CLASSES[draft])

      expect(built).toEqual(tablePClassesFor(unsigned))
      expect(built).toEqual(classesOf(expectedSheet(unsigned)))
      expect(unsignedClasses.filter((name) => built.has(name))).toEqual([])
    },
  )

  it.each(statesFeedback)(
    'is the set Appendix C.4 counts for the state with %s unsigned, and has no class of an unsigned feedback draft',
    async (key, unsigned) => {
      const built = classesOf(await buildState(unsigned))
      const unsignedClasses = unsigned.flatMap((draft) => DRAFT_CLASSES_FEEDBACK[draft])

      expect(built.size).toBe(feedbackRows.states[key]?.classes)
      expect(built).toEqual(classesOf(expectedSheet([], unsigned)))
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
    const state = expectedSheet(['highlight-fill'])
    const kept = `${state}\n.nave-base-ui-item-highlight { }`

    expect(classesOf(state)).toEqual(tablePClassesFor(['highlight-fill']))
    expect(classesOf(kept)).not.toEqual(tablePClassesFor(['highlight-fill']))
  })

  it('reds on an unsigned draft whose class no table row removes (control)', () => {
    const state = expectedSheet(['combobox'])

    expect(classesOf(`${state}\n.nave-base-ui-chip { }`)).not.toEqual(
      tablePClassesFor(['combobox']),
    )
  })

  it.each(DRAFTS_FEEDBACK)(
    'reds on the class of %s left in the state that leaves it unsigned, and not on the state itself (control)',
    (draft) => {
      const state = expectedSheet([], [draft])
      const [name = ''] = DRAFT_CLASSES_FEEDBACK[draft]
      const kept = `${state}\n  .${name} { }`
      const expected = classesOf(expectedSheet([], [draft]))

      expect(expected.has(name)).toBe(false)
      expect(classesOf(state)).toEqual(expected)
      expect(classesOf(kept)).not.toEqual(expected)
      expect(classesOf(kept).size).toBe((feedbackRows.states[draft]?.classes ?? 0) + 1)
    },
  )

  it('reds on a class of the block missing from the all-signed state, and on one the block does not hold (control)', () => {
    const sheet = expectedSheet()
    const missing = withoutRules(sheet, [`${PREFIX}avatar-fallback`])

    expect(classesOf(missing)).not.toEqual(classesOf(sheet))
    expect(classesOf(missing).size).toBe(85)
    expect(classesOf(`${sheet}\n  .${PREFIX}toast-deck { }`)).not.toEqual(classesOf(sheet))
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

  it('has the backdrop class only if scrim is signed', async () => {
    expect(classesOf(css).has(`${PREFIX}backdrop`)).toBe(true)
    expect(classesOf(await buildStyles({ unsigned: ['scrim'] })).has(`${PREFIX}backdrop`)).toBe(
      false,
    )
  })

  it('sets background-color under [data-highlighted] only in item-highlight, and only if highlight-fill is signed', async () => {
    expect(new Set(highlightOwners(css))).toEqual(new Set([`${PREFIX}item-highlight`]))
    expect(highlightOwners(await buildStyles({ unsigned: ['highlight-fill'] }))).toEqual([])
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

  it('has data-nave-variant only as primary and ghost, and data-nave-size only as sm and lg (the first set of AC-35)', () => {
    const attributes = dataNaveSelectors(css).map((entry) => entry.split(' ', 2)[1])

    expect(new Set(attributes)).toEqual(DATA_NAVE_FORMS)
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

  it('would see a highlight background outside item-highlight, and one in a state without highlight-fill (control)', () => {
    const outside = planted('.nave-base-ui-item[data-highlighted] { background-color: red }')
    const withoutSignature = deriveState(allSigned, ['highlight-fill'])

    expect(highlightOwners(outside)).toContain(`${PREFIX}item`)
    expect(highlightOwners(withoutSignature)).toEqual([])
    expect(highlightOwners(allSigned)).toEqual([`${PREFIX}item-highlight`])
  })
})

describe('AC-base-ui-feedback-navigation-35 and AC-base-ui-overlay-completion-49: data-nave-* is variants and sizes only', () => {
  const STATES = [
    'open',
    'checked',
    'pressed',
    'disabled',
    'invalid',
    'expanded',
    'selected',
    'highlighted',
    'limited',
    'current',
    'indeterminate',
  ]

  // The second set of AC-35, "these": size sm on the button, the toggle and the avatar, size lg on
  // the avatar only, variant primary and ghost on the button.
  const EXPECTED = new Set([
    `${PREFIX}avatar [data-nave-size="lg"]`,
    `${PREFIX}avatar [data-nave-size="sm"]`,
    `${PREFIX}button [data-nave-size="sm"]`,
    `${PREFIX}button [data-nave-variant="ghost"]`,
    `${PREFIX}button [data-nave-variant="primary"]`,
    `${PREFIX}toggle [data-nave-size="sm"]`,
  ])

  it('is exactly size sm on the button, the toggle and the avatar, size lg on the avatar only, and variant primary and ghost on the button', () => {
    const found = new Set(dataNaveSelectors(readStylesheet()))

    expect(found).toEqual(EXPECTED)
  })

  it('has the lg size on no class but the avatar', () => {
    const large = dataNaveSelectors(readStylesheet()).filter((entry) =>
      entry.endsWith('[data-nave-size="lg"]'),
    )

    expect(large).toEqual([`${PREFIX}avatar [data-nave-size="lg"]`])
  })

  it('names no state', () => {
    const named = dataNaveSelectors(readStylesheet()).filter((entry) =>
      STATES.some((state) => entry.includes(`data-nave-${state}`)),
    )

    expect(named).toEqual([])
  })

  it("keeps the file's two expected sets equal: the forms alone are the forms of the owned entries", () => {
    const forms = new Set([...EXPECTED].map((entry) => entry.split(' ', 2)[1]))

    expect(forms).toEqual(DATA_NAVE_FORMS)
    expect(DATA_NAVE_FORMS.size).toBe(4)
  })

  it('reds on a data-nave attribute that names a state (control)', () => {
    const css = planted('.nave-base-ui-button[data-nave-open] { color: red }')

    expect(dataNaveSelectors(css).some((entry) => entry.includes('data-nave-open'))).toBe(true)
  })

  it('reds on a planted [data-nave-size="lg"] key in the button, which is not in the set (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}button { &[data-nave-size="lg"] { min-block-size: 3rem } } }`
    const found = new Set(dataNaveSelectors(css))

    const extra = found.difference(EXPECTED)

    const oracle = new Set(dataNaveSelectors(expectedSheet()))

    expect(extra).toEqual(new Set([`${PREFIX}button [data-nave-size="lg"]`]))
    expect(oracle).toEqual(EXPECTED)
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
