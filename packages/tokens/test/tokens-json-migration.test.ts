/**
 * The migration of `tokens.json` itself: the five specifics `R44` names, the stated `em`
 * deviation `R41` keeps, the adjacency declaration set `R45` requires preserved as a SET, and
 * the JSON types `R46` carries through to `tokens.js` and `tokens.d.ts`.
 *
 * **The oracle for every byte-level claim here is `test/fixtures/generated/`**, five
 * artifacts built from `tokens.json` as it stood BEFORE this migration and frozen on disk.
 * Diffing the live build against the live source would compare the migrated file with itself
 * and pass over any set the migration silently shrank.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): string =>
  readFileSync(path.join(here, 'fixtures/generated', name), 'utf8')
const built = (name: string): string => readFileSync(path.join(here, '../dist', name), 'utf8')

/**
 * Lines the JS emitter gained AFTER this migration, for reasons that have nothing to do with
 * it. The frozen oracle in `fixtures/generated/` never carried them and must not start
 * carrying them now, so they are named here and lifted out of `built('tokens.js')` before it
 * is compared against that oracle, keeping the accounting below about the migration alone.
 *
 * - the stylesheet-import comment: names `@import '@navecss/tokens/css'` for a CSS tool that
 *   misresolves the bare package name to this file, so it fails at that line instead of deep
 *   inside the token list.
 */
const POST_MIGRATION_JS_LINES = [
  "// This file is the JavaScript entry of @navecss/tokens. For the stylesheet, use: @import '@navecss/tokens/css';",
]

/**
 * Strips each line in `POST_MIGRATION_JS_LINES` out of `text`, after asserting it occurs
 * EXACTLY ONCE — zero means the line went missing, more than one means something else now
 * emits it too, and either is worth failing loudly on rather than silently absorbing.
 */
function withoutPostMigrationLines(text: string): string {
  return POST_MIGRATION_JS_LINES.reduce((remaining, line) => {
    const lines = remaining.split('\n')
    const occurrences = lines.filter((candidate) => candidate === line).length
    expect(occurrences).toBe(1)
    return lines.filter((candidate) => candidate !== line).join('\n')
  }, text)
}

/**
One token node, narrowed to the fields the scenarios below actually ask about.
 */
interface TokenNode {
  $type?: string
  $value?: unknown
}

/**
One adjacency declaration, as the `$extensions` block carries it.
 */
interface AdjacencyPair {
  against: string
  class: string
}

/**
The shipped token source, typed to what these scenarios read rather than to the format.
 */
interface TokenSource {
  $extensions: {
    'dev.navecss.theming': { adjacency: Record<string, AdjacencyPair[] | string> }
  }
  breakpoint: Record<string, TokenNode>
  font: { family: Record<string, TokenNode> }
  letterSpacing: Record<string, TokenNode>
  shadow: Record<string, TokenNode>
}

const source = JSON.parse(
  readFileSync(path.join(here, '../tokens.json'), 'utf8'),
) as unknown as TokenSource

/**
 * Every `(subject, against, class)` triple an adjacency block declares, as a sorted set. A
 * SET, never a count: an implementation keeping 17 subjects and 30 triples while swapping one
 * subject's partner passes any count check, and must fail a comparison over this.
 */
function adjacencyTriples(block: Record<string, AdjacencyPair[] | string>): string[] {
  const out: string[] = []
  for (const [subject, pairs] of Object.entries(block)) {
    if (!Array.isArray(pairs)) continue
    for (const pair of pairs) out.push(`${subject}|${pair.against}|${pair.class}`)
  }
  return out.toSorted((a, b) => a.localeCompare(b))
}

/**
 * Every (index, before, after) triple at which two files' lines differ.
 */
function lineDeltas(before: string, after: string): { after: string; before: string }[] {
  const a = before.split('\n')
  const b = after.split('\n')
  expect(b).toHaveLength(a.length)
  const deltas: { after: string; before: string }[] = []
  for (const [index, line] of a.entries()) {
    if (b[index] !== line) deltas.push({ after: b[index] ?? '', before: line })
  }
  return deltas
}

