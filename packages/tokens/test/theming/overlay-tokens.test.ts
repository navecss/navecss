import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Adjacency } from '../../src/theming/adjacency-source.ts'

import { ADJACENCY, ADJACENCY_EXCLUSIONS } from '../../src/theming/adjacency-source.ts'
import {
  assertNoTranslucentSlotInDeclaredPair,
  assertShippedSurfaceCountProvenance,
  shippedSurfaces,
} from '../../src/theming/adjacency.ts'
import { SLOT_DESCRIPTIONS } from '../../src/theming/descriptions.ts'
import { CHROMATIC_MAPPING, SEMANTIC_SLOTS } from '../../src/theming/semantics.ts'

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
    'dev.navecss.theming': { adjacency: Record<string, { against: string; class: string }[]> }
  }
}
const declared = tokensJson.$extensions['dev.navecss.theming'].adjacency

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
    expect(declared['content.primary']?.at(-1)).toEqual(tail)
    expect(declared['content.secondary']?.at(-1)).toEqual(tail)
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

  it('types both names in ColorPropertyName', () => {
    expect(builtDts).toContain("'--nave-color-action-highlight'")
    expect(builtDts).toContain("'--nave-color-backdrop-modal'")
  })
})

describe('AC-base-ui-overlay-completion-34 covers: R10, R16 (the scrim is the one translucent colour)', () => {
  it('declares an alpha below 1 only on backdrop.modal, in the built colour layer', () => {
    const translucent = cssLines
      .filter((line) => line.startsWith('    --nave-color-'))
      .filter((line) => /\/ 0\.\d+\)/.test(line))
      .map((line) => line.slice(4, line.indexOf(':')))
    expect(translucent).toEqual(['--nave-color-backdrop-modal'])
  })
})
