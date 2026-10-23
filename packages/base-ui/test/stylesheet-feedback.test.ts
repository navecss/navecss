/**
 * The stylesheet clauses of the feedback and navigation criteria: the rule text of the 21 new
 * classes, in the states each criterion names, read from the built sheet (`buildStyles`, with a
 * draft unsigned where the criterion has that branch) and parsed with postcss. Each expectation is a
 * literal from the criterion, or an arithmetic on the built tokens; none is read from the module
 * that builds the sheet. A negative check carries the planted control its scenario names.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Draft } from '../styles/drafts.ts'
import type { Entry, RuleBlock } from './support/w11-rules.ts'

import { buildStyles } from '../scripts/build-styles.ts'
import { ringBase, ringBlock } from './support/focus.ts'
import { attributeReads, requiresDisabled } from './support/selector.ts'
import { flatten, flattenRules, PACKAGE_DIR } from './support/stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './support/tokens.ts'
import { ringReach } from './support/w6-sheet.ts'
import { boxEdges, EDGES, lengthPx } from './support/w11-lengths.ts'
import {
  allEntries,
  blocksOf,
  effective,
  guardBlocks,
  isGuardRule,
  isMentioned,
  keyedBlocks,
  ownerEntries,
  planted,
  PREFIX,
  pseudosOf,
  replaced,
  restEntries,
  ruleText,
  sortedLines,
} from './support/w11-rules.ts'

type NewDraft = 'navigation-menu-fade' | 'toast-fade' | 'toast-limit' | 'toast-placement'

// The ids are not in the build's `Draft` type until the drafts exist; a build with an id it does
// not know leaves the sheet whole, so a missing implementation reds an assertion, not the build.
const without = (draft: NewDraft): Promise<string> =>
  buildStyles({ unsigned: [draft] as unknown as readonly Draft[] })

const signed = await buildStyles()
const noPlacement = await without('toast-placement')
const noFade = await without('toast-fade')
const noLimit = await without('toast-limit')
const noNavigationFade = await without('navigation-menu-fade')

const cls = (name: string): string => `${PREFIX}${name}`

const VIEWPORT = cls('toast-viewport')
const PLACEMENT = cls('toast-placement')
const TOAST_ROOT = cls('toast-root')
const TOAST_FADE = cls('toast-fade')
const TOAST_LIMIT = cls('toast-limit')
const NAV_LIST = cls('navigation-menu-list')
const NAV_TRIGGER = cls('navigation-menu-trigger')
const NAV_ICON = cls('navigation-menu-icon')
const NAV_FADE = cls('navigation-menu-fade')
const CURRENT_LINK = cls('current-link')
const SCROLL_ROOT = cls('scroll-area')
const SCROLL_VIEWPORT = cls('scroll-area-viewport')
const SCROLL_BAR = cls('scroll-area-scrollbar')
const SCROLL_THUMB = cls('scroll-area-thumb')
const SCROLL_CORNER = cls('scroll-area-corner')
const BAR_TRACK = cls('value-bar-track')
const BAR_INDICATOR = cls('value-bar-indicator')
const AVATAR = cls('avatar')
const AVATAR_IMAGE = cls('avatar-image')
const AVATAR_FALLBACK = cls('avatar-fallback')
const BUTTON = cls('button')

const NEW_TOAST_CLASSES = [VIEWPORT, PLACEMENT, TOAST_ROOT, TOAST_FADE, TOAST_LIMIT]
const SCROLL_CLASSES = [SCROLL_ROOT, SCROLL_VIEWPORT, SCROLL_BAR, SCROLL_THUMB, SCROLL_CORNER]

/**
 * The classes Table P puts on the parts of Toast, the reused ones included, for the state where
 * every draft is signed.
 */
const TOAST_PART_CLASSES = [
  ...NEW_TOAST_CLASSES,
  cls('title'),
  cls('description'),
  BUTTON,
  cls('arrow'),
  cls('arrow-inline'),
]

/**
 * The classes Table P puts on the parts of Navigation Menu, all drafts signed.
 */
const NAV_PART_CLASSES = [
  NAV_LIST,
  NAV_TRIGGER,
  NAV_ICON,
  NAV_FADE,
  CURRENT_LINK,
  cls('toolbar-link'),
  cls('popover-popup'),
  cls('arrow'),
  cls('arrow-inline'),
]

const compareText = (a: string, b: string): number => a.localeCompare(b)

/**
 * A template of declaration lines as the sorted list `sortedLines` returns.
 */
