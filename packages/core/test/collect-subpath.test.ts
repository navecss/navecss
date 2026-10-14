/**
 * AC-nextjs-used-atoms-08: the module reader, the report formatter and the option validation are
 * one public subpath of core with no parser and no host module behind it, and the Vite plugin
 * reaches them through the same built module. Reads `dist/`, so it needs a build.
 */
import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.join(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')

/**
 * Every Node built-in under both spellings. The build strips the `node:` prefix (`dist/vite.js`
 * imports from 'fs'), so the bare name has to count as much as the prefixed one. Subpaths such as
 * `fs/promises` are listed by `builtinModules` themselves; a name that only exists with the
 * prefix (`node:test`) stays prefixed.
 */
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))

/**
 * Hosts and parsers the reader must not reach, with any subpath of them.
 */
const FORBIDDEN_PACKAGE = /^(?:vite|rollup|rolldown|oxc-parser|oxc-resolver)(?:\/|$)/u

function isForbidden(specifier: string): boolean {
  return (
    specifier.startsWith('node:') ||
    specifier === 'node' ||
    NODE_BUILTINS.has(specifier) ||
    FORBIDDEN_PACKAGE.test(specifier)
  )
}

/**
 * Every module specifier a built file names: `from '...'` (an import or an `export ... from`), a
 * bare `import '...'`, a dynamic `import('...')` and a `/// <reference types="..." />` line.
 */
function specifiersIn(text: string): string[] {
  const imports = text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)
  const references = text.matchAll(/^\/\/\/\s*<reference\s+types=["']([^"']+)["']/gmu)
  return [...imports, ...references].map((match) => match[1]!)
}

/**
 * The file a relative specifier names. A declaration file spells a sibling declaration file with
 * the `.js` ending TypeScript requires, so that import is followed to the `.d.ts`.
 */
function resolveRelative(from: string, specifier: string): string {
  const target = path.resolve(path.dirname(from), specifier)
  return from.endsWith('.d.ts') && target.endsWith('.js') ? `${target.slice(0, -3)}.d.ts` : target
}

/**
 * The built files `entry` (a name in `dist/`) reaches through relative imports, itself included,
 * each with the specifiers it names. A relative specifier whose file is missing throws.
 */
function moduleGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  const queue = [path.join(DIST, entry)]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (graph.has(file)) continue
    const specifiers = specifiersIn(readFileSync(file, 'utf8'))
    graph.set(file, specifiers)
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) queue.push(resolveRelative(file, specifier))
    }
  }
  return graph
}

/**
 * The forbidden specifiers anywhere in a graph, each as `<file>: <specifier>`.
 */
function forbiddenIn(graph: Map<string, string[]>): string[] {
  return [...graph].flatMap(([file, specifiers]) =>
    specifiers
      .filter((specifier) => isForbidden(specifier))
      .map((specifier) => `${path.basename(file)}: ${specifier}`),
  )
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

  it('exports exactly the reader, the report, its cause, the option validation and the helpers they share', async () => {
    const collect = (await import(pathToFileURL(path.join(DIST, 'collect.js')).href)) as Record<
      string,
      unknown
    >
    expect(Object.keys(collect).toSorted((a, b) => Number(a > b) - Number(a < b))).toEqual([
      'CX_SOURCE',
      'REPORT_CAUSE',
      'assertOptions',
      'buildReport',
      'keptAtoms',
      'readModule',
      'resolveUsedOptions',
    ])
  })

  it('reaches no vite, rollup, rolldown, oxc-parser, oxc-resolver or Node built-in module, in code or in types', () => {
    const code = moduleGraph('collect.js')
    const types = moduleGraph('collect.d.ts')
    expect(code.size).toBeGreaterThan(1)
    expect(types.size).toBeGreaterThan(1)
    expect(forbiddenIn(code)).toEqual([])
    expect(forbiddenIn(types)).toEqual([])
  })

  it('control: the same scan finds a Node built-in that vite.js imports', () => {
    const imported = forbiddenIn(moduleGraph('vite.js')).map((hit) => hit.split(': ', 2)[1]!)
    expect(imported.filter((specifier) => NODE_BUILTINS.has(specifier))).not.toEqual([])
  })

  it('control: the declaration walk follows a .js specifier in collect.d.ts to the shared .d.ts files', () => {
    const files = moduleGraph('collect.d.ts')
      .keys()
      .map((file) => path.basename(file))
      .toArray()
    expect(files).toContain('atoms.d.ts')
    expect(files.some((file) => /^vite-options-.+\.d\.ts$/u.test(file))).toBe(true)
  })

  it('control: the scan reads a static, bare, re-export and dynamic import, and judges each spelling', () => {
    const text = [
      "import { a } from 'node:fs'",
      "import 'path'",
      "export * from 'fs/promises'",
      "export {\n  b,\n} from 'vite/client'",
      "const c = await import('crypto')",
      'import("rollup")',
    ].join('\n')
    const specifiers = specifiersIn(text)
    expect(specifiers).toEqual([
      'node:fs',
      'path',
      'fs/promises',
      'vite/client',
      'crypto',
      'rollup',
    ])
    expect(specifiers.every((specifier) => isForbidden(specifier))).toBe(true)
    expect(['./chunk.js', '@navecss/tokens/breakpoints'].some((s) => isForbidden(s))).toBe(false)
  })

  it('is reached by the Vite plugin through the one built module that holds the reader', () => {
    const holders = moduleGraph('vite.js')
      .keys()
      .filter((file) => readFileSync(file, 'utf8').includes('function readModule('))
      .toArray()
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

/**
 * The README sentence that names the entry points loading through `import` only, up to the
 * sentence about `require()`.
 */
function importOnlySentence(): string {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const start = readme.indexOf('- **ES modules.**')
  expect(start).toBeGreaterThanOrEqual(0)
  const bullet = readme.slice(start).split(/\n- \*\*/u, 1)[0]!
  return bullet.split('A `require()`', 1)[0]!.replaceAll(/\s+/gu, ' ')
}

/**
 * The export keys whose map is exactly `{ types, import }`: the subpaths a `require()` cannot
 * reach.
 */
function importOnlyKeys(): string[] {
  const exports = manifest().exports as Record<string, unknown>
  return Object.entries(exports)
    .filter(([, value]) => {
      if (typeof value !== 'object' || value === null) return false
      const keys = new Set(Object.keys(value))
      return keys.size === 2 && keys.has('import') && keys.has('types')
    })
    .map(([key]) => key)
}

describe('AC-nextjs-used-atoms-08: the README lists every import-only subpath', () => {
  it('names @navecss/core/<key> for every export key whose map is exactly { types, import }', () => {
    const keys = importOnlyKeys()
    expect(keys).toContain('./collect')
    expect(keys).toContain('./lightningcss')
    const sentence = importOnlySentence()
    expect(sentence).toContain('load through `import` only')
    for (const key of keys) {
      expect(sentence, `README does not name @navecss/core/${key.slice(2)}`).toContain(
        `\`@navecss/core/${key.slice(2)}\``,
      )
    }
  })
})
