/**
 * What the package CLAIMS about the format it implements, and what it never names.
 *
 * `R49` (the word "DTCG" dated, the word "W3C" gone, the community-group status stated once in
 * body prose), `R48` (the withdrawn resolved-artifact claim swept from its two renderings),
 * `R47` (the rename and the renamed file's own self-describing sentence), `R40` (no shipped
 * byte names a third-party product) and `R51` (every file implementing the reader is authored
 * here).
 *
 * The scans below walk the SHIPPED surfaces rather than the source tree: `dist/` is where a
 * docblock has already been stripped and a string literal has not, and that distinction is
 * what makes "shipped byte" a checkable predicate instead of a reading.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { THIRD_PARTY_RESIDUE_PATTERNS } from '../src/theming/third-party-provenance.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.resolve(here, '..')
const repo = path.resolve(pkg, '../..')
const read = (relative: string): string => readFileSync(path.join(pkg, relative), 'utf8')

/**
Every file under `dir`, recursively.
 */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const distFiles = walk(path.join(pkg, 'dist'))

/**
 * The compiled library, where `removeComments` has already stripped every docblock and left
 * every string literal standing. That is what makes "a shipped byte" a checkable predicate
 * rather than a reading of the source.
 */
const libFiles = distFiles.filter((file) => file.includes(`${path.sep}lib${path.sep}`))

/**
Every `$description` string anywhere in the shipped token source.
 */
function descriptions(node: unknown, out: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$description' && typeof value === 'string') out.push(value)
    else descriptions(value, out)
  }
  return out
}

describe('AC-token-build-49 covers: R49 (DTCG dated, W3C absent, the status stated once)', () => {
  const PACKING = ['package.json', 'README.md', 'tokens.json']

  it('dates every occurrence of DTCG on the packing surfaces, never a bare DTCG', () => {
    for (const relative of PACKING) {
      const text = read(relative)
      for (const match of text.matchAll(/DTCG(?<tail>.{0,9})/g)) {
        expect(`${relative}: DTCG${match.groups?.tail ?? ''}`).toContain('DTCG 2025.10')
      }
    }
  })

  it('dates every occurrence of DTCG in the runtime strings compiled into dist/lib', () => {
    for (const file of libFiles) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/DTCG(?<tail>.{0,9})/g)) {
        expect(`${file}: DTCG${match.groups?.tail ?? ''}`).toContain('DTCG 2025.10')
      }
    }
  })

  it('carries the word W3C on none of the packing surfaces, nor in dist/lib', () => {
    for (const relative of PACKING) expect(read(relative)).not.toContain('W3C')
    for (const file of libFiles) {
      expect(readFileSync(file, 'utf8')).not.toContain('W3C')
    }
  })

  it('carries the word W3C on none of the public surfaces that do not pack', () => {
    for (const relative of ['README.md', '.github/CONTRIBUTING.md', 'docs/index.md']) {
      expect(readFileSync(path.join(repo, relative), 'utf8')).not.toContain('W3C')
    }
  })

  it('states the community-group status at most once per surface, in body prose', () => {
    const STATUS = 'Community Group'
    for (const relative of ['README.md', 'tokens.json']) {
      const text = read(relative)
      expect(text.matchAll(new RegExp(STATUS, 'g')).toArray().length).toBeLessThanOrEqual(1)
    }
    // The package description is a tagline: the status never goes there.
    expect(read('package.json')).not.toContain(STATUS)
    // It IS stated, in body prose, on the surface that is the npm page.
    expect(read('README.md')).toContain(STATUS)
  })
})

describe('AC-token-build-48 covers: R48 (the withdrawn claim swept from both renderings)', () => {
  const WITHDRAWN = /any DTCG tool can consume/i

  it('no longer claims the emitted artifact is a DTCG document any DTCG tool can consume', () => {
    expect(read('tokens.json')).not.toMatch(WITHDRAWN)
    expect(read('src/theming/palette-record.ts')).not.toMatch(WITHDRAWN)
  })

  it('no longer cites the theming spec requirement as authority for a claim it no longer makes', () => {
    const source = read('src/theming/palette-record.ts')
    expect(source).not.toMatch(/R37[^]{0,80}any DTCG tool/i)
    expect(source).toContain('palette-record.json')
  })
})

