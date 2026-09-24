/**
 * The DTCG 2025.10 input contract: one accepted shape, a named refusal for the pre-stable
 * draft shape, the accepted `$type` set and its two distinct refusal grounds, and `$ref`.
 *
 * Every scenario here is written against `readTokens`'s own public surface, because the
 * refusal a consumer meets IS the deliverable: the message's contents are a requirement,
 * not an implementation detail, so they are asserted rather than smoke-tested.
 */
import { describe, expect, it } from 'vitest'

import { DtcgShapeRefusal } from '../src/errors.ts'
import { readTokens } from '../src/reader.ts'

/**
 * Reads `source` and returns the refusal it threw, failing the test if it did not throw.
 * A bare `expect(...).toThrow()` cannot then be interrogated for its contents, and every
 * scenario below asks about contents.
 */
function refusalFrom(source: unknown, sourceName?: string): Error {
  try {
    readTokens(source, sourceName)
  } catch (error) {
    return error as Error
  }
  throw new Error('expected readTokens to refuse this source, and it did not')
}

const draftDimension = { spacing: { small: { $type: 'dimension', $value: '16px' } } }

describe('AC-token-build-36 covers: R36 (one shape, the draft shape refused by name per $type)', () => {
  it('refuses a draft-shaped dimension, number, fontWeight and shadow, naming the draft shape for each', () => {
    const source = {
      a: { $type: 'dimension', $value: '16px' },
      b: { $type: 'number', $value: '14' },
      c: { $type: 'fontWeight', $value: '400' },
      d: {
        $type: 'shadow',
        $value: [{ offsetX: '0', offsetY: '1px', blur: '2px', color: 'oklch(0 0 0 / 0.1)' }],
      },
    }
    const message = refusalFrom(source, 'tokens.json').message

    for (const type of ['dimension', 'number', 'fontWeight', 'shadow']) {
      expect(message).toContain(type)
    }
    expect(message).toContain('pre-stable draft shape')
  })

  it('accepts the 2025.10 shape for each of those same four types', () => {
    const tokens = readTokens({
      a: { $type: 'dimension', $value: { value: 16, unit: 'px' } },
      b: { $type: 'number', $value: 14 },
      c: { $type: 'fontWeight', $value: 400 },
      d: {
        $type: 'shadow',
        $value: [
          {
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 1, unit: 'px' },
            blur: { value: 2, unit: 'px' },
            spread: { value: 0, unit: 'px' },
            color: { colorSpace: 'oklch', components: [0, 0, 0], alpha: 0.1 },
          },
        ],
      },
    })

    expect(tokens.map((t) => t.value)).toEqual([
      '16px',
      14,
      400,
      '0px 1px 2px 0px oklch(0 0 0 / 0.1)',
    ])
  })

  it('accepts a fontWeight written as one of the format’s own weight keywords, and refuses a quoted numeral', () => {
    expect(readTokens({ w: { $type: 'fontWeight', $value: 'bold' } })[0]?.value).toBe('bold')
    expect(refusalFrom({ w: { $type: 'fontWeight', $value: '400' } }).message).toContain(
      'fontWeight',
    )
  })

  it('accepts a {token.reference} alias string under dimension and under number, never refusing it as a draft string', () => {
    const tokens = readTokens({
      base: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
      count: { $type: 'number', $value: 2 },
      aliasDimension: { $type: 'dimension', $value: '{base}' },
      aliasNumber: { $type: 'number', $value: '{count}' },
    })
    expect(tokens.find((t) => t.path[0] === 'aliasDimension')?.value).toBe('4px')
    expect(tokens.find((t) => t.path[0] === 'aliasNumber')?.value).toBe(2)
  })

  it('refuses a fontFamily string carrying a comma and says IN TERMS that the rule is a heuristic', () => {
    const message = refusalFrom({
      f: { $type: 'fontFamily', $value: "system-ui, 'Segoe UI', sans-serif" },
    }).message
    expect(message.toLowerCase()).toContain('heuristic')
  })

  it('labels ONLY the fontFamily comma rule a heuristic, never a real shape defect', () => {
    const message = refusalFrom({
      a: { $type: 'dimension', $value: '16px' },
      f: { $type: 'fontFamily', $value: 'system-ui, sans-serif' },
    }).message
    const heuristicLines = message
      .split('\n')
      .filter((line) => line.toLowerCase().includes('heuristic'))
    expect(heuristicLines).toHaveLength(1)
    expect(heuristicLines[0]).toContain('fontFamily')
  })

  it('accepts a fontFamily array, and a single-family fontFamily string with no comma', () => {
    const tokens = readTokens({
      stack: { $type: 'fontFamily', $value: ['system-ui', 'Segoe UI', 'sans-serif'] },
      one: { $type: 'fontFamily', $value: 'Menlo' },
    })
    expect(tokens.map((t) => t.value)).toEqual(["system-ui, 'Segoe UI', sans-serif", 'Menlo'])
  })
})

