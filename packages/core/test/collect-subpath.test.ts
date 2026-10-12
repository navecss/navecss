/**
 * AC-nextjs-used-atoms-08: the module reader, the report formatter and the option validation are
 * one public subpath of core with no parser and no host module behind it, and the Vite plugin
 * reaches them through the same built module. Reads `dist/`, so it needs a build.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.join(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')

const FORBIDDEN_IMPORT =
  /^(?:node:|vite(?:\/|$)|rollup(?:\/|$)|rolldown(?:\/|$)|oxc-parser|oxc-resolver)/

/**
 * Every static import specifier of a built file: `from '...'` and a bare `import '...'`.
 */
function specifiersOf(file: string): string[] {
  const text = readFileSync(path.join(DIST, file), 'utf8')
  return text
    .matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)
    .map((match) => match[1]!)
    .toArray()
}

/**
 * The built files `entry` reaches through relative imports, itself included.
 */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const specifier of specifiersOf(file)) {
      if (specifier.startsWith('./')) queue.push(specifier.slice(2))
    }
  }
  return seen
}

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
}

describe('AC-nextjs-used-atoms-08 — the reader is one public, parser-free subpath', () => {
  it('names ./collect in the export map, loadable by import', () => {
    const exports = manifest().exports as Record<string, unknown>
    expect(exports['./collect']).toEqual({
      types: './dist/collect.d.ts',
      import: './dist/collect.js',
    })
    expect(existsSync(path.join(DIST, 'collect.js'))).toBe(true)
    expect(existsSync(path.join(DIST, 'collect.d.ts'))).toBe(true)
  })

  it('exports the module reader, the report formatter with its cause, and option validation', async () => {
    const collect = (await import(pathToFileURL(path.join(DIST, 'collect.js')).href)) as Record<
      string,
      unknown
    >
    expect(collect.readModule).toBeTypeOf('function')
    expect(collect.buildReport).toBeTypeOf('function')
    expect(collect.REPORT_CAUSE).toBeTypeOf('string')
    expect(collect.assertOptions).toBeTypeOf('function')
    expect(collect.resolveUsedOptions).toBeTypeOf('function')
  })

  it('reaches no vite, rollup, rolldown, oxc-parser, oxc-resolver or node: module', () => {
    const graph = moduleGraph('collect.js')
    expect(graph.size).toBeGreaterThan(1)
    for (const file of graph) {
      expect(specifiersOf(file).filter((specifier) => FORBIDDEN_IMPORT.test(specifier))).toEqual([])
    }
  })

  it('is reached by the Vite plugin through the one built module that holds the reader', () => {
    const holders = [...moduleGraph('vite.js')].filter((file) =>
      readFileSync(path.join(DIST, file), 'utf8').includes('function readModule('),
    )
    expect(holders).toHaveLength(1)
    expect(moduleGraph('collect.js').has(holders[0]!)).toBe(true)
  })

  it('names neither oxc-parser nor oxc-resolver in any dependency field', () => {
    const pkg = manifest()
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const names = Object.keys(pkg[field] ?? {})
      expect(names).not.toContain('oxc-parser')
      expect(names).not.toContain('oxc-resolver')
    }
  })

  it('has an Exports-table row for the subpath that says it is not meant for application code', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    const row = readme.split('\n').find((line) => line.startsWith('| `@navecss/core/collect`'))
    expect(row).toBeDefined()
    expect(row).toContain('not meant for application code')
  })
})
