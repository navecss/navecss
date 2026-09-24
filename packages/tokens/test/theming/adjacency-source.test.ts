import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ADJACENCY, materializeAdjacency } from '../../src/theming/adjacency-source.ts'
import { assertNoDuplicateAdjacencySubjects } from '../../src/theming/tokens-source.ts'

/**
 * `materializeAdjacency` is the function that turns `tokens.json`'s
 * `$extensions.dev.navecss.theming.adjacency` block into the flat `Adjacency[]` list every
 * other module reads. Its own doc comment says it validates a constructed source without
 * touching the filesystem; these are the tests that exercise that path directly (every
 * error branch), rather than only ever running it against the one real, well-formed
 * `tokens.json` at module load — an exported function with no direct test is often
 * unfinished wiring, not dead code.
 */
describe('materializeAdjacency (R22 source validation)', () => {
  it('flattens a well-formed per-subject block into the flat Adjacency[] shape', () => {
    const result = materializeAdjacency({
      $extensions: {
        'dev.navecss.theming': {
          adjacency: {
            comment: 'ignored, not a subject',
            'content.primary': [
              { against: 'surface.base', class: 'text' },
              { against: 'surface.raised', class: 'text' },
            ],
            'border.control': [{ against: 'surface.base', class: 'non-text' }],
          },
        },
      },
    })
    expect(result).toEqual([
      { subject: 'content.primary', against: 'surface.base', class: 'text' },
      { subject: 'content.primary', against: 'surface.raised', class: 'text' },
      { subject: 'border.control', against: 'surface.base', class: 'non-text' },
    ])
  })

  it('throws when the source is not an object at all', () => {
    expect(() => materializeAdjacency('not an object')).toThrow(/did not parse to an object/)
    // JSON.parse('null'), not the literal, so the real "$value is JSON null" shape is
    // exercised rather than JavaScript's own undefined/null distinction.
    expect(() => materializeAdjacency(JSON.parse('null') as unknown)).toThrow(
      /did not parse to an object/,
    )
    expect(() => materializeAdjacency(['an', 'array'])).toThrow(/did not parse to an object/)
  })

  it('throws naming the missing block when $extensions.dev.navecss.theming.adjacency is absent', () => {
    expect(() => materializeAdjacency({})).toThrow(
      /carries no \$extensions\.dev\.navecss\.theming\.adjacency block/,
    )
    expect(() => materializeAdjacency({ $extensions: {} })).toThrow(
      /carries no \$extensions\.dev\.navecss\.theming\.adjacency block/,
    )
    expect(() => materializeAdjacency({ $extensions: { 'dev.navecss.theming': {} } })).toThrow(
      /carries no \$extensions\.dev\.navecss\.theming\.adjacency block/,
    )
  })

  it('throws naming the subject whose value is not an array of partners', () => {
    expect(() =>
      materializeAdjacency({
        $extensions: {
          'dev.navecss.theming': {
            adjacency: { 'content.primary': 'surface.base' },
          },
        },
      }),
    ).toThrow(
      /adjacency\["content\.primary"\] in @navecss\/tokens' own bundled tokens\.json is not an array of partners/,
    )
  })

  it('throws naming the subject whose partner entry is malformed (missing/wrong-typed fields)', () => {
    const malformedAgainst = {
      $extensions: {
        'dev.navecss.theming': {
          adjacency: { 'content.primary': [{ against: 123, class: 'text' }] },
        },
      },
    }
    expect(() => materializeAdjacency(malformedAgainst)).toThrow(
      /adjacency\["content\.primary"\] in @navecss\/tokens' own bundled tokens\.json carries a malformed partner entry/,
    )

    const malformedClass = {
      $extensions: {
        'dev.navecss.theming': {
          adjacency: { 'content.primary': [{ against: 'surface.base', class: 'loud' }] },
        },
      },
    }
    expect(() => materializeAdjacency(malformedClass)).toThrow(
      /adjacency\["content\.primary"\] in @navecss\/tokens' own bundled tokens\.json carries a malformed partner entry/,
    )
  })

  it('the shipped tokens.json parses clean through the same function (module-load path is not a special case)', () => {
    expect(ADJACENCY.length).toBeGreaterThan(0)
    for (const pair of ADJACENCY) {
      expect(typeof pair.subject).toBe('string')
      expect(typeof pair.against).toBe('string')
      expect(['text', 'non-text']).toContain(pair.class)
    }
  })
})

const block = (body: string): string =>
  `{ "$extensions": { "dev.navecss.theming": { "adjacency": { ${body} } } } }`

/**
 * Moving a TypeScript array into a hand-authored JSON object introduces
 * a loss mode that did not exist before and that no layer downstream of `JSON.parse` can
 * see. `materializeAdjacency` above is handed an object the parser has already collapsed, so
 * the check has to read the raw bytes.
 */
describe('assertNoDuplicateAdjacencySubjects (R22 source integrity)', () => {
  it('the loss it exists to catch is real: JSON.parse keeps the LAST block and drops the first', () => {
    const raw = block(
      '"content.primary": [{ "against": "surface.base", "class": "text" }], ' +
        '"content.primary": [{ "against": "surface.sunken", "class": "text" }]',
    )
    expect(materializeAdjacency(JSON.parse(raw))).toEqual([
      { subject: 'content.primary', against: 'surface.sunken', class: 'text' },
    ])
  })

  it('a duplicate subject key fails, naming the subject', () => {
    const raw = block(
      '"content.primary": [{ "against": "surface.base", "class": "text" }], ' +
        '"content.primary": [{ "against": "surface.sunken", "class": "text" }]',
    )
    expect(() => assertNoDuplicateAdjacencySubjects(raw)).toThrow(
      /declares the subject "content\.primary" twice/,
    )
  })

  it('the shipped tokens.json carries no duplicate subject', () => {
    const raw = readFileSync(path.resolve(import.meta.dirname, '../../tokens.json'), 'utf8')
    expect(() => assertNoDuplicateAdjacencySubjects(raw)).not.toThrow()
  })

  it('a subject name repeated as a PARTNER value is not a duplicate key', () => {
    const raw = block(
      '"content.primary": [{ "against": "surface.base", "class": "text" }], ' +
        '"border.control": [{ "against": "content.primary", "class": "non-text" }]',
    )
    expect(() => assertNoDuplicateAdjacencySubjects(raw)).not.toThrow()
  })

  it('a brace inside the block comment does not end the block early', () => {
    const raw = block(
      `${String.raw`"comment": "a } brace and a \" quote, both inside a string", `}"content.primary": [{ "against": "surface.base", "class": "text" }], ` +
        `"content.primary": [{ "against": "surface.sunken", "class": "text" }]`,
    )
    expect(() => assertNoDuplicateAdjacencySubjects(raw)).toThrow(/twice/)
  })

  it('names the consequence and not only the duplicate, so the reader knows what is lost', () => {
    const raw = block(
      '"content.primary": [{ "against": "surface.base", "class": "text" }], ' +
        '"content.primary": [{ "against": "surface.sunken", "class": "text" }]',
    )
    expect(() => assertNoDuplicateAdjacencySubjects(raw)).toThrow(/dropped silently/)
  })
})