const lines = (strings: TemplateStringsArray): string[] =>
  (strings[0] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .toSorted(compareText)

const transitionOwners = (css: string, classes: readonly string[]): string[] =>
  classes.filter((name) =>
    ownerEntries(css, name).some(([property]) => property.startsWith('transition')),
  )

const byFirstSelector = <T extends { selectors: readonly string[] }>(a: T, b: T): number =>
  a.selectors.join(',').localeCompare(b.selectors.join(','))

// The properties that form a stacking context, a containing block or a group.
const GROUP_FORMING = new Set([
  'backdrop-filter',
  'clip-path',
  'contain',
  'filter',
  'isolation',
  'mix-blend-mode',
  'opacity',
  'perspective',
  'rotate',
  'scale',
  'transform',
  'translate',
  'will-change',
])
const isGroupForming = (property: string): boolean => {
  const bare = property.toLowerCase().replace(/^-(?:moz|ms|o|webkit)-/, '')
  return GROUP_FORMING.has(bare) || /^mask(?:-|$)/.test(bare)
}
// The sheet's rules all sit in a layer; at rest means under no media query or other at-rule.
const isLayer = (atRule: string): boolean => atRule.startsWith('@layer ')
const DECK_ATTRIBUTES = new Set(['data-behind', 'data-expanded', 'data-swiping', 'data-type'])

const deckViolations = (css: string): string[] => {
  const found = flatten(css)
  const onToastParts = found.filter((item) => item.owner.startsWith(`${PREFIX}toast-`))
  const direction = onToastParts
    .filter(
      (item) =>
        (item.property === 'flex-direction' && item.value === 'column-reverse') ||
        item.property === 'order' ||
        item.property === 'flex-flow',
    )
    .map((item) => `direction: ${item.owner} sets ${item.property}: ${item.value}`)
  const rest = found
    .filter((item) => NEW_TOAST_CLASSES.includes(item.owner))
    .filter(
      (item) => item.selectors.length === 1 && item.atRules.every((atRule) => isLayer(atRule)),
    )
    .filter(
      (item) =>
        isGroupForming(item.property) ||
        (/^overflow(?:-[xy])?$/.test(item.property) && item.value !== 'visible'),
    )
    .map((item) => `rest: ${item.owner} sets ${item.property}: ${item.value}`)
  const selectors = flattenRules(css).flatMap((rule) =>
    rule.selectors.flatMap((selector) =>
      attributeReads(selector)
        .filter((read) => DECK_ATTRIBUTES.has(read.name))
        .map((read) => `selector: ${rule.owner} names ${read.name}`),
    ),
  )
  const values = found
    .filter((item) => item.value.includes('--toast-'))
    .map((item) => `value: ${item.owner} ${item.property} reads ${item.value}`)
  return [...direction, ...rest, ...selectors, ...values]
}

/**
 * `[]` when the value is the one wanted, else a line naming what it is.
 */
const mismatch = (label: string, actual: string | undefined, wanted: string): string[] =>
  actual === wanted ? [] : [`${label} is ${actual ?? 'unset'}`]

const shapesOf = (
  blocks: readonly RuleBlock[],
): { atRules: readonly string[]; entries: string[]; selectors: readonly string[] }[] =>
  blocks.map((block) => ({
    atRules: block.atRules,
    selectors: block.selectors,
    entries: sortedLines(block.entries),
  }))

const hasShapes = (blocks: readonly RuleBlock[], wanted: readonly unknown[]): boolean =>
  JSON.stringify(shapesOf(blocks)) === JSON.stringify(wanted)

describe('AC-base-ui-feedback-navigation-11: toasts are a plain list and nothing keys the deck', () => {
  it('sets exactly display: flex, flex-direction: column and the content-sm gap on -toast-viewport', () => {
    expect(isMentioned(signed, VIEWPORT), 'the stylesheet has a -toast-viewport rule').toBe(true)
    expect(sortedLines(ownerEntries(signed, VIEWPORT))).toEqual(
      lines`
        display: flex
        flex-direction: column
        gap: var(--nave-spacing-content-sm)
      `,
    )
  })

  it('leaves the deck out of the five toast rules and out of the whole sheet', () => {
    expect(
      NEW_TOAST_CLASSES.filter((name) => !isMentioned(signed, name)),
      'the toast rules the scan runs over exist',
    ).toEqual([])
    expect(deckViolations(signed)).toEqual([])
  })

  it('reports a planted transform that reads --toast-offset-y in -toast-root (control)', () => {
    const found = deckViolations(
      planted(signed, `.${TOAST_ROOT} { transform: translateY(var(--toast-offset-y)) }`),
    )

    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining('rest: nave-base-ui-toast-root sets transform'),
        expect.stringContaining('value: nave-base-ui-toast-root transform reads'),
      ]),
    )
  })

  it('reports a planted &[data-expanded] key in -toast-viewport (control)', () => {
    const found = deckViolations(planted(signed, `.${VIEWPORT} { &[data-expanded] { gap: 0 } }`))

    expect(found).toEqual(['selector: nave-base-ui-toast-viewport names data-expanded'])
  })

  it.each([
    ['column-reverse', `.${VIEWPORT} { flex-direction: column-reverse }`, 'direction:'],
    ['order', `.${TOAST_ROOT} { order: -1 }`, 'direction:'],
    ['flex-flow', `.${VIEWPORT} { flex-flow: column wrap }`, 'direction:'],
    ['overflow: hidden', `.${TOAST_ROOT} { overflow: hidden }`, 'rest:'],
    ['overflow-y: auto', `.${VIEWPORT} { overflow-y: auto }`, 'rest:'],
    ['scale', `.${TOAST_ROOT} { scale: 0.95 }`, 'rest:'],
    ['opacity', `.${VIEWPORT} { opacity: 0.9 }`, 'rest:'],
    ['data-behind key', `.${TOAST_ROOT} { &[data-behind] { color: red } }`, 'selector:'],
    ['data-swiping key', `.${TOAST_ROOT} { &[data-swiping] { color: red } }`, 'selector:'],
    ['data-type key', `.${TOAST_ROOT} { &[data-type="error"] { color: red } }`, 'selector:'],
    ['--toast-height read', `.${TOAST_ROOT} { min-block-size: var(--toast-height) }`, 'value:'],
    [
      '--toast-swipe-movement-x read',
      `.${TOAST_ROOT} { translate: var(--toast-swipe-movement-x) }`,
      'value:',
    ],
  ])('reports a planted %s (control)', (_name, rule, tag) => {
    const found = deckViolations(planted(signed, rule))

    expect(found.some((item) => item.startsWith(tag))).toBe(true)
  })

  it('reads the fade opacity under its keys as no violation, and the same opacity at rest as one (control for the rest filter)', () => {
    // The fade's `opacity: 0` is group-forming but sits under a key, so it is not an at-rest
    // declaration; planted at rest it is what the scan reports.
    expect(deckViolations(planted(signed, `.${TOAST_FADE} { opacity: 0 }`))).toEqual([
      'rest: nave-base-ui-toast-fade sets opacity: 0',
    ])
  })
})

const CARD = {
  'background-color': 'var(--nave-color-surface-overlay)',
  border: 'var(--nave-border-width-sm) solid var(--nave-color-border-default)',
  'box-shadow': 'var(--nave-shadow-overlay)',
  padding: 'var(--nave-spacing-content-md)',
  'border-radius': 'var(--nave-radius-card)',
}

const focusProblems = (css: string): string[] => [
  ...ownerEntries(css, TOAST_ROOT)
    .filter(([property]) => property.startsWith('outline'))
    .map(([property]) => `outline: ${property}`),
  ...flattenRules(css)
    .filter((rule) => rule.owner === TOAST_ROOT)
    .flatMap((rule) => rule.selectors)
    .filter((selector) => pseudosOf(selector).some((name) => name.startsWith(':focus')))
    .map((selector) => `focus: ${selector}`),
]

describe('AC-base-ui-feedback-navigation-12: the card, and Toast.Root keeps the browser ring', () => {
  it('sets the surface, the edge, the shadow, the padding and the radius the card is drawn with', () => {
    const rest = effective(blocksOf(signed, TOAST_ROOT))

    expect(
      Object.fromEntries(Object.keys(CARD).map((property) => [property, rest.get(property)])),
    ).toEqual(CARD)
  })

  it('declares no outline* and no focus pseudo-class, so no rule composes focusRing on it', () => {
    expect(isMentioned(signed, TOAST_ROOT), 'the stylesheet has a -toast-root rule').toBe(true)
    expect(focusProblems(signed)).toEqual([])
  })

  it('reports a planted outline, a planted focusRing block and a planted focus pseudo-class (control)', () => {
    const ring = Object.entries(ringBlock)
      .map(([property, value]) => `${property}: ${value}`)
      .join('; ')

    expect(focusProblems(planted(signed, `.${TOAST_ROOT} { outline: none }`))).toEqual([
      'outline: outline',
    ])
    expect(
      focusProblems(planted(signed, `.${TOAST_ROOT} { &:focus-visible { ${ring} } }`)),
    ).toEqual(
      expect.arrayContaining([
        'outline: outline-style',
        'focus: .nave-base-ui-toast-root:focus-visible',
      ]),
    )
    expect(
      focusProblems(planted(signed, `.${TOAST_ROOT} { &:focus-within { color: red } }`)),
    ).toEqual(['focus: .nave-base-ui-toast-root:focus-within'])
  })

  it('names no data-type in any selector, so the types are painted alike', () => {
    expect(isMentioned(signed, TOAST_ROOT), 'the stylesheet has a -toast-root rule').toBe(true)
    expect(
      flattenRules(signed)
        .flatMap((rule) => rule.selectors)
        .flatMap((selector) => attributeReads(selector).map((read) => read.name)),
    ).not.toContain('data-type')
  })
})

