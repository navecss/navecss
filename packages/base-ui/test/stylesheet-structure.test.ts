import type { AtRule, ChildNode, Root, Rule } from 'postcss'

import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { describe, expect, it } from 'vitest'

import type { SelectorNode } from './support/selector.ts'

import { isFocusRingBase, THUMB } from './support/focus.ts'
import { selectorNodes } from './support/selector.ts'
import { flatten, flattenRules, readStylesheet } from './support/stylesheet.ts'
import { focusRingClasses } from './support/table-p.ts'
import { firstOrderStatement, workspaceTokensCss } from './support/tokens.ts'

const PREFIX = 'nave-base-ui-'
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

describe('AC-base-ui-bridge-18: the stylesheet is components-only, and its order statement is live and first', () => {
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

const GUARDED: ReadonlyMap<string, string> = new Map([
  [`.${PREFIX}accordion-panel`, '&'],
  [`.${PREFIX}collapsible-panel`, '&'],
  [`.${PREFIX}disclosure-icon`, '& > svg:last-child'],
  [`.${PREFIX}switch-thumb`, '&'],
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
 * Every transition-duration outside a guard needs its twin selector in its own class's guard.
 */
const unguardedDurations = (root: Root): string[] => {
  const twins = new Map<string, Set<string>>()
  for (const { at, owner } of nestedAtRules(root)) {
    const selectors = twins.get(owner) ?? new Set<string>()
    at.walkRules((rule) => {
      selectors.add(rule.selector)
    })
    twins.set(owner, selectors)
  }
  return flatten(root.toString())
    .filter((item) => item.property === 'transition-duration' && item.atRules.length === 1)
    .map((item) => ({ own: `.${item.owner}`, relative: item.selectors[1] ?? '&' }))
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

describe('AC-base-ui-bridge-18: the only nested at-rule is the reduced-motion guard, in its duration form', () => {
  it('is exactly one guard in each of the four transitioning classes, and every duration has its twin', () => {
    expect(guardViolations(readStylesheet())).toEqual([])
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
})

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
const isNodeOutside = ({ node, inside }: SelectorNode, owner: string): boolean => {
  switch (node.type) {
    case 'attribute': {
      return !ATTRIBUTES.has(node.attribute)
    }
    case 'class': {
      return node.value !== owner
    }
    case 'combinator': {
      return node.value !== '>'
    }
    case 'pseudo': {
      return isPseudoOutside(node.value, inside, owner)
    }
    case 'tag': {
      return !isTypeAdmitted(node.value, inside, owner)
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

/**
 * What AC-20 asserts, as the list of what is wrong.
 */
const vocabularyViolations = (css: string): string[] =>
  flattenRules(css).flatMap((item) =>
    item.selectors.flatMap((selector) => [
      ...selectorNodes(selector)
        .filter((entry) => isNodeOutside(entry, item.owner))
        .map((entry) => `${entry.node.toString().trim()} in ${selector}`),
      ...unadmittedHasArguments(selector, item.owner),
    ]),
  )

const PLANTED_KEYS = ['[role="menuitem"]', '[dir="rtl"]', '.other']

describe('AC-base-ui-bridge-20: selectors use only the vocabulary', () => {
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

  it('has the base outline declaration of focusRing only on Table T2 classes (cross-check)', () => {
    const owners = flatten(readStylesheet())
      .filter((item) => isFocusRingBase(item))
      .map((item) => item.owner)

    expect(new Set(owners)).toEqual(new Set(focusRingClasses))
  })
})
