import type { AtomName } from '@navecss/core/atoms'
import type { Root, Rule } from 'postcss'

import { toClassName } from '@navecss/core/atoms'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import { buildStyles } from '../scripts/build-styles.ts'
import { focusRingAtoms } from '../styles/atoms.ts'
import { listDifference, parentStylesheet, sha256 } from './support/draft-states.ts'
import { buildWithoutClasses } from './support/feedback-build.ts'
import {
  blockFor,
  blockRules,
  expectedSheet,
  feedbackBlock,
  NEW_CLASSES_789,
  readOracle,
  sheet787,
  withoutRing,
} from './support/feedback-states.ts'
import {
  focusRingClasses,
  isFocusRingBase,
  isFocusRingDeclaration,
  ringBlock,
} from './support/focus.ts'
import { flatten, flattenRules, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import { focusRingClasses as tablePFocusRingClasses } from './support/table-p.ts'

const fixture = (name: string): string =>
  readFileSync(path.join(PACKAGE_DIR, 'test/fixtures/generated', name), 'utf8')

const LAYER = '@layer components.nave'
const GOLDEN = 'styles.css'
const INDEPENDENT_BUILD = 'independent-build.css'
// The same agreed bytes built a second time, independently of this package's atoms: the parent
// contract's stylesheet with the ghost keys and the 14 new rules in, before `focusRing` is composed
// in. Held by hash so the copy cannot drift from what was agreed.
const INDEPENDENT_BUILD_SHA256 = 'e9b54cd0a877debecc18d58ae39cd3d7e1b59182aeb76fe8f209598d0e839ba0'
const INDEPENDENT_BUILD_BYTES = 30_401
// Appendix C: the block of the 21 rules (C.1) and the whole sheet of the all-signed state (C.4),
// each held by its full sha256. The golden below is this sheet with `focusRing` composed over
// Table T2 as amended, written from the spec text by a script and not copied from a build.
const BLOCK_SHA256 = '028c71ff36e6e4546bc4ad90a767a2fae8fb83ca00f5c4df235cb0309b298ad4'
const BLOCK_BYTES = 6899
const COMBINED_SHA256 = '5b918c4b5551f0c4c9d2999f11d60fd2c5132698b7b559a55a5ae93a9d146d40'
const COMBINED_BYTES = 37_300
const GOLDEN_BYTES = 40_210
// The parent contract's stylesheet alone, which is what the independent build holds once the ghost
// keys and the 14 new rules are taken out.
const PARENT_STYLESHEET_SHA256 = '59cd8bad1cd24eab84fc9a7cae856d18b4193284d387d5872baa517df2caa8bb'

// The golden is the combined package's sheet (Appendix C.4's all-signed 37,300 B plus the 15
// `focusRing` blocks of Table T2 as amended, 40,210 B). It is written from the spec text by a
// script and is never a copy of `dist/styles.css`: a change to the stylesheet that is intended is
// a change to the spec's bytes first.

const rulesOf = (css: string): string[] => css.split(/\n(?=\s*\.nave-base-ui-)/)

const firstDifferingRule = (built: string, golden: string): string | undefined => {
  const mine = rulesOf(built)
  const differing = rulesOf(golden).find((rule, index) => mine[index] !== rule)
  return differing === undefined ? undefined : /\.nave-base-ui-[\w-]+/.exec(differing)?.[0]
}

/**
 * Where a built stylesheet departs from the golden: undefined when the two are byte-identical, the
 * first differing class rule when one is, and a stand-in when the difference sits outside them.
 * The golden check and its controls both call this one comparator.
 */
const driftAt = (built: string, golden: string): string | undefined =>
  built === golden ? undefined : (firstDifferingRule(built, golden) ?? 'outside the class rules')

describe('AC-base-ui-bridge-41: the golden of the built stylesheet reds on drift', () => {
  it('is byte-identical to the committed golden', async () => {
    expect(driftAt(await buildStyles(), fixture(GOLDEN))).toBeUndefined()
  })

  it('has the golden at the size of the combined sheet with the ring on 15 classes, and holds the focusRing of exactly those', () => {
    const golden = fixture(GOLDEN)
    const ringless = withoutRing(golden)

    expect(Buffer.byteLength(golden)).toBe(GOLDEN_BYTES)
    expect(ringless.count).toBe(15)
    expect(ringless.text).toBe(expectedSheet())
    expect(sha256(ringless.text)).toBe(COMBINED_SHA256)
  })

  it('is what dist/styles.css holds', async () => {
    expect(readStylesheet()).toBe(await buildStyles())
  })

  it('reds when a value in the arrow left rule changes, at that rule', () => {
    const golden = fixture(GOLDEN)
    const drifted = golden.replace('right: -4px; rotate: -45deg', 'right: -5px; rotate: -45deg')

    expect(drifted).not.toBe(golden)
    expect(driftAt(drifted, golden)).toBe('.nave-base-ui-arrow')
  })

  it('reds on a drift that keeps the length of the file, at that rule', () => {
    const golden = fixture(GOLDEN)
    const drifted = golden.replace('rotate: 135deg', 'rotate: 136deg')

    expect(drifted).not.toBe(golden)
    expect(drifted).toHaveLength(golden.length)
    expect(driftAt(drifted, golden)).toBe('.nave-base-ui-arrow')
  })

  it('reds on a difference outside every class rule', () => {
    const golden = fixture(GOLDEN)

    expect(driftAt(`/* drift */\n${golden}`, golden)).toBe('outside the class rules')
    expect(driftAt(golden, golden)).toBeUndefined()
  })

  it("reds when the input's invalid rule is deleted, at that rule", () => {
    const golden = fixture(GOLDEN)
    const rule = golden.indexOf('.nave-base-ui-input {')
    const start = golden.indexOf('&[aria-invalid="true"]{', rule)
    const end = golden.indexOf('}', start) + 1
    const drifted = golden.slice(0, start) + golden.slice(end)

    expect(drifted).not.toBe(golden)
    expect(driftAt(drifted, golden)).toBe('.nave-base-ui-input')
  })
})

const ordered = (css: string): FlatDeclaration[] =>
  flatten(css).filter((item) => !isFocusRingDeclaration(item))

const tupleOf = (item: FlatDeclaration): unknown[] => [
  item.atRules,
  item.selectors,
  item.property,
  item.value,
]

/**
 * The first declaration where a candidate's ordered list (focusRing set aside) leaves the expected
 * one, as that declaration of the expected list, or of the candidate when it only runs on.
 */
const firstListDifference = (candidate: string, expected: string): FlatDeclaration | undefined => {
  const mine = ordered(candidate)
  const wanted = ordered(expected)
  const at = wanted.findIndex(
    (item, index) => JSON.stringify(tupleOf(item)) !== JSON.stringify(tupleOf(mine[index] ?? item)),
  )
  return at === -1 ? mine[wanted.length] : wanted[at]
}

const edited = (css: string, edit: (root: Root) => void): string => {
  const root = postcss.parse(css)
  edit(root)
  return root.toString()
}

const ruleOf = (container: Root | Rule, selector: string): Rule => {
  const found: Rule[] = []
  container.walkRules((rule) => {
    if (rule.selector === selector) found.push(rule)
  })
  const [first] = found
  if (first === undefined) throw new Error(`no rule ${selector}`)
  return first
}

describe('AC-base-ui-feedback-navigation-06 and AC-base-ui-overlay-completion-06: the built stylesheet is Appendix A plus overlay Appendix B plus Appendix C', () => {
  // The overlay oracle (Appendix A with B.1 and B.2, all signed), and the expected sheet of the
  // combined package: that oracle with Appendix C's block appended, all feedback drafts signed.
  const expected787 = fixture(INDEPENDENT_BUILD)
  const expected = expectedSheet()

  it('holds the overlay independent build byte for byte', () => {
    expect(sha256(expected787)).toBe(INDEPENDENT_BUILD_SHA256)
  })

  it('has the byte count and sha256 prefix Appendix C gives the all-signed state, focusRing left out (a check on the expected value)', () => {
    expect(Buffer.byteLength(expected)).toBe(COMBINED_BYTES)
    expect(sha256(expected)).toBe(COMBINED_SHA256)
    expect(sha256(expected).slice(0, 16)).toBe('5b918c4b5551f0c4')
    expect(Buffer.byteLength(expected787)).toBe(INDEPENDENT_BUILD_BYTES)
    expect(sha256(expected787).slice(0, 16)).toBe('e9b54cd0a877debe')
  })

  it("holds Appendix C's block (6,899 B, 028c71ff), and appends it to the overlay sheet before the layer's closing brace", () => {
    const block = feedbackBlock()

    expect(Buffer.byteLength(block)).toBe(BLOCK_BYTES)
    expect(sha256(block)).toBe(BLOCK_SHA256)
    expect(blockFor()).toBe(block)
    expect(expected.startsWith(expected787.slice(0, -2))).toBe(true)
    expect(expected.slice(expected787.length - 2)).toBe(`${block}}\n`)
  })

  it('has each of the 21 rules at the bytes and sha256 prefix Appendix C.2 gives', () => {
    const table = JSON.parse(readOracle('feedback-states.json')) as {
      rules: Record<string, { bytes: number; sha256: string }>
    }
    const rules = blockRules(feedbackBlock())

    expect(rules.keys().toArray()).toEqual(NEW_CLASSES_789)
    expect(
      [...rules].map(([name, text]) => [
        name.replace('nave-base-ui-', ''),
        Buffer.byteLength(text),
        sha256(text).slice(0, 16),
      ]),
    ).toEqual(Object.entries(table.rules).map(([name, row]) => [name, row.bytes, row.sha256]))
  })

  it('is Appendix A once the ghost keys and the 14 new rules are taken out', () => {
    expect(sha256(parentStylesheet(expected787))).toBe(PARENT_STYLESHEET_SHA256)
  })

  it('has the same ordered (at-rule path, selector path, property, value) list once focusRing is set aside', () => {
    expect(listDifference(readStylesheet(), expected)).toBeUndefined()
    expect(flatten(expected).some((item) => isFocusRingDeclaration(item))).toBe(false)
  })

  it('sets aside only focusRing: an outline declaration anywhere else is not excused (control)', () => {
    const stray = readStylesheet().replace(
      '.nave-base-ui-title { margin: 0;',
      '.nave-base-ui-title { outline: none; margin: 0;',
    )

    expect(stray).not.toBe(readStylesheet())
    expect(firstListDifference(stray, expected)?.owner).toBe('nave-base-ui-title')
  })

  it('composes focusRing on exactly the atoms Table T2 names, now also the Navigation Menu trigger', () => {
    const classes = focusRingAtoms.map((name) => toClassName(name as AtomName))

    expect(new Set(classes)).toEqual(new Set(focusRingClasses))
    expect(classes).toHaveLength(focusRingClasses.length)
    expect(focusRingClasses).toHaveLength(15)
    expect(classes).toContain('nave-base-ui-navigation-menu-trigger')
  })

  it("agrees with the render tests' Table T2 on the same 15 classes", () => {
    expect(new Set(tablePFocusRingClasses)).toEqual(new Set(focusRingClasses))
  })

  it('does not red on the expected stylesheet against itself (control)', () => {
    expect(firstListDifference(expected, expected)).toBeUndefined()
  })

  it("reds when one value of the arrow-inline rule's inline-start RTL key changes, at that rule (control)", () => {
    const drifted = edited(expected, (root) => {
      ruleOf(
        ruleOf(root, '.nave-base-ui-arrow-inline'),
        '&[data-side="inline-start"]:dir(rtl)',
      ).walkDecls('rotate', (decl) => {
        decl.value = '136deg'
      })
    })
    const difference = firstListDifference(drifted, expected)

    expect(drifted).not.toBe(expected)
    expect(difference?.owner).toBe('nave-base-ui-arrow-inline')
    expect(difference?.selectors).toEqual([
      '.nave-base-ui-arrow-inline',
      '&[data-side="inline-start"]:dir(rtl)',
    ])
  })

  it("reds when the button's ghost rest key is deleted, at that rule (control)", () => {
    const drifted = edited(expected, (root) => {
      ruleOf(ruleOf(root, '.nave-base-ui-button'), '&[data-nave-variant="ghost"]').remove()
    })
    const difference = firstListDifference(drifted, expected)

    expect(drifted).not.toBe(expected)
    expect(difference?.owner).toBe('nave-base-ui-button')
    expect(difference?.selectors).toEqual(['.nave-base-ui-button', '&[data-nave-variant="ghost"]'])
  })

  it("reds when popup-fade's @media block is deleted, at that rule (control)", () => {
    const drifted = edited(expected, (root) => {
      ruleOf(root, '.nave-base-ui-popup-fade').walkAtRules('media', (media) => {
        media.remove()
      })
    })
    const difference = firstListDifference(drifted, expected)

    expect(drifted).not.toBe(expected)
    expect(difference?.owner).toBe('nave-base-ui-popup-fade')
    expect(difference?.atRules).toEqual([LAYER, '@media (prefers-reduced-motion: reduce)'])
  })

  it('reds when the z-index value of toast-placement changes, at that rule (control)', () => {
    const drifted = edited(expected, (root) => {
      ruleOf(root, '.nave-base-ui-toast-placement').walkDecls('z-index', (decl) => {
        decl.value = 'var(--nave-layer-modal)'
      })
    })
    const difference = firstListDifference(drifted, expected)

    expect(drifted).not.toBe(expected)
    expect(difference?.owner).toBe('nave-base-ui-toast-placement')
    expect(difference?.property).toBe('z-index')
  })

  it('reds when the &[data-ending-style] rule of navigation-menu-fade is deleted, at that rule (control)', () => {
    const drifted = edited(expected, (root) => {
      ruleOf(ruleOf(root, '.nave-base-ui-navigation-menu-fade'), '&[data-ending-style]').remove()
    })
    const difference = firstListDifference(drifted, expected)

    expect(drifted).not.toBe(expected)
    expect(difference?.owner).toBe('nave-base-ui-navigation-menu-fade')
    expect(difference?.selectors).toEqual([
      '.nave-base-ui-navigation-menu-fade',
      '&[data-ending-style]',
    ])
  })

  it('reds when the max-block-size of value-bar-indicator is deleted, at that rule (control)', () => {
    const drifted = edited(expected, (root) => {
      ruleOf(root, '.nave-base-ui-value-bar-indicator').walkDecls('max-block-size', (decl) => {
        decl.remove()
      })
    })
    const difference = firstListDifference(drifted, expected)

    expect(drifted).not.toBe(expected)
    expect(difference?.owner).toBe('nave-base-ui-value-bar-indicator')
    expect(difference?.property).toBe('max-block-size')
  })
})

const BUTTON = 'nave-base-ui-button'
const GHOST_KEY = '.nave-base-ui-button > &[data-nave-variant="ghost"]'
const ENABLED = ':not(:disabled, [aria-disabled="true"])'
const HIGHLIGHT = 'background-color: var(--nave-color-action-highlight)'

// The button's ghost entries in Appendix B's order: the rest key, hover, active, then the open key.
const GHOST_ENTRIES: readonly string[] = [
  `${LAYER} | ${GHOST_KEY} | background-color: transparent`,
  `${LAYER} | ${GHOST_KEY} | border-color: transparent`,
  `${LAYER} | ${GHOST_KEY}:hover${ENABLED} | ${HIGHLIGHT}`,
  `${LAYER} | ${GHOST_KEY}:active${ENABLED} | ${HIGHLIGHT}`,
  `${LAYER} | ${GHOST_KEY}[aria-expanded="true"]${ENABLED} | ${HIGHLIGHT}`,
]

const entryOf = (item: FlatDeclaration): string =>
  `${item.atRules.join(' > ')} | ${item.selectors.join(' > ')} | ${item.property}: ${item.value}`

/**
 * Each class's declarations as (at-rule path, selector path, property, value), in order, with
 * focusRing set aside.
 */
const classLists = (css: string): Map<string, string[]> => {
  const lists = new Map<string, string[]>()
  for (const item of ordered(css))
    lists.set(item.owner, [...(lists.get(item.owner) ?? []), entryOf(item)])
  return lists
}

const parentLists = classLists(parentStylesheet(fixture(INDEPENDENT_BUILD)))

/**
 * The classes of Appendix A whose list is not Appendix A's; the button's is Appendix A's followed
 * by the ghost entries.
 */
const v1Drift = (css: string): string[] => {
  const lists = classLists(css)
  return parentLists
    .entries()
    .filter(([name, list]) => {
      const wanted = name === BUTTON ? [...list, ...GHOST_ENTRIES] : list
      return JSON.stringify(lists.get(name)) !== JSON.stringify(wanted)
    })
    .map(([name]) => name)
    .toArray()
}

const isGhostAfterDisabled = (css: string): boolean => {
  const selectors = flattenRules(css)
    .filter((item) => item.owner === BUTTON)
    .map((item) => item.rule.selector)

  return (
    selectors.indexOf('&[data-nave-variant="ghost"]') >
    selectors.indexOf('&:disabled, &[aria-disabled="true"]')
  )
}

describe('AC-base-ui-overlay-completion-09: no v1 rule changes, and the ghost keys follow the disabled key', () => {
  const expected = fixture(INDEPENDENT_BUILD)

  it('has an identical list for every class of Appendix A but the button, whose list is Appendix A followed by the ghost entries', () => {
    expect(v1Drift(readStylesheet())).toEqual([])
  })

  it("ends the button's list with the ghost entries and then the focusRing entries", () => {
    const built = flatten(readStylesheet())
      .filter((item) => item.owner === BUTTON && !isFocusRingBase(item))
      .map((item) => entryOf(item))
    const ring = Object.entries(ringBlock).map(
      ([property, value]) => `${LAYER} | .${BUTTON} > &:focus-visible | ${property}: ${value}`,
    )

    expect(built).toEqual([...(parentLists.get(BUTTON) ?? []), ...GHOST_ENTRIES, ...ring])
  })

  it('puts the ghost rest rule after the disabled rule in the button', () => {
    expect(isGhostAfterDisabled(readStylesheet())).toBe(true)
  })

  it('finds no drift in the expected stylesheet, and the order holds in it (control)', () => {
    expect(v1Drift(expected)).toEqual([])
    expect(isGhostAfterDisabled(expected)).toBe(true)
  })

  it('reds on the ghost rest key moved before the disabled key, naming the order (control)', () => {
    const moved = edited(expected, (root) => {
      const button = ruleOf(root, '.nave-base-ui-button')
      ruleOf(button, '&:disabled, &[aria-disabled="true"]').before(
        ruleOf(button, '&[data-nave-variant="ghost"]'),
      )
    })

    expect(moved).not.toBe(expected)
    expect(isGhostAfterDisabled(moved)).toBe(false)
    expect(v1Drift(moved)).toEqual([BUTTON])
  })

  it("reds on a declaration added to v1's tab-indicator rule, naming that class (control)", () => {
    const added = edited(expected, (root) => {
      ruleOf(root, '.nave-base-ui-tab-indicator').append({ prop: 'color', value: 'red' })
    })

    expect(added).not.toBe(expected)
    expect(v1Drift(added)).toEqual(['nave-base-ui-tab-indicator'])
  })
})

/**
 * What AC-09's first clauses assert, as the list of what is wrong: the sheet built without the 21
 * classes is a byte prefix of the sheet, up to the layer's closing brace, and what follows is the
 * block of the state. Both are read with `focusRing` left out, as Appendix C counts them.
 */
const prefixProblems = (sheet: string, without: string, block: string): string[] => {
  if (!without.endsWith('\n}\n')) return ['the sheet without the new classes has no closing brace']
  const head = without.slice(0, -2)
  if (!sheet.startsWith(head)) return ['the sheet without the new classes is not a byte prefix']
  return sheet.slice(head.length) === `${block}}\n`
    ? []
    : ["what follows the prefix is not Appendix C's block"]
}

/**
 * The classes whose ordered lists differ from the reference's, with `focusRing` set aside.
 */
const listDrift = (candidate: string, reference: string): string[] => {
  const mine = classLists(candidate)
  return classLists(reference)
    .entries()
    .filter(([name, list]) => JSON.stringify(mine.get(name)) !== JSON.stringify(list))
    .map(([name]) => name)
    .toArray()
}

describe('AC-base-ui-feedback-navigation-09: nothing earlier changes, the block is appended, and every overlay state composes with every feedback state', () => {
  const expected = expectedSheet()
  const expected787 = sheet787()

  it('builds, with every feedback class left out of the atom map, the overlay sheet of 30,401 B, e9b54cd0', async () => {
    const without = await buildWithoutClasses(NEW_CLASSES_789)
    const ringless = withoutRing(without)

    expect(ringless.count).toBe(14)
    expect(Buffer.byteLength(ringless.text)).toBe(INDEPENDENT_BUILD_BYTES)
    expect(sha256(ringless.text)).toBe(INDEPENDENT_BUILD_SHA256)
  })

  it('is, with the new classes left out, a byte prefix of the built sheet up to the layer closing brace, and what follows is the block', async () => {
    const [sheet, without] = await Promise.all([
      buildStyles(),
      buildWithoutClasses(NEW_CLASSES_789),
    ])

    expect(prefixProblems(withoutRing(sheet).text, withoutRing(without).text, blockFor())).toEqual(
      [],
    )
  })

  it('has an identical per-class ordered list, in both builds, for every class of Appendix A and of overlay B.1 and B.2', async () => {
    const [sheet, without] = await Promise.all([
      buildStyles(),
      buildWithoutClasses(NEW_CLASSES_789),
    ])
    const classes787 = classLists(expected787).keys().toArray()

    expect(classes787).toHaveLength(65)
    expect(classes787.filter((name) => !classLists(sheet).has(name))).toEqual([])
    expect(listDrift(sheet, without)).toEqual([])
    const sheetClasses = classLists(sheet).keys().toArray()
    const kept = classLists(without)

    expect(sheetClasses.filter((name) => !kept.has(name))).toEqual(NEW_CLASSES_789)
    expect(listDrift(sheet, expected787)).toEqual([])
  })

  it('names, in no feedback rule, popup-fade, popup-motion, active-option or the open ghost key of open-ghost', async () => {
    const rules = [...blockRules(feedbackBlock())]
    const built = withoutRing(await buildStyles()).text
    const names = NEW_CLASSES_789.map((name) => name.replace('nave-base-ui-', ''))
    const forbidden = ['popup-fade', 'popup-motion', 'active-option']
    const ghostKey = '[data-nave-variant="ghost"][aria-expanded="true"]'
    const builtRules = [
      ...blockRules(built.slice(built.indexOf('  .nave-base-ui-toast-viewport '))),
    ]

    expect(rules).toHaveLength(21)
    expect(
      rules
        .filter(
          ([, text]) => forbidden.some((word) => text.includes(word)) || text.includes(ghostKey),
        )
        .map(([name]) => name),
    ).toEqual([])
    expect(builtRules.map(([name]) => name.replace('nave-base-ui-', ''))).toEqual(names)
    expect(
      builtRules
        .filter(
          ([, text]) => forbidden.some((word) => text.includes(word)) || text.includes(ghostKey),
        )
        .map(([name]) => name),
    ).toEqual([])
  })

  it('does not red on the expected sheet against the overlay oracle with the block appended (control)', () => {
    expect(prefixProblems(expected, expected787, feedbackBlock())).toEqual([])
    expect(listDrift(expected, expected787)).toEqual([])
  })

  it('reds on a declaration added to the popover popup, which Navigation Menu popups reuse, naming that class (control)', () => {
    const added = edited(expected, (root) => {
      ruleOf(root, '.nave-base-ui-popover-popup').append({ prop: 'color', value: 'red' })
    })

    expect(added).not.toBe(expected)
    expect(listDrift(added, expected)).toEqual(['nave-base-ui-popover-popup'])
  })

  it('reds on the toast viewport moved before the tab indicator motion, in the prefix clause (control)', () => {
    const viewport = blockRules(feedbackBlock()).get('nave-base-ui-toast-viewport') ?? ''
    const moved = expected
      .replace(viewport, '')
      .replace(
        '  .nave-base-ui-tab-indicator-motion ',
        () => `${viewport}  .nave-base-ui-tab-indicator-motion `,
      )

    expect(viewport).not.toBe('')
    expect(moved).not.toBe(expected)
    expect(moved.length).toBe(expected.length)
    expect(prefixProblems(moved, expected787, feedbackBlock())).toEqual([
      'the sheet without the new classes is not a byte prefix',
    ])
  })

  it('reds on a block that is not the state: a rule dropped from the end of the block (control)', () => {
    const dropped = expected.replace(
      blockRules(feedbackBlock()).get('nave-base-ui-avatar-fallback') ?? '',
      '',
    )

    expect(dropped).not.toBe(expected)
    expect(prefixProblems(dropped, expected787, feedbackBlock())).toEqual([
      "what follows the prefix is not Appendix C's block",
    ])
  })
})
