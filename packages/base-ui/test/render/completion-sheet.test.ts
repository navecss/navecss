import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { deriveState } from '../support/draft-states.ts'
import { flattenRules, readStylesheet } from '../support/stylesheet.ts'
import { declarationsOf, pixels, ringReach, wordsInPixels } from '../support/w6-sheet.ts'

const P = 'nave-base-ui-'

/**
The text of a class's top-level rule, with the class name swapped for a placeholder so two
classes can be compared byte for byte.
 */
const ruleText = (css: string, cls: string): string => {
  let text: string | undefined
  postcss.parse(css).walkRules(`.${cls}`, (rule) => {
    if (rule.parent?.type === 'atrule') {
      text ??= rule.toString().replaceAll(cls, '<class>')
    }
  })
  if (text === undefined) {
    throw new Error(`no rule for .${cls}`)
  }
  return text
}

const isSameRuleText = (css: string): boolean =>
  ruleText(css, `${P}tooltip-motion`) === ruleText(css, `${P}popup-motion`)

/**
The stylesheet with a declaration added first to a class's own rule.
 */
const withDeclaration = (css: string, cls: string, property: string, value: string): string => {
  const root = postcss.parse(css)
  root.walkRules(`.${cls}`, (rule) => {
    rule.prepend({ prop: property, value })
  })
  return root.toString()
}

/**
The stylesheet with every `opacity` of a class's rule (nested keys included) set to another value.
 */
const withOpacity = (css: string, cls: string, value: string): string => {
  const root = postcss.parse(css)
  root.walkRules(`.${cls}`, (rule) => {
    rule.walkDecls('opacity', (declaration) => {
      declaration.value = value
    })
  })
  return root.toString()
}

describe("AC-base-ui-overlay-completion-18: the tooltip fade's rule is the popup's, with the class name swapped", () => {
  it('-tooltip-motion has the same rule text as -popup-motion, byte for byte', () => {
    expect(isSameRuleText(readStylesheet())).toBe(true)
    expect(ruleText(readStylesheet(), `${P}tooltip-motion`).length).toBeGreaterThan(100)
  })

  it('control: changing one value in the tooltip rule, or in the popup rule, reds the comparison', () => {
    const css = readStylesheet()
    expect(ruleText(css, `${P}tooltip-motion`)).toContain('opacity: 0')
    const changedTooltip = withOpacity(css, `${P}tooltip-motion`, '0.5')
    expect(changedTooltip).not.toBe(css)
    expect(isSameRuleText(changedTooltip)).toBe(false)
    const changedPopup = withOpacity(css, `${P}popup-motion`, '0.5')
    expect(changedPopup).not.toBe(css)
    expect(isSameRuleText(changedPopup)).toBe(false)
  })

  it('with the tooltip fade unsigned no -tooltip-motion class or rule exists', () => {
    const css = deriveState(readStylesheet(), ['tooltip-fade'])
    expect(css).not.toContain('tooltip-motion')
    expect(css).toContain(`.${P}tooltip-popup`)
  })
})

describe('AC-base-ui-overlay-completion-17: with the popup fade unsigned neither popup class exists, and no popup class sets a transition', () => {
  it('derives the state without -popup-motion and -popup-fade, and the popup classes set no transition-*', () => {
    const css = deriveState(readStylesheet(), ['popup-fade'])
    expect(css).not.toContain('popup-motion')
    expect(css).not.toContain('popup-fade')
    for (const cls of ['list-popup', 'popover-popup', 'dialog-popup']) {
      expect(declarationsOf(css, `${P}${cls}`).length, `${cls} is styled`).toBeGreaterThan(0)
      expect(
        declarationsOf(css, `${P}${cls}`).filter(({ property }) =>
          property.startsWith('transition'),
        ),
      ).toEqual([])
    }
  })

  it('control: the all-signed state does carry the two motion classes, each setting a transition', () => {
    const css = readStylesheet()
    for (const cls of ['popup-motion', 'popup-fade']) {
      expect(
        declarationsOf(css, `${P}${cls}`).some(({ property }) => property.startsWith('transition')),
      ).toBe(true)
    }
  })
})

