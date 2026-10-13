import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Adjacency } from '../../src/theming/adjacency-source.ts'

import { ADJACENCY, ADJACENCY_EXCLUSIONS } from '../../src/theming/adjacency-source.ts'
import {
  assertNoTranslucentSlotInDeclaredPair,
  assertShippedSurfaceCountProvenance,
  shippedSurfaces,
} from '../../src/theming/adjacency.ts'
import { SLOT_DESCRIPTIONS } from '../../src/theming/descriptions.ts'
import {
  ACHROMATIC_MAPPING,
  CHROMATIC_MAPPING,
  SEMANTIC_SLOTS,
  type SlotMapping,
} from '../../src/theming/semantics.ts'

/**
 * The tokens the Base UI overlay components paint with: the highlight fill every list item and
 * ghost button takes under the pointer or keyboard, and the scrim behind a modal panel. They
 * ship in their own release, ahead of the package that paints them, because the package's peer
 * range names this tokens version as its floor.
 */

const here = import.meta.dirname
const builtCss = readFileSync(path.resolve(here, '../../dist/tokens.css'), 'utf8')
const builtDts = readFileSync(path.resolve(here, '../../dist/tokens.d.ts'), 'utf8')
const tokensJson = JSON.parse(readFileSync(path.resolve(here, '../../tokens.json'), 'utf8')) as {
  $extensions: {
    'dev.navecss.theming': {
      adjacency: Record<string, { against: string; class: string }[] | string>
    }
  }
}
const declared = tokensJson.$extensions['dev.navecss.theming'].adjacency

const declaredPairs = Object.entries(declared).flatMap(([subject, entry]) =>
  Array.isArray(entry) ? entry.map((pair) => ({ subject, ...pair })) : [],
)

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

const HIGHLIGHT_DESCRIPTION =
  'Fill for a control under the pointer, the keyboard or a press: a highlighted list or menu item, or a ghost button. Never the only cue for focus or for a state such as selected, checked, open or current, and not for disabled controls.'
const SCRIM_DESCRIPTION =
  'Translucent layer between a modal panel and the page, which it recedes. Only behind a fully modal panel; never under text, a control or a focus indicator the reader can reach.'
const SCRIM_EXCLUSION_REASON =
  'scrim: excluded from the checked pair set because it is translucent, so the colour it renders is a blend with whatever the page shows beneath it, which no pair in this list can describe. The exclusion holds only while the scrim is painted behind a fully modal panel, over a page the reader cannot reach; it is void the moment text, a control or a focus indicator the reader can reach is drawn on it.'

const HIGHLIGHT_LINE =
  '    --nave-color-action-highlight: light-dark(oklch(from var(--nave-color-tint) 0.965 0.0067 h / 1), oklch(from var(--nave-color-tint) 0.37 0.0067 h / 1));'
const SCRIM_LINE =
  '    --nave-color-backdrop-modal: light-dark(oklch(from var(--nave-color-tint) 0.12 0.0067 h / 0.3), oklch(from var(--nave-color-tint) 0.12 0.0067 h / 0.6));'

const cssLines = builtCss.split('\n')
const lineAfter = (anchor: string): string | undefined =>
  cssLines[cssLines.findIndex((line) => line.startsWith(`    ${anchor}:`)) + 1]

/**
 * The math functions whose `/` is a division inside a channel, not the alpha separator.
 */
const MATH_FUNCTION =
  /^(?:abs|a?(?:cos|sin|tan)|atan2|calc|clamp|exp|hypot|log|max|min|mod|pow|rem|round|sign|sqrt)$/

/**
 * Where the alpha that starts at `from` ends: its colour function's closing parenthesis, or
 * the end of the value.
 */
function alphaEnd(value: string, from: number): number {
  let depth = 0
  for (let at = from; at < value.length; at++) {
    if (value[at] === '(') depth++
    else if (value[at] === ')') {
      if (depth === 0) return at
      depth--
    }
  }
  return value.length
}

/**
 * Every alpha in a value: the text after each `/` that is not a division inside a math
 * function.
 */
