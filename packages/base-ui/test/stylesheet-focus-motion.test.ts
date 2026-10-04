import { atoms as coreAtoms } from '@navecss/core/atoms'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import {
  isFocusRingBase,
  isFocusRingDeclaration,
  isThumbRingDeclaration,
  ringBlock,
  THUMB,
  THUMB_RING,
} from './support/focus.ts'
import { flatten, readStylesheet } from './support/stylesheet.ts'
import { focusRingClasses } from './support/table-p.ts'

const PREFIX = 'nave-base-ui-'
const GUARD_QUERY = '@media (prefers-reduced-motion: reduce)'
const GUARD_VALUE = 'calc(0 * var(--nave-motion-duration-fast))'

const planted = (rule: string): string => `${readStylesheet()}\n@layer components.nave { ${rule} }`

const isFocusKeyed = (item: FlatDeclaration): boolean =>
  item.selectors.some((selector) => /:focus(?:-visible|-within)?\b/.test(selector))

const isAdmittedFocus = (item: FlatDeclaration): boolean =>
  isFocusRingDeclaration(item) ||
  isThumbRingDeclaration(item) ||
  (item.owner === THUMB && item.selectors.join(' ').includes(':has(:focus-visible)'))

const outlineProblems = (item: FlatDeclaration): string[] => {
  const where = `${item.owner} ${item.selectors.join(' ')}`
  const isAdmitted = isFocusRingDeclaration(item) || isThumbRingDeclaration(item)
  return !isAdmitted && item.property.startsWith('outline')
    ? [`${where} sets ${item.property}`]
    : []
}

const focusKeyProblems = (item: FlatDeclaration): string[] => {
  const where = `${item.owner} ${item.selectors.join(' ')}`
  const problems: string[] = []
  if (!isFocusKeyed(item)) return problems
  if (item.property === 'box-shadow') problems.push(`${where} has a focus-keyed box-shadow`)
  if (!isAdmittedFocus(item)) problems.push(`${where} keys on focus`)
  return problems
}

/**
 * The classes that carry the whole ring block: every longhand of it, each with its value. A class
 * with one longhand missing has no visible ring, since `outline-style` is `none` unless set.
 */
const classesWithWholeBlock = (found: FlatDeclaration[]): Set<string> => {
  const written = new Set(
    found
      .filter((item) => isFocusRingDeclaration(item) && !isFocusRingBase(item))
      .map((item) => `${item.owner}|${item.property}`),
  )
  return new Set(
    focusRingClasses.filter((name) =>
      Object.keys(ringBlock).every((property) => written.has(`${name}|${property}`)),
    ),
  )
}

const ringCompleteness = (found: FlatDeclaration[]): string[] => {
  const base = new Set(found.filter((item) => isFocusRingBase(item)).map((item) => item.owner))
  const block = classesWithWholeBlock(found)
  const lacking = focusRingClasses.filter((name) => !base.has(name) || !block.has(name))
  const extra = base
    .union(block)
    .values()
    .filter((name) => !focusRingClasses.includes(name))
  return [
    ...lacking.map((name) => `${name} lacks focusRing`),
    ...extra.map((name) => `${name} carries focusRing`),
  ]
}

/**
 * What AC-27 asserts, as the list of what is wrong.
 */
const focusViolations = (css: string): string[] => {
  const found = flatten(css)
  return [
    ...found.flatMap((item) => outlineProblems(item)),
    ...found.flatMap((item) => focusKeyProblems(item)),
    ...ringCompleteness(found),
  ]
}

/**
 * `outline` in a pseudo block as a shorthand with a var(): the form that computes to none as a whole.
 */
const isShorthandWithVar = (pseudos: Record<string, Record<string, string>>): boolean =>
  Object.values(pseudos).some((block) => (block.outline ?? '').includes('var('))