describe('AC-base-ui-feedback-navigation-13: limited toasts hidden (draft toast-limit)', () => {
  it('has no declaration at rest and exactly one rule, &[data-limited] { display: none }, with no transition', () => {
    const blocks = blocksOf(signed, TOAST_LIMIT)

    expect(blocks.length, 'the stylesheet has a -toast-limit rule').toBeGreaterThan(0)
    expect(restEntries(blocks)).toEqual([])
    expect(blocks.filter((block) => block.path.length > 1)).toHaveLength(1)
    expect(
      keyedBlocks(blocks).map((block) => ({
        selectors: block.selectors,
        entries: sortedLines(block.entries),
      })),
    ).toEqual([{ selectors: ['&[data-limited]'], entries: ['display: none'] }])
    expect(allEntries(blocks).filter(([property]) => property.startsWith('transition'))).toEqual([])
    expect(guardBlocks(blocks)).toEqual([])
  })

  it('has no other toast rule that hides a toast or its viewport', () => {
    expect(
      [VIEWPORT, PLACEMENT, TOAST_ROOT, TOAST_FADE].filter((name) => !isMentioned(signed, name)),
      'the toast rules the scan runs over exist',
    ).toEqual([])
    expect(
      [VIEWPORT, PLACEMENT, TOAST_ROOT, TOAST_FADE].flatMap((name) =>
        ownerEntries(signed, name).filter(
          ([property, value]) => property === 'display' && value === 'none',
        ),
      ),
    ).toEqual([])
  })

  it('with toast-limit unsigned has no -toast-limit class and no rule that keys data-limited, the rest of Toast staying', () => {
    expect(isMentioned(signed, TOAST_LIMIT), 'control: the signed sheet has the class').toBe(true)
    expect(isMentioned(noLimit, TOAST_LIMIT)).toBe(false)
    expect(noLimit).not.toContain('data-limited')
    expect(
      [VIEWPORT, PLACEMENT, TOAST_ROOT, TOAST_FADE].filter((name) => !isMentioned(noLimit, name)),
    ).toEqual([])
  })
})

const NOT_SWIPED = '&[data-ending-style]:not([data-swipe-direction])'
const KEYS = /^&(?:\[[^\]]+\]|:not\(\[[^\]]+\]\))*$/

describe('AC-base-ui-feedback-navigation-14: the toast fade rule text (draft toast-fade)', () => {
  it('is the opacity form: the transition at rest, opacity: 0 under the starting key and the not-swiped ending key, the accelerate easing under the ending key', () => {
    const blocks = blocksOf(signed, TOAST_FADE)

    expect(blocks.length, 'the stylesheet has a -toast-fade rule').toBeGreaterThan(0)
    expect(sortedLines(restEntries(blocks))).toEqual(
      lines`
        transition-duration: var(--nave-motion-duration-fast)
        transition-property: opacity
        transition-timing-function: var(--nave-motion-easing-decelerate)
      `,
    )
    expect(
      keyedBlocks(blocks)
        .map((block) => ({ selectors: block.selectors, entries: sortedLines(block.entries) }))
        .toSorted(byFirstSelector),
    ).toEqual([
      {
        selectors: ['&[data-ending-style]'],
        entries: ['transition-timing-function: var(--nave-motion-easing-accelerate)'],
      },
      { selectors: ['&[data-starting-style]', NOT_SWIPED], entries: ['opacity: 0'] },
    ])
  })

  it('sets opacity: 0 exactly and only under the transient keys, with no [data-instant] key and nothing but keys on itself', () => {
    const blocks = blocksOf(signed, TOAST_FADE)

    expect(blocks.length, 'the stylesheet has a -toast-fade rule').toBeGreaterThan(0)
    expect(allEntries(blocks).filter(([property]) => property === 'opacity')).toEqual([
      ['opacity', '0'],
    ])
    expect(restEntries(blocks).some(([property]) => property === 'opacity')).toBe(false)
    expect(
      blocks.flatMap((block) => block.selectors).filter((s) => s.includes('data-instant')),
    ).toEqual([])
    expect(
      keyedBlocks(blocks)
        .flatMap((block) => block.selectors)
        .filter((selector) => !KEYS.test(selector)),
      'every key is on the toast itself (nothing on Toast.Content)',
    ).toEqual([])
  })

  it('carries one reduced-motion guard naming & only', () => {
    const guards = guardBlocks(blocksOf(signed, TOAST_FADE))

    expect(guards).toHaveLength(1)
    expect(guards.every((block) => isGuardRule(block))).toBe(true)
  })

  it('with toast-fade unsigned has no -toast-fade class or rule, and no class on a toast part sets a transition', () => {
    expect(
      transitionOwners(signed, TOAST_PART_CLASSES),
      'control: the check sees the fade in the signed sheet',
    ).toEqual([TOAST_FADE])
    expect(isMentioned(noFade, TOAST_FADE)).toBe(false)
    expect(noFade).not.toContain('data-swipe-direction')
    expect(transitionOwners(noFade, TOAST_PART_CLASSES)).toEqual([])
    expect(
      [VIEWPORT, PLACEMENT, TOAST_ROOT, TOAST_LIMIT].filter((name) => !isMentioned(noFade, name)),
    ).toEqual([])
  })
})

const nestedSelectors = (css: string): string[] =>
  flattenRules(css)
    .filter((rule) => rule.owner === PLACEMENT)
    .flatMap((rule) => rule.selectors)
    .filter((selector) => selector !== `.${PLACEMENT}`)

describe('AC-base-ui-feedback-navigation-16: placement and stacking ride the toast-placement draft', () => {
  it('is exactly position: fixed, the two corner insets, a 20rem width capped at the window, and the toast layer', () => {
    expect(isMentioned(signed, PLACEMENT), 'the stylesheet has a -toast-placement rule').toBe(true)
    expect(sortedLines(ownerEntries(signed, PLACEMENT))).toEqual(
      lines`
        inline-size: 20rem
        inset-block-end: var(--nave-spacing-content-lg)
        inset-inline-end: var(--nave-spacing-content-lg)
        max-inline-size: calc(100% - 2 * var(--nave-spacing-content-lg))
        position: fixed
        z-index: var(--nave-layer-toast)
      `,
    )
  })

  it('has no nested rule, no :has() and no data-side key', () => {
    expect(isMentioned(signed, PLACEMENT), 'the stylesheet has a -toast-placement rule').toBe(true)
    expect(blocksOf(signed, PLACEMENT)).toHaveLength(1)
    expect(nestedSelectors(signed)).toEqual([])
  })

  it('reports a nested rule, a :has() reset and a data-side key (control)', () => {
    expect(
      nestedSelectors(planted(signed, `.${PLACEMENT} { &[data-x] { position: static } }`)),
    ).toHaveLength(1)
    expect(
      nestedSelectors(planted(signed, `.${PLACEMENT}:has(> [data-side]) { position: static }`)),
    ).toHaveLength(1)
    expect(
      nestedSelectors(planted(signed, `.${PLACEMENT} { &[data-side] { z-index: auto } }`)),
    ).toHaveLength(1)
  })

  it('with toast-placement unsigned has no -toast-placement class or rule', () => {
    expect(isMentioned(signed, PLACEMENT), 'control: the signed sheet has the class').toBe(true)
    expect(isMentioned(noPlacement, PLACEMENT)).toBe(false)
  })
})

