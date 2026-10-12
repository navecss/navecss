import type { AtRule, ChildNode, Root, Rule } from 'postcss'
import type { Attribute } from 'postcss-selector-parser'

import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { describe, expect, it } from 'vitest'

import type { SelectorNode } from './support/selector.ts'

import { focusRingClasses, THUMB } from './support/focus.ts'
import { attributeReads, selectorNodes } from './support/selector.ts'
import { flatten, flattenRules, readStylesheet, splitSelectorList } from './support/stylesheet.ts'
import { firstOrderStatement, workspaceTokensCss } from './support/tokens.ts'

const PREFIX = 'nave-base-ui-'

const byText = (a: string, b: string): number => a.localeCompare(b)
const GUARD_QUERY = '(prefers-reduced-motion: reduce)'
const GUARD_VALUE = 'calc(0 * var(--nave-motion-duration-fast))'

/**
 * Applies an edit to a parsed copy of the stylesheet and returns the result's text.
 */
const mutate = (edit: (root: Root) => void): string => {
  const root = postcss.parse(readStylesheet())
  edit(root)
  return root.toString()
}

const classRule = (root: Root, name: string): Rule => {
  const found = root.nodes
    .flatMap((node) => (node.type === 'atrule' ? (node.nodes ?? []) : [node]))
    .find((node) => node.type === 'rule' && node.selector === `.${PREFIX}${name}`)
  if (found?.type !== 'rule') throw new Error(`no .${PREFIX}${name} rule`)
  return found
}

const isLayerBlock = (node: ChildNode): boolean =>
  node.type === 'atrule' &&
  node.name === 'layer' &&
  node.params === 'components.nave' &&
  node.nodes !== undefined

const orderViolations = (first: ChildNode | undefined): string[] => {
  if (first?.type !== 'atrule' || first.name !== 'layer' || first.nodes !== undefined) {
    return ['the first node is not a block-less @layer at-rule']
  }
  const expected = firstOrderStatement(workspaceTokensCss())
  return first.params === expected ? [] : [`the order statement is not the tokens package's`]
}

const forbiddenViolations = (root: Root): string[] => {
  const problems: string[] = []
  root.walkAtRules((rule) => {
    if (['import', 'keyframes', 'nave'].includes(rule.name)) problems.push(`@${rule.name}`)
  })
  root.walkRules((rule) => {
    if (/:root|\bhtml\b/.test(rule.selector)) problems.push(`selector ${rule.selector}`)
  })
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) problems.push(`custom property ${decl.prop}`)
    if (['isolation', 'z-index'].includes(decl.prop)) problems.push(`property ${decl.prop}`)
  })
  return problems
}

/**
 * What AC-18's first scenario asserts, as the list of what is wrong.
 */
const componentsOnlyViolations = (css: string): string[] => {
  const root = postcss.parse(css)
  const [first, ...rest] = root.nodes.filter((node) => node.type !== 'comment')
  const stray = rest
    .filter((node) => !isLayerBlock(node))
    .map(() => 'a top-level node is not an @layer components.nave block')
  return [...orderViolations(first), ...stray, ...forbiddenViolations(root)]
}

describe('AC-base-ui-overlay-completion-20 and AC-base-ui-bridge-18: the stylesheet is components-only, and its order statement is live and first', () => {
  it('has nothing in it but the order statement and components.nave blocks, and no forbidden construct', () => {
    expect(componentsOnlyViolations(readStylesheet())).toEqual([])
  })

  it('admits a comment before the order statement and between nodes: comments are not nodes', () => {
    const css = `/*! NaveCSS */\n${readStylesheet()}\n/* end */\n`

    expect(componentsOnlyViolations(css)).toEqual([])
  })

  it('reds on a stylesheet that carries an @import first (the prototype shape)', () => {
    const prototype = `@import url('@navecss/tokens/css');\n${readStylesheet()}`

    expect(componentsOnlyViolations(prototype)).not.toEqual([])
  })

  it('reds on a copy with the order statement moved after the first block', () => {
    const moved = mutate((root) => {
      const [order, block] = root.nodes
      if (order === undefined || block === undefined) throw new Error('no nodes')
      order.remove()
      block.after(order)
    })

    expect(componentsOnlyViolations(moved)).not.toEqual([])
  })

  it('reds on a custom property, a z-index, an isolation, a :root rule and a keyframes (controls)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { :root { --nave-x: 1; z-index: 1; isolation: isolate } @keyframes k {} }`

    expect(componentsOnlyViolations(css)).toEqual(
      expect.arrayContaining([
        'custom property --nave-x',
        'property z-index',
        'property isolation',
        '@keyframes',
        'selector :root',
      ]),
    )
  })
})

