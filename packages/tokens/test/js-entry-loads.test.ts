/**
 * `package.json`'s `"."` and `"./js"` `import` conditions both resolve to
 * `dist/tokens.js`, which `formatJsTokens` wrote with `} as const` and two `export type`
 * lines — TypeScript, not JavaScript. `import { tokens } from '@navecss/tokens'` threw
 * `SyntaxError: Unexpected identifier 'as'` at module load on every build since the
 * first-party reader landed, and nothing caught it: `formats-boundary.test.ts` asserts the
 * emitted STRING, `check:pack` asserts names and presence, and no package in this monorepo
 * imports the JS entry. Test the published graph, not the source graph.
 *
 * Every load here goes OUT OF PROCESS through the real `node` binary: vitest's own module
 * pipeline parses a file with a different parser and reports a different error, so an
 * in-process `import()` would not be evidence about the runtime that actually fails. Assumes
 * `pnpm run build` has produced `dist/` (turbo.json: `test` depends on `build`, the
 * `bin.test.ts` convention).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { FlatToken } from '../src/reader.ts'

import { formatJsTokens, formatTsDeclarations } from '../src/formats.ts'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..')

interface ExportTarget {
  [condition: string]: ExportTarget | string
}

interface ImportTarget {
  subpath: string
  file: string
  rel: string
}

interface LoadResult {
  status: number
  stderr: string
  exportNames: string[]
  tokens?: Record<string, unknown>
}

/**
 * Resolves one export-map entry the way Node resolves an `import`: the first of
 * `import`/`node`/`default` in key order at every level, continuing to the next sibling
 * key when a matched key's value resolves to nothing, which is Node's condition matching.
 * A bare string entry (no conditions object at all) is a stylesheet or a JSON file,
 * resolved by no `import` condition; a level whose keys contain none of the three, or
 * whose matched keys all resolve to nothing, also resolves to `undefined`.
 */
function resolveImportTarget(entry: ExportTarget | string): string | undefined {
  if (typeof entry === 'string') return undefined
  for (const [key, value] of Object.entries(entry)) {
    if (key !== 'import' && key !== 'node' && key !== 'default') continue
    const resolved = typeof value === 'string' ? value : resolveImportTarget(value)
    if (resolved !== undefined) return resolved
  }
  return undefined
}

/**
 * The `import` target of every subpath in the real export map that declares one, resolved
 * via `resolveImportTarget`. A subpath whose resolution ends in no string is skipped.
 */
function importTargets(): ImportTarget[] {
  const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, ExportTarget | string>
  }
  const targets: ImportTarget[] = []
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    const target = resolveImportTarget(entry)
    if (target === undefined) continue
    const file = path.join(PACKAGE_ROOT, target)
    const rel = path.relative(PACKAGE_ROOT, file).split(path.sep).join('/')
    targets.push({ subpath, file, rel })
  }
  return targets
}

/**
 * Imports one file in a fresh Node process and reports what loaded: the export names, plus
 * the `tokens` export when the module has one. A load failure surfaces as a non-zero status
 * with Node's own message in `stderr` (asserted as one shape, so the message lands in the diff).
 */
function loadInNode(file: string): LoadResult {
  const script = [
    `const m = await import(${JSON.stringify(pathToFileURL(file).href)})`,
    "const tokens = typeof m.tokens === 'object' ? m.tokens : undefined",
    'process.stdout.write(JSON.stringify({ exportNames: Object.keys(m), tokens }))',
  ].join('\n')
  try {
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    })
    return {
      status: 0,
      stderr: '',
      ...(JSON.parse(stdout) as Pick<LoadResult, 'exportNames' | 'tokens'>),
    }
  } catch (error) {
    const failure = error as { status: number | null; stderr: string }
    return { status: failure.status ?? 1, stderr: failure.stderr, exportNames: [] }
  }
}

function targetOf(subpath: string): ImportTarget {
  const target = importTargets().find((t) => t.subpath === subpath)
  if (target === undefined) throw new Error(`${subpath} declares no import condition`)
  return target
}