describe('AC-base-ui-feedback-navigation-19: the unplaced branch, the stylesheet half (toast-placement unsigned)', () => {
  it('has no -toast-placement class or rule and leaves the viewport a list that nothing positions or stacks', () => {
    expect(isMentioned(signed, PLACEMENT), 'control: the signed sheet has the class').toBe(true)
    expect(isMentioned(noPlacement, PLACEMENT)).toBe(false)
    expect(sortedLines(ownerEntries(noPlacement, VIEWPORT))).toEqual(
      lines`
        display: flex
        flex-direction: column
        gap: var(--nave-spacing-content-sm)
      `,
    )
    expect(
      flatten(noPlacement).filter(
        (item) =>
          item.owner.startsWith(`${PREFIX}toast-`) &&
          ['inset-block-end', 'inset-inline-end', 'position', 'z-index'].includes(item.property),
      ),
      'no toast rule sets position or z-index, so the viewport computes static and auto',
    ).toEqual([])
  })
})

const HOVER = [
  '&:hover:not(:disabled, [aria-disabled="true"])',
  '&:active:not(:disabled, [aria-disabled="true"])',
]
const FORBIDDEN_ATTRIBUTES = new Set([
  'aria-expanded',
  'data-disabled',
  'data-popup-open',
  'data-pressed',
])
const RING_LINES = sortedLines(Object.entries(ringBlock))
const RING_BASE_LINES = sortedLines(Object.entries(ringBase))

const isRingBlock = (block: RuleBlock): boolean =>
  block.selectors.length === 1 &&
  block.selectors[0] === '&:focus-visible' &&
  sortedLines(block.entries).join('|') === RING_LINES.join('|')

// Where the role has blocks, focusRing's own declaration sits alone in a `& { }` after them.
const isRingBase = (block: RuleBlock): boolean =>
  block.path.length === 2 &&
  block.atRules.length === 0 &&
  block.selectors.length === 1 &&
  block.selectors[0] === '&' &&
  sortedLines(block.entries).join('|') === RING_BASE_LINES.join('|')

const triggerMetricProblems = (css: string): string[] => {
  const button = effective(blocksOf(css, BUTTON))
  const trigger = effective(blocksOf(css, NAV_TRIGGER))
  const metrics = [...button]
    .filter(([property]) => property !== 'border' && property !== 'background-color')
    .flatMap(([property, value]) => mismatch(`metric: ${property}`, trigger.get(property), value))
  return [
    ...metrics,
    ...mismatch('border', trigger.get('border'), 'var(--nave-border-width-sm) solid transparent'),
    ...mismatch('background', trigger.get('background-color'), 'transparent'),
  ]
}

const triggerSelectorProblems = (selector: string): string[] => [
  ...attributeReads(selector)
    .filter((read) => FORBIDDEN_ATTRIBUTES.has(read.name))
    .map((read) => `selector: names ${read.name}`),
  ...(requiresDisabled(selector) ? [`selector: ${selector} requires a disabled state`] : []),
  ...(pseudosOf(selector).some((name) => name.startsWith(':focus'))
    ? [`selector: ${selector} names a focus pseudo-class`]
    : []),
]

// focusRing, composed on the trigger as a Table T2 class, is the one thing besides the hover
// rule: its two rules are told by their exact declarations.
const triggerProblems = (css: string): string[] => {
  const others = blocksOf(css, NAV_TRIGGER)
    .filter((block) => block.path.length > 1 || block.atRules.length > 0)
    .filter((block) => !isRingBlock(block) && !isRingBase(block))
  const wanted = [
    {
      atRules: [],
      selectors: HOVER,
      entries: ['background-color: var(--nave-color-action-highlight)'],
    },
  ]
  return [
    ...triggerMetricProblems(css),
    ...(hasShapes(others, wanted) ? [] : [`rules: ${JSON.stringify(shapesOf(others))}`]),
    ...others
      .flatMap((block) => block.selectors)
      .flatMap((selector) => triggerSelectorProblems(selector)),
  ]
}

describe('AC-base-ui-feedback-navigation-20: the navigation menu trigger is its own atom, a ghost look with the Button metrics', () => {
  it('sets what -button sets at rest, bar the border and the fill, and a transparent border and fill', () => {
    expect(isMentioned(signed, NAV_TRIGGER), 'the stylesheet has a trigger rule').toBe(true)
    const trigger = effective(blocksOf(signed, NAV_TRIGGER))
    const button = effective(blocksOf(signed, BUTTON))

    expect(button.size, 'control: -button sets properties at rest').toBeGreaterThan(10)
    expect(trigger.get('border')).toBe('var(--nave-border-width-sm) solid transparent')
    expect(trigger.get('background-color')).toBe('transparent')
    expect(
      [...button]
        .filter(([property]) => property !== 'border' && property !== 'background-color')
        .filter(([property, value]) => trigger.get(property) !== value),
    ).toEqual([])
  })

  it('has one other rule, the hover and active fill, and no selector on an open, pressed, disabled or focus state', () => {
    expect(isMentioned(signed, NAV_TRIGGER), 'the stylesheet has a trigger rule').toBe(true)
    expect(triggerProblems(signed)).toEqual([])
  })

  it('reports a planted &[aria-expanded="true"] fill (control)', () => {
    const found = triggerProblems(
      planted(
        signed,
        `.${NAV_TRIGGER} { &[aria-expanded="true"] { background-color: var(--nave-color-action-highlight) } }`,
      ),
    )

    expect(found.some((item) => item.startsWith('rules:'))).toBe(true)
    expect(found).toContain('selector: names aria-expanded')
  })

  it.each([
    ['data-popup-open', `&[data-popup-open] { background-color: red }`],
    ['data-pressed', `&[data-pressed] { background-color: red }`],
    ['data-disabled', `&[data-disabled] { color: red }`],
    ['bare :disabled', `&:disabled { color: red }`],
    ['bare [aria-disabled]', `&[aria-disabled="true"] { color: red }`],
    ['focus pseudo-class', `&:focus { color: red }`],
  ])('reports a planted %s rule (control)', (_name, rule) => {
    expect(
      triggerProblems(planted(signed, `.${NAV_TRIGGER} { ${rule} }`)).some((item) =>
        item.startsWith('selector:'),
      ),
    ).toBe(true)
  })

  it('reads the disabled states inside :not() as an exclusion and outside it as a requirement (control for the selector reader)', () => {
    expect(requiresDisabled('.x:hover:not(:disabled, [aria-disabled="true"])')).toBe(false)
    expect(requiresDisabled('.x:disabled')).toBe(true)
  })
})