interface Nested {
  readonly at: AtRule
  readonly owner: string
}

/**
 * Every at-rule that is not a top-level node or the layer block, with the class rule it sits in.
 */
const nestedAtRules = (root: Root): Nested[] => {
  const found: Nested[] = []
  root.walkAtRules((at) => {
    const parent = at.parent
    if (parent?.type === 'root') return
    found.push({ at, owner: parent?.type === 'rule' ? parent.selector : '' })
  })
  return found
}

const MOTION_GUARD_SELECTOR = '&, &[data-instant]'

/**
 * The classes that carry the guard, each with the selector of the one rule inside it: the first
 * release's four transitioning classes, and the five motion classes of the overlay completion.
 */
const GUARDED: ReadonlyMap<string, string> = new Map([
  [`.${PREFIX}accordion-panel`, '&'],
  [`.${PREFIX}backdrop`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}collapsible-panel`, '&'],
  [`.${PREFIX}disclosure-icon`, '& > svg:last-child'],
  [`.${PREFIX}popup-fade`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}popup-motion`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}switch-thumb`, '&'],
  [`.${PREFIX}tab-indicator-motion`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}tooltip-motion`, MOTION_GUARD_SELECTOR],
])

const strayAtRules = (nested: Nested[]): string[] =>
  nested.flatMap(({ at, owner }) => {
    if (at.name !== 'media' || at.params !== GUARD_QUERY) {
      return [`nested at-rule @${at.name} ${at.params} in ${owner}`]
    }
    return GUARDED.has(owner) ? [] : [`a guard in ${owner}`]
  })

const isLoneDeclaration = (rule: Rule): boolean => {
  const [declaration, ...others] = rule.nodes
  return (
    others.length === 0 &&
    declaration?.type === 'decl' &&
    declaration.prop === 'transition-duration' &&
    declaration.value === GUARD_VALUE
  )
}

const isGuardShape = (guard: AtRule, selector: string): boolean => {
  const [rule, ...others] = guard.nodes ?? []
  return (
    others.length === 0 &&
    rule?.type === 'rule' &&
    rule.selector === selector &&
    isLoneDeclaration(rule)
  )
}

const guardShapes = (nested: Nested[]): string[] =>
  GUARDED.entries()
    .flatMap(([owner, selector]) => {
      const guards = nested.filter((item) => item.owner === owner && item.at.params === GUARD_QUERY)
      const [guard] = guards
      if (guard === undefined || guards.length !== 1)
        return [`${owner} has ${guards.length} guards`]
      return isGuardShape(guard.at, selector)
        ? []
        : [`${owner}'s guard is not one rule holding one transition-duration: ${GUARD_VALUE}`]
    })
    .toArray()

/**
 * Every transition-duration outside a guard needs each of its selectors in the selector list of its
 * own class's guard.
 */