describe('AC-token-build-37 covers: R37 (the shape refusal collects every node, never fails fast)', () => {
  it('reports every draft-shaped node across types in ONE run, not only the first', () => {
    const message = refusalFrom({
      one: { $type: 'dimension', $value: '16px' },
      two: { $type: 'dimension', $value: '24px' },
      three: { $type: 'fontWeight', $value: '700' },
      fine: { $type: 'number', $value: 3 },
    }).message

    expect(message).toContain('one')
    expect(message).toContain('two')
    expect(message).toContain('three')
  })

  it('reports all six draft-shaped types together rather than one build cycle per node', () => {
    const refusal = refusalFrom({
      dim: { $type: 'dimension', $value: '16px' },
      num: { $type: 'number', $value: '14' },
      weight: { $type: 'fontWeight', $value: '400' },
      dur: { $type: 'duration', $value: '200ms' },
      fam: { $type: 'fontFamily', $value: 'system-ui, sans-serif' },
      shade: {
        $type: 'shadow',
        $value: { offsetX: '0', offsetY: '1px', blur: '2px', color: 'oklch(0 0 0 / 0.1)' },
      },
    }) as DtcgShapeRefusal

    expect(refusal).toBeInstanceOf(DtcgShapeRefusal)
    expect(refusal.nodes.map((node) => node.path).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'dim',
      'dur',
      'fam',
      'num',
      'shade',
      'weight',
    ])
  })

  it('reports a malformed node and a genuinely draft-shaped node together in one run', () => {
    const message = refusalFrom({
      draftDim: { $type: 'dimension', $value: '16px' },
      badNumber: { $type: 'number', $value: true },
    }).message

    expect(message).toContain('draftDim')
    expect(message).toContain('badNumber')
  })

  it("carries a malformed node's path, the FILE, its $value verbatim, and the shape its own $type accepts — never a conversion instruction", () => {
    const message = refusalFrom(
      { badDim: { $type: 'dimension', $value: { value: 16 } } },
      'tokens.json',
    ).message

    expect(message).toContain('badDim')
    expect(message).toContain('tokens.json')
    expect(message).toContain('{"value":16}')
    expect(message).toContain('unit')
    expect(message).not.toContain('wrap the value in an object')
  })

  it('keeps a draft node’s full conversion instruction unchanged when a malformed node is reported alongside it, and never calls a malformed node draft-shaped', () => {
    const message = refusalFrom({
      draftDim: { $type: 'dimension', $value: '16px' },
      badNumber: { $type: 'number', $value: true },
    }).message

    expect(message).toContain('wrap the value in an object carrying a numeric "value" and a "unit"')
    expect(message.match(/pre-stable draft shape/g)).toHaveLength(1)
  })

  it('collects every malformed and every draft-shaped node, not merely the first of each class', () => {
    const message = refusalFrom({
      badOne: { $type: 'number', $value: true },
      draftOne: { $type: 'dimension', $value: '16px' },
      badTwo: { $type: 'fontWeight', $value: [] },
      draftTwo: { $type: 'duration', $value: '200ms' },
    }).message

    for (const name of ['badOne', 'draftOne', 'badTwo', 'draftTwo']) {
      expect(message).toContain(name)
    }
  })

  it('carries the specific reason a malformed node was refused, not only the general shape its $type accepts', () => {
    const message = refusalFrom({
      shadow: {
        $type: 'shadow',
        bad: {
          $value: {
            offsetX: { unit: 'banana', value: 1 },
            offsetY: { unit: 'px', value: 0 },
            blur: { unit: 'px', value: 0 },
            spread: { unit: 'px', value: 0 },
            color: { colorSpace: 'srgb', components: [0, 0, 0] },
          },
        },
      },
    }).message

    // `offsetX` alone would pass even without this fix — it already appears inside the
    // verbatim `$value` dump — so this asserts the REASON TEXT specifically.
    expect(message).toContain('unit "banana" is not one this reader renders')
  })

  it('embeds a malformed reason without a duplicated reader prefix or a visibly empty path', () => {
    const message = refusalFrom({
      shadow: {
        $type: 'shadow',
        bad: {
          $value: {
            offsetX: { unit: 'banana', value: 1 },
            offsetY: { unit: 'px', value: 0 },
            blur: { unit: 'px', value: 0 },
            spread: { unit: 'px', value: 0 },
            color: { colorSpace: 'srgb', components: [0, 0, 0] },
          },
        },
      },
    }).message

    expect(message).toContain('dimension "offsetX" unit "banana" is not one this reader renders')
    expect(message).not.toContain('at ""')
    // Assert the COUNT, not merely presence: presence passes even with the prefix stuttered
    // once per malformed entry, since the section heading also carries it once.
    expect(message.match(/DTCG 2025\.10 reader:/g)).toHaveLength(1)
  })

  it('omits the reason line entirely when the renderer names nothing beyond the $value dump already shown', () => {
    const message = refusalFrom({ nums: { bad2: { $type: 'number', $value: true } } }).message

    expect(message).not.toContain('unreadable value')
    expect(message).toContain('nums.bad2')
    expect(message).toContain('true')
    expect(message).toContain('Its own $type accepts: a "number" value is a JSON number.')
  })
})

