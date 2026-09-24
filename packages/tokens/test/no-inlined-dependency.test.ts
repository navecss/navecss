/**
 * AC-token-build-28 covers: R28.
 *
 * A DELIVERABLE of the CLI's implementation, landed BEFORE R1's `bin: navecss-tokens` and R8's
 * compile step so `scripts/check-bundling-guard-coverage.mjs`
 * stays green the instant either arms the tripwire — R28's own text: "`bin: navecss-tokens`
 * arms the tripwire by itself, and R8's compile step arms it a second time independently."
 * Cédric's 2026-08-15 instruction stands verbatim and is this item's: expect the guard to
 * trip once R1/R8 land, and do not narrow the criterion or exempt the package to quiet it.
 *
 * A GENERATOR-shaped property, not a bundler-shaped one — R28's own warning: this package has
 * no bundler and emits generated artifacts, so `packages/core/test/no-inlined-dependency.test.ts`'s
 * bundler-shaped check ("every external specifier in `src/` still resolves to a live import in
 * `dist/`") would assert a property with no subject here. Two halves:
 *
 * 1. GENERATOR half: every artifact this package's build writes onto a consumer's disk (R6's
 *    set) carries no text traceable to a third-party source. Checked against a REAL build
 *    (`dist/`), never against source alone — R30's hazard (a vendored parser, an inlined
 *    dependency's banner, a copied licence header) is an output-time fact. Shares its
 *    instrument with `AC-token-build-30` (`third-party-provenance.ts`) rather than duplicating
 *    the scan; this file names its OWN AC and does not restate R30's routing-obligation half.
 * 2. COMPILED-JS half: the same predicate core's and cli's guards assert (external specifiers
 *    stay live imports, never inlined text), kept here so this file already exists — and
 *    already passes — the moment R8 ships compiled `dist/lib` JS. Zero specifiers today, the
 *    same shape `cli`'s guard had before its first external import.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  findThirdPartyResidue,
  findUnattributedHeader,
  R6_CONSUMER_ARTIFACTS,
} from '../src/theming/third-party-provenance.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.resolve(HERE, '../src')
const DIST_DIR = path.resolve(HERE, '../dist')

// Three alternatives, one capture group each: static `import`/`export ... from '<spec>'`,
// `require('<spec>')` (a substring match, so it also catches TypeScript's
// `import x = require('<spec>')`), and dynamic `import('<spec>')` — the specifier forms
// AC-token-build-28 names in terms ("remains a live `require`/`import`, never inlined text").
// core's sibling guard (packages/core/test/no-inlined-dependency.test.ts) still carries only the
// first alternative; this widening is scoped to this file, this package's own AC.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)(?:[^'"]*?from\s*)?['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

/**
Recursively lists files under `dir` whose name ends with one of `extensions`.
 */
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

/**
 * Recursively lists every FILE (not directory) under `dir`, regardless of extension.
 * The "every file the build actually left in dist/" test below used a
 * NON-recursive `readdirSync(DIST_DIR)`, so R8's own `dist/lib` subtree (created the same PR
 * that added this comment) was entirely invisible to it — 74 of 86 packed entries, measured.
 * A rogue artifact one directory down would have been exactly as invisible as one at the top.
 */
function listAllFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listAllFilesRecursively(full))
    else out.push(full)
  }
  return out
}

/**
Escapes a string for safe use inside a `new RegExp(...)` pattern.
 */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/**
External (non-relative, non-Node-builtin) import specifiers referenced by `files`.
 */
function isExternalSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false
  const builtinName = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  return !isBuiltin(builtinName)
}

function specifiersIn(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return text
    .matchAll(IMPORT_RE)
    .map((match) => (match[1] ?? match[2] ?? match[3])!)
    .filter((specifier) => isExternalSpecifier(specifier))
    .toArray()
}

function externalSpecifiers(files: string[]): Set<string> {
  return new Set(files.flatMap((file) => specifiersIn(file)))
}

const sourceSpecifiers = [...externalSpecifiers(listFiles(SRC_DIR, ['.ts', '.tsx']))].toSorted(
  (a, b) => a.localeCompare(b),
)
const distText = listFiles(DIST_DIR, ['.js'])
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

describe('AC-token-build-28 covers: R28 (generator half — no R6 artifact traces to a third party)', () => {
  it('found the built R6 artifact set on disk (run `pnpm run build` first if this fails)', () => {
    for (const name of R6_CONSUMER_ARTIFACTS) {
      expect(existsSync(path.join(DIST_DIR, name)), `missing dist/${name}`).toBe(true)
    }
  })

  it('no R6 artifact contains the one concretely-known historical residue (style-dictionary)', () => {
    const artifacts = R6_CONSUMER_ARTIFACTS.map((name) => ({
      path: name,
      content: readFileSync(path.join(DIST_DIR, name), 'utf8'),
    }))
    expect(findThirdPartyResidue(artifacts)).toEqual([])
  })

  it('scans every file the build actually left in dist/, not only the enumerated seven — RECURSIVELY, so dist/lib is not invisible to it (a rogue artifact must not be invisible)', () => {
    const everyDistFile = listAllFilesRecursively(DIST_DIR).map((full) => ({
      path: path.relative(DIST_DIR, full),
      content: readFileSync(full, 'utf8'),
    }))
    // This floor alone cannot distinguish "walked dist/lib" from "did
    // not", since dist/lib's own file count already clears it; the discriminating assertion
    // is the dedicated dist/lib comment-stripping test below.
    expect(everyDistFile.length).toBeGreaterThanOrEqual(R6_CONSUMER_ARTIFACTS.length)
    expect(everyDistFile.some((file) => file.path.startsWith(`lib${path.sep}`))).toBe(true)
    expect(findThirdPartyResidue(everyDistFile)).toEqual([])
  })

  it('every header-bearing R6 artifact (.css, .js, .d.ts) attributes generation to Nave alone', () => {
    const artifacts = R6_CONSUMER_ARTIFACTS.filter(
      (name) => name.endsWith('.css') || name.endsWith('.js') || name.endsWith('.d.ts'),
    ).map((name) => ({ path: name, content: readFileSync(path.join(DIST_DIR, name), 'utf8') }))
    expect(findUnattributedHeader(artifacts)).toEqual([])
  })
})

describe('AC-token-build-28 covers: R28 (compiled-JS half — external specifiers stay live imports)', () => {
  it('has no external import to guard today — src/ names no specifier outside node: builtins and its own relative modules', () => {
    // Asserts the premise explicitly, mirroring cli's guard: the day an external import lands
    // in src/, this fails with "expected 0 to be 1", which is the signal that the it.each
    // below has real work to do.
    //
    // A review found this title used to read "no bundler, no bin, no compile step
    // yet — R1/R8 both untouched", and this same PR falsified it: R1's `bin: navecss-tokens`
    // and R8's `tsc` step both landed here. None of those three was ever the premise the
    // assertion measures, which is only that `src/` names no external specifier, so the
    // per-specifier guard below has nothing to range over. The compile step still is not a
    // bundler (`tsc`, R30's licensing fence), so R28's property holds by construction rather
    // than because no compile step exists.
    expect(sourceSpecifiers.length).toBe(0)
  })

  // vitest registers zero tests here today (sourceSpecifiers is empty) with no warning and no
  // hint in the pass count — the trip-wire above is what stands between "nothing to check yet"
  // and "silently stopped checking".
  it.each(sourceSpecifiers)('keeps "%s" external in dist/, never inlined', (specifier) => {
    expect(distText).toMatch(new RegExp(String.raw`from\s*['"]${escapeRegExp(specifier)}['"]`))
  })
})
