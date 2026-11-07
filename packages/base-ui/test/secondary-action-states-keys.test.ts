/**
 * The secondary action's hover and press keys on the Button and the Toggle, read from the atoms and
 * the built stylesheet: AC-secondary-action-states-03, -04, -09, -13 (its Tier A half) and -14.
 * Every check is a function of a stylesheet text, so each control feeds the same function a copy
 * that breaks one clause and reads the problem it names.
 */
import type { Rule } from 'postcss'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { atoms, atomsFor } from '../styles/atoms.ts'
import { allStates, type Draft, OPEN_GHOST_KEY, stateKey } from './support/draft-states.ts'
import {
  ACTIVE_VALUE,
  BUTTON,
  BUTTON_KEYS,
  BUTTON_KEYS_BEFORE,
  declarationsOf,
  hasUserAction,
  HOVER_VALUE,
  keyListProblems,
  nestedRules,
  secondaryStateRules,
  stateKeysOf,
  TOGGLE,
  TOGGLE_KEYS,
  TOGGLE_KEYS_BEFORE,
  userActions,
} from './support/secondary-states.ts'
import { requiresAttributeValue, selectorSpecificity } from './support/selector.ts'
import { flatten, readStylesheet } from './support/stylesheet.ts'

const css = readStylesheet()
const NOT_DISABLED = ':not(:disabled, [aria-disabled="true"])'
const FORBIDDEN_STATE_KEYS =
  /aria-expanded|aria-pressed|data-pressed|data-popup-open|:focus|:checked/

const keyOf = (className: string, selector: string): string => `${className} ${selector}`

/**
Adds rules, written as CSS, to the end of a class rule in a copy of the stylesheet.
 */
const withRules = (source: string, className: string, snippet: string): string => {
  const root = postcss.parse(source)
  root.walkRules(`.${className}`, (rule) => {
    rule.append(postcss.parse(snippet))
  })
  return root.toString()
}

/**
Appends a declaration to the rule of a class, or to one of its nested keys, in a copy of the CSS.
 */
const withDeclaration = (
  source: string,
  className: string,
  key: string | undefined,
  declaration: string,
): string => {
  const root = postcss.parse(source)
  root.walkRules(`.${className}`, (rule) => {
    const target =
      key === undefined
        ? rule
        : rule.nodes.find((node): node is Rule => node.type === 'rule' && node.selector === key)
    const [prop = '', value = ''] = declaration.split(/:\s*/, 2)
    target?.append({ prop, value })
  })
  return root.toString()
}

const wantedFills = new Map<string, string>([
  [keyOf(BUTTON, BUTTON_KEYS[0]), HOVER_VALUE],
  [keyOf(BUTTON, BUTTON_KEYS[1]), ACTIVE_VALUE],
  [keyOf(TOGGLE, TOGGLE_KEYS[0]), HOVER_VALUE],
  [keyOf(TOGGLE, TOGGLE_KEYS[1]), ACTIVE_VALUE],
])

const ruleFillProblems = (key: string, rule: Rule): string[] => {
  const decls = declarationsOf(rule)
  const expected = wantedFills.get(key)
  const shape = decls.map((decl) => `${decl.prop}: ${decl.value}`)
  const problems =
    expected !== undefined && shape.join(',') !== `background-color: ${expected}`
      ? [`${key} carries ${shape.join('; ')}`]
      : []
  for (const decl of decls) {
    if (decl.prop === 'color' || decl.prop.startsWith('border')) {
      problems.push(`${key} sets ${decl.prop} under a user action`)
    }
  }
  return problems
}

const stateFillProblems = (source: string): string[] => {
  const problems = secondaryStateRules(source).flatMap(([className, selector, rule]) =>
    ruleFillProblems(keyOf(className, selector), rule),
  )
  const users = flatten(source)
    .filter((item) => /action-secondary-(?:hover|active)\b/.test(item.value))
    .map((item) => `${item.owner} ${item.selectors.at(-1)}`)
  for (const user of users) {
    if (!wantedFills.has(user)) problems.push(`${user} names a state fill outside the four keys`)
  }
  for (const key of wantedFills.keys()) {
    if (!users.includes(key)) problems.push(`${key} does not name its state fill`)
  }
  return problems
}