function alphasOf(value: string): string[] {
  const alphas: string[] = []
  const openFunctions: string[] = []
  for (let at = 0; at < value.length; at++) {
    if (value[at] === '(') {
      openFunctions.push(/([\w-]*)\s*$/.exec(value.slice(0, at))?.[1]?.toLowerCase() ?? '')
    } else if (value[at] === ')') {
      openFunctions.pop()
    } else if (value[at] === '/' && !MATH_FUNCTION.test(openFunctions.at(-1) ?? '')) {
      alphas.push(value.slice(at + 1, alphaEnd(value, at + 1)).trim())
    }
  }
  return alphas
}

/**
 * Whether an alpha is a plain number of at least 1, or a percentage of at least 100%. Anything
 * else (a smaller number, `none`, `calc()`, `var()`) counts as not opaque.
 */
function isOpaqueAlpha(alpha: string): boolean {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%?)$/i.exec(alpha)
  return match !== null && Number(match[1]) / (match[2] ? 100 : 1) >= 1
}

/**
 * Whether a declaration's value is, or may be, translucent: the keyword `transparent` in any
 * case, or any alpha that is not provably opaque.
 */
function isTranslucentValue(value: string): boolean {
  return /transparent/i.test(value) || alphasOf(value).some((alpha) => !isOpaqueAlpha(alpha))
}

/**
 * The names of the `--nave-color-*` declarations in `css`, at any indent, whose value is
 * translucent. Comments are ignored; a value runs to its `;` or to the closing `}`.
 */
function translucentColorProperties(css: string): string[] {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/(--nave-color-[\w-]+)\s*:([^;}]*)/g)
    .filter((match) => isTranslucentValue(match[2] ?? ''))
    .map((match) => match[1] ?? '')
    .toArray()
}

const declaredAgainstContent = (slot: string): Adjacency[] => [
  { subject: 'content.primary', against: slot, class: 'text' },
]

const isSurface = (slot: string): boolean => slot.startsWith('surface.')

const surfaceOverlayWithAlpha = (alpha: number): Record<string, SlotMapping> => ({
  ...CHROMATIC_MAPPING,
  'surface.overlay': {
    light: { scale: 'neutral', step: 0, alpha },
    dark: { scale: 'neutral', step: 800 },
  },
})

