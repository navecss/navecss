/**
 * A guard promised at architecture review: no build inlines a third-party
 * dependency.
 *
 * Verified once by hand: postcss stays an external
 * import in core's build output rather than being bundled in, and so does
 * @navecss/tokens/breakpoints. That answer discharges condition 3 of the
 * project's licensing review (no NOTICE obligation today because nothing
 * third-party is redistributed) but it holds only by tsup's default —
 * anything declared in dependencies/peerDependencies stays external,
 * anything else gets absorbed — and not by any assertion. A future
 * `noExternal` entry, an inlining plugin, or a tsup major flipping that
 * default would start silently redistributing third-party code with no
 * NOTICE file for it.
 *
 * core is the only workspace package where a bundler could inline a
 * third-party dependency today: it is the only one with both a real
 * bundler step and a third-party dependency (postcss, peer) or runtime
 * dependency (@navecss/tokens) to potentially absorb. cli imports
 * nothing and bridge ships src/ unbuilt, so neither has a bundler step
 * to guard here yet. tokens has its own guard instead
 * (packages/tokens/test/no-inlined-dependency.test.ts): a
 * generator-shaped check, not this bundler-shaped one, because tokens'
 * build.ts writes generated output directly rather than bundling — this
 * file copied verbatim there would assert a property with no subject
 * (R28).
 *
 * The check is generic, not hardcoded to "postcss": it reads every
 * external (non-relative, non-Node-builtin) import specifier out of
 * core's own src/, then asserts each one still resolves to a live
 * `from '<specifier>'` import in the built dist/*.js — proof it was kept
 * external rather than silently inlined. If core ever gains a new
 * external source import, this test starts covering it automatically.
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
  it('found at least one external dependency to guard', () => {
    // A regression here (zero specifiers found) would silently turn every
    // check below into a vacuous pass, so assert the premise explicitly.
    expect(sourceSpecifiers.length).toBeGreaterThan(0)
  })

  it.each(sourceSpecifiers)('keeps "%s" external in dist/, never inlined', (specifier) => {
    expect(distText).toMatch(new RegExp(`from\\s*['"]${escapeRegExp(specifier)}['"]`))
  })
})