describe('AC-secondary-action-states-03: the states change the fill and nothing else', () => {
  it('gives each of the four keys exactly one background-color declaration, with no fallback', () => {
    expect(stateFillProblems(css)).toEqual([])
  })

  it('reds on a border-colour added to the Toggle hover key (control)', () => {
    const planted = withDeclaration(
      css,
      TOGGLE,
      TOGGLE_KEYS[0],
      'border-color: var(--nave-color-border-strong)',
    )

    expect(stateFillProblems(planted).join('\n')).toContain(
      `${keyOf(TOGGLE, TOGGLE_KEYS[0])} sets border-color`,
    )
  })

  it('reds on the hover fill added to the select trigger (control)', () => {
    const planted = withDeclaration(
      css,
      'nave-base-ui-select-trigger',
      undefined,
      `background-color: ${HOVER_VALUE}`,
    )

    expect(stateFillProblems(planted).join('\n')).toContain(
      'nave-base-ui-select-trigger names a state fill outside the four keys',
    )
  })
})

const guardProblems = (source: string): string[] => {
  const problems: string[] = []
  const primary = nestedRules(source, BUTTON)
    .map((rule) => rule.selector)
    .filter((selector) => selector.startsWith('&[data-nave-variant="primary"]:'))
  for (const selector of primary) {
    if (!selector.endsWith(NOT_DISABLED)) problems.push(`primary key ${selector} lost its guard`)
  }
  for (const [className, selector] of secondaryStateRules(source)) {
    const key = keyOf(className, selector)
    if (!selector.endsWith(NOT_DISABLED)) problems.push(`${key} does not end with the guard`)
    if (FORBIDDEN_STATE_KEYS.test(selector))
      problems.push(`${key} keys a state that carries information`)
    if (userActions(selector).length !== 1) problems.push(`${key} has not exactly one user action`)
    const rest = selector
      .replace(NOT_DISABLED, '')
      .replace(':not([data-nave-variant="primary"], [data-nave-variant="ghost"])', '')
    if (!/^&:(?:hover|active)$/.test(rest)) problems.push(`${key} carries more than its action`)
  }
  return problems
}

const borderColourProblems = (source: string): string[] =>
  [BUTTON, TOGGLE].flatMap((className) =>
    nestedRules(source, className)
      .filter(
        (rule) =>
          declarationsOf(rule).some((decl) =>
            /^border(?:-[a-z-]+)?-color$|^border-color$|^border$/.test(decl.prop),
          ) &&
          !requiresAttributeValue(rule.selector, 'data-nave-variant', 'primary') &&
          !requiresAttributeValue(rule.selector, 'data-nave-variant', 'ghost') &&
          rule.selector !== '&:disabled, &[aria-disabled="true"]',
      )
      .map((rule) => `${keyOf(className, rule.selector)} changes a border`),
  )

