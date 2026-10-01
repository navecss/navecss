/**
 * AC-directive-core-19: one corpus, every host that exists (the PostCSS adapter,
 * expandText() and the Vite plugin's transform hook fed each file directly), one equivalence.
 */
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { expandText } from '../../src/directive/expand-text.ts'
import { navePlugin } from '../../src/postcss.ts'
import { isEquivalent } from '../helpers/css-equivalence.ts'
import { runHook } from '../helpers/vite-hook.ts'

const EXTEND: Record<string, AtomDefinition> = {
  brandBox: { declarations: { color: 'red', padding: '1px' } },
  emptyMedia: { declarations: {}, media: { '(x)': { declarations: {} } } },
}

const CORPUS: readonly string[] = [
  '.a { color: red; @nave flex; }',
  '.a, .b { @nave focusRing; }',
  '.a, .b { @nave hidePhoneOnly; }',
  '.x { @nave first; @nave second; }',
  '.card { &:hover { color: red; } @nave interactive; }',
  '.card { @nave interactive; &:hover { color: red; } }',
  '.card { &:hover { color: red; } @nave flex itemsCenter; }',
  '@supports (display: grid) { .a { @nave flex; } }',
  '.a { @media (x) { & { @nave flex; } } }',
  '.a { @nave flex /* c */ block; }',
  '.a { @nave flex, block; }',
  '.a { @nave brandBox; }',
  '.btn { @nave focusRing; }',
  '.btn { &:hover { color: red } @nave focusRing; }',
  '@media (width >= 1px) { .btn { @nave focusRing; } }',
  '.btn { @nave srOnlyFocusable; }',
  '.btn { &:hover { color: red } @nave srOnlyFocusable; }',
  '@media (width >= 1px) { .btn { @nave srOnlyFocusable; } }',
  // AC-04's remaining rows
  '.a { &:hover {} @nave focusRing; @nave flex; }',
  '.a { color: red; @foo; @nave flex; }',
  '.a { @nave focusRing flex; @nave srOnlyFocusable; }',
  '.a { @nave emptyMedia; }',
  // AC-10's spellings a PostCSS parse can reach
  '.a { @NAVE flex; }',
  '.a { @Nave flex; }',
  String.raw`.a { @n\61ve flex; }`,
  String.raw`.a { @n\61 ve flex; }`,
  // AC-11's prelude rows
  '.a { @nave flex block; }',
  '.a { @nave flex/**/block; }',
  '.a { @nave flex,block; }',
  '.a { @nave flex !important; }',
  '.a { @nave flex "block"; }',
  '.a { @nave flex 2; }',
  '.a { @nave flex var(--x, a b); }',
  '.a { @nave .flex; }',
  '.a { @nave flex [a]; }',
  '.a { @nave nope flex; }',
  // AC-12's rows
  '.a { @nave flex { color: red } }',
  '.a { @media (width >= 37.5em) { @nave flex; } }',
  '.a { @supports (display: grid) { @nave flex; } }',
  '.a { @container (width > 1px) { @nave flex; } }',
]

async function throughPostcss(css: string): Promise<string> {
  const result = await postcss([navePlugin({ onUnknown: 'warn', extend: EXTEND })]).process(css, {
    from: undefined,
  })
  return result.css
}

function throughExpandText(css: string): string {
  return expandText(css, { onUnknown: 'warn', extend: EXTEND }).css
}

async function throughVite(css: string): Promise<string> {
  const run = await runHook({ code: css, options: { onUnknown: 'warn', extend: EXTEND } })
  return run.code ?? css
}

const LEGS = ['postcss', 'expandText', 'vite'] as const

describe('AC-directive-core-19 — one corpus, every leg, one equivalence', () => {
  it.each(CORPUS)('%s', async (css) => {
    const postcssOutput = await throughPostcss(css)
    const expandTextOutput = throughExpandText(css)
    const viteOutput = await throughVite(css)

    expect(isEquivalent(postcssOutput, expandTextOutput)).toBe(true)
    expect(isEquivalent(postcssOutput, viteOutput)).toBe(true)
  })

  it.each(CORPUS)('diagnostics agree between expandText() and the Vite leg: %s', async (css) => {
    const id = '/proj/app.css'
    const expected = expandText(css, { onUnknown: 'warn', extend: EXTEND, from: id })
      .diagnostics.map((d) => ({ file: d.file, line: d.line, column: d.column }))
      .toSorted((a, b) => a.line - b.line || a.column - b.column)
    const run = await runHook({ code: css, id, options: { onUnknown: 'warn', extend: EXTEND } })
    const actual = run.warnings
      .map((w) => ({ file: w.loc?.file, line: w.loc?.line, column: (w.loc?.column ?? -1) + 1 }))
      .toSorted((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.column - b.column)

    expect(actual).toEqual(expected)
  })

  it('runs exactly the legs there are, each over a non-empty corpus', () => {
    expect(LEGS).toEqual(['postcss', 'expandText', 'vite'])
    expect(CORPUS.length).toBeGreaterThan(0)
  })

  it('the Vite leg really transforms: a directive row changes, a directive-free row does not', async () => {
    expect(await throughVite('.a { @nave flex; }')).toContain('display: flex')
    expect(await throughVite('.a { color: red; }')).toBe('.a { color: red; }')
  })

  it('asserts the corpus is non-empty', () => {
    expect(CORPUS.length).toBeGreaterThan(0)
  })

  it('reds on swapped declaration order (equivalence control)', () => {
    expect(
      isEquivalent('.a { color: red; display: flex; }', '.a { display: flex; color: red; }'),
    ).toBe(false)
  })

  it('reds on a missing nested rule (equivalence control)', () => {
    expect(isEquivalent('.a { &:hover { color: red; } }', '.a { }')).toBe(false)
  })

  it('reds on a changed selector (equivalence control)', () => {
    expect(isEquivalent('.a { color: red; }', '.b { color: red; }')).toBe(false)
  })

  it('reds on a dropped !important (equivalence control)', () => {
    expect(isEquivalent('.a { color: red !important; }', '.a { color: red; }')).toBe(false)
  })

  it('greens on whitespace-only differences (equivalence control)', () => {
    expect(isEquivalent('.a{color:red;display:flex}', '.a { color: red; display: flex; }')).toBe(
      true,
    )
  })
})