const unguardedDurations = (root: Root): string[] => {
  const twins = new Map<string, Set<string>>()
  for (const { at, owner } of nestedAtRules(root)) {
    const selectors = twins.get(owner) ?? new Set<string>()
    at.walkRules((rule) => {
      for (const selector of splitSelectorList(rule.selector)) selectors.add(selector)
    })
    twins.set(owner, selectors)
  }
  return flatten(root.toString())
    .filter((item) => item.property === 'transition-duration' && item.atRules.length === 1)
    .flatMap((item) =>
      splitSelectorList(item.selectors[1] ?? '&').map((relative) => ({
        own: `.${item.owner}`,
        relative,
      })),
    )
    .filter(({ own, relative }) => !twins.get(own)?.has(relative))
    .map(({ own, relative }) => `${own} ${relative} has no guard twin`)
}

/**
 * What AC-18's second scenario asserts, as the list of what is wrong.
 */
const guardViolations = (css: string): string[] => {
  const root = postcss.parse(css)
  const nested = nestedAtRules(root)
  return [...strayAtRules(nested), ...guardShapes(nested), ...unguardedDurations(root)]
}

describe('AC-base-ui-overlay-completion-20 and AC-base-ui-bridge-18: the only nested at-rule is the reduced-motion guard, in its duration form', () => {
  it('is exactly one guard in each of the nine guarded classes, and every duration has its twin', () => {
    expect(guardViolations(readStylesheet())).toEqual([])
  })

  it('has nine nested at-rules, the four of the first release and the five motion classes', () => {
    const nested = nestedAtRules(postcss.parse(readStylesheet()))

    expect(nested.map((item) => item.owner).toSorted(byText)).toEqual(
      GUARDED.keys().toArray().toSorted(byText),
    )
  })

  it('writes each motion class guard as one rule, `&, &[data-instant]`, holding the one declaration', () => {
    const nested = nestedAtRules(postcss.parse(readStylesheet()))
    const motion = nested.filter(
      (item) => item.owner !== '' && GUARDED.get(item.owner) === MOTION_GUARD_SELECTOR,
    )

    expect(motion).toHaveLength(5)
    expect(
      motion.map((item) =>
        item.at.nodes?.map((node) => (node.type === 'rule' ? node.selector : '')),
      ),
    ).toEqual(motion.map(() => [MOTION_GUARD_SELECTOR]))
  })

  it('reds on the property form of a guard (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'accordion-panel').walkAtRules('media', (at) => {
        at.walkDecls('transition-duration', (decl) => {
          decl.replaceWith({ prop: 'transition-property', value: 'none' })
        })
      })
    })

    expect(guardViolations(css)).not.toEqual([])
  })

  it('reds on a planted nested @media in the title class (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'title').append({ name: 'media', params: '(min-width: 1px)' })
    })

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('@media (min-width: 1px)')]),
    )
  })

  it('reds on a media query planted directly in the layer block (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { @media (min-width: 1px) { .${PREFIX}title { color: red } } }`

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('@media (min-width: 1px)')]),
    )
  })

  it('reds on a sub-layer planted in the layer block, which the layer contract does not allow (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { @layer inner; }`

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('@layer inner')]),
    )
  })

  it("reds when the icon's guard selector is changed to & (control)", () => {
    const css = mutate((root) => {
      classRule(root, 'disclosure-icon').walkAtRules('media', (at) => {
        at.walkRules((rule) => {
          rule.selector = '&'
        })
      })
    })

    expect(guardViolations(css)).not.toEqual([])
  })

  it('reds when the guard is deleted from the switch thumb (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'switch-thumb').walkAtRules('media', (at) => {
        at.remove()
      })
    })

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('switch-thumb')]),
    )
  })

  it('reds on a nested @media (min-width: 1px) planted in popup-fade (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}popup-fade { @media (min-width: 1px) { color: red } } }`

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('@media (min-width: 1px)')]),
    )
  })

  it('reds on a transition-property: none planted inside a guard (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'switch-thumb').walkAtRules('media', (at) => {
        at.walkRules((rule) => {
          rule.append({ prop: 'transition-property', value: 'none' })
        })
      })
    })

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('switch-thumb')]),
    )
  })

  it('reds when the &[data-instant] half is deleted from the popup-motion guard (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'popup-motion').walkAtRules('media', (at) => {
        at.walkRules((rule) => {
          rule.selector = '&'
        })
      })
    })

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('popup-motion'),
        `.${PREFIX}popup-motion &[data-instant] has no guard twin`,
      ]),
    )
  })

  it('reds when a duration planted on &[data-instant] has no twin in its guard (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}switch-thumb { &[data-instant] { transition-duration: var(--nave-motion-duration-instant) } } }`

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([`.${PREFIX}switch-thumb &[data-instant] has no guard twin`]),
    )
  })
})