describe('AC-base-ui-bridge-27: B1, focus styling is exactly what the signatures admit', () => {
  it('has outline only as focusRing on Table T2 and the thumb rule byte for byte, and no other focus selector', () => {
    expect(focusViolations(readStylesheet())).toEqual([])
  })

  it("gives the Slider thumb's rule as the four longhands with fallbacks, byte for byte", () => {
    const rule = flatten(readStylesheet()).filter(
      (item) => item.owner === THUMB && item.selectors[1] === '&:has(:focus-visible)',
    )

    expect(Object.fromEntries(rule.map((item) => [item.property, item.value]))).toEqual(THUMB_RING)
  })

  it("composes core's focusRing in its longhand form: no outline shorthand with a var() in it", () => {
    expect(isShorthandWithVar(coreAtoms.focusRing.pseudos)).toBe(false)
    expect(Object.keys(ringBlock)).toEqual(Object.keys(THUMB_RING))
  })

  it('reds on a shorthand with a var() (control)', () => {
    expect(isShorthandWithVar({ ':focus-visible': { outline: 'var(--a) solid var(--b)' } })).toBe(
      true,
    )
  })

  it('reds on a planted outline (control)', () => {
    expect(focusViolations(planted(`.${PREFIX}title { outline: 1px solid red }`))).toEqual([
      expect.stringContaining('sets outline'),
    ])
  })

  it('reds on a planted :focus rule (control)', () => {
    const css = planted(`.${PREFIX}title { &:focus { color: red } }`)

    expect(focusViolations(css)).toEqual([expect.stringContaining('keys on focus')])
  })

  it('reds on a :has(:focus-visible) rule outside the Slider thumb (control)', () => {
    const css = planted(`.${PREFIX}title { &:has(:focus-visible) { color: red } }`)

    expect(focusViolations(css)).toEqual([expect.stringContaining('keys on focus')])
  })

  it('reds on an outline under a hover-qualified root, even beside the four ring longhands (control)', () => {
    const longhands = Object.entries(ringBlock)
      .map(([property, value]) => `${property}: ${value}`)
      .join('; ')
    const css = planted(
      `.${PREFIX}button:hover { outline: none; &:focus-visible { ${longhands} } }`,
    )

    expect(focusViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('sets outline')]),
    )
  })

  it('reds on a focus-keyed box-shadow (control)', () => {
    const css = planted(`.${PREFIX}title { &:focus-visible { box-shadow: 0 0 0 1px red } }`)

    expect(focusViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('focus-keyed box-shadow')]),
    )
  })

  it('reds on a Table T2 class whose ring block loses one longhand (control)', () => {
    const root = postcss.parse(readStylesheet())
    root.walkRules('&:focus-visible', (rule) => {
      if (rule.parent?.type === 'rule' && rule.parent.selector === `.${PREFIX}tab`) {
        rule.walkDecls('outline-style', (decl) => {
          decl.remove()
        })
      }
    })

    expect(focusViolations(root.toString())).toEqual([`${PREFIX}tab lacks focusRing`])
  })

  it('reds on a Table T2 class that loses its ring (control)', () => {
    const root = postcss.parse(readStylesheet())
    root.walkRules('&:focus-visible', (rule) => {
      if (rule.parent?.type === 'rule' && rule.parent.selector === `.${PREFIX}tab`) rule.remove()
    })

    expect(focusViolations(root.toString())).toEqual([`${PREFIX}tab lacks focusRing`])
  })
})

const MOTION_PROPERTIES = new Set([
  'animation-delay',
  'animation-duration',
  'animation-timing-function',
  'transition-delay',
  'transition-duration',
  'transition-timing-function',
])

const isGuarded = (item: FlatDeclaration): boolean =>
  item.atRules.some((rule) => rule.startsWith(GUARD_QUERY)) &&
  item.property === 'transition-duration' &&
  item.value === GUARD_VALUE

const isMotionToken = (value: string): boolean => /^var\(--nave-motion-[a-z-]+\)$/.test(value)

