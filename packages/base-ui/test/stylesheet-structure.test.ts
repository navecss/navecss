import type { AtRule, ChildNode, Declaration, Root, Rule } from 'postcss'
import type { Attribute } from 'postcss-selector-parser'

import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { describe, expect, it } from 'vitest'

import type { SelectorNode } from './support/selector.ts'

import { buildState } from './support/feedback-build.ts'
import {
  allStatesFeedback,
  DRAFT_CLASSES_FEEDBACK,
  type DraftFeedback,
  DRAFTS_FEEDBACK,
  expectedSheet,
  NEW_CLASSES_FEEDBACK,
  stateKeyFeedback,
} from './support/feedback-states.ts'
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
const mutate = (edit: (root: Root) => void, css: string = readStylesheet()): string => {
  const root = postcss.parse(css)
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

// The one `z-index` the stylesheet may hold (AC-17), as the tuple that admits it: the owner class,
// the property, the value, and the nesting depth. Depth 0 is a direct declaration of the top-level
// class rule, which sits in the `components.nave` layer and nowhere else.
const ADMITTED_Z_INDEX = {
  owner: `${PREFIX}toast-placement`,
  property: 'z-index',
  value: 'var(--nave-layer-toast)',
}

const isComponentsLayer = (node: Rule['parent']): boolean =>
  node?.type === 'atrule' &&
  node.name === 'layer' &&
  node.params === 'components.nave' &&
  node.parent?.type === 'root'

const isTopLevelClassRule = (node: Declaration['parent'], owner: string): boolean =>
  node?.type === 'rule' && node.selector === `.${owner}` && isComponentsLayer(node.parent)

const isAdmittedZIndex = (decl: Declaration): boolean =>
  decl.prop.toLowerCase() === ADMITTED_Z_INDEX.property &&
  decl.value === ADMITTED_Z_INDEX.value &&
  isTopLevelClassRule(decl.parent, ADMITTED_Z_INDEX.owner)

const whereIs = (decl: Declaration): string =>
  decl.parent?.type === 'rule' ? decl.parent.selector : 'a rule-less place'

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
    // A property name is ASCII case-insensitive, so `Z-INDEX` is a z-index too.
    const property = decl.prop.toLowerCase()
    if (property === 'isolation') problems.push(`property ${decl.prop} in ${whereIs(decl)}`)
    if (property === 'z-index' && !isAdmittedZIndex(decl)) {
      problems.push(`property ${decl.prop} in ${whereIs(decl)}`)
    }
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

describe('AC-base-ui-feedback-navigation-17, AC-base-ui-overlay-completion-20 and AC-base-ui-bridge-18: the stylesheet is components-only, its order statement is live and first, and it holds one z-index', () => {
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
        'property z-index in :root',
        'property isolation in :root',
        '@keyframes',
        'selector :root',
      ]),
    )
  })
})

const zIndexes = (css: string): string[] =>
  flatten(css)
    .filter((item) => item.property.toLowerCase() === 'z-index')
    .map((item) => `${item.owner} ${item.selectors.length} ${item.value}`)

const isolations = (css: string): string[] =>
  flatten(css)
    .filter((item) => item.property.toLowerCase() === 'isolation')
    .map((item) => item.owner)

/**
 * The oracle sheet (Appendix C, every draft signed) with a rule or a declaration planted, to give
 * the controls a state that holds the admitted tuple.
 */
const plantedFeedback = (edit: (root: Root) => void): string => mutate(edit, expectedSheet())

const placement = (root: Root): Rule => classRule(root, 'toast-placement')