/**
 * The fourteen attribute names of the first release, admitted wherever a rule keys on them.
 */
const ATTRIBUTES = new Set([
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-invalid',
  'aria-orientation',
  'aria-pressed',
  'data-disabled',
  'data-ending-style',
  'data-nave-size',
  'data-nave-variant',
  'data-orientation',
  'data-placeholder',
  'data-side',
  'data-starting-style',
])

const MOTION_CLASSES = [
  'backdrop',
  'popup-motion',
  'popup-fade',
  'tooltip-motion',
  'tab-indicator-motion',
]

/**
 * What a rule needs to know about where a selector sits to judge the attributes the overlay
 * completion adds: whose rule it is, the selector as resolved, and whether it is inside the guard.
 */
interface Place {
  readonly owner: string
  readonly selector: string
  readonly isInGuard: boolean
}

const isInstantAdmitted = ({ owner, isInGuard }: Place): boolean =>
  [`${PREFIX}popup-motion`, `${PREFIX}tooltip-motion`].includes(owner) ||
  (isInGuard && MOTION_CLASSES.some((name) => owner === `${PREFIX}${name}`))

/**
 * The attributes beyond the fourteen, each with where it may appear.
 */
const SCOPED_ATTRIBUTES: ReadonlyMap<string, (place: Place, node: Attribute) => boolean> = new Map([
  [
    'aria-haspopup',
    ({ owner }, node) =>
      owner === `${PREFIX}combobox-trigger` && node.operator === '=' && node.value === 'dialog',
  ],
  [
    'data-empty',
    ({ owner, selector }) =>
      owner === `${PREFIX}list-empty` && selector === `[data-empty] > .${owner}`,
  ],
  [
    'data-highlighted',
    ({ owner }) => [`${PREFIX}active-option`, `${PREFIX}item-highlight`].includes(owner),
  ],
  ['data-instant', (place) => isInstantAdmitted(place)],
  ['data-invalid', ({ owner }) => owner === `${PREFIX}input-group`],
])
const PSEUDO_CLASSES = new Set([
  ':active',
  ':dir',
  ':disabled',
  ':first-child',
  ':has',
  ':hover',
  ':last-child',
  ':not',
])
const PSEUDO_ELEMENTS = new Set(['::after', '::before', '::placeholder'])

const isRingPseudo = (owner: string, inside: readonly string[]): boolean =>
  focusRingClasses.includes(owner) && inside.length === 0

const isThumbPseudo = (owner: string, inside: readonly string[]): boolean =>
  owner === THUMB && inside.includes(':has')

const isPseudoOutside = (value: string, inside: readonly string[], owner: string): boolean => {
  if (value.startsWith('::')) return !PSEUDO_ELEMENTS.has(value)
  if (PSEUDO_CLASSES.has(value)) return false
  const isFocus = value === ':focus-visible'
  return !(isFocus && (isRingPseudo(owner, inside) || isThumbPseudo(owner, inside)))
}

const isTypeAdmitted = (value: string, inside: readonly string[], owner: string): boolean =>
  (inside.includes(':dir') && ['ltr', 'rtl'].includes(value)) ||
  (value === 'svg' && owner === `${PREFIX}disclosure-icon`)

/**
 * Whether one node of a resolved selector is outside the vocabulary, as the text to report.
 */
