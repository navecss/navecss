import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ACTION_SECONDARY_FOREGROUND } from '../../src/theming/semantics.ts'

/**
 * The token changes the Base UI package depends on: the glyph-stroke width, the
 * `radius.control` wording, and the widened set of colour pairs its parts paint. They ship in
 * their own release, ahead of the package, because the package's peer range names this
 * tokens version as its floor.
 */

interface Pair {
  against: string
  class: 'non-text' | 'text'
}

interface TokensJson {
  $extensions: { 'dev.navecss.theming': { adjacency: Record<string, Pair[] | string> } }
  borderWidth: Record<string, { $description?: string; $value: { unit: string; value: number } }>
  radius: Record<string, { $description?: string }>
}

const TOKENS_JSON_PATH = path.resolve(import.meta.dirname, '../../tokens.json')
const tokens = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as TokensJson
const adjacency = tokens.$extensions['dev.navecss.theming'].adjacency

function pairsOf(subject: string): Pair[] {
  const entry = adjacency[subject]
  return Array.isArray(entry) ? entry : []
}

function isDeclared(subject: string, against: string, cls: Pair['class']): boolean {
  return pairsOf(subject).some((pair) => pair.against === against && pair.class === cls)
}

describe('AC-base-ui-bridge-43 covers: R14 (the tokens bytes)', () => {
  it('declares border-width.mark as a 2px glyph stroke with its exact description', () => {
    expect(tokens.borderWidth.mark).toEqual({
      $description: 'Strokes of glyphs drawn in CSS: check marks, indeterminate bars',
      $type: 'dimension',
      $value: { unit: 'px', value: 2 },
    })
  })

  it('words radius.control to include the popovers, menus and select lists anchored to a control', () => {
    expect(tokens.radius.control?.$description).toBe(
      'Inputs, buttons, tags, and the popovers, menus and select lists anchored to a control',
    )
  })

  it('emits --nave-border-width-mark: 2px exactly once in the built tokens.css', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../../dist/tokens.css'), 'utf8')
    expect(css.match(/--nave-border-width-mark:\s*2px;/g)).toHaveLength(1)
  })
})

describe('AC-base-ui-bridge-33 covers: R9, R14 (the painted pairs are declared before ship)', () => {
  const declaredText: [string, string][] = [
    ['content.primary', 'surface.overlay'],
    ['content.secondary', 'surface.overlay'],
    ['content.secondary', 'surface.raised'],
    ['content.tertiary', 'surface.overlay'],
    ['content.tertiary', 'surface.raised'],
    ['feedback.danger.foreground', 'surface.base'],
    ['feedback.danger.foreground', 'surface.raised'],
    ['feedback.danger.foreground', 'surface.overlay'],
    ['content.link', 'surface.raised'],
    ['content.link', 'surface.overlay'],
  ]
  const declaredNonText: [string, string][] = [
    ['action.primary', 'surface.raised'],
    ['action.primary', 'surface.overlay'],
    ['feedback.danger', 'surface.raised'],
    ['feedback.danger', 'surface.overlay'],
  ]
  const alreadyDeclared: [string, string, Pair['class']][] = [
    ['content.primary', 'surface.base', 'text'],
    ['content.primary', 'surface.raised', 'text'],
    ['content.secondary', 'surface.base', 'text'],
    ['content.tertiary', 'surface.base', 'text'],
    ['content.tertiary', 'surface.sunken', 'text'],
    ['content.inverse', 'surface.inverse', 'text'],
    ['content.link', 'surface.base', 'text'],
    ['on-action.primary', 'action.primary', 'text'],
    ['on-action.primary', 'action.primary.hover', 'text'],
    ['on-action.primary', 'action.primary.active', 'text'],
    ['action.secondary.foreground', 'action.secondary', 'text'],
    ['action.primary', 'surface.base', 'non-text'],
    ['feedback.danger', 'surface.base', 'non-text'],
    ...['base', 'raised', 'overlay', 'sunken', 'inverse'].flatMap(
      (surface): [string, string, Pair['class']][] => [
        ['border.control', `surface.${surface}`, 'non-text'],
        ['border.focus', `surface.${surface}`, 'non-text'],
      ],
    ),
  ]

  it.each(declaredText)('declares %s against %s as text', (subject, against) => {
    expect(isDeclared(subject, against, 'text')).toBe(true)
  })

  it.each(declaredNonText)('declares %s against %s as non-text', (subject, against) => {
    expect(isDeclared(subject, against, 'non-text')).toBe(true)
  })

  it.each(alreadyDeclared)('still declares %s against %s as %s', (subject, against, cls) => {
    expect(isDeclared(subject, against, cls)).toBe(true)
  })

  it('declares nothing with an excluded slot as subject or partner, and no surface against a surface', () => {
    const excluded = new Set(['border.default', 'border.disabled', 'content.disabled'])
    for (const [subject, entry] of Object.entries(adjacency)) {
      if (!Array.isArray(entry)) continue
      expect(excluded.has(subject), `${subject} is an excluded subject`).toBe(false)
      expect(subject.startsWith('surface.'), `${subject} is a surface used as subject`).toBe(false)
      for (const pair of entry) {
        expect(excluded.has(pair.against), `${subject} against ${pair.against}`).toBe(false)
      }
    }
  })
})

describe('AC-base-ui-bridge-42 covers: R13 (the tokens half of the G6 pair)', () => {
  it('resolves action.secondary.foreground to content.primary, the token the Button paints', () => {
    expect(ACTION_SECONDARY_FOREGROUND).toBe('content.primary')
  })
})