describe('resolveImportTarget walks import, then node, then default, at every level', () => {
  it('prefers a nested `import` over a top-level `default`', () => {
    const entry: ExportTarget = {
      types: './tokens.d.ts',
      node: { import: './a.js' },
      default: './b.js',
    }
    expect(resolveImportTarget(entry)).toBe('./a.js')
  })

  it('falls back to `default` when neither `import` nor `node` is present', () => {
    const entry: ExportTarget = { types: './tokens.d.ts', default: './b.js' }
    expect(resolveImportTarget(entry)).toBe('./b.js')
  })

  it('resolves a bare string entry to undefined (no `import` condition to walk)', () => {
    expect(resolveImportTarget('./x.css')).toBeUndefined()
  })

  // Key order wins, not a fixed precedence: a fixed `import ?? node ?? default` order
  // would return './a.js' here, but `default` is the first matching key in this entry.
  it('takes `default` over a later `import` when `default` comes first in key order', () => {
    const entry: ExportTarget = { default: './b.js', import: './a.js' }
    expect(resolveImportTarget(entry)).toBe('./b.js')
  })

  // A matched key whose nested object has no enabled condition does not end the walk:
  // `import` here resolves to nothing, so the walk continues to the sibling `default`.
  it('continues to the next sibling key when a matched key resolves to nothing', () => {
    const entry: ExportTarget = { import: { require: './r.js' }, default: './b.js' }
    expect(resolveImportTarget(entry)).toBe('./b.js')
  })
})

// The two TypeScript forms `formatJsTokens` historically wrote into `dist/tokens.js`; the
// Node load one test up is the actual guard, this is just belt-and-braces on the syntax.
const HISTORICAL_TS_FORMS = [/\bas const\b/, /^export (?:declare )?type\b/m]

describe('the "." and "./js" import conditions load in Node', () => {
  it('"." resolves to a file Node imports, and it exports `tokens`', () => {
    const result = loadInNode(targetOf('.').file)
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    expect(result.exportNames).toContain('tokens')
  })

  /**
   * Every token reads back as a JSON scalar, which since the source moved to DTCG 2025.10 is
   * `string` OR `number`: a `number`, `fontWeight`, `lineHeight` or `opacity` token carries its
   * own JSON type through to the emitted object, and `tokens.d.ts` types those keys `number` to
   * say so. Asserting `string` alone here would pin the shipped claim this package had to stop
   * making, so both members are asserted, and one witness of each is named so the union is not
   * satisfied vacuously by an all-string object.
   */
  it('"./js" resolves to a file Node imports, and every token reads back as a JSON scalar', () => {
    const result = loadInNode(targetOf('./js').file)
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    expect(result.tokens).toBeDefined()
    const values = Object.values(result.tokens ?? {})
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) expect(['number', 'string']).toContain(typeof value)
    // `--nave-font-size-md` is one example key, not the contract being asserted above.
    expect(typeof result.tokens?.['--nave-font-size-md']).toBe('string')
    expect(typeof result.tokens?.['--nave-font-weight-bold']).toBe('number')
  })

  it('the built file carries neither TypeScript form the emitter used to write', () => {
    const js = readFileSync(targetOf('./js').file, 'utf8')
    for (const pattern of HISTORICAL_TS_FORMS) expect(js).not.toMatch(pattern)
  })
})

describe('every `import` condition in the export map loads in Node', () => {
  const targets = importTargets()

  it('the walk finds the two subpaths this defect shipped through, so nothing below is vacuous', () => {
    expect(targets.map((t) => t.subpath)).toEqual(expect.arrayContaining(['.', './js']))
  })

  it.each(targets)('$subpath → $rel', ({ file }) => {
    const result = loadInNode(file)
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    expect(result.exportNames.length).toBeGreaterThan(0)
  })
})

const FIXTURE_TOKENS: FlatToken[] = [
  { path: ['font', 'size', 'md'], name: 'font-size-md', type: 'dimension', value: '1rem' },
  {
    path: ['_primitive', 'neutral', '500'],
    name: 'primitive-neutral-500',
    type: 'color',
    value: 'oklch(0.5 0 0)',
  },
]

describe('formatJsTokens emits JavaScript; formatTsDeclarations keeps the types', () => {
  it('the emitted string is a module Node imports, exposing the public token by its custom-property name', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'navecss-js-entry-'))
    try {
      const file = path.join(dir, 'tokens.mjs')
      writeFileSync(file, formatJsTokens(FIXTURE_TOKENS))

      const result = loadInNode(file)
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
      expect(result.exportNames).toEqual(['tokens'])
      expect(result.tokens).toEqual({ '--nave-font-size-md': '1rem' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the emitted string carries neither TypeScript form the emitter used to write', () => {
    const js = formatJsTokens(FIXTURE_TOKENS)
    for (const pattern of HISTORICAL_TS_FORMS) expect(js).not.toMatch(pattern)
  })

  it('the .d.ts still declares the `tokens` object and both type aliases (moved, not lost)', () => {
    const dts = formatTsDeclarations(FIXTURE_TOKENS)
    expect(dts).toContain('export declare const tokens: {')
    expect(dts).toContain('export declare type TokenName = keyof typeof tokens')
    expect(dts).toContain('export declare type TokenValue = typeof tokens[TokenName]')
  })
})