const isNodeOutside = ({ node, inside }: SelectorNode, place: Place): boolean => {
  switch (node.type) {
    case 'attribute': {
      const scoped = SCOPED_ATTRIBUTES.get(node.attribute)
      return scoped === undefined ? !ATTRIBUTES.has(node.attribute) : !scoped(place, node)
    }
    case 'class': {
      return node.value !== place.owner
    }
    case 'combinator': {
      return node.value !== '>'
    }
    case 'pseudo': {
      return isPseudoOutside(node.value, inside, place.owner)
    }
    case 'tag': {
      return !isTypeAdmitted(node.value, inside, place.owner)
    }
    default: {
      return ['id', 'nesting', 'string', 'universal'].includes(node.type)
    }
  }
}

/**
 * Every argument of every `:has()` begins with `>`, except `:has(:focus-visible)` on the Slider
 * thumb. A list of arguments is judged one argument at a time.
 */
const unadmittedHasArguments = (selector: string, owner: string): string[] => {
  const found: string[] = []
  selectorParser((root) => {
    root.walkPseudos((pseudo) => {
      if (pseudo.value !== ':has') return
      for (const argument of pseudo.nodes) {
        const text = String(argument).trim()
        const isBounded = argument.first?.type === 'combinator' && argument.first.value === '>'
        const isThumbFocus = text === ':focus-visible' && owner === THUMB
        if (!isBounded && !isThumbFocus) found.push(`:has(${text}) in ${selector}`)
      }
    })
  }).processSync(selector)
  return found
}

const OPEN_GHOST_KEY = `.${PREFIX}button[data-nave-variant="ghost"][aria-expanded="true"]:not(:disabled, [aria-disabled="true"])`

/**
 * `aria-expanded` on the button, outside the one open-ghost key, and with any value but `true`.
 */
const buttonExpandedViolations = (owner: string, selector: string): string[] =>
  selector !== OPEN_GHOST_KEY &&
  owner === `${PREFIX}button` &&
  attributeReads(selector).some((read) => read.name === 'aria-expanded')
    ? [`aria-expanded in ${selector}`]
    : []

/**
 * What AC-27 asserts, as the list of what is wrong.
 */
const vocabularyViolations = (css: string): string[] =>
  flattenRules(css).flatMap((item) =>
    item.selectors.flatMap((selector) => {
      const place: Place = {
        owner: item.owner,
        selector,
        isInGuard: item.atRules.some((rule) => rule.startsWith(`@media ${GUARD_QUERY}`)),
      }
      return [
        ...selectorNodes(selector)
          .filter((entry) => isNodeOutside(entry, place))
          .map((entry) => `${entry.node.toString().trim()} in ${selector}`),
        ...unadmittedHasArguments(selector, item.owner),
        ...buttonExpandedViolations(item.owner, selector),
      ]
    }),
  )

/**
 * The classes with a rule keyed on an attribute, without the prefix.
 */
const ownersKeyedOn = (name: string): string[] =>
  flattenRules(readStylesheet())
    .filter((item) =>
      item.selectors.some((selector) =>
        attributeReads(selector).some((read) => read.name === name),
      ),
    )
    .map((item) => item.owner.replace(PREFIX, ''))

const PLANTED_KEYS = ['[role="menuitem"]', '[dir="rtl"]', '.other']