describe('AC-secondary-action-states-04: the six conditions are held by the shipped bytes', () => {
  it("ends the four keys with the primary keys' guard and on exactly one user action", () => {
    expect(guardProblems(css)).toEqual([])
  })

  it('has the disabled rule as the only border change for a part not in primary or ghost', () => {
    expect(borderColourProblems(css)).toEqual([])
  })

  it('leaves the focus ring and the control gaps as they were', () => {
    const decls = flatten(css)
    const set = (className: string): string[] =>
      decls
        .filter((item) => item.owner === className && item.selectors.length > 1)
        .filter((item) => hasUserAction(item.selectors.at(-1) ?? ''))
        .filter((item) => /^(?:outline|box-shadow)/.test(item.property))
        .map((item) => item.property)
    for (const className of [BUTTON, TOGGLE]) expect(set(className)).toEqual([])
    for (const className of [
      'nave-base-ui-toggle-group',
      'nave-base-ui-toolbar',
      'nave-base-ui-toolbar-group',
    ]) {
      const gaps = decls.filter((item) => item.owner === className && item.property === 'gap')
      expect(
        gaps.map((item) => item.value),
        className,
      ).toEqual(['var(--nave-spacing-control-xs)'])
    }
  })

  it('reds on a Button hover key that ends :not(:disabled) (control)', () => {
    const planted = css.replace(
      `&:not([data-nave-variant="primary"], [data-nave-variant="ghost"]):hover${NOT_DISABLED}`,
      () =>
        '&:not([data-nave-variant="primary"], [data-nave-variant="ghost"]):hover:not(:disabled)',
    )

    expect(guardProblems(planted).join('\n')).toContain(
      `${keyOf(BUTTON, `&:not([data-nave-variant="primary"], [data-nave-variant="ghost"]):hover:not(:disabled)`)} does not end with the guard`,
    )
  })

  it('reds on a Toggle active key that adds [aria-pressed="true"] (control)', () => {
    const planted = css.replace(
      `&:active${NOT_DISABLED}`,
      () => `&[aria-pressed="true"]:active${NOT_DISABLED}`,
    )

    expect(guardProblems(planted).join('\n')).toContain('keys a state that carries information')
  })
})

const pseudoKeys = (unsigned: readonly Draft[]): string[] =>
  Object.keys(atomsFor(unsigned).baseUiButton?.pseudos ?? {})

const secondarySpecificity = (key: string, className: string): readonly number[] =>
  selectorSpecificity(key.replaceAll('&', () => `:is(.${className})`))

describe('AC-secondary-action-states-09: the Button gains exactly the two keys, last, in every signature state', () => {
  it('lists the keys it had with the two appended after the ghost open key', () => {
    const all = Object.keys(atoms.baseUiButton?.pseudos ?? {})

    expect(keyListProblems(all, [...BUTTON_KEYS_BEFORE, ...BUTTON_KEYS])).toEqual([])
  })

  it('has both keys present and last in every atomsFor() result', () => {
    for (const unsigned of allStates()) {
      const expected = [...BUTTON_KEYS_BEFORE, ...BUTTON_KEYS].filter(
        (key) => !(unsigned.includes('open-ghost') && key === BUTTON_KEYS_BEFORE.at(-1)),
      )

      expect(keyListProblems(pseudoKeys(unsigned), expected), stateKey(unsigned)).toEqual([])
    }
  })

  it("ends the built Button rule's state rules with the two keys, in that order", () => {
    expect(stateKeysOf(css, BUTTON).slice(-2)).toEqual([...BUTTON_KEYS])
  })

  it('gives each key the specificity of the primary and ghost state keys', () => {
    const wanted = secondarySpecificity(BUTTON_KEYS_BEFORE[2], BUTTON)

    expect(wanted).toEqual([0, 4, 0])
    expect(BUTTON_KEYS.map((key) => secondarySpecificity(key, BUTTON))).toEqual([wanted, wanted])
  })

  it('reds on the keys swapped, placed before the primary rest key, or with the ghost keys dropped (controls)', () => {
    const expected = [...BUTTON_KEYS_BEFORE, ...BUTTON_KEYS]
    const swapped = [...BUTTON_KEYS_BEFORE, BUTTON_KEYS[1], BUTTON_KEYS[0]]
    const early = [BUTTON_KEYS_BEFORE[0], ...BUTTON_KEYS, ...BUTTON_KEYS_BEFORE.slice(1)]
    const noGhost = expected.filter((key) => !key.includes('[data-nave-variant="ghost"]'))

    expect(keyListProblems(swapped, expected).join(',')).toContain('out of order')
    expect(keyListProblems(early, expected).join(',')).toContain('out of order')
    expect(keyListProblems(noGhost, expected).join(',')).toContain(
      'missing: &[data-nave-variant="ghost"]',
    )
    expect(OPEN_GHOST_KEY).toContain('aria-expanded')
  })
})