describe('AC-token-build-41 covers: R41 (the migration changes no rendered value)', () => {
  it('keeps the three letterSpacing tokens in em, at their pre-migration rendered values', () => {
    const letterSpacing = source.letterSpacing as Record<string, { $value: unknown }>
    expect(letterSpacing.tight?.$value).toEqual({ unit: 'em', value: -0.025 })
    expect(letterSpacing.normal?.$value).toEqual({ unit: 'em', value: 0 })
    expect(letterSpacing.wide?.$value).toEqual({ unit: 'em', value: 0.075 })

    for (const rendered of ['-0.025em', '0em', '0.075em']) {
      expect(fixture('tokens.css')).toContain(rendered)
      expect(built('tokens.css')).toContain(rendered)
    }
  })

  it('states the em deviation in the token file itself, never converting the three to rem', () => {
    expect(JSON.stringify(source.letterSpacing)).not.toContain('"rem"')
    // The three stay TOKENS in the ordinary tree. Moving them under `$extensions` was
    // considered and rejected: that block is for vendor data, and a load-bearing token value
    // hidden in it is a real token outside the format's type system with nothing saying why.
    // So a stated deviation must not quietly become a relocated value.
    expect(JSON.stringify(source.$extensions)).not.toContain('$value')

    const deviation = JSON.stringify(source).toLowerCase()
    expect(deviation).toContain('deviation')
    expect(deviation).toContain('90 of 93')
  })

  it('renders every other token byte-identically to its pre-migration value', () => {
    // The three shadow declarations are this migration's own stated deltas, asserted
    // exhaustively in the scenario below; everything else must be byte-identical.
    const changed = lineDeltas(fixture('tokens.css'), built('tokens.css'))
    expect(changed.every((delta) => delta.before.includes('--nave-shadow-'))).toBe(true)
  })
})

describe('AC-token-build-44 covers: R44 (the five specifics, and the EXHAUSTIVE byte delta)', () => {
  it('writes the three fontFamily stacks as arrays of family names, never a comma-joined string', () => {
    const family = source.font.family
    for (const key of ['base', 'display', 'mono']) {
      expect(Array.isArray(family[key]?.$value)).toBe(true)
    }
    expect(family.base?.$value).toEqual([
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'sans-serif',
    ])
  })

  it('keeps breakpoint.* at $type number and does NOT re-type them to dimension', () => {
    for (const token of Object.values(source.breakpoint)) {
      expect(token.$type).toBe('number')
      expect(typeof token.$value).toBe('number')
    }
  })

  it('keeps shadow.none as an empty array, and emits a zero spread rather than dropping it', () => {
    expect(source.shadow.none?.$value).toEqual([])
    const layers = source.shadow.raised?.$value as { spread?: unknown }[]
    for (const layer of layers) expect(layer.spread).toEqual({ unit: 'px', value: 0 })
  })

  it('leaves breakpoints.js and breakpoints.d.ts byte-identical across the migration', () => {
    expect(built('breakpoints.js')).toBe(fixture('breakpoints.js'))
    expect(built('breakpoints.d.ts')).toBe(fixture('breakpoints.d.ts'))
  })

  it('changes tokens.css at EXACTLY the three shadow declarations and nowhere else', () => {
    const deltas = lineDeltas(fixture('tokens.css'), built('tokens.css'))
    expect(deltas).toEqual([
      {
        after:
          '    --nave-shadow-raised: 0px 0.0625rem 0.1875rem 0px oklch(0 0 0 / 0.08), 0px 0.0625rem 0.125rem 0px oklch(0 0 0 / 0.06);',
        before:
          '    --nave-shadow-raised: 0 0.0625rem 0.1875rem oklch(0 0 0 / 0.08), 0 0.0625rem 0.125rem oklch(0 0 0 / 0.06);',
      },
      {
        after:
          '    --nave-shadow-overlay: 0px 0.25rem 0.75rem 0px oklch(0 0 0 / 0.1), 0px 0.125rem 0.375rem 0px oklch(0 0 0 / 0.08);',
        before:
          '    --nave-shadow-overlay: 0 0.25rem 0.75rem oklch(0 0 0 / 0.1), 0 0.125rem 0.375rem oklch(0 0 0 / 0.08);',
      },
      {
        after:
          '    --nave-shadow-modal: 0px 1rem 2rem 0px oklch(0 0 0 / 0.15), 0px 0.5rem 1rem 0px oklch(0 0 0 / 0.1);',
        before:
          '    --nave-shadow-modal: 0 1rem 2rem oklch(0 0 0 / 0.15), 0 0.5rem 1rem oklch(0 0 0 / 0.1);',
      },
    ])
  })

  it('renders fontFamily with SINGLE quotes, so the three family lines do not move', () => {
    expect(built('tokens.css')).toContain(
      "--nave-font-family-base: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
    )
    expect(built('tokens.css')).not.toContain('"Segoe UI"')
  })

  /**
   * `R44` states its byte-delta list as exhaustive for `tokens.css` and the two breakpoint
   * artifacts. `tokens.js` and `tokens.d.ts` DO move, by `R46`'s own requirement and by
   * `R49`'s dating of the emitted header, and the two sets are disjoint and are each named
   * here: the sum check is what makes this an accounting rather than a spot check, so a
   * nineteenth row moving for a reason nobody named fails this scenario.
   */
  it('accounts for EVERY tokens.js and tokens.d.ts delta, with nothing left over', () => {
    const jsDeltas = lineDeltas(fixture('tokens.js'), withoutPostMigrationLines(built('tokens.js')))
    const jsHeader = jsDeltas.filter((d) => d.before.includes('The DTCG token set'))
    const jsNumeric = jsDeltas.filter((d) => d.after === d.before.replaceAll('"', ''))
    const jsShadow = jsDeltas.filter((d) => d.before.includes('--nave-shadow-'))

    expect(jsHeader).toHaveLength(1)
    expect(jsNumeric).toHaveLength(18)
    expect(jsShadow).toHaveLength(3)
    expect(jsHeader.length + jsNumeric.length + jsShadow.length).toBe(jsDeltas.length)
    for (const delta of jsHeader) expect(delta.after).toContain('DTCG 2025.10 token set')

    const dtsDeltas = lineDeltas(fixture('tokens.d.ts'), built('tokens.d.ts'))
    const dtsHeader = dtsDeltas.filter((d) => d.before.includes('The DTCG token set'))
    const dtsTypes = dtsDeltas.filter((d) => d.after === d.before.replace(/: string$/, ': number'))

    expect(dtsHeader).toHaveLength(1)
    expect(dtsTypes).toHaveLength(18)
    expect(dtsHeader.length + dtsTypes.length).toBe(dtsDeltas.length)
  })
})

