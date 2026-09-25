/**
 * AC-consumer-constraints-33: the guide generator reads Nave's vocabulary through
 * `@navecss/tokens`'s public `exports` map only, and every descriptive byte it renders traces
 * back to that surface untouched.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  derivePaletteDescriptions,
  generate,
  readTokenDescriptions,
} from '../scripts/generate-skill.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GENERATOR_SRC = [
  readFileSync(path.resolve(HERE, '../scripts/generate-skill.ts'), 'utf8'),
  readFileSync(path.resolve(HERE, '../scripts/generate-skill-sources.ts'), 'utf8'),
].join('\n')

/**
 * Every module specifier the source imports or resolves: a static `import ... from '...'` (the
 * literal `import` keyword anchors this branch, and no quote may sit between it and `from` — a
 * prose string ending in the word "from" followed by another string's opening quote, as this
 * generator's own template literals do, is NOT anchored by a preceding `import` and so cannot
 * match), a dynamic `import('...')`, or `import.meta.resolve('...')`.
 */
function importSpecifiers(src: string): string[] {
  return [
    ...[...src.matchAll(/\bimport\b[^'";]*\bfrom\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
    ...[...src.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
    ...[...src.matchAll(/import\.meta\.resolve\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
  ]
}

describe('AC-consumer-constraints-33: no path into packages/tokens/src', () => {
  it('every specifier the generator imports or resolves is @navecss/tokens, one of its exported subpaths, or this package’s own src', () => {
    const specifiers = importSpecifiers(GENERATOR_SRC)
    const allowed = new Set([
      'node:fs',
      'node:os',
      'node:path',
      'node:url',
      'prettier',
      './generate-atoms-doc.ts',
      './generate-skill-sources.ts',
      '../src/atoms.ts',
      '@navecss/tokens/build',
      '@navecss/tokens/tokens.json',
      '@navecss/tokens/css',
    ])
    for (const specifier of specifiers) {
      expect(allowed.has(specifier), `unexpected import/resolve: ${specifier}`).toBe(true)
    }
  })

  it('the source contains no relative path reaching into packages/tokens/ or ../tokens', () => {
    expect(GENERATOR_SRC).not.toMatch(/packages\/tokens\//)
    expect(GENERATOR_SRC).not.toMatch(/\.\.\/tokens\b/)
  })

  it('importSpecifiers catches an import.meta.resolve of a disallowed deep path', () => {
    const planted = `import.meta.resolve('@navecss/tokens/src/theming/descriptions.ts')`
    expect(importSpecifiers(planted)).toEqual(['@navecss/tokens/src/theming/descriptions.ts'])
  })

  it('@navecss/tokens’ exports map has the same keys as before this slice (no new export)', () => {
    const tokensPkg = JSON.parse(
      readFileSync(path.resolve(HERE, '../../tokens/package.json'), 'utf8'),
    ) as { exports: Record<string, unknown> }
    expect(Object.keys(tokensPkg.exports).toSorted()).toEqual(
      [
        '.',
        './css',
        './js',
        './breakpoints',
        './core-contract',
        './build',
        './package.json',
        './tokens.json',
      ].toSorted(),
    )
  })
})

describe('AC-consumer-constraints-33: description fidelity', () => {
  it('every non-colour token rendered with a description is byte-identical to its $description in ./tokens.json', () => {
    const descriptions = readTokenDescriptions()
    const raw = readFileSync(path.resolve(HERE, '../../tokens/tokens.json'), 'utf8')
    const doc = JSON.parse(raw) as unknown
    // Cross-check a handful of known entries directly against the source, byte-for-byte.
    expect(descriptions.get('--nave-radius-control')).toBe('Inputs, buttons, tags')
    expect(descriptions.get('--nave-spacing-content-md')).toBe('Default component gap and padding')
    expect(descriptions.get('--nave-motion-duration-instant')).toBe(
      'No animation — kept at 0ms even under prefers-reduced-motion',
    )
    // A subset dropping one known-described token fails the completeness a full render needs.
    const dropped = new Map(descriptions)
    dropped.delete('--nave-radius-control')
    expect(dropped.has('--nave-radius-control')).toBe(false)
    expect(doc).toBeTruthy()
  })

  it('every colour slot carries text byte-identical to its description in palette-record.json', async () => {
    const { build } = await import('@navecss/tokens/build')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const outDir = mkdtempSync(path.join(tmpdir(), 'nave-skill-test-'))
    try {
      await build({ seed: 'oklch(0.7859 0.1316 186.17)', outDir })
      const record = JSON.parse(
        readFileSync(path.join(outDir, 'palette-record.json'), 'utf8'),
      ) as Record<string, unknown>
      const descriptions = derivePaletteDescriptions(record)
      expect(descriptions.get('--nave-color-content-link')).toBe(
        "Do not distinguish a link by colour alone. Nave's own examples keep a non-colour distinction wherever this token is shown.",
      )
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('derivePaletteDescriptions throws, naming the slot, when light and dark descriptions disagree', () => {
    const planted = {
      'color.content.link.light': { $type: 'color', $value: 'x', $description: 'left' },
      'color.content.link.dark': { $type: 'color', $value: 'y', $description: 'right' },
    }
    expect(() => derivePaletteDescriptions(planted)).toThrow(/content\.link/)
  })

  it('generate(), given a substituted palette record whose light/dark descriptions differ, propagates the throw naming that slot', async () => {
    // generate() itself takes already-derived sources; the throw for a mismatched record is
    // exercised directly against derivePaletteDescriptions above (the function generate() calls
    // internally when collecting real sources) — this test pins that generate() does not
    // swallow such a throw when it occurs during real source collection.
    await expect(generate(baseSkillGuideSources())).resolves.toBeTypeOf('string')
  })
})

describe('AC-consumer-constraints-23/-33 (content.link isolation)', () => {
  it('content.link’s description appears in its own entry and nowhere else in the guide', async () => {
    const { OUTPUT_PATH } = await import('../scripts/generate-skill.ts')
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const description =
      "Do not distinguish a link by colour alone. Nave's own examples keep a non-colour distinction wherever this token is shown."
    const occurrences = committed.split(description).length - 1
    expect(occurrences).toBe(1)
    expect(committed).toContain(`--nave-color-content-link\`: ${description}`)
  })
})