describe('AC-base-ui-overlay-completion-35 covers: R16 (the tokens release)', () => {
  it('maps action.highlight to neutral 100 light and neutral 700 dark, directly after action.secondary', () => {
    expect(CHROMATIC_MAPPING['action.highlight']).toEqual({
      light: { scale: 'neutral', step: 100 },
      dark: { scale: 'neutral', step: 700 },
    })
    const at = SEMANTIC_SLOTS.indexOf('action.highlight')
    expect(at).toBeGreaterThan(-1)
    expect(SEMANTIC_SLOTS[at - 1]).toBe('action.secondary')
  })

  it('maps backdrop.modal to neutral 950 at alpha 0.3 light and 0.6 dark, last', () => {
    expect(CHROMATIC_MAPPING['backdrop.modal']).toEqual({
      light: { scale: 'neutral', step: 950, alpha: 0.3 },
      dark: { scale: 'neutral', step: 950, alpha: 0.6 },
    })
    expect(SEMANTIC_SLOTS.at(-1)).toBe('backdrop.modal')
    expect(SEMANTIC_SLOTS.at(-2)).toBe('on-feedback.info')
  })

  it('emits both custom properties byte for byte, in their places', () => {
    expect(cssLines.filter((line) => line === HIGHLIGHT_LINE)).toHaveLength(1)
    expect(cssLines.filter((line) => line === SCRIM_LINE)).toHaveLength(1)
    expect(cssLines[cssLines.indexOf(HIGHLIGHT_LINE) - 1]).toMatch(
      /^ {4}--nave-color-action-secondary:/,
    )
    expect(cssLines[cssLines.indexOf(SCRIM_LINE) - 1]).toMatch(
      /^ {4}--nave-color-on-feedback-info:/,
    )
    expect(lineAfter('--nave-color-backdrop-modal')).toBe('  }')
  })

  it("holds action.highlight's description by length, hash and containment", () => {
    expect(Buffer.byteLength(HIGHLIGHT_DESCRIPTION)).toBe(233)
    expect(sha(HIGHLIGHT_DESCRIPTION)).toBe('2b2c71314db6d2c3')
    expect(SLOT_DESCRIPTIONS.get('action.highlight')).toBe(HIGHLIGHT_DESCRIPTION)
  })

  it("holds backdrop.modal's description and exclusion reason by length, hash and containment", () => {
    expect(Buffer.byteLength(SCRIM_DESCRIPTION)).toBe(175)
    expect(sha(SCRIM_DESCRIPTION)).toBe('fd9537d4d9493157')
    expect(SLOT_DESCRIPTIONS.get('backdrop.modal')).toBe(SCRIM_DESCRIPTION)

    expect(Buffer.byteLength(SCRIM_EXCLUSION_REASON)).toBe(399)
    expect(sha(SCRIM_EXCLUSION_REASON)).toBe('48b2639141f68ee5')
    expect(ADJACENCY_EXCLUSIONS['backdrop.modal']).toBe(SCRIM_EXCLUSION_REASON)
  })

  it('gains exactly the two text triples, appended last to content.primary and content.secondary', () => {
    const tail = { against: 'action.highlight', class: 'text' }
    expect(
      Array.isArray(declared['content.primary']) && declared['content.primary'].at(-1),
    ).toEqual(tail)
    expect(
      Array.isArray(declared['content.secondary']) && declared['content.secondary'].at(-1),
    ).toEqual(tail)
    const naming = ADJACENCY.filter(
      (pair) => pair.subject === 'action.highlight' || pair.against === 'action.highlight',
    )
    expect(
      naming
        .map((pair) => `${pair.subject}|${pair.against}|${pair.class}`)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['content.primary|action.highlight|text', 'content.secondary|action.highlight|text'])
  })

  it('pairs no disabled slot, no surface and no border with the highlight, and names the scrim in no pair', () => {
    const named = ADJACENCY.flatMap((pair) => [pair.subject, pair.against])
    expect(named).not.toContain('backdrop.modal')
    const partnersOfHighlight = ADJACENCY.filter(
      (pair) => pair.subject === 'action.highlight' || pair.against === 'action.highlight',
    ).map((pair) => (pair.subject === 'action.highlight' ? pair.against : pair.subject))
    expect(partnersOfHighlight.filter((slot) => slot.startsWith('surface.'))).toEqual([])
    expect(partnersOfHighlight.filter((slot) => slot.startsWith('border.'))).toEqual([])
    expect(partnersOfHighlight).not.toContain('content.disabled')
  })

  it('keeps the shipped surface count at 5', () => {
    expect(shippedSurfaces()).toHaveLength(5)
    expect(() => assertShippedSurfaceCountProvenance()).not.toThrow()
  })

  it('refuses a slot with alpha below 1 in a declared pair, naming it, and passes the shipped set', () => {
    const planted: Adjacency[] = [
      ...ADJACENCY,
      { subject: 'content.primary', against: 'backdrop.modal', class: 'text' },
    ]
    expect(() => assertNoTranslucentSlotInDeclaredPair(planted)).toThrow(/backdrop\.modal/)
    const asSubject: Adjacency[] = [
      { subject: 'backdrop.modal', against: 'surface.base', class: 'non-text' },
    ]
    expect(() => assertNoTranslucentSlotInDeclaredPair(asSubject)).toThrow(/backdrop\.modal/)
    expect(() => assertNoTranslucentSlotInDeclaredPair(ADJACENCY)).not.toThrow()
  })

  describe('the build refuses a translucent slot that is declared in pairs and not excluded', () => {
    afterEach(() => {
      vi.doUnmock('../../src/theming/semantics.ts')
    })

    it('a copy giving surface.overlay an alpha of 0.9 fails the build naming surface.overlay', async () => {
      vi.resetModules()
      vi.doMock('../../src/theming/semantics.ts', async () => {
        const actual: Record<string, unknown> = await vi.importActual(
          '../../src/theming/semantics.ts',
        )
        return {
          ...actual,
          CHROMATIC_MAPPING: {
            ...CHROMATIC_MAPPING,
            'surface.overlay': {
              light: { scale: 'neutral', step: 0, alpha: 0.9 },
              dark: CHROMATIC_MAPPING['surface.overlay']?.dark,
            },
          },
        }
      })
      const step = await import('../../src/theming/build-step.ts')
      expect(() => step.composeThemingOutputs()).toThrow(/translucent slot "surface\.overlay"/)
    })
  })

  describe('the guard judges the alpha the build writes, which is rounded to four places', () => {
    it('does not refuse an alpha that is written as 1', () => {
      expect(() =>
        assertNoTranslucentSlotInDeclaredPair(ADJACENCY, surfaceOverlayWithAlpha(0.99996)),
      ).not.toThrow()
    })

    it('refuses an alpha that is still below 1 once rounded', () => {
      expect(() =>
        assertNoTranslucentSlotInDeclaredPair(ADJACENCY, surfaceOverlayWithAlpha(0.9999)),
      ).toThrow(/translucent slot "surface\.overlay"/)
    })
  })

  describe('the guard judges the step the build emits, not the entry as written', () => {
    it('refuses a new slot that aliases the scrim, naming it', () => {
      const aliased: Record<string, SlotMapping> = {
        ...CHROMATIC_MAPPING,
        'backdrop.dim': {
          light: { alias: 'backdrop.modal' },
          dark: { alias: 'backdrop.modal' },
        },
      }
      expect(() =>
        assertNoTranslucentSlotInDeclaredPair(declaredAgainstContent('backdrop.dim'), aliased),
      ).toThrow(/translucent slot "backdrop\.dim"/)
    })

    it('follows a chain of aliases to the translucent step', () => {
      const chained: Record<string, SlotMapping> = {
        ...CHROMATIC_MAPPING,
        'backdrop.dim': { light: { alias: 'backdrop.dimmer' }, dark: { alias: 'backdrop.dimmer' } },
        'backdrop.dimmer': {
          light: { alias: 'backdrop.modal' },
          dark: { alias: 'backdrop.modal' },
        },
      }
      expect(() =>
        assertNoTranslucentSlotInDeclaredPair(declaredAgainstContent('backdrop.dim'), chained),
      ).toThrow(/translucent slot "backdrop\.dim"/)
    })

    it('refuses a translucent step set for a slot in the achromatic column only', () => {
      const achromatic: Record<string, SlotMapping> = {
        ...ACHROMATIC_MAPPING,
        'border.focus': {
          light: { scale: 'neutral', step: 500, alpha: 0.5 },
          dark: { scale: 'neutral', step: 500 },
        },
      }
      expect(() =>
        assertNoTranslucentSlotInDeclaredPair(ADJACENCY, CHROMATIC_MAPPING, achromatic),
      ).toThrow(/translucent slot "border\.focus"/)
    })

    it('passes the shipped mapping in both columns', () => {
      expect(() =>
        assertNoTranslucentSlotInDeclaredPair(ADJACENCY, CHROMATIC_MAPPING, ACHROMATIC_MAPPING),
      ).not.toThrow()
    })
  })

  it('types both names in ColorPropertyName', () => {
    expect(builtDts).toContain("'--nave-color-action-highlight'")
    expect(builtDts).toContain("'--nave-color-backdrop-modal'")
  })
})