describe('AC-token-build-38 covers: R38 (the refusal’s four contents, and the two it must not carry)', () => {
  it('carries the node path, the FILE, and the $value verbatim', () => {
    const message = refusalFrom(draftDimension, 'my-tokens.json').message
    expect(message).toContain('spacing.small')
    expect(message).toContain('my-tokens.json')
    expect(message).toContain('"16px"')
  })

  it('says what the file IS by name, and never calls it invalid or unsupported', () => {
    const message = refusalFrom(draftDimension, 'my-tokens.json').message
    expect(message).toContain('pre-stable draft shape')
    expect(message).not.toMatch(/\binvalid\b/i)
    expect(message).not.toMatch(/\bunsupported\b/i)
  })

  it('points at the specification by DATE, and carries no enumerated accepted-form list', () => {
    const message = refusalFrom(draftDimension, 'my-tokens.json').message
    expect(message).toContain('2025.10')
    expect(message).toContain('28 October 2025')
    expect(message).not.toContain('Accepted seed forms')
  })

  it('carries neither the seed refusal’s verbatim input echo nor its two-act distinction', () => {
    const message = refusalFrom(draftDimension, 'my-tokens.json').message
    expect(message).not.toContain('Input as given:')
    expect(message).not.toContain('Refused at:')
  })

  it('is a DtcgShapeRefusal, never a SeedIngestRefusal or a UsageError, so it exits 1', async () => {
    const { SeedIngestRefusal } = await import('../src/theming/seed-refusal.ts')
    const { UsageError } = await import('../src/errors.ts')
    const refusal = refusalFrom(draftDimension, 'my-tokens.json')

    expect(refusal).toBeInstanceOf(DtcgShapeRefusal)
    expect(refusal).not.toBeInstanceOf(SeedIngestRefusal)
    expect(refusal).not.toBeInstanceOf(UsageError)
  })
})

describe('AC-token-build-39 covers: R39 (a per-$type conversion instruction, never one template)', () => {
  const drafts: Record<string, unknown> = {
    dimension: { $type: 'dimension', $value: '16px' },
    duration: { $type: 'duration', $value: '200ms' },
    fontFamily: { $type: 'fontFamily', $value: 'system-ui, sans-serif' },
    fontWeight: { $type: 'fontWeight', $value: '400' },
    number: { $type: 'number', $value: '14' },
    shadow: {
      $type: 'shadow',
      $value: { offsetX: '0', offsetY: '1px', blur: '2px', color: 'oklch(0 0 0 / 0.1)' },
    },
  }

  it('gives each of the six refused types an instruction naming that type’s own shape difference', () => {
    const refusal = refusalFrom(drafts, 'tokens.json') as DtcgShapeRefusal
    const byType = new Map(refusal.nodes.map((node) => [node.type, node.conversion]))

    expect(byType.get('dimension')).toContain('unit')
    expect(byType.get('duration')).toContain('ms')
    expect(byType.get('number')).toContain('JSON number')
    expect(byType.get('fontWeight')).toContain('keyword')
    expect(byType.get('shadow')).toContain('spread')
    expect(byType.get('fontFamily')).toContain('array')
  })

  it('fails a single interpolated template: no two instructions are the same sentence with the type name swapped', () => {
    const refusal = refusalFrom(drafts, 'tokens.json') as DtcgShapeRefusal
    const skeletons = refusal.nodes.map((node) =>
      node.conversion.replaceAll(new RegExp(node.type, 'gi'), '<type>'),
    )
    expect(new Set(skeletons).size).toBe(skeletons.length)
  })

  it('never states or implies that the fix is to re-export the file from the author’s own tool', () => {
    const refusal = refusalFrom(drafts, 'tokens.json') as DtcgShapeRefusal
    for (const node of refusal.nodes) {
      expect(node.conversion).not.toMatch(/re-?export/i)
      expect(node.conversion).not.toMatch(/\byour (?:tool|editor|plugin|exporter)\b/i)
    }
  })
})

