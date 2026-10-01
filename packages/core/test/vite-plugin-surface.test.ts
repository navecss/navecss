/**
 * AC-directive-core-31 (the Vite plugin's surface), -28 (its default export) and -34 (only hosts
 * with a green fixture are exported): the plugin is a plain object named `nave` with no `enforce`,
 * it takes `extend` and `onUnknown` and nothing else, and `vite` is a name in no field of the
 * manifest but `devDependencies`, nor an import specifier in anything the built entry loads, types
 * included.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import viteModule, { navePlugin } from '../src/vite.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(CORE_ROOT, 'dist')

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
}

const IMPORT_SPECIFIER = /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/g
const DYNAMIC_SPECIFIER = /\bimport\(\s*['"]([^'"]+)['"]/g

function specifiersOf(source: string): string[] {
  return [
    ...[...source.matchAll(IMPORT_SPECIFIER)].map((m) => m[1]!),
    ...[...source.matchAll(DYNAMIC_SPECIFIER)].map((m) => m[1]!),
  ]
}

/**
 * Every file reachable from `entry` (a name in `dist/`) by relative import, with the bare
 * specifiers each of them names.
 */
function reachableFromDist(entry: string): { files: string[]; bare: Set<string> } {
  const files: string[] = []
  const bare = new Set<string>()
  const queue = [path.join(DIST, entry)]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    files.push(file)
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) queue.push(path.resolve(path.dirname(file), specifier))
      else bare.add(specifier)
    }
  }
  return { files, bare }
}

// Each type-check builds a TypeScript program over Vite's own types, which a loaded runner
// (every test file of the package running at once) takes well past the default timeout to do.
describe('AC-directive-core-31 — the Vite plugin’s surface', { timeout: 120_000 }, () => {
  it('is a plain object, named nave, with no enforce key', () => {
    const plugin = navePlugin()

    expect(Object.getPrototypeOf(plugin)).toBe(Object.prototype)
    expect(plugin.name).toBe('nave')
    expect('enforce' in plugin).toBe(false)
  })

  it('accepts extend (an object or a specifier) and onUnknown', () => {
    expect(() =>
      navePlugin({ extend: { a: { declarations: { color: 'red' } } }, onUnknown: 'warn' }),
    ).not.toThrow()
    expect(() => navePlugin({ extend: './no-such-file.mjs' })).not.toThrow()
  })

  it('names vite in no manifest field but devDependencies', () => {
    const pkg = manifest()
    for (const field of [
      'dependencies',
      'peerDependencies',
      'peerDependenciesMeta',
      'optionalDependencies',
      'bundledDependencies',
    ]) {
      const value = pkg[field]
      expect(JSON.stringify(value ?? {}), `${field} names vite`).not.toMatch(
        /(?<![\w-])vite(?![\w-])/,
      )
    }
    expect(Object.keys(pkg.devDependencies as Record<string, string>)).toContain('vite')
  })

  it('has no vite specifier in dist/vite.js, dist/vite.d.ts or any chunk they import', () => {
    for (const entry of ['vite.js', 'vite.d.ts']) {
      const { files, bare } = reachableFromDist(entry)

      expect(files.length).toBeGreaterThan(0)
      expect([...bare].filter((s) => s === 'vite' || s.startsWith('vite/'))).toEqual([])
      expect([...bare].filter((s) => s === 'postcss')).toEqual([])
    }
  })

  /**
   * Type-checks `source` as a consumer's file, against the built `dist/vite.d.ts` and Vite's own
   * types, with `skipLibCheck` off so a broken declaration surfaces.
   */
  function diagnosticsFor(source: string): string[] {
    const dir = mkdtempSync(path.join(CORE_ROOT, '.nave-vite-types-'))
    try {
      mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'consumer.ts')
      writeFileSync(file, source.replaceAll('@navecss/core/vite', '../dist/vite.js'))
      const program = ts.createProgram([file], {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ESNext,
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: ['node'],
        ignoreDeprecations: '6.0',
      })
      return ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  }

  it('type-checks in a Vite project: plugins takes it, and the default export has its type', () => {
    const diagnostics = diagnosticsFor(`
      import { defineConfig } from 'vite'
      import navePluginDefault, { navePlugin } from '@navecss/core/vite'

      export default defineConfig({
        plugins: [
          navePlugin(),
          navePlugin({ extend: { a: { declarations: { color: 'red' } } }, onUnknown: 'warn' }),
          navePlugin({ extend: './my-atoms.mjs' }),
        ],
      })
      export const same: typeof navePlugin = navePluginDefault
    `)

    expect(diagnostics).toEqual([])
  })

  it.each([
    ['an unknown option key', 'navePlugin({ scan: false })'],
    ['an enforce key', "navePlugin({ enforce: 'pre' })"],
    ['an onUnknown outside the closed set', "navePlugin({ onUnknown: 'bogus' })"],
  ])('a type test passing %s fails tsc', (_name, call) => {
    const diagnostics = diagnosticsFor(`
      import { navePlugin } from '@navecss/core/vite'
      navePlugin()
      ${call}
    `)

    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('a later overload that returns an array does not break a caller of the plain call', () => {
    // A later release may add `navePlugin(options)` overloads that return an array of plugin
    // objects while the call with no such option keeps returning the single object. A caller
    // written today must still compile when the declaration gains overloads like that.
    const diagnostics = diagnosticsFor(`
      import { navePlugin } from '@navecss/core/vite'
      declare function overloaded(options: { atomic: 'used' }): ReturnType<typeof navePlugin>[]
      declare function overloaded(options?: Parameters<typeof navePlugin>[0]): ReturnType<typeof navePlugin>
      const single: ReturnType<typeof navePlugin> = overloaded()
      void single
    `)

    expect(diagnostics).toEqual([])
  })
})

describe('AC-directive-core-28 — ./vite also carries a default export', () => {
  it('is the same function object as the named navePlugin', () => {
    expect(viteModule).toBe(navePlugin)
  })

  it('declares the default export in dist/vite.d.ts', () => {
    expect(readFileSync(path.join(DIST, 'vite.d.ts'), 'utf8')).toMatch(
      /export\s*\{[^}]*\bas default\b/,
    )
  })
})

describe('AC-directive-core-34 — only hosts with a green fixture are exported', () => {
  it('adds ./vite and no key for another host', () => {
    const exports = manifest().exports as Record<string, unknown>

    expect(exports['./vite']).toEqual({ types: './dist/vite.d.ts', import: './dist/vite.js' })
    for (const host of ['rspack', 'esbuild', 'rollup', 'rolldown', 'webpack', 'turbopack']) {
      expect(Object.keys(exports).filter((k) => k.includes(host))).toEqual([])
    }
  })
})