describe('AC-base-ui-overlay-completion-27 and AC-base-ui-bridge-20: selectors use only the vocabulary, as the overlay completion extends it', () => {
  it('uses only the rule own class, the declared attributes, the admitted pseudo-classes and elements, and the child combinator', () => {
    expect(vocabularyViolations(readStylesheet())).toEqual([])
  })

  it.each(PLANTED_KEYS)('reds on a planted %s key (control)', (key) => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item${key} { color: red } }`

    expect(vocabularyViolations(css)).not.toEqual([])
  })

  it('reds on a descendant combinator, a type selector outside the disclosure icon and an unadmitted pseudo-class', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}item span:focus { color: red } }`

    expect(vocabularyViolations(css).join('\n')).toMatch(/span[\s\S]*:focus/)
  })

  it('reads :focus-visible as admitted only as focusRing on a Table T2 class and in the thumb :has()', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}title:focus-visible { color: red } }`

    expect(vocabularyViolations(css)).toEqual([`:focus-visible in .${PREFIX}title:focus-visible`])
  })

  it('reds on every :has() argument that is not bounded to a direct child, not only the first (control)', () => {
    const selector = `:has(> [aria-invalid="true"], [aria-invalid="true"])`
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}number-field-group { &${selector} { border-color: red } } }`

    expect(vocabularyViolations(css)).toEqual([
      `:has([aria-invalid="true"]) in .${PREFIX}number-field-group${selector}`,
    ])
  })

  it('reds on a type selector inside :dir() that is not a direction (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}tab-indicator { &:dir(span) { left: 0 } } }`

    expect(vocabularyViolations(css)).toEqual([`span in .${PREFIX}tab-indicator:dir(span)`])
  })

  it('keys on data-highlighted, data-instant, data-empty, data-invalid and aria-haspopup only where the criterion admits them', () => {
    expect(new Set(ownersKeyedOn('data-highlighted'))).toEqual(
      new Set(['active-option', 'item-highlight']),
    )
    expect(new Set(ownersKeyedOn('data-instant'))).toEqual(
      new Set(['popup-motion', 'tooltip-motion', ...MOTION_CLASSES]),
    )
    expect(new Set(ownersKeyedOn('data-empty'))).toEqual(new Set(['list-empty']))
    expect(new Set(ownersKeyedOn('data-invalid'))).toEqual(new Set(['input-group']))
    expect(new Set(ownersKeyedOn('aria-haspopup'))).toEqual(new Set(['combobox-trigger']))
  })

  it('keys data-instant outside the guard only in popup-motion and tooltip-motion', () => {
    const outside = flattenRules(readStylesheet())
      .filter((item) => item.atRules.every((rule) => !rule.startsWith('@media')))
      .filter((item) =>
        item.selectors.some((selector) =>
          attributeReads(selector).some((read) => read.name === 'data-instant'),
        ),
      )
      .map((item) => item.owner.replace(PREFIX, ''))

    expect(new Set(outside)).toEqual(new Set(['popup-motion', 'tooltip-motion']))
  })

  it('keys aria-expanded in the button only in the open ghost key, with the value true', () => {
    const keys = flattenRules(readStylesheet())
      .filter((item) => item.owner === `${PREFIX}button`)
      .flatMap((item) => item.selectors)
      .filter((selector) => attributeReads(selector).some((read) => read.name === 'aria-expanded'))

    expect(keys).toEqual([OPEN_GHOST_KEY])
  })

  it('names data-popup-open in no selector', () => {
    const named = flattenRules(readStylesheet()).filter((item) =>
      item.selectors.some((selector) => selector.includes('data-popup-open')),
    )

    expect(named).toEqual([])
  })

  it.each([
    ['item-highlight', '[data-popup-open]'],
    ['title', '[data-highlighted]'],
    ['item', '[data-highlighted]'],
    ['popup-fade', '[data-instant]'],
    ['chip', '[data-invalid]'],
    ['combobox-trigger', '[aria-haspopup="menu"]'],
    ['input-group', '[aria-haspopup="dialog"]'],
    ['list-empty', '[data-empty]'],
    ['button', '[aria-expanded="false"]'],
    ['button', '[data-nave-variant="primary"][aria-expanded="true"]'],
  ])('reds on a planted %s%s key (control)', (name, key) => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}${name} { &${key} { color: red } } }`

    expect(vocabularyViolations(css)).not.toEqual([])
  })

  it('admits data-instant inside the guard of a motion class, and data-empty as an ancestor key (control)', () => {
    const css = `${readStylesheet()}\n@layer components.nave { .${PREFIX}backdrop { @media (prefers-reduced-motion: reduce) { &[data-instant] { color: red } } } .${PREFIX}list-empty { [data-empty] > & { color: red } } }`

    expect(vocabularyViolations(css)).toEqual([])
  })
})