describe('AC-token-build-45 covers: R45 (the adjacency declaration SET, compared as triples)', () => {
  const frozen = JSON.parse(fixture('adjacency-triples.json')) as string[]

  const migrated = adjacencyTriples(source.$extensions['dev.navecss.theming'].adjacency)

  it('preserves the triple set element for element, not merely its size', () => {
    expect(migrated).toEqual(frozen)
    expect(new Set(migrated)).toEqual(new Set(frozen))
    expect([...frozen].every((triple) => migrated.includes(triple))).toBe(true)
    expect([...migrated].every((triple) => frozen.includes(triple))).toBe(true)
  })

  it('is written so a count-preserving, membership-changing migration FAILS', () => {
    const block = source.$extensions['dev.navecss.theming'].adjacency
    const tampered = structuredClone(block)
    const entry = Object.entries(tampered).find(
      (candidate): candidate is [string, AdjacencyPair[]] =>
        Array.isArray(candidate[1]) && candidate[1].length > 0,
    )
    if (!entry) throw new Error('no subject with a non-empty adjacency array to tamper with')
    const [, pairs] = entry
    // Same subject, same class, same pair count: only WHO the pair points at changes.
    pairs[0]!.against = `${pairs[0]!.against}--tampered-for-test`

    const tamperedTriples = adjacencyTriples(tampered)

    expect(tamperedTriples).toHaveLength(frozen.length)
    expect(tamperedTriples).not.toEqual(frozen)
  })

  it('keeps the adjacency keys DOTTED, never de-dotted to satisfy the format’s name rule', () => {
    const subjects = Object.keys(source.$extensions['dev.navecss.theming'].adjacency).filter(
      (key) => key !== 'comment',
    )

    expect(subjects).toContain('content.primary')
    expect(subjects).toContain('border.focus')
    expect(subjects.filter((key) => key.includes('.')).length).toBeGreaterThan(0)
    expect(subjects.some((key) => key.includes('-') && !key.includes('.'))).toBe(false)
  })
})

describe('AC-token-build-46 covers: R46 (JSON types reach tokens.js, and the .d.ts says so)', () => {
  const NUMERIC_ROWS = 18

  it('emits all 18 fontWeight, lineHeight, opacity and layer values as JavaScript numbers', () => {
    const js = built('tokens.js')
    const numeric = js.matchAll(/^ {2}'(--nave-[\w-]+)': (-?[\d.]+),$/gm).toArray()
    expect(numeric).toHaveLength(NUMERIC_ROWS)
    expect(js).toContain("'--nave-font-weight-regular': 400,")
    expect(js).toContain("'--nave-line-height-base': 1.5,")
    expect(js).toContain("'--nave-opacity-disabled': 0.4,")
    expect(js).toContain("'--nave-layer-base': 0,")
  })

  it('types the shipped token map so TokenValue admits both string and number, never string alone', () => {
    const dts = built('tokens.d.ts')
    expect(dts).toContain("'--nave-font-weight-regular': number")
    expect(dts).toContain("'--nave-font-size-md': string")
    expect(dts).toMatch(/export declare type TokenValue = typeof tokens\[TokenName]/)
  })

  it('fails against the pre-migration build, where every value was a quoted string', () => {
    expect(fixture('tokens.js')).toContain(`'--nave-font-weight-regular': "400",`)
    expect(fixture('tokens.d.ts')).toContain("'--nave-font-weight-regular': string")
  })
})