describe('AC-token-build-47 covers: R47 (the rename, and the renamed file’s own sentence)', () => {
  const record = JSON.parse(read('dist/palette-record.json')) as Record<string, unknown>

  it('emits palette-record.json, and no file named tokens.resolved.json under either name', () => {
    const names = new Set(distFiles.map((f) => path.basename(f)))
    expect(names.has('palette-record.json')).toBe(true)
    expect(names.has('tokens.resolved.json')).toBe(false)
  })

  it('carries a non-$-rooted key saying what the file IS before what it is not', () => {
    const key = Object.keys(record).find((k) => !k.startsWith('$') && !k.startsWith('color.'))
    expect(key).toBeDefined()
    const sentence = String(record[key!])

    const whatItIsAt = sentence.indexOf('resolved palette record')
    const whatItIsNotAt = sentence.indexOf('not a DTCG 2025.10 document')
    expect(whatItIsAt).toBeGreaterThanOrEqual(0)
    expect(whatItIsNotAt).toBeGreaterThan(whatItIsAt)
    expect(sentence).toContain('tokens.json')
  })

  it('makes the narrower, true claim, never the measured-false one about every tool', () => {
    const sentence = Object.entries(record)
      .filter(([key]) => !key.startsWith('color.'))
      .map(([, value]) => String(value))
      .join(' ')

    expect(sentence).not.toMatch(/no DTCG.{0,20}tool reads/i)
    expect(sentence).toMatch(/not meant to be read by a DTCG/i)
  })
})

describe('AC-token-build-40 covers: R40 (no shipped byte names a third-party product)', () => {
  it('names more than the one historical literal, so a second product name cannot pass', () => {
    expect(THIRD_PARTY_RESIDUE_PATTERNS.length).toBeGreaterThan(1)
  })

  it('finds no third-party product name in any shipped byte of dist/', () => {
    for (const file of distFiles) {
      const text = readFileSync(file, 'utf8')
      for (const pattern of THIRD_PARTY_RESIDUE_PATTERNS) {
        expect(`${path.relative(pkg, file)}: ${text.match(pattern)?.[0] ?? ''}`).toBe(
          `${path.relative(pkg, file)}: `,
        )
      }
    }
  })

  it('finds no third-party product name in the README or in any shipped $description', () => {
    const surfaces = [read('README.md'), ...descriptions(JSON.parse(read('tokens.json')))]
    for (const surface of surfaces) {
      for (const pattern of THIRD_PARTY_RESIDUE_PATTERNS) {
        expect(surface).not.toMatch(pattern)
      }
    }
  })

  it('would catch a second product name that the single historical literal misses', () => {
    const invented = 'a refusal telling the reader to re-export from Terrazzo'
    expect(THIRD_PARTY_RESIDUE_PATTERNS.some((pattern) => pattern.test(invented))).toBe(true)
  })
})

describe('AC-token-build-51 covers: R51 (every reader file is authored in this repository)', () => {
  const READER_FILES = [
    'src/reader.ts',
    'src/dtcg-shape.ts',
    'src/composite-value.ts',
    'src/errors.ts',
  ]

  it('declares no dependency an implementation could have imported instead', () => {
    const manifest = JSON.parse(read('package.json')) as Record<string, unknown>
    expect(manifest.dependencies).toBeUndefined()
    expect(manifest.peerDependencies).toBeUndefined()
  })

  it('carries no third-party parser or colour-space library source in any reader file', () => {
    for (const relative of READER_FILES) {
      const text = read(relative)
      expect(text).not.toMatch(/\bcopied from\b/i)
      for (const pattern of THIRD_PARTY_RESIDUE_PATTERNS) expect(text).not.toMatch(pattern)
    }
  })

  it('states why the compiled-JS instrument cannot discharge the copy-in shape on its own', () => {
    const external = distFiles
      .filter((f) => f.endsWith('.js'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .matchAll(/from ['"]([^.'"][^'"]*)['"]/g)
          .toArray(),
      )
      .map((match) => match[1])

    // A copied-in parser has no external specifier at all, so this set staying empty is
    // exactly what R51 says does NOT discharge its predicate.
    expect(external.filter((specifier) => !specifier?.startsWith('node:'))).toEqual([])
  })
})