describe('AC-secondary-action-states-13: the Toggle gains exactly the two keys, last (Tier A)', () => {
  it('lists the keys it had with the two appended after the disabled key', () => {
    const all = Object.keys(atoms.baseUiToggle?.pseudos ?? {})

    expect(keyListProblems(all, [...TOGGLE_KEYS_BEFORE, ...TOGGLE_KEYS])).toEqual([])
  })

  it("ends the built Toggle rule's state rules with the two keys, each at (0,3,0)", () => {
    expect(stateKeysOf(css, TOGGLE).slice(-2)).toEqual([...TOGGLE_KEYS])
    expect(TOGGLE_KEYS.map((key) => secondarySpecificity(key, TOGGLE))).toEqual([
      [0, 3, 0],
      [0, 3, 0],
    ])
  })

  it('keys the pressed underline alone on aria-pressed', () => {
    const pressed = nestedRules(css, TOGGLE).filter((rule) =>
      rule.selector.includes('aria-pressed'),
    )

    expect(pressed.map((rule) => rule.selector)).toEqual(['&[aria-pressed="true"]::after'])
  })
})

const ruleFillKeyProblem = (className: string, rule: Rule): string[] => {
  const key = keyOf(className, rule.selector)
  const isGhostOpen = rule.selector.startsWith('&[data-nave-variant="ghost"][aria-expanded')
  const isKeysExpanded = className === BUTTON && rule.selector.includes('aria-expanded')
  const isKeysPressed =
    className === TOGGLE && /aria-pressed|data-pressed|:checked/.test(rule.selector)
  return [
    ...(isKeysExpanded && !isGhostOpen ? [`${key} keys aria-expanded`] : []),
    ...(isKeysPressed ? [`${key} keys the pressed state`] : []),
  ]
}

const hoverAtRuleProblems = (source: string, className: string): string[] => {
  const problems: string[] = []
  postcss.parse(source).walkRules(`.${className}`, (rule) =>
    rule.walkAtRules((atRule) => {
      if (atRule.params.includes('hover')) {
        problems.push(`${className} gains @${atRule.name} ${atRule.params}`)
      }
    }),
  )
  return problems
}

const fillKeyProblems = (source: string): string[] =>
  [BUTTON, TOGGLE].flatMap((className) => [
    ...nestedRules(source, className)
      .filter((rule) => declarationsOf(rule).some((decl) => decl.prop === 'background-color'))
      .flatMap((rule) => ruleFillKeyProblem(className, rule)),
    ...hoverAtRuleProblems(source, className),
  ])

describe('AC-secondary-action-states-14: no fill is keyed on a state that carries information, and nothing is gated', () => {
  it('has no such key and no hover media query', () => {
    expect(fillKeyProblems(css)).toEqual([])
  })

  it('reds on an aria-expanded fill key on the default variant (control)', () => {
    const planted = withRules(
      css,
      BUTTON,
      `&:not([data-nave-variant="primary"], [data-nave-variant="ghost"])[aria-expanded="true"]${NOT_DISABLED}{ background-color: red; }`,
    )

    expect(fillKeyProblems(planted).join('\n')).toContain('keys aria-expanded')
  })

  it('reds on a pressed Toggle hover fill key (control)', () => {
    const planted = withRules(
      css,
      TOGGLE,
      `&[aria-pressed="true"]:hover${NOT_DISABLED}{ background-color: red; }`,
    )

    expect(fillKeyProblems(planted).join('\n')).toContain('keys the pressed state')
  })

  it('reds on a hover media query inside the Button (control)', () => {
    const planted = withRules(css, BUTTON, '@media (hover: hover){ &{ color: red; } }')

    expect(fillKeyProblems(planted).join('\n')).toContain('@media (hover: hover)')
  })
})