describe('AC-token-build-42 covers: R42 (the accepted $type set, and two distinct refusal grounds)', () => {
  const ACCEPTED = [
    'color',
    'cubicBezier',
    'dimension',
    'duration',
    'fontFamily',
    'fontWeight',
    'number',
    'shadow',
  ]

  it('accepts the seven types tokens.json uses plus color, refusing none of them for its type', () => {
    const source: Record<string, unknown> = {
      color: { $type: 'color', $value: { colorSpace: 'oklch', components: [0.5, 0.1, 180] } },
      cubicBezier: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] },
      dimension: { $type: 'dimension', $value: { value: 16, unit: 'px' } },
      duration: { $type: 'duration', $value: { value: 200, unit: 'ms' } },
      fontFamily: { $type: 'fontFamily', $value: ['system-ui'] },
      fontWeight: { $type: 'fontWeight', $value: 400 },
      number: { $type: 'number', $value: 1.5 },
      shadow: { $type: 'shadow', $value: [] },
    }
    expect(
      readTokens(source)
        .map((t) => t.type)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(ACCEPTED)
  })

  it('refuses transition, gradient and typography BY NAME on a STRUCTURAL ground, stated in the message', () => {
    for (const type of ['transition', 'gradient', 'typography']) {
      const message = refusalFrom({ t: { $type: type, $value: {} } }).message
      expect(message).toContain(type)
      expect(message).toContain('one CSS value')
    }
  })

  it('refuses border and strokeStyle BY NAME on a SCOPE ground, distinguishable in the message', () => {
    for (const type of ['border', 'strokeStyle']) {
      const message = refusalFrom({ t: { $type: type, $value: {} } }).message
      expect(message).toContain(type)
      expect(message).toContain('scope')
      expect(message).not.toContain('one CSS value')
    }
  })

  it('names the return trigger on the scope refusal and NOT on the structural one', () => {
    const scope = refusalFrom({ t: { $type: 'border', $value: {} } }).message
    const structural = refusalFrom({ t: { $type: 'gradient', $value: {} } }).message

    expect(scope).toContain('0.2.0')
    expect(structural).not.toContain('0.2.0')
  })
})

describe('AC-token-build-43 covers: R43 ($ref supported, narrowed to whole-token pointers)', () => {
  const base = { spacing: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } } }

  it('resolves a whole-token $ref to the referenced token’s own resolved value', () => {
    const tokens = readTokens({
      ...base,
      gap: { $type: 'dimension', $ref: '#/spacing/md' },
    })
    expect(tokens.find((t) => t.path[0] === 'gap')?.value).toBe('16px')
  })

  it('unescapes RFC 6901’s ~1 and ~0 in a pointer segment', () => {
    const tokens = readTokens({
      'a/b': { '~c': { $type: 'number', $value: 7 } },
      ref: { $type: 'number', $ref: '#/a~1b/~0c' },
    })
    expect(tokens.find((t) => t.path[0] === 'ref')?.value).toBe(7)
  })

  it('refuses a $ref pointing into a SUB-VALUE rather than at a whole token, naming that reason', () => {
    const message = refusalFrom({
      ...base,
      bad: { $type: 'dimension', $ref: '#/spacing/md/$value/unit' },
    }).message
    expect(message).toContain('sub-value')
    expect(message).toContain('spacing.md')
  })

  it('refuses a node carrying BOTH $ref and a {group.token} alias, naming both reference forms', () => {
    const message = refusalFrom({
      ...base,
      both: { $type: 'dimension', $ref: '#/spacing/md', $value: '{spacing.md}' },
    }).message
    expect(message).toContain('$ref')
    expect(message).toContain('both')
  })

  it('never drops a $ref token silently: the run either resolves it or refuses, never exits with the name simply absent', () => {
    const resolved = readTokens({ ...base, gap: { $type: 'dimension', $ref: '#/spacing/md' } })
    expect(resolved.map((t) => t.name)).toContain('gap')

    expect(() => readTokens({ ...base, gap: { $type: 'dimension', $ref: '#/nowhere' } })).toThrow()
  })
})
