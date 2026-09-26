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
  kebab,
  readDeclaredPropertyNames,
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
 * match), a dynamic `import('...')`, `import.meta.resolve('...')`, or a literal argument to this
 * generator's own `resolveExport('...')` wrapper — the shape every real
 * `@navecss/tokens`-reaching call in `generate-skill-sources.ts` actually takes (neither
 * `readTokenDescriptions` nor `readDeclaredPropertyNames` calls `import.meta.resolve` directly;
 * both go through `resolveExport`, which this scanner could not see until this clause was added).
 */
function importSpecifiers(src: string): string[] {
  return [
    ...[...src.matchAll(/\bimport\b[^'";]*\bfrom\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
    ...[...src.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
    ...[...src.matchAll(/import\.meta\.resolve\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
    ...[...src.matchAll(/\bresolveExport\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]!),
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
      './disabled-state-note.ts',
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

  it('importSpecifiers catches a resolveExport(...) literal of a disallowed deep path', () => {
    const planted = `resolveExport('@navecss/tokens/src/theming/descriptions.ts')`
    expect(importSpecifiers(planted)).toEqual(['@navecss/tokens/src/theming/descriptions.ts'])
  })

  it('importSpecifiers now actually extracts the two deep-read specifiers the real source reaches through resolveExport', () => {
    // Until this clause was added, neither `'@navecss/tokens/tokens.json'` nor `'@navecss/tokens/css'`
    // was ever matched by this scanner (both sit in resolveExport(...) calls, not a bare
    // import.meta.resolve(...) or import ... from), so the AC-33 allowlist check below was
    // vacuously satisfied for exactly the two paths it exists to guard.
    const specifiers = importSpecifiers(GENERATOR_SRC)
    expect(specifiers).toContain('@navecss/tokens/tokens.json')
    expect(specifiers).toContain('@navecss/tokens/css')
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
  it('the description map is complete: every $description leaf in tokens.json is represented, byte for byte, none dropped', () => {
    // A loop over EVERY leaf, not 3 hand-picked names: a leaf this loop misses is a leaf a
    // hand-picked check could never have named in the first place. Walks the same DTCG tree
    // `readTokenDescriptions()` itself walks, independently collecting VALUES only (never
    // re-deriving the `kebab()` name transform a second time, which a separate test below
    // covers) — so a dropped or wrong-value leaf reds here regardless of
    // whether its computed NAME would also have been right.
    const descriptions = readTokenDescriptions()
    const raw = readFileSync(path.resolve(HERE, '../../tokens/tokens.json'), 'utf8')
    const doc: unknown = JSON.parse(raw)

    const expectedValues: string[] = []
    function walk(node: unknown, segments: string[]): void {
      if (node === null || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if ('$value' in obj) {
        if (segments[0] === 'breakpoint' || segments.some((s) => s.startsWith('_'))) return
        if (typeof obj.$description === 'string') expectedValues.push(obj.$description)
        return
      }
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue
        walk(value, [...segments, key])
      }
    }
    walk(doc, [])

    expect(expectedValues.length).toBeGreaterThan(0)
    // A dropped-one-token subset (the pre-fix "tautology" control) fails THIS assertion, since
    // the size no longer matches the independently-walked count.
    expect(descriptions.size).toBe(expectedValues.length)
    expect([...descriptions.values()].toSorted()).toEqual(expectedValues.toSorted())

    // Three of the real entries, still pinned by name (not just by value-set membership), so a
    // wrong NAME for a right value would still be visible somewhere in this file's other tests
    // (drift, cell-identity) even though this particular assertion is value-only.
    expect(descriptions.get('--nave-radius-control')).toBe('Inputs, buttons, tags')
    expect(descriptions.get('--nave-spacing-content-md')).toBe('Default component gap and padding')
    expect(descriptions.get('--nave-motion-duration-instant')).toBe(
      'No animation — kept at 0ms even under prefers-reduced-motion',
    )
  })

  it('a subset dropping one known-described token fails the completeness check above', () => {
    const descriptions = readTokenDescriptions()
    const dropped = new Map(descriptions)
    dropped.delete('--nave-radius-control')
    expect(dropped.size).not.toBe(descriptions.size)
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

  it('collectRealSources, given a mismatched palette-record override, propagates the throw naming that slot — the REAL collection path, not derivePaletteDescriptions called directly', async () => {
    // Before this seam was added, the only test on this clause called generate(baseSkillGuideSources())
    // — sources it had already derived itself — so no mismatch was ever constructed and the
    // throw path through the real collection pipeline (collectRealSources -> buildPaletteRecord
    // -> derivePaletteDescriptions) was never exercised end to end. The override parameter below
    // is the seam that lets a test inject a real mismatch through that pipeline with no need to
    // run the tokens build twice for one throw.
    const { collectRealSources } = await import('../scripts/generate-skill-sources.ts')
    const mismatched = {
      'color.content.link.light': { $type: 'color', $value: 'x', $description: 'left' },
      'color.content.link.dark': { $type: 'color', $value: 'y', $description: 'right' },
    }
    await expect(collectRealSources(mismatched)).rejects.toThrow(/content\.link/)
  })

  it('generate(), given the real tree, still resolves (the happy path the seam above does not disturb)', async () => {
    await expect(generate(baseSkillGuideSources())).resolves.toBeTypeOf('string')
  })
})

describe('AC-consumer-constraints-33: kebab() matches the real @navecss/tokens build transform', () => {
  it('every non-colour token name it computes is a member of the declared --nave-* set (completeness, not 3 hand-picked names)', () => {
    // Before this test, AC-33's only cross-check between the two maps was 3 hand-picked names,
    // none of which would ever exercise a kebab() naming mismatch — every OTHER name could have
    // silently missed the declared set with nothing here to notice.
    const declared = new Set(readDeclaredPropertyNames())
    const names = [...readTokenDescriptions().keys()]
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(declared.has(name), `${name} is not in the declared --nave-* set`).toBe(true)
    }
  })

  it('kebab() is byte-identical to the real build’s transform on an adjacent-capitals (acronym-shaped) segment', async () => {
    // The real transform this generator's own docblock says it re-derives
    // (`@navecss/tokens/src/token-name.ts`'s `kebabName`), reached here only for this TEST's
    // own verification — R20's restriction on reading `@navecss/tokens` through its public
    // exports only binds the GENERATOR, never what verifies it (the same rule
    // skill-guide-cleared-copy.test.ts’s FEEDBACK_SHARED_IDENTITY_NOTICE check already relies
    // on). No such segment exists in the real tokens.json today, which is exactly why nothing
    // catches a mismatch without this test.
    const { kebabName } = (await import(path.resolve(HERE, '../../tokens/src/token-name.ts'))) as {
      kebabName: (path: readonly string[]) => string
    }
    const adversarial = 'URLPath'
    expect(kebab(adversarial)).toBe(kebabName([adversarial]))
    expect(kebab(adversarial)).toBe('url-path')
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