describe('AC-base-ui-overlay-completion-25: chip geometry clears the ring', () => {
  const CLASSES = ['chips', 'chip', 'chip-remove'].map((name) => `${P}${name}`)

  it("-chips' padding and gap, resolved, are each at least the ring's width plus its offset", () => {
    const { reach } = ringReach()
    const css = readStylesheet()
    for (const property of ['padding', 'gap']) {
      const words = wordsInPixels(css, `${P}chips`, property)
      expect(words.length, `${property} is declared on -chips`).toBeGreaterThan(0)
      expect(words.filter((word) => word < reach)).toEqual([])
    }
  })

  it('reads the ring from atoms.focusRing and the built tokens: 2px wide and offset 2px today', () => {
    expect(ringReach()).toEqual({ offset: 2, reach: 4, width: 2 })
    expect(pixels('var(--nave-spacing-control-sm)')).toBeGreaterThanOrEqual(ringReach().reach)
  })

  it('no rule of -chips, -chip or -chip-remove declares overflow, overflow-x or overflow-y', () => {
    const css = readStylesheet()
    expect(
      CLASSES.flatMap((cls) =>
        declarationsOf(css, cls)
          .filter(({ property }) => ['overflow', 'overflow-x', 'overflow-y'].includes(property))
          .map(({ property }) => `${cls} ${property}`),
      ),
    ).toEqual([])
  })

  it('control: a chips padding under the ring reach, and an overflow on a chip, are each reported', () => {
    const { reach } = ringReach()
    const planted = withDeclaration(
      withDeclaration(readStylesheet(), `${P}chip`, 'overflow', 'hidden'),
      `${P}chips`,
      'padding',
      '1px',
    )
    // The planted padding comes first in the rule, so it is read before the shipped one.
    expect(wordsInPixels(planted, `${P}chips`, 'padding').filter((word) => word < reach)).toEqual([
      1,
    ])
    expect(
      declarationsOf(planted, `${P}chip`).filter(({ property }) => property === 'overflow'),
    ).toHaveLength(1)
  })
})

const FORBIDDEN = new Set([
  'block-size',
  'clip',
  'clip-path',
  'content',
  'display',
  'height',
  'opacity',
  'overflow',
  'visibility',
])

const propertiesOf = (nodes: readonly { prop?: string; type: string }[]): string[] =>
  nodes.flatMap((node) => (node.type === 'decl' && node.prop !== undefined ? [node.prop] : []))

/**
Where `-list-empty` is wrong, as sentences: it sets only `font-size` and `color` on itself, only
`padding` under `[data-empty] > &`, and none of the properties that would hide it.
 */
const emptyViolations = (css: string): string[] => {
  const rules = flattenRules(css).filter(({ owner }) => owner === `${P}list-empty`)
  const read = (selector: string): string[] =>
    rules
      .filter(({ selectors }) => selectors.includes(selector))
      .flatMap(({ rule }) => propertiesOf(rule.nodes))
  const own = read(`.${P}list-empty`)
  const whenEmpty = read(`[data-empty] > .${P}list-empty`)
  const all = rules.flatMap(({ rule }) => propertiesOf(rule.nodes))
  const others = all.filter((name) => ![...own, ...whenEmpty].includes(name))
  return [
    ...(own.toSorted((a, b) => a.localeCompare(b)).join(',') === 'color,font-size'
      ? []
      : [`own: ${own.join(',')}`]),
    ...(whenEmpty.join(',') === 'padding' ? [] : [`when empty: ${whenEmpty.join(',')}`]),
    ...others.map((name) => `other: ${name}`),
    ...all.filter((name) => FORBIDDEN.has(name)).map((name) => `forbidden: ${name}`),
  ]
}

describe('AC-base-ui-overlay-completion-26: the empty message is padded only when the list is empty, and never hidden', () => {
  it('-list-empty sets only font-size and color, and padding only under [data-empty] > &, and none of the properties that hide it', () => {
    expect(emptyViolations(readStylesheet())).toEqual([])
  })

  it('control: a planted display: none in -list-empty, and a padding at rest, are each reported', () => {
    const css = readStylesheet()
    const hidden = withDeclaration(css, `${P}list-empty`, 'display', 'none')
    expect(hidden).not.toBe(css)
    expect(emptyViolations(hidden)).toEqual(expect.arrayContaining(['forbidden: display']))
    const padded = withDeclaration(css, `${P}list-empty`, 'padding', '0')
    expect(emptyViolations(padded)).not.toEqual([])
  })
})

describe('AC-base-ui-overlay-completion-15: the toolbar gap clears the ring', () => {
  it("-toolbar's gap, resolved from the built tokens, is at least the ring's width plus its offset", () => {
    const { reach } = ringReach()
    const words = wordsInPixels(readStylesheet(), `${P}toolbar`, 'gap')
    expect(words.length).toBeGreaterThan(0)
    expect(words.filter((word) => word < reach)).toEqual([])
  })
})
