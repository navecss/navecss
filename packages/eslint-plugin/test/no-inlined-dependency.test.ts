/**
 * Companion guard to `packages/core/test/no-inlined-dependency.test.ts`, required by
 * `scripts/check-bundling-guard-coverage.mjs`: this package has a runtime dependency
 * (`postcss-value-parser`) and no bundler (`tsc` only, per R1), so a build could never inline it
 * in the first place — `tsc` transpiles each file in place and never rewrites an import
 * specifier into copied bytes. This guard is trivially green by construction, kept here so the
 * property is asserted rather than assumed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.resolve(HERE, '../src')
const DIST_DIR = path.resolve(HERE, '../dist')

// Excludes `import type` / `export type`: erased entirely under `verbatimModuleSyntax`, so it
// never reaches dist/ as a value import — a package named only there is a type dependency, not
// a runtime one, and this guard is about runtime inlining.
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?!\s+type\s)(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g

function listFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full, extensions))
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

function isExternalSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false
  const builtinName = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  return !isBuiltin(builtinName)
}

function specifiersIn(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return text
    .matchAll(IMPORT_RE)
    .map((match) => match[1]!)
    .filter((specifier) => isExternalSpecifier(specifier))
    .toArray()
}

function externalSpecifiers(files: string[]): Set<string> {
  return new Set(files.flatMap((file) => specifiersIn(file)))
}

const sourceSpecifiers = [...externalSpecifiers(listFiles(SRC_DIR, ['.ts']))]
const distText = listFiles(DIST_DIR, ['.js'])
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

describe('no build inlines a third-party dependency (tsc never rewrites an import into copied bytes)', () => {
  it('package.json build script runs only tsc', () => {
    const manifest = JSON.parse(readFileSync(path.resolve(HERE, '../package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(manifest.scripts?.build).toBe('tsc -p tsconfig.build.json')
  })

  it('found at least one external dependency to guard', () => {
    expect(sourceSpecifiers.length).toBeGreaterThan(0)
  })

  it.each(sourceSpecifiers)('keeps "%s" external in dist/, never inlined', (specifier) => {
    expect(distText).toMatch(new RegExp(String.raw`from\s*['"]${escapeRegExp(specifier)}['"]`))
  })
})