describe('AC-base-ui-overlay-completion-34 covers: R10, R16 (the scrim is the one translucent colour)', () => {
  it('declares an alpha below 1 only on backdrop.modal, in the built colour layer', () => {
    expect(translucentColorProperties(builtCss)).toEqual(['--nave-color-backdrop-modal'])
  })

  it.each([
    ['an alpha of 0', 'oklch(from var(--nave-color-tint) 0.5 0 h / 0)'],
    ['a percentage below 100', 'oklch(from var(--nave-color-tint) 0.5 0 h / 30%)'],
    ['an alpha written without a leading zero', 'oklch(from var(--nave-color-tint) 0.5 0 h / .5)'],
    ['the keyword transparent', 'transparent'],
    ['the keyword transparent in capitals', 'TRANSPARENT'],
    ['an alpha in scientific notation', 'oklch(from var(--nave-color-tint) 0.5 0 h / 1e-1)'],
    ['an alpha of none', 'oklch(from var(--nave-color-tint) 0.5 0 h / none)'],
    [
      'an alpha that is a calc() expression',
      'oklch(from var(--nave-color-tint) 0.5 0 h / calc(0.5))',
    ],
    [
      'an alpha of 0.9 in the dark value only',
      'light-dark(oklch(0.5 0 0 / 1), oklch(0.5 0 0 / 0.9))',
    ],
  ])('reports a declaration with %s', (_label, value) => {
    expect(translucentColorProperties(`:root {\n    --nave-color-veil: ${value};\n  }`)).toEqual([
      '--nave-color-veil',
    ])
  })

  it('reports a last declaration that has no semicolon before the closing brace', () => {
    const unterminated = ':root {\n    --nave-color-veil: oklch(0.5 0 0 / 0.5)\n}'
    expect(translucentColorProperties(unterminated)).toEqual(['--nave-color-veil'])
  })

  it('reports a declaration nested six spaces deep', () => {
    const nested = ':root {\n  @layer x {\n      --nave-color-veil: oklch(0.5 0 0 / 0.5);\n  }\n}'
    expect(translucentColorProperties(nested)).toEqual(['--nave-color-veil'])
  })

  it.each([
    ['an alpha of 1', 'oklch(from var(--nave-color-tint) 0.5 0 h / 1)'],
    ['an alpha of 100%', 'oklch(from var(--nave-color-tint) 0.5 0 h / 100%)'],
    ['no alpha at all', 'oklch(0.5 0 0)'],
    ['an alpha of 1.0', 'oklch(from var(--nave-color-tint) 0.5 0 h / 1.0)'],
    ['a comment that mentions a smaller alpha', 'oklch(0.5 0 0 / 1) /* was / 0.3) */'],
    [
      'a division inside a channel and an alpha of 1',
      'oklch(from var(--nave-color-tint) calc(l / 0.9) 0 h / 1)',
    ],
  ])('does not report a declaration with %s', (_label, value) => {
    expect(translucentColorProperties(`:root {\n    --nave-color-solid: ${value};\n  }`)).toEqual(
      [],
    )
  })
})

