/**
 * Companion guard to `packages/core/test/no-inlined-dependency.test.ts`,
 * added for `@navecss/cli` by the bundling-guard coverage tripwire
 * (`scripts/check-bundling-guard-coverage.mjs`).
 *
 * `@navecss/cli` already has a bundler step (`tsup ... --clean`) and a
 * `bin`, which qualifies it as "capable of bundling" under that tripwire's
 * criterion, even though `src/index.ts` imports nothing today and the
 * package is `private: true` so no tarball ships. That makes this a LATENT
 * guard: it is inert only because the package imports nothing and is
 * `private: true`, never because inlining could not happen here. Both of
 * those facts can change without looking like a licensing change to
 * whoever changes them — the first import of an argv parser is absorbed by
 * tsup on the exact principle that once absorbed `postcss` in core, and
 * flipping `private` is a one-line `package.json` edit. An inlined
 * dependency redistributes third-party code inside Nave's own artifact
 * with no NOTICE file for it, so this guard exists to catch that day with
 * a test rather than have it rediscovered by reading.
 *
 * Same mechanism as core's guard: reads every external (non-relative,
 * non-Node-builtin) import specifier out of `src/`, then asserts each one
 * still resolves to a live `from '<specifier>'` import in the built
 * `dist/*.js` — proof it stayed external rather than being inlined. It is
 * generic over specifiers, so a new external import in `cli` is covered
 * automatically; the explicit zero-specifier assertion below exists so a
 * regression (the guard finding nothing to check) is visible rather than
 * silently vacuous, per the same premise-assertion pattern core's guard
 * uses for the opposite case (asserting at least one specifier exists).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.resolve(HERE, '../src')
const DIST_DIR = path.resolve(HERE, '../dist')

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g

/** Recursively lists files under `dir` whose name ends with one of `extensions`. */
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

/** Escapes a string for safe use inside a `new RegExp(...)` pattern. */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** External (non-relative, non-Node-builtin) import specifiers referenced by `files`. */
function externalSpecifiers(files: string[]): Set<string> {
  const specifiers = new Set<string>()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(IMPORT_RE)) {
      const specifier = match[1]!
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue
      const builtinName = specifier.startsWith('node:') ? specifier.slice(5) : specifier
      if (isBuiltin(builtinName)) continue
      specifiers.add(specifier)
    }
  }
  return specifiers
}

const sourceSpecifiers = [...externalSpecifiers(listFiles(SRC_DIR, ['.ts', '.tsx']))]
const distText = listFiles(DIST_DIR, ['.js'])
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

describe('no build inlines a third-party dependency', () => {
  it('has no external import to guard today (src/index.ts is argv-only)', () => {
    // Asserts the premise explicitly rather than leaving it implicit: the
    // day an external import is added, this fails with "expected 0 to be
    // 1", which is the signal to read this file's header and let the
    // it.each below start doing the real work.
    expect(sourceSpecifiers.length).toBe(0)
  })

  it.each(sourceSpecifiers)('keeps "%s" external in dist/, never inlined', (specifier) => {
    expect(distText).toMatch(new RegExp(`from\\s*['"]${escapeRegExp(specifier)}['"]`))
  })
})