const motionProblems = (item: FlatDeclaration): string[] => {
  const where = `${item.owner} ${item.property}: ${item.value}`
  const problems: string[] = []
  if (item.node.important) problems.push(`${where} is !important`)
  if (['animation', 'animation-name', 'transition'].includes(item.property)) {
    problems.push(`${where} is a shorthand`)
  }
  if (/\b\d*\.?\d+m?s\b/.test(item.value)) problems.push(`${where} holds a raw time`)
  if (MOTION_PROPERTIES.has(item.property) && !isMotionToken(item.value) && !isGuarded(item)) {
    problems.push(`${where} is not one motion token`)
  }
  return problems
}

describe('AC-base-ui-bridge-28: B2 and motion', () => {
  it('has no !important, no motion shorthand and no raw time, and every motion value one token or the guard', () => {
    expect(flatten(readStylesheet()).flatMap((item) => motionProblems(item))).toEqual([])
  })

  it.each([['transition-duration: 200ms'], ['color: red !important']])(
    'reds on a planted %s (control)',
    (declaration) => {
      const found = flatten(planted(`.${PREFIX}title { ${declaration} }`))

      expect(found.flatMap((item) => motionProblems(item))).not.toEqual([])
    },
  )

  it('reds on the guard value outside the @media (control)', () => {
    const found = flatten(planted(`.${PREFIX}title { transition-duration: ${GUARD_VALUE} }`))

    expect(found.flatMap((item) => motionProblems(item))).toEqual([
      expect.stringContaining('not one motion token'),
    ])
  })
})

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

const isGroupForming = (property: string): boolean =>
  GROUP_FORMING.has(property) || /^mask(?:-|$)/.test(property)

/**
 * The group-forming declarations of a stylesheet, each as `owner|relative selectors|property: value`.
 */
const groupForming = (css: string): string[] =>
  flatten(css)
    .filter((item) => isGroupForming(item.property))
    .map(
      (item) =>
        `${item.owner}|${item.selectors.slice(1).join(' ')}|${item.property}: ${item.value}`,
    )

const byText = (a: string, b: string): number => a.localeCompare(b)

const ADMITTED_GROUP_FORMING = [
  `${PREFIX}arrow|&[data-side="top"]|rotate: 45deg`,
  `${PREFIX}arrow|&[data-side="bottom"]|rotate: 225deg`,
  `${PREFIX}arrow|&[data-side="left"]|rotate: -45deg`,
  `${PREFIX}arrow|&[data-side="right"]|rotate: 135deg`,
  `${PREFIX}disclosure-icon|&[aria-expanded="true"] > svg:last-child|rotate: 180deg`,
  `${PREFIX}checkbox-indicator||rotate: 45deg`,
  `${PREFIX}checkbox-indicator|[aria-checked="mixed"] > &|rotate: 0deg`,
  `${PREFIX}input|&::placeholder|opacity: 1`,
  `${PREFIX}number-field-input|&::placeholder|opacity: 1`,
]

describe('AC-base-ui-bridge-29: B3, group-forming properties only where they are admitted', () => {
  it('has rotate on the arrow, the disclosure icon svg and the check mark, and opacity: 1 on ::placeholder only', () => {
    expect(groupForming(readStylesheet()).toSorted(byText)).toEqual(
      ADMITTED_GROUP_FORMING.toSorted(byText),
    )
  })

  it('reds on a planted opacity under ::placeholder (control)', () => {
    const css = planted(`.${PREFIX}input { &::placeholder { opacity: 0.5 } }`)

    expect(groupForming(css)).toContain(`${PREFIX}input|&::placeholder|opacity: 0.5`)
  })

  it('reds on a planted clip-path, which can cut a descendant focus ring (control)', () => {
    const css = planted(`.${PREFIX}list-popup { clip-path: inset(0) }`)

    expect(groupForming(css)).toContain(`${PREFIX}list-popup||clip-path: inset(0)`)
  })

  it('reds on a planted opacity under a starting-style key (control)', () => {
    const css = planted(`.${PREFIX}accordion-panel { &[data-starting-style] { opacity: 0 } }`)

    expect(groupForming(css)).toContain(
      `${PREFIX}accordion-panel|&[data-starting-style]|opacity: 0`,
    )
  })
})