describe('AC-base-ui-feedback-navigation-17: exactly one z-index, on one criterion', () => {
  it('has, with placement signed, the one z-index of toast-placement as a direct declaration of its rule, and no isolation', () => {
    const css = readStylesheet()

    expect(zIndexes(css)).toEqual([`${PREFIX}toast-placement 1 var(--nave-layer-toast)`])
    expect(isolations(css)).toEqual([])
    expect(componentsOnlyViolations(css)).toEqual([])
  })

  it('has, with placement unsigned, no z-index and no isolation at all', async () => {
    const css = await buildState(['toast-placement'])

    expect(zIndexes(css)).toEqual([])
    expect(isolations(css)).toEqual([])
    expect(componentsOnlyViolations(css)).toEqual([])
    expect(css).not.toContain('toast-placement')
  })

  it('admits the tuple (owner toast-placement, z-index, var(--nave-layer-toast), depth 0) in the expected sheet, and reports nothing there (positive control)', () => {
    const oracle = expectedSheet()

    expect(zIndexes(oracle)).toEqual([`${PREFIX}toast-placement 1 var(--nave-layer-toast)`])
    expect(componentsOnlyViolations(oracle)).toEqual([])
    expect(componentsOnlyViolations(expectedSheet([], [...DRAFTS_FEEDBACK]))).toEqual([])
    expect(zIndexes(expectedSheet([], ['toast-placement']))).toEqual([])
  })

  it.each([
    [
      'the same declaration in toast-root',
      (root: Root) =>
        classRule(root, 'toast-root').append({ prop: 'z-index', value: 'var(--nave-layer-toast)' }),
      [`property z-index in .${PREFIX}toast-root`],
    ],
    [
      'z-index: 501 in toast-placement',
      (root: Root) => placement(root).append({ prop: 'z-index', value: '501' }),
      [`property z-index in .${PREFIX}toast-placement`],
    ],
    [
      'z-index: var(--nave-layer-modal) in toast-placement',
      (root: Root) => placement(root).append({ prop: 'z-index', value: 'var(--nave-layer-modal)' }),
      [`property z-index in .${PREFIX}toast-placement`],
    ],
    [
      'the admitted declaration nested in a child rule of toast-placement',
      (root: Root) =>
        placement(root).append({
          selector: '&[data-x]',
          nodes: [{ prop: 'z-index', value: 'var(--nave-layer-toast)' }],
        }),
      ['property z-index in &[data-x]'],
    ],
    [
      'a z-index in the toast-fade rule of the viewport',
      (root: Root) => classRule(root, 'toast-viewport').append({ prop: 'z-index', value: 'auto' }),
      [`property z-index in .${PREFIX}toast-viewport`],
    ],
    [
      'an upper-case Z-Index in toast-root (a property name is case-insensitive)',
      (root: Root) =>
        classRule(root, 'toast-root').append({ prop: 'Z-Index', value: 'var(--nave-layer-toast)' }),
      [`property Z-Index in .${PREFIX}toast-root`],
    ],
    [
      'an upper-case ISOLATION in toast-placement',
      (root: Root) => placement(root).append({ prop: 'ISOLATION', value: 'isolate' }),
      [`property ISOLATION in .${PREFIX}toast-placement`],
    ],
    [
      'an isolation in toast-placement',
      (root: Root) => placement(root).append({ prop: 'isolation', value: 'isolate' }),
      [`property isolation in .${PREFIX}toast-placement`],
    ],
  ] as const)('reds on %s, and on nothing else (control)', (_name, edit, expected) => {
    const css = plantedFeedback(edit)

    expect(css).not.toBe(expectedSheet())
    expect(componentsOnlyViolations(css)).toEqual(expected)
  })

  it('reds on the existing :root { z-index: 1 } plant, which is not the admitted tuple (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { :root { z-index: 1 } }`

    expect(componentsOnlyViolations(css)).toEqual(
      expect.arrayContaining(['property z-index in :root', 'selector :root']),
    )
  })

  it('reds on the admitted declaration planted in a stylesheet that has a media query around it (control)', () => {
    const css = plantedFeedback((root) => {
      placement(root).append({
        name: 'media',
        params: '(min-width: 1px)',
        nodes: [{ prop: 'z-index', value: 'var(--nave-layer-toast)' }],
      })
    })

    expect(componentsOnlyViolations(css)).toEqual(['property z-index in a rule-less place'])
    expect(zIndexes(css)).toHaveLength(2)
  })

  it.each(allStatesFeedback().map((unsigned) => [stateKeyFeedback(unsigned), unsigned] as const))(
    'holds the one z-index in the state with %s unsigned exactly when placement is signed (the positive control for the unsigned reading)',
    (_key, unsigned) => {
      const found = zIndexes(expectedSheet([], unsigned))

      expect(found).toEqual(
        unsigned.includes('toast-placement')
          ? []
          : [`${PREFIX}toast-placement 1 var(--nave-layer-toast)`],
      )
    },
  )
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
 * release's four transitioning classes, the five motion classes of the overlay completion, and the
 * Navigation Menu icon with the two fades of the feedback and navigation spec (`toast fade` and `panel fade`),
 * each of whose guard names `&` only. Twelve with every draft signed.
 */
const GUARDED: ReadonlyMap<string, string> = new Map([
  [`.${PREFIX}accordion-panel`, '&'],
  [`.${PREFIX}backdrop`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}collapsible-panel`, '&'],
  [`.${PREFIX}disclosure-icon`, '& > svg:last-child'],
  [`.${PREFIX}navigation-menu-fade`, '&'],
  [`.${PREFIX}navigation-menu-icon`, '&'],
  [`.${PREFIX}popup-fade`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}popup-motion`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}switch-thumb`, '&'],
  [`.${PREFIX}tab-indicator-motion`, MOTION_GUARD_SELECTOR],
  [`.${PREFIX}toast-fade`, '&'],
  [`.${PREFIX}tooltip-motion`, MOTION_GUARD_SELECTOR],
])

/**
 * The guarded classes of a state: the two fades go with their drafts.
 */
const guardedIn = (unsigned: readonly string[]): ReadonlyMap<string, string> =>
  new Map(
    [...GUARDED].filter(
      ([owner]) =>
        !unsigned
          .flatMap((draft) => DRAFT_CLASSES_FEEDBACK[draft as DraftFeedback] ?? [])
          .includes(owner.slice(1)),
    ),
  )

const strayAtRules = (nested: Nested[], guarded: ReadonlyMap<string, string> = GUARDED): string[] =>
  nested.flatMap(({ at, owner }) => {
    if (at.name !== 'media' || at.params !== GUARD_QUERY) {
      return [`nested at-rule @${at.name} ${at.params} in ${owner}`]
    }
    return guarded.has(owner) ? [] : [`a guard in ${owner}`]
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

const guardShapes = (nested: Nested[], guarded: ReadonlyMap<string, string> = GUARDED): string[] =>
  guarded
    .entries()
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
const guardViolations = (css: string, guarded: ReadonlyMap<string, string> = GUARDED): string[] => {
  const root = postcss.parse(css)
  const nested = nestedAtRules(root)
  return [
    ...strayAtRules(nested, guarded),
    ...guardShapes(nested, guarded),
    ...unguardedDurations(root),
  ]
}

describe('AC-base-ui-feedback-navigation-36, AC-base-ui-overlay-completion-20 and AC-base-ui-bridge-18: the only nested at-rule is the reduced-motion guard, in its duration form', () => {
  it('is exactly one guard in each of the twelve guarded classes, and every duration has its twin', () => {
    expect(guardViolations(readStylesheet())).toEqual([])
  })

  it('has twelve nested at-rules: the four of the first release, the five motion classes, the Navigation Menu icon and the two fades', () => {
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

  it.each(allStatesFeedback().map((unsigned) => [stateKeyFeedback(unsigned), unsigned] as const))(
    'has a guard in each class the state with %s unsigned ships: twelve, eleven with one of toast fade and panel fade unsigned, ten with both',
    async (_key, unsigned) => {
      const css = await buildState(unsigned)
      const nested = nestedAtRules(postcss.parse(css))
      const count =
        10 +
        (unsigned.includes('toast-fade') ? 0 : 1) +
        (unsigned.includes('navigation-menu-fade') ? 0 : 1)

      expect(nested).toHaveLength(count)
      expect(guardViolations(css, guardedIn(unsigned))).toEqual([])
    },
  )

  it('counts twelve, eleven and ten guards in the expected sheets of the states the criterion names (the positive control for the counts above)', () => {
    const counts = [
      [],
      ['toast-fade'],
      ['navigation-menu-fade'],
      ['toast-fade', 'navigation-menu-fade'],
    ].map(
      (unsigned) =>
        nestedAtRules(postcss.parse(expectedSheet([], unsigned as DraftFeedback[]))).length,
    )

    expect(counts).toEqual([12, 11, 11, 10])
  })

  it('writes the guard of toast-fade, navigation-menu-fade and navigation-menu-icon as one rule, `&`, holding the one declaration', () => {
    const nested = nestedAtRules(postcss.parse(readStylesheet()))
    const mine = nested.filter(({ owner }) =>
      [
        `.${PREFIX}navigation-menu-fade`,
        `.${PREFIX}navigation-menu-icon`,
        `.${PREFIX}toast-fade`,
      ].includes(owner),
    )

    expect(mine).toHaveLength(3)
    expect(
      mine.map((item) => item.at.nodes?.map((node) => (node.type === 'rule' ? node.selector : ''))),
    ).toEqual(mine.map(() => ['&']))
    const guarded = new Map(mine.map((item) => [item.owner, '&']))

    expect(guardShapes(mine, guarded)).toEqual([])
  })

  it('sets a duration outside the guard only at `&` in the three classes, and the exit key of navigation-menu-fade sets transition-property: none and no duration', () => {
    const found = flatten(readStylesheet()).filter((item) =>
      [
        `${PREFIX}navigation-menu-fade`,
        `${PREFIX}navigation-menu-icon`,
        `${PREFIX}toast-fade`,
      ].includes(item.owner),
    )
    const setters = found.filter(
      (item) => item.property === 'transition-duration' && item.atRules.length === 1,
    )
    const exit = found.filter(
      (item) =>
        item.owner === `${PREFIX}navigation-menu-fade` &&
        item.selectors[1] === '&[data-ending-style]',
    )

    expect(new Set(setters.map((item) => item.owner))).toEqual(
      new Set([
        `${PREFIX}navigation-menu-fade`,
        `${PREFIX}navigation-menu-icon`,
        `${PREFIX}toast-fade`,
      ]),
    )
    expect(setters.filter((item) => item.selectors.length !== 1)).toEqual([])
    expect(exit.map((item) => `${item.property}: ${item.value}`)).toEqual([
      'transition-property: none',
    ])
  })

  it('reds on the guard deleted from navigation-menu-icon (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'navigation-menu-icon').walkAtRules('media', (at) => {
        at.remove()
      })
    }, expectedSheet())

    expect(guardViolations(expectedSheet())).toEqual([])
    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('navigation-menu-icon')]),
    )
  })

  it('reds on a transition-duration planted under the exit key of toast-fade, a setter with no twin (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'toast-fade').append({
        selector: '&[data-ending-style]',
        nodes: [{ prop: 'transition-duration', value: 'var(--nave-motion-duration-instant)' }],
      })
    }, expectedSheet())

    expect(guardViolations(css)).toEqual([
      `.${PREFIX}toast-fade &[data-ending-style] has no guard twin`,
    ])
  })

  it('reds on a transition-property: none planted inside the guard of toast-fade (control)', () => {
    const css = mutate((root) => {
      classRule(root, 'toast-fade').walkAtRules('media', (at) => {
        at.walkRules((rule) => {
          rule.append({ prop: 'transition-property', value: 'none' })
        })
      })
    }, expectedSheet())

    expect(guardViolations(css)).toEqual(
      expect.arrayContaining([expect.stringContaining('toast-fade')]),
    )
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

const isCurrentPage = (owner: string, node: Attribute): boolean =>
  owner === `${PREFIX}current-link` && node.operator === '=' && node.value === 'page'

const isInstantAdmitted = ({ owner, isInGuard }: Place): boolean =>
  [`${PREFIX}popup-motion`, `${PREFIX}tooltip-motion`].includes(owner) ||
  (isInGuard && MOTION_CLASSES.some((name) => owner === `${PREFIX}${name}`))

/**
 * The attributes beyond the fourteen, each with where it may appear.
 */
const SCOPED_ATTRIBUTES: ReadonlyMap<
  string,
  (place: Place, node: Attribute, inside: readonly string[]) => boolean
> = new Map([
  // The six names the feedback and navigation spec adds, each where AC-37 admits it.
  ['aria-current', ({ owner }, node) => isCurrentPage(owner, node)],
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
  ['data-has-overflow-x', ({ owner }) => owner === `${PREFIX}scroll-area-viewport`],
  ['data-has-overflow-y', ({ owner }) => owner === `${PREFIX}scroll-area-viewport`],
  [
    'data-highlighted',
    ({ owner }) => [`${PREFIX}active-option`, `${PREFIX}item-highlight`].includes(owner),
  ],
  ['data-indeterminate', ({ owner }) => owner === `${PREFIX}value-bar-indicator`],
  ['data-instant', (place) => isInstantAdmitted(place)],
  ['data-invalid', ({ owner }) => owner === `${PREFIX}input-group`],
  ['data-limited', ({ owner }) => owner === `${PREFIX}toast-limit`],
  [
    'data-swipe-direction',
    ({ owner }, _node, inside) => owner === `${PREFIX}toast-fade` && inside.includes(':not'),
  ],
])

/**
 * The six attribute names this spec adds to the stylesheet's attribute vocabulary (AC-20).
 */
const ADDED_ATTRIBUTES = [
  'aria-current',
  'data-has-overflow-x',
  'data-has-overflow-y',
  'data-indeterminate',
  'data-limited',
  'data-swipe-direction',
]
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
      return scoped === undefined ? !ATTRIBUTES.has(node.attribute) : !scoped(place, node, inside)
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
 * What no selector of a feedback class names (AC-37): `:has()`, and the attributes that are either
 * Base UI's deck and swipe state (`data-expanded`, `data-behind`, `data-swiping`, `data-type`),
 * another part's (`data-side`, `data-instant`, `data-active`, `data-popup-open`, `data-pressed`),
 * or a disabled state (`data-disabled`).
 */
const FORBIDDEN_IN_NEW = new Set([
  'data-active',
  'data-behind',
  'data-disabled',
  'data-expanded',
  'data-instant',
  'data-popup-open',
  'data-pressed',
  'data-side',
  'data-swiping',
  'data-type',
])

const newClassProblems = (owner: string, selector: string): string[] =>
  NEW_CLASSES_FEEDBACK.includes(owner)
    ? selectorNodes(selector)
        .filter(
          ({ node }) =>
            (node.type === 'attribute' && FORBIDDEN_IN_NEW.has(node.attribute)) ||
            (node.type === 'pseudo' && node.value === ':has'),
        )
        .map(({ node }) => `${node.toString().trim()} named in ${selector}`)
    : []

/**
 * `aria-expanded` in a feedback class is the parent key of the icon and nothing else.
 */
const iconExpandedViolations = (owner: string, selector: string): string[] =>
  NEW_CLASSES_FEEDBACK.includes(owner) &&
  owner !== `${PREFIX}navigation-menu-icon` &&
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
        ...newClassProblems(item.owner, selector),
        ...iconExpandedViolations(item.owner, selector),
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

describe('AC-base-ui-feedback-navigation-37, AC-base-ui-overlay-completion-27 and AC-base-ui-bridge-20: selectors use only the vocabulary, as the overlay completion and the feedback and navigation spec extend it', () => {
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

  it('admits the fourteen attribute names, overlay five scoped ones and this spec six scoped ones: the vocabulary gains exactly the six names', () => {
    const scoped = SCOPED_ATTRIBUTES.keys().toArray().toSorted(byText)

    expect(ATTRIBUTES.size).toBe(14)
    expect(ADDED_ATTRIBUTES.toSorted(byText)).toEqual([
      'aria-current',
      'data-has-overflow-x',
      'data-has-overflow-y',
      'data-indeterminate',
      'data-limited',
      'data-swipe-direction',
    ])
    expect(scoped.filter((name) => !ADDED_ATTRIBUTES.includes(name))).toEqual([
      'aria-haspopup',
      'data-empty',
      'data-highlighted',
      'data-instant',
      'data-invalid',
    ])
    expect(scoped).toHaveLength(11)
    expect(ADDED_ATTRIBUTES.filter((name) => ATTRIBUTES.has(name))).toEqual([])
  })

  it('keys data-limited only in toast-limit, aria-current only in current-link with the value page, data-indeterminate only in value-bar-indicator, and data-has-overflow-x and -y only in scroll-area-viewport', () => {
    const css = readStylesheet()
    const keyed = (name: string): string[] =>
      flattenRules(css)
        .filter((item) =>
          item.selectors.some((selector) =>
            attributeReads(selector).some((read) => read.name === name),
          ),
        )
        .map((item) => item.owner)

    expect(new Set(keyed('data-limited'))).toEqual(new Set([`${PREFIX}toast-limit`]))
    expect(new Set(keyed('aria-current'))).toEqual(new Set([`${PREFIX}current-link`]))
    expect(new Set(keyed('data-indeterminate'))).toEqual(new Set([`${PREFIX}value-bar-indicator`]))
    expect(new Set(keyed('data-has-overflow-x'))).toEqual(
      new Set([`${PREFIX}scroll-area-viewport`]),
    )
    expect(new Set(keyed('data-has-overflow-y'))).toEqual(
      new Set([`${PREFIX}scroll-area-viewport`]),
    )
    expect(
      flattenRules(css)
        .flatMap((item) => item.selectors)
        .flatMap((selector) => attributeReads(selector))
        .filter((read) => read.name === 'aria-current')
        .map((read) => `${read.operator}${read.value}`),
    ).toEqual(['=page'])
  })

  it('keys data-swipe-direction only inside :not() in toast-fade', () => {
    const reads = flattenRules(readStylesheet()).flatMap((item) =>
      item.selectors.flatMap((selector) =>
        attributeReads(selector)
          .filter((read) => read.name === 'data-swipe-direction')
          .map((read) => `${item.owner} ${read.inside.join(' ')}`),
      ),
    )

    expect(reads).toEqual([`${PREFIX}toast-fade :not`])
  })

  it('keys data-orientation in scroll-area-scrollbar and scroll-area-thumb, data-starting-style and data-ending-style in toast-fade and navigation-menu-fade, and aria-expanded in the feedback classes only as the parent key of the icon', () => {
    const owners = (name: string): Set<string> =>
      new Set(
        flattenRules(readStylesheet())
          .filter((item) =>
            item.selectors.some((selector) =>
              attributeReads(selector).some((read) => read.name === name),
            ),
          )
          .map((item) => item.owner)
          .filter((owner) => NEW_CLASSES_FEEDBACK.includes(owner)),
      )
    const expanded = flattenRules(readStylesheet())
      .filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner))
      .flatMap((item) => item.selectors)
      .filter((selector) => attributeReads(selector).some((read) => read.name === 'aria-expanded'))

    expect(owners('data-orientation')).toEqual(
      new Set([`${PREFIX}scroll-area-scrollbar`, `${PREFIX}scroll-area-thumb`]),
    )
    expect(owners('data-starting-style')).toEqual(
      new Set([`${PREFIX}navigation-menu-fade`, `${PREFIX}toast-fade`]),
    )
    expect(owners('data-ending-style')).toEqual(
      new Set([`${PREFIX}navigation-menu-fade`, `${PREFIX}toast-fade`]),
    )
    expect(expanded).toEqual([`[aria-expanded="true"] > .${PREFIX}navigation-menu-icon`])
  })

  it('names, in no feedback class, :has(), data-side, data-active, data-popup-open, data-pressed, data-disabled, data-instant, data-expanded, data-behind, data-swiping or data-type', () => {
    const problems = flattenRules(readStylesheet())
      .filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner))
      .flatMap((item) =>
        item.selectors.flatMap((selector) => newClassProblems(item.owner, selector)),
      )

    expect(NEW_CLASSES_FEEDBACK).toHaveLength(21)
    expect(
      flattenRules(readStylesheet()).filter((item) => NEW_CLASSES_FEEDBACK.includes(item.owner))
        .length,
    ).toBeGreaterThan(20)
    expect(problems).toEqual([])
  })

  it('has no violation in the expected sheet, which holds every class of the block (positive control for the three below)', () => {
    expect(vocabularyViolations(expectedSheet())).toEqual([])
  })

  it.each([
    [
      'a planted &:has(> [data-side]) in toast-placement',
      'toast-placement',
      '&:has(> [data-side])',
    ],
    [
      'a planted &[data-swipe-direction] outside :not() in toast-fade',
      'toast-fade',
      '&[data-swipe-direction]',
    ],
    ['a planted &[data-active] in current-link', 'current-link', '&[data-active]'],
    ['a planted &[data-limited] in toast-root', 'toast-root', '&[data-limited]'],
    [
      'a planted &[aria-current="false"] in current-link',
      'current-link',
      '&[aria-current="false"]',
    ],
    [
      'a planted &[data-popup-open] in navigation-menu-trigger',
      'navigation-menu-trigger',
      '&[data-popup-open]',
    ],
    [
      'a planted &[aria-expanded="true"] in navigation-menu-trigger',
      'navigation-menu-trigger',
      '&[aria-expanded="true"]',
    ],
  ])('reds on %s (control)', (_name, owner, key) => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}${owner} { ${key} { color: red } } }`

    expect(vocabularyViolations(css)).not.toEqual([])
    expect(vocabularyViolations(css).join('\n')).toContain(key.replaceAll('&', ''))
  })
})
