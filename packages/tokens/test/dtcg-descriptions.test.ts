import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { collectDescriptions, collectDescriptionsFromSources } from '../src/dtcg-descriptions.ts'

async function scratchDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'nave-dtcg-descriptions-'))
}

// A review found that `dtcg-descriptions.ts` had no dedicated test file, only indirect
// coverage via copy-lint.test.ts's own real-corpus check. These cases cover the walk's edges
// directly: a root-level description, a malformed root, an empty tree, `$`-key exclusion, and
// the file-reading half's own failure modes.

describe('collectDescriptions: the walk over one parsed DTCG tree', () => {
  it('a root-level $description collapses the path key to ""', () => {
    const descriptions = collectDescriptions({ $description: 'The whole tree.', $type: 'color' })
    expect(descriptions.get('')).toBe('The whole tree.')
  })

  it('an empty tree ({}) yields an empty map, not a throw', () => {
    expect(collectDescriptions({}).size).toBe(0)
  })

  it('a $-prefixed key is never descended into as a group — $extensions must not contribute', () => {
    const descriptions = collectDescriptions({
      color: { base: { $type: 'color', $value: '#000', $description: 'A base colour.' } },
      $extensions: { dev: { navecss: { $description: 'Should never be collected.' } } },
    })
    expect(descriptions.get('color.base')).toBe('A base colour.')
    expect(descriptions.values().toArray()).not.toContain('Should never be collected.')
    expect(descriptions.size).toBe(1)
  })

  it('nested groups accumulate their own descriptions under their own dotted path', () => {
    const descriptions = collectDescriptions({
      color: {
        border: {
          focus: { $type: 'color', $value: '#000', $description: 'Focus indicator colour.' },
        },
      },
    })
    expect(descriptions.get('color.border.focus')).toBe('Focus indicator colour.')
  })

  // Mirrors reader.ts's collectRawTokens: every node the recursion reaches (any key that
  // isn't `$`-prefixed) must be an object, because that is the only shape DTCG gives a group
  // or token node. A prior version of this walk returned an empty/partial map here instead,
  // while its own docblock claimed to mirror collectRawTokens — this is the case that made
  // that claim false (a non-object root, and a non-object mid-tree node) until aligned.
  it('a non-object / array root throws rather than silently returning an empty map', () => {
    expect(() => collectDescriptions(['not', 'an', 'object'])).toThrow(/expected an object/)
    expect(() => collectDescriptions('not an object either')).toThrow(/expected an object/)
    // JSON.parse('null'), not a literal `null`, so this stays within the file's own lint
    // rules while still exercising the isPlainObject(value !== null) branch for real.
    expect(() => collectDescriptions(JSON.parse('null'))).toThrow(/expected an object/)
  })

  it('a non-object node reached mid-walk throws, naming its dotted path', () => {
    expect(() => collectDescriptions({ color: { base: 'not an object' } })).toThrow(
      /expected an object at "color\.base"/,
    )
  })
})

describe('collectDescriptionsFromSources: the file-reading half', () => {
  it('returns one map PER FILE, not merged, in call order', async () => {
    const dir = await scratchDir()
    try {
      const firstPath = path.join(dir, 'a.json')
      const secondPath = path.join(dir, 'b.json')
      await writeFile(
        firstPath,
        JSON.stringify({ color: { a: { $type: 'color', $value: '#000', $description: 'A.' } } }),
      )
      await writeFile(
        secondPath,
        JSON.stringify({ color: { b: { $type: 'color', $value: '#000', $description: 'B.' } } }),
      )
      const maps = collectDescriptionsFromSources([firstPath, secondPath])
      expect(maps).toHaveLength(2)
      expect(maps[0]!.get('color.a')).toBe('A.')
      expect(maps[0]!.has('color.b')).toBe(false)
      expect(maps[1]!.get('color.b')).toBe('B.')
      expect(maps[1]!.has('color.a')).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('throws on malformed (unparsable) JSON, naming no fabricated result', async () => {
    const dir = await scratchDir()
    try {
      const badPath = path.join(dir, 'bad.json')
      await writeFile(badPath, '{ this is not valid JSON')
      expect(() => collectDescriptionsFromSources([badPath])).toThrow(SyntaxError)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('throws on an unreadable (nonexistent) path', async () => {
    const dir = await scratchDir()
    try {
      const missingPath = path.join(dir, 'does-not-exist.json')
      expect(() => collectDescriptionsFromSources([missingPath])).toThrow(/ENOENT/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