const iconProblems = (css: string): string[] => {
  const blocks = blocksOf(css, NAV_ICON)
  const problems: string[] = []
  const rest = restEntries(blocks).filter(([property]) => property.startsWith('transition'))
  const wanted = lines`
    transition-duration: var(--nave-motion-duration-fast)
    transition-property: rotate
    transition-timing-function: var(--nave-motion-easing-standard)
  `
  if (sortedLines(rest).join('|') !== wanted.join('|')) {
    problems.push(`transition: ${sortedLines(rest).join('; ')}`)
  }
  const turning = blocks.filter((block) =>
    block.entries.some(([property]) => property === 'rotate'),
  )
  if (
    JSON.stringify(
      turning.map((block) => ({
        selectors: block.selectors,
        entries: sortedLines(block.entries),
      })),
    ) !==
    JSON.stringify([{ selectors: ['[aria-expanded="true"] > &'], entries: ['rotate: 180deg'] }])
  ) {
    problems.push('rotate: not only under [aria-expanded="true"] > &')
  }
  const guards = guardBlocks(blocks)
  if (guards.length !== 1 || guards.some((block) => !isGuardRule(block))) {
    problems.push('guard: not one duration-form guard naming &')
  }
  const transitions = allEntries(blocks).filter(([property]) => property.startsWith('transition'))
  if (transitions.length !== 4) {
    problems.push(`transition: ${transitions.length} declarations, not three and the guard`)
  }
  return problems
}

describe('AC-base-ui-feedback-navigation-22: the icon turns on its trigger aria-expanded', () => {
  it('turns 180deg only under [aria-expanded="true"] > &, transitions only rotate on the fast duration and the standard easing, and carries the duration-form guard naming &', () => {
    expect(isMentioned(signed, NAV_ICON), 'the stylesheet has a -navigation-menu-icon rule').toBe(
      true,
    )
    expect(iconProblems(signed)).toEqual([])
  })

  it('reports the guard deleted, a second turn key and a transition of another property (control)', () => {
    const noGuard = replaced(
      signed,
      NAV_ICON,
      `.${NAV_ICON} { display: inline-flex; transition-property: rotate; transition-duration: var(--nave-motion-duration-fast); transition-timing-function: var(--nave-motion-easing-standard); [aria-expanded="true"] > & { rotate: 180deg } }`,
    )

    expect(iconProblems(noGuard)).toEqual([
      'guard: not one duration-form guard naming &',
      'transition: 3 declarations, not three and the guard',
    ])
    expect(
      iconProblems(planted(signed, `.${NAV_ICON} { &[data-popup-open] { rotate: 180deg } }`)).some(
        (item) => item.startsWith('rotate:'),
      ),
    ).toBe(true)
    expect(
      iconProblems(planted(signed, `.${NAV_ICON} { transition-property: rotate, opacity }`)).some(
        (item) => item.startsWith('transition:'),
      ),
    ).toBe(true)
  })
})

const FADE_SIZE_PROPERTIES = new Set(['height', 'scale', 'transform', 'translate', 'width'])

describe('AC-base-ui-feedback-navigation-23: the navigation menu fade rule text (draft navigation-menu-fade)', () => {
  it('is a fade-in: the transition at rest, opacity: 0 under both keys, and under the ending key exactly transition-property: none', () => {
    const blocks = blocksOf(signed, NAV_FADE)

    expect(blocks.length, 'the stylesheet has a -navigation-menu-fade rule').toBeGreaterThan(0)
    expect(sortedLines(restEntries(blocks))).toEqual(
      lines`
        transition-duration: var(--nave-motion-duration-fast)
        transition-property: opacity
        transition-timing-function: var(--nave-motion-easing-decelerate)
      `,
    )
    expect(
      keyedBlocks(blocks)
        .map((block) => ({ selectors: block.selectors, entries: sortedLines(block.entries) }))
        .toSorted(byFirstSelector),
    ).toEqual([
      { selectors: ['&[data-ending-style]'], entries: ['transition-property: none'] },
      { selectors: ['&[data-starting-style]', '&[data-ending-style]'], entries: ['opacity: 0'] },
    ])
    expect(allEntries(blocks).filter(([property]) => property === 'opacity')).toEqual([
      ['opacity', '0'],
    ])
  })

  it('sets no transform, translate, scale, size or --popup-* anywhere, has no [data-instant] key and carries the guard naming &', () => {
    const blocks = blocksOf(signed, NAV_FADE)

    expect(blocks.length, 'the stylesheet has a -navigation-menu-fade rule').toBeGreaterThan(0)
    expect(
      ownerEntries(signed, NAV_FADE).filter(
        ([property, value]) =>
          FADE_SIZE_PROPERTIES.has(property) ||
          property.startsWith('--popup-') ||
          value.includes('--popup-'),
      ),
    ).toEqual([])
    expect(
      blocks.flatMap((block) => block.selectors).filter((s) => s.includes('data-instant')),
    ).toEqual([])
    const guards = guardBlocks(blocks)
    expect(guards).toHaveLength(1)
    expect(guards.every((block) => isGuardRule(block))).toBe(true)
  })

  it('reports a planted transform, a planted ending-key duration and a planted [data-instant] key (control)', () => {
    const problems = (css: string): string[] => {
      const blocks = blocksOf(css, NAV_FADE)
      return [
        ...ownerEntries(css, NAV_FADE)
          .filter(([property]) => FADE_SIZE_PROPERTIES.has(property))
          .map(([property]) => `size: ${property}`),
        ...keyedBlocks(blocks)
          .filter((block) => block.selectors.join(',') === '&[data-ending-style]')
          .flatMap((block) => block.entries)
          .filter(([property]) => property !== 'transition-property')
          .map(([property]) => `ending: ${property}`),
        ...blocks
          .flatMap((block) => block.selectors)
          .filter((s) => s.includes('data-instant'))
          .map((s) => `instant: ${s}`),
      ]
    }

    expect(problems(signed)).toEqual([])
    expect(problems(planted(signed, `.${NAV_FADE} { transform: scale(0.95) }`))).toEqual([
      'size: transform',
    ])
    expect(
      problems(
        planted(
          signed,
          `.${NAV_FADE} { &[data-ending-style] { transition-duration: var(--nave-motion-duration-fast) } }`,
        ),
      ),
    ).toEqual(['ending: transition-duration'])
    expect(problems(planted(signed, `.${NAV_FADE} { &[data-instant] { opacity: 1 } }`))).toEqual([
      'instant: &[data-instant]',
    ])
  })

  it('with navigation-menu-fade unsigned has no -navigation-menu-fade class or rule, and no navigation menu part sets a transition but the icon', () => {
    expect(
      transitionOwners(signed, NAV_PART_CLASSES),
      'control: the check sees the fade and the icon in the signed sheet',
    ).toEqual([NAV_ICON, NAV_FADE])
    expect(isMentioned(noNavigationFade, NAV_FADE)).toBe(false)
    expect(transitionOwners(noNavigationFade, NAV_PART_CLASSES)).toEqual([NAV_ICON])
    expect(
      [NAV_LIST, NAV_TRIGGER, NAV_ICON, CURRENT_LINK].filter(
        (name) => !isMentioned(noNavigationFade, name),
      ),
    ).toEqual([])
  })
})

describe('AC-base-ui-feedback-navigation-25: the navigation menu list keeps its list semantics', () => {
  it('sets exactly display: flex, align-items: center, a control-xs gap, no margin or padding and list-style: none', () => {
    expect(isMentioned(signed, NAV_LIST), 'the stylesheet has a -navigation-menu-list rule').toBe(
      true,
    )
    expect(sortedLines(ownerEntries(signed, NAV_LIST))).toEqual(
      lines`
        align-items: center
        display: flex
        gap: var(--nave-spacing-control-xs)
        list-style: none
        margin: 0
        padding: 0
      `,
    )
  })

  it('has no other class that sets list-style*', () => {
    expect(
      flatten(signed)
        .filter((item) => item.property.startsWith('list-style'))
        .map((item) => item.owner),
    ).toEqual([NAV_LIST])
  })

  it('reports a planted list-style on another class (control)', () => {
    const owners = flatten(planted(signed, `.${PREFIX}title { list-style-type: disc }`))
      .filter((item) => item.property.startsWith('list-style'))
      .map((item) => item.owner)

    expect(owners).toContain(`${PREFIX}title`)
  })
})