describe('AC-base-ui-overlay-completion-36 covers: R16 (the declared pairs the overlay parts paint)', () => {
  const EXCLUDED = new Set(['border.default', 'border.disabled', 'content.disabled'])

  it('declares content.primary and content.secondary on action.highlight as text', () => {
    for (const subject of ['content.primary', 'content.secondary']) {
      expect(
        declaredPairs.filter(
          (pair) =>
            pair.subject === subject &&
            pair.against === 'action.highlight' &&
            pair.class === 'text',
        ),
        subject,
      ).toHaveLength(1)
    }
  })

  it('declares no pair with content.disabled, border.disabled or border.default on either side', () => {
    const touching = declaredPairs.filter(
      (pair) => EXCLUDED.has(pair.subject) || EXCLUDED.has(pair.against),
    )
    expect(touching).toEqual([])
  })

  it('declares no pair of two surfaces', () => {
    const surfaceOnSurface = declaredPairs.filter(
      (pair) => isSurface(pair.subject) && isSurface(pair.against),
    )
    expect(surfaceOnSurface).toEqual([])
  })

  it('declares no pair of a surface with action.highlight, in either direction', () => {
    const surfaceWithHighlight = declaredPairs.filter(
      (pair) =>
        (isSurface(pair.subject) && pair.against === 'action.highlight') ||
        (pair.subject === 'action.highlight' && isSurface(pair.against)),
    )
    expect(surfaceWithHighlight).toEqual([])
  })
})
