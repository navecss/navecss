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
import { isFocusRingBase, isFocusRingDeclaration, ringBlock } from './support/focus.ts'
import { flatten, flattenRules, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import { focusRingClasses } from './support/table-p.ts'

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
// The parent contract's stylesheet alone, which is what the independent build holds once the ghost
// keys and the 14 new rules are taken out.
const PARENT_STYLESHEET_SHA256 = '59cd8bad1cd24eab84fc9a7cae856d18b4193284d387d5872baa517df2caa8bb'

// To regenerate the golden when a change to the stylesheet is intended:
//   pnpm --filter @navecss/base-ui run build
//   cp packages/base-ui/dist/styles.css packages/base-ui/test/fixtures/generated/styles.css

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

describe('AC-base-ui-overlay-completion-06: the built stylesheet is Appendix A plus Appendix B', () => {
  const expected = fixture(INDEPENDENT_BUILD)

  it('holds the independent build byte for byte', () => {
    expect(sha256(expected)).toBe(INDEPENDENT_BUILD_SHA256)
  })

  it('has the byte count and sha256 prefix Appendix B gives the all-signed state, focusRing left out (a check on the expected value)', () => {
    expect(Buffer.byteLength(expected)).toBe(INDEPENDENT_BUILD_BYTES)
    expect(sha256(expected).slice(0, 16)).toBe('e9b54cd0a877debe')
  })

  it('is Appendix A once the ghost keys and the 14 new rules are taken out', () => {
    expect(sha256(parentStylesheet(expected))).toBe(PARENT_STYLESHEET_SHA256)
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

  it('composes focusRing on exactly the atoms Table T2 names', () => {
    const classes = focusRingAtoms.map((name) => toClassName(name as AtomName))

    expect(new Set(classes)).toEqual(new Set(focusRingClasses))
    expect(classes).toHaveLength(focusRingClasses.length)
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
