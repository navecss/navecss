/**
 * AC-directive-core-19: one corpus, every host that exists (the PostCSS adapter,
 * expandText() and the Vite plugin's transform hook fed each file directly), one equivalence.
 */
import postcss from 'postcss'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { expandText } from '../../src/directive/expand-text.ts'
import { navePlugin as lightningAdapter } from '../../src/lightningcss.ts'
import { navePlugin } from '../../src/postcss.ts'
import { isEquivalent } from '../helpers/css-equivalence.ts'
import { LIGHTNING_RELEASES, type LightningLib } from '../helpers/lightningcss-releases.ts'
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

/**
 * The Lightning leg: the Lightning adapter's `expand`, then `transform()`, against the PostCSS
 * adapter's output through the same `transform()` on the same release (so a difference is the
 * adapter's, never Lightning CSS's own printing).
 */
function printed(lib: LightningLib, css: string): string {
  return lib
    .transform({ filename: '/proj/app.css', code: Buffer.from(css), errorRecovery: true })
    .code.toString()
}

function throughLightning(lib: LightningLib, css: string): string {
  const nave = lightningAdapter({ onUnknown: 'warn', extend: EXTEND })
  return printed(lib, Buffer.from(nave.expand(css, '/proj/app.css').code).toString())
}

const LEGS = {
  postcss: throughPostcss,
  expandText: (css: string) => Promise.resolve(throughExpandText(css)),
  vite: throughVite,
}

const warned: string[] = []

beforeEach(() => {
  warned.length = 0
  vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
    warned.push(String(message))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AC-directive-core-19 — one corpus, every leg, one equivalence', () => {
  it.each(CORPUS)('%s', async (css) => {
    const reference = await LEGS.postcss(css)

    for (const [name, leg] of Object.entries(LEGS)) {
      expect(isEquivalent(reference, await leg(css)), `the ${name} leg`).toBe(true)
    }
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

  describe.each(LIGHTNING_RELEASES)('the Lightning leg on $label', ({ lib }) => {
    it.each(CORPUS)('%s', async (css) => {
      const reference = printed(lib, await LEGS.postcss(css))

      expect(isEquivalent(reference, throughLightning(lib, css))).toBe(true)
    })

    it.each(CORPUS)('diagnostics agree with expandText(): %s', (css) => {
      const file = '/proj/app.css'
      const expected = expandText(css, { onUnknown: 'warn', extend: EXTEND, from: file })
        .diagnostics.map((d) => `${d.file}:${d.line}:${d.column}`)
        .toSorted((a, b) => a.localeCompare(b))

      throughLightning(lib, css)

      const actual = warned
        .map((message) => /^(.*):(\d+):(\d+): /.exec(message))
        .filter((match) => match !== null)
        .map((match) => `${match[1]}:${match[2]}:${match[3]}`)
        .toSorted((a, b) => a.localeCompare(b))
      expect(actual).toEqual(expected)
      expect(warned.length, 'a warning that is not a framed diagnostic').toBe(actual.length)
    })

    it('really transforms: a directive row changes, a directive-free row does not', () => {
      expect(throughLightning(lib, '.a { @nave flex; }')).toContain('display: flex')
      expect(isEquivalent(throughLightning(lib, '.a { color: red; }'), '.a { color: red; }')).toBe(
        true,
      )
    })
  })

  it('runs exactly the legs there are, each over a non-empty corpus', () => {
    expect(Object.keys(LEGS)).toEqual(['postcss', 'expandText', 'vite'])
    expect(LIGHTNING_RELEASES.map((release) => release.package)).toEqual([
      'lightningcss-1-22',
      'lightningcss',
    ])
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