// The keyed form of the base padding: 201 B, sha256 prefix 1aba28783d7d6392.
const KEYED_FORM = `  .${CURRENT_LINK} {\n\n    &[aria-current="page"]{ text-decoration-line: underline; text-decoration-thickness: var(--nave-border-width-lg); padding-block: var(--nave-border-width-lg);\n    } }\n`
const UNDERLINE = [
  'text-decoration-line: underline',
  'text-decoration-thickness: var(--nave-border-width-lg)',
]

const isForbiddenOnLink = ([property, value]: Entry): boolean =>
  property === 'color' ||
  property === 'background-color' ||
  property.startsWith('margin') ||
  (property.startsWith('padding') &&
    !(property === 'padding-block' && value === 'var(--nave-border-width-lg)'))

const linkSelectorProblems = (selector: string): string[] => [
  ...(attributeReads(selector).some((read) => read.name === 'data-active')
    ? [`selector: ${selector} names data-active`]
    : []),
  ...(pseudosOf(selector).some((name) =>
    ['::after', '::before', ':after', ':before'].includes(name),
  )
    ? [`selector: ${selector} is a pseudo-element`]
    : []),
]

const linkProblems = (css: string): string[] => {
  const blocks = blocksOf(css, CURRENT_LINK)
  const rest = sortedLines(restEntries(blocks)).join('; ')
  const keyed = blocks.filter((block) => block.path.length > 1)
  const wantedKey = [{ atRules: [], selectors: ['&[aria-current="page"]'], entries: UNDERLINE }]
  return [
    ...(rest === 'padding-block: var(--nave-border-width-lg)' ? [] : [`rest: ${rest}`]),
    ...(hasShapes(keyed, wantedKey)
      ? []
      : ['keyed: not exactly one &[aria-current="page"] rule of the two underline declarations']),
    ...ownerEntries(css, CURRENT_LINK)
      .filter((entry) => isForbiddenOnLink(entry))
      .map(([property]) => `declaration: ${property}`),
    ...flattenRules(css)
      .filter((rule) => rule.owner === CURRENT_LINK)
      .flatMap((rule) => rule.selectors)
      .flatMap((selector) => linkSelectorProblems(selector)),
  ]
}

describe('AC-base-ui-feedback-navigation-26: the current link is keyed on aria-current and every link carries the block padding', () => {
  it('sets exactly padding-block at rest and has exactly one keyed rule, &[aria-current="page"], of the two underline declarations', () => {
    expect(isMentioned(signed, CURRENT_LINK), 'the stylesheet has a -current-link rule').toBe(true)
    expect(linkProblems(signed)).toEqual([])
  })

  it('names no data-active and declares only the base padding and the two underline properties', () => {
    expect(isMentioned(signed, CURRENT_LINK), 'the stylesheet has a -current-link rule').toBe(true)
    expect(
      flattenRules(signed)
        .flatMap((rule) => rule.selectors)
        .flatMap((selector) => attributeReads(selector).map((read) => read.name)),
    ).not.toContain('data-active')
    expect(sortedLines(ownerEntries(signed, CURRENT_LINK))).toEqual([
      'padding-block: var(--nave-border-width-lg)',
      ...UNDERLINE,
    ])
  })

  it('gives the padding to no other class of NavigationMenu.Link: -toolbar-link sets only padding-inline (pinning: already true of the earlier sheet)', () => {
    expect(
      ownerEntries(signed, cls('toolbar-link'))
        .map(([property]) => property)
        .filter((property) => property.startsWith('padding')),
    ).toEqual(['padding-inline'])
  })

  it('reports the keyed form, 201 B (control)', () => {
    const found = linkProblems(replaced(signed, CURRENT_LINK, KEYED_FORM))

    expect(Buffer.byteLength(KEYED_FORM), 'the keyed form is 201 B').toBe(201)
    expect(found).toEqual([
      'rest: ',
      'keyed: not exactly one &[aria-current="page"] rule of the two underline declarations',
    ])
  })

  it('reports a planted margin-block that cancels the padding (control)', () => {
    const baseline = linkProblems(signed)
    const added = linkProblems(
      planted(signed, `.${CURRENT_LINK} { margin-block: calc(-1 * var(--nave-border-width-lg)) }`),
    ).filter((item) => !baseline.includes(item))

    expect(added).toContain('declaration: margin-block')
    expect(added.filter((item) => !item.startsWith('rest:'))).toEqual(['declaration: margin-block'])
  })

  it.each([
    ['data-active key', `&[data-active] { text-decoration-line: underline }`, 'selector:'],
    ['::after', `&::after { content: "" }`, 'selector:'],
    ['colour', `color: red`, 'declaration:'],
    ['padding-inline', `padding-inline: 0`, 'declaration:'],
  ])('reports a planted %s (control)', (_name, rule, tag) => {
    expect(
      linkProblems(planted(signed, `.${CURRENT_LINK} { ${rule} }`)).some((item) =>
        item.startsWith(tag),
      ),
    ).toBe(true)
  })
})

const STRIP = 'var(--nave-size-control-xs)'
const CENTRING = 'calc((var(--nave-size-control-xs) - var(--nave-border-width-lg)) / 2)'
const STROKE_WIDTH = 'calc(var(--nave-border-width-lg) / 2)'
const STROKE = `${STROKE_WIDTH} solid var(--nave-color-border-control)`
const GUTTER = 'calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs))'
const STATES = [
  { name: 'at rest', state: {} },
  { name: 'overflowing the block axis', state: { 'data-has-overflow-y': '' } },
  { name: 'overflowing the inline axis', state: { 'data-has-overflow-x': '' } },
  {
    name: 'overflowing both',
    state: { 'data-has-overflow-x': '', 'data-has-overflow-y': '' },
  },
]

const px = (value: string | undefined): number => (value === undefined ? NaN : lengthPx(value))

const isClipLike = ([property, value]: Entry): boolean =>
  property.startsWith('overflow') ||
  property.startsWith('mask') ||
  property === 'clip-path' ||
  property === 'contain' ||
  value.includes('gradient(')

const rootProblems = (css: string): string[] => {
  const root = sortedLines(ownerEntries(css, SCROLL_ROOT)).join('; ')
  return [
    ...(root === 'display: flex; flex-direction: column' ? [] : [`root: ${root}`]),
    ...SCROLL_CLASSES.flatMap((name) =>
      ownerEntries(css, name)
        .filter((entry) => isClipLike(entry))
        .map(([property]) => `root: ${name} declares ${property}`),
    ),
  ]
}

const SIDES = [
  ['vertical', 'inline-size', 'padding-inline'],
  ['horizontal', 'block-size', 'padding-block'],
] as const

const barProblems = (css: string): string[] => {
  const bar = blocksOf(css, SCROLL_BAR)
  return SIDES.flatMap(([orientation, size, padding]) => {
    const strip = effective(bar, { 'data-orientation': orientation })
    return [
      ...mismatch(`strip: ${orientation} ${size}`, strip.get(size), STRIP),
      ...(px(strip.get(size)) === 24 ? [] : [`strip: ${orientation} ${size} is not 24px`]),
      ...mismatch(`strip: ${orientation} ${padding}`, strip.get(padding), CENTRING),
      ...(px(strip.get(padding)) === 10 ? [] : [`strip: ${orientation} ${padding} is not 10px`]),
    ]
  })
}

const stripProblems = (css: string): string[] => {
  const thumb = blocksOf(css, SCROLL_THUMB)
  const strokes = (
    [
      ['vertical', 'border-inline'],
      ['horizontal', 'border-block'],
    ] as const
  ).flatMap(([orientation, border]) =>
    mismatch(
      `strip: ${orientation} thumb ${border}`,
      effective(thumb, { 'data-orientation': orientation }).get(border),
      STROKE,
    ),
  )
  return [...barProblems(css), ...strokes]
}

const barEdges = (state: Readonly<Record<string, string>>): string[] => [
  ...(state['data-has-overflow-y'] === undefined ? [] : ['inline-end']),
  ...(state['data-has-overflow-x'] === undefined ? [] : ['block-end']),
]

const gutterProblems = (css: string): string[] => {
  const viewport = blocksOf(css, SCROLL_VIEWPORT)
  return STATES.flatMap(({ name, state }) => {
    const padding = boxEdges(viewport, state, 'padding')
    const scrollPadding = boxEdges(viewport, state, 'scroll-padding')
    const onBar = barEdges(state)
    return EDGES.flatMap((edge) => {
      const wanted = onBar.includes(edge) ? 28 : 4
      return [
        ...(px(padding[edge]) === wanted && px(scrollPadding[edge]) === wanted
          ? []
          : [
              `gutter: ${name}, ${edge}: padding ${padding[edge] ?? 'unset'}, scroll-padding ${scrollPadding[edge] ?? 'unset'}, wanted ${wanted}px`,
            ]),
        ...(onBar.includes(edge) && padding[edge] !== GUTTER
          ? [`gutter: ${name}, ${edge} is not the strip plus control-xs`]
          : []),
      ]
    })
  })
}

describe('AC-base-ui-feedback-navigation-27: the Scroll Area geometry, from the built tokens', () => {
  it('is a flex column Root with no overflow, mask, clip-path, contain or gradient on any Scroll Area class', () => {
    expect(
      SCROLL_CLASSES.filter((name) => !isMentioned(signed, name)),
      'the five Scroll Area rules exist',
    ).toEqual([])
    expect(rootProblems(signed)).toEqual([])
  })

  it('draws a 24px strip centred by 10px padding with a thumb of two 2px strokes, keyed on data-orientation, from the built tokens', () => {
    const tokens = declaredTokens(workspaceTokensCss())

    expect(lengthPx(STRIP, tokens), 'control: the built control-xs token is 24px').toBe(24)
    expect(lengthPx(CENTRING, tokens), 'control: the built tokens give 10px of centring').toBe(10)
    expect(lengthPx(STROKE_WIDTH, tokens), 'control: a stroke is half the border-width-lg').toBe(2)
    expect(
      2 * lengthPx(CENTRING, tokens) + 2 * lengthPx(STROKE_WIDTH, tokens),
      'the pill (two strokes) centred by the padding spans the strip',
    ).toBe(lengthPx(STRIP, tokens))
    expect(stripProblems(signed)).toEqual([])
  })

  it('resolves padding and scroll-padding to the same length on every edge: 4px at rest, 28px on the scrollbar edges', () => {
    expect(isMentioned(signed, SCROLL_VIEWPORT), 'the stylesheet has a viewport rule').toBe(true)
    expect(gutterProblems(signed)).toEqual([])
  })

  it("holds Table T3's inequality for the viewport: 4 clears the ring's reach on an edge with no scrollbar, 28 clears the strip plus the reach on a scrollbar edge", () => {
    const { reach } = ringReach()
    const viewport = blocksOf(signed, SCROLL_VIEWPORT)
    const atRest = boxEdges(viewport, {}, 'padding')
    const onBar = boxEdges(
      viewport,
      { 'data-has-overflow-x': '', 'data-has-overflow-y': '' },
      'padding',
    )

    expect(px(atRest['block-start']), 'P on an edge with no scrollbar').toBeGreaterThanOrEqual(
      reach + 0,
    )
    expect(px(onBar['inline-end']), 'P on the inline-end scrollbar edge').toBeGreaterThanOrEqual(
      px(STRIP) + reach,
    )
    expect(px(onBar['block-end']), 'P on the block-end scrollbar edge').toBeGreaterThanOrEqual(
      px(STRIP) + reach,
    )
  })

  it('puts the padding on the viewport and gives Scroll Area Content no class', () => {
    expect(isMentioned(signed, SCROLL_VIEWPORT), 'the stylesheet has a viewport rule').toBe(true)
    expect(
      ownerEntries(signed, SCROLL_ROOT).filter(([property]) => property.startsWith('padding')),
    ).toEqual([])
    expect(isMentioned(signed, cls('scroll-area-content'))).toBe(false)
    expect(ownerEntries(signed, SCROLL_VIEWPORT).some(([property]) => property === 'padding')).toBe(
      true,
    )
  })

  it('reports a planted scroll-padding-block-end at 4px under [data-has-overflow-x] (control)', () => {
    const found = gutterProblems(
      planted(
        signed,
        `.${SCROLL_VIEWPORT} { &[data-has-overflow-x] { scroll-padding-block-end: var(--nave-spacing-control-xs) } }`,
      ),
    )

    expect(found.some((item) => item.startsWith('gutter:'))).toBe(true)
  })

  it('reports a planted 12px strip under [data-orientation="vertical"] (control)', () => {
    const found = stripProblems(
      planted(
        signed,
        `.${SCROLL_BAR} { &[data-orientation="vertical"] { inline-size: calc(var(--nave-border-width-lg) + 2 * var(--nave-spacing-control-xs)) } }`,
      ),
    )

    expect(found.some((item) => item.startsWith('strip:'))).toBe(true)
  })

  it('reports a planted overflow: hidden in -scroll-area (control)', () => {
    const found = rootProblems(planted(signed, `.${SCROLL_ROOT} { overflow: hidden }`))

    expect(found.some((item) => item.startsWith('root:'))).toBe(true)
  })
})

const BAR_SIZE_PROPERTIES = ['width', 'inline-size', 'block-size', 'height', 'min-block-size']

const indicatorProblems = (css: string): string[] => {
  const blocks = blocksOf(css, BAR_INDICATOR)
  const rest = effective(blocks)
  const keyed = blocks.filter((block) => block.path.length > 1 || block.atRules.length > 0)
  const wantedKey = [
    { atRules: [], selectors: ['&[data-indeterminate]'], entries: ['display: none'] },
  ]
  return [
    ...ownerEntries(css, BAR_INDICATOR)
      .filter(([property]) => BAR_SIZE_PROPERTIES.includes(property))
      .map(([property]) => `indicator: sets ${property}`),
    ...mismatch(
      'indicator: max-block-size',
      rest.get('max-block-size'),
      'var(--nave-border-width-lg)',
    ),
    // A keyword, so its case is not part of the value.
    ...mismatch(
      'indicator: border-block',
      rest.get('border-block')?.toLowerCase(),
      'calc(var(--nave-border-width-lg) / 2) solid currentcolor',
    ),
    ...mismatch('indicator: color', rest.get('color'), 'var(--nave-color-content-primary)'),
    ...(hasShapes(keyed, wantedKey)
      ? []
      : ['indicator: its only keyed rule is not &[data-indeterminate] { display: none }']),
  ]
}

const trackProblems = (css: string): string[] => {
  const track = effective(blocksOf(css, BAR_TRACK))
  return [
    ...(track.has('min-block-size') ? [] : ['track: no min-block-size']),
    ...mismatch('track: display', track.get('display'), 'flex'),
    ...mismatch('track: align-items', track.get('align-items'), 'center'),
    ...mismatch(
      'track: border',
      track.get('border'),
      'var(--nave-border-width-sm) solid var(--nave-color-border-control)',
    ),
    ...(ownerEntries(css, BAR_TRACK).some(([property]) => property === 'background-color')
      ? ['track: sets a background-color']
      : []),
  ]
}

describe('AC-base-ui-feedback-navigation-31: one value bar, indeterminate shows only the trough (rule text)', () => {
  it('gives the indicator no size, a clamped 4px solid fill drawn as a currentColor border, and a data-indeterminate key that hides it', () => {
    expect(isMentioned(signed, BAR_INDICATOR), 'the stylesheet has an indicator rule').toBe(true)
    expect(indicatorProblems(signed)).toEqual([])
  })

  it('gives the track the block size, a flex centring and a control border, and no fill colour', () => {
    expect(isMentioned(signed, BAR_TRACK), 'the stylesheet has a track rule').toBe(true)
    expect(trackProblems(signed)).toEqual([])
  })

  it('sizes the track at 8px, the figure the trough is measured at', () => {
    const track = effective(blocksOf(signed, BAR_TRACK))

    expect(track.get('min-block-size'), 'the track declares its block size').toBeDefined()
    expect(lengthPx(track.get('min-block-size') ?? '')).toBe(8)
  })

  it('sets no animation* anywhere and holds no @keyframes (pinning: already true of the earlier sheet)', () => {
    expect(
      flatten(signed)
        .filter((item) => item.property.startsWith('animation'))
        .map((item) => item.owner),
    ).toEqual([])
    expect(signed).not.toContain('@keyframes')
  })

  it('reports a planted animation and a planted @keyframes (control)', () => {
    expect(
      flatten(planted(signed, `.${BAR_INDICATOR} { animation-name: x }`)).filter((item) =>
        item.property.startsWith('animation'),
      ),
    ).toHaveLength(1)
    expect(planted(signed, '@keyframes x { to { opacity: 0 } }')).toContain('@keyframes')
  })

  it('reports a planted inline-size: 100% in -value-bar-indicator, the control the scenario names', () => {
    expect(indicatorProblems(planted(signed, `.${BAR_INDICATOR} { inline-size: 100% }`))).toContain(
      'indicator: sets inline-size',
    )
  })

  it.each(BAR_SIZE_PROPERTIES.map((property) => [property]))(
    'reports a planted %s in -value-bar-indicator (control)',
    (property) => {
      expect(
        indicatorProblems(planted(signed, `.${BAR_INDICATOR} { ${property}: 100% }`)),
      ).toContain(`indicator: sets ${property}`)
    },
  )
})

const clips = (css: string): string[] =>
  ownerEntries(css, AVATAR)
    .map(([property]) => property)
    .filter((property) => property.startsWith('overflow') || property === 'clip-path')

describe('AC-base-ui-feedback-navigation-33: Avatar rule text', () => {
  it('draws the root as a default-border ring with a full radius and no clip', () => {
    const root = effective(blocksOf(signed, AVATAR))

    expect(isMentioned(signed, AVATAR), 'the stylesheet has an -avatar rule').toBe(true)
    expect(root.get('border')).toBe(
      'var(--nave-border-width-sm) solid var(--nave-color-border-default)',
    )
    expect(root.get('border-radius')).toBe('var(--nave-radius-full)')
    expect(clips(signed)).toEqual([])
  })

  it('has the image and the fallback inherit the root radius, and the fallback draw the sunken fill and the primary text', () => {
    expect(isMentioned(signed, AVATAR_IMAGE), 'the stylesheet has an -avatar-image rule').toBe(true)
    expect(
      isMentioned(signed, AVATAR_FALLBACK),
      'the stylesheet has an -avatar-fallback rule',
    ).toBe(true)
    expect(effective(blocksOf(signed, AVATAR_IMAGE)).get('border-radius')).toBe('inherit')
    const fallback = effective(blocksOf(signed, AVATAR_FALLBACK))
    expect(fallback.get('border-radius')).toBe('inherit')
    expect(fallback.get('background-color')).toBe('var(--nave-color-surface-sunken)')
    expect(fallback.get('color')).toBe('var(--nave-color-content-primary)')
  })

  it('reports a planted overflow or clip-path on the root (control)', () => {
    expect(clips(planted(signed, `.${AVATAR} { overflow: hidden }`))).toEqual(['overflow'])
    expect(clips(planted(signed, `.${AVATAR} { clip-path: circle(50%) }`))).toEqual(['clip-path'])
  })
})

const SEPARATOR = cls('toolbar-separator')
// The first release's rule, taken from the committed golden of its stylesheet.
const golden = readFileSync(path.join(PACKAGE_DIR, 'test/fixtures/generated/styles.css'), 'utf8')

const keysOf = (css: string): string[] =>
  flattenRules(css)
    .filter((rule) => rule.owner === SEPARATOR)
    .flatMap((rule) => rule.selectors)
    .flatMap((selector) => attributeReads(selector))
    .map((read) => `${read.name}=${read.value ?? ''}`)

describe('AC-base-ui-feedback-navigation-34: Separator reuses the toolbar separator, keyed on aria-orientation', () => {
  it("is the first release's rule byte for byte", () => {
    const expected = ruleText(golden, SEPARATOR)

    expect(expected, "control: the golden holds the first release's rule").toContain(
      'aria-orientation',
    )
    expect(ruleText(signed, SEPARATOR)).toBe(expected)
  })

  it('keys both orientations on aria-orientation and never on data-orientation', () => {
    expect(keysOf(signed).toSorted(compareText)).toEqual([
      'aria-orientation=horizontal',
      'aria-orientation=vertical',
    ])
  })

  it('reports a changed declaration and a data-orientation key (control)', () => {
    const edited = signed.replace(
      'margin-inline: var(--nave-spacing-control-xs)',
      'margin-inline: 0',
    )

    expect(edited).not.toBe(signed)
    expect(ruleText(edited, SEPARATOR)).not.toBe(ruleText(golden, SEPARATOR))
    expect(
      keysOf(planted(signed, `.${SEPARATOR} { &[data-orientation="vertical"] { margin: 0 } }`)),
    ).toContain('data-orientation=vertical')
  })
})
