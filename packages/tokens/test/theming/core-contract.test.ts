import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type * as CoreContractModule from '../../src/theming/core-contract.ts'

import {
  assertContractPreconditions,
  buildManifest,
  checkManifestVersionSkew,
  diffContract,
  discoverSourceFiles,
  MANIFEST_FORMAT_VERSION,
  scanCoreContract,
  scanCoreContractFromDisk,
  StaleContractPreconditionError,
  validateAgainstManifest,
} from '../../src/theming/core-contract.ts'
import { buildCoreContractManifest } from '../../src/theming/core-source.ts'
import { cleanupScratchDirs, scratchDir } from '../helpers/scratch-dir.ts'

afterAll(cleanupScratchDirs)

/**
 * This file reads `packages/core/src/**` directly, one of four
 * cross-package reads found outside `@navecss/tokens#test`'s turbo cache key —
 * but it took the OTHER available remedy, not the relocate-to-`core/test` remedy
 * `packages/core/test/reset-color-scheme.test.ts` and its two siblings took for the
 * other three sites. Ownership is why: `scanCoreContractFromDisk` and
 * `buildCoreContractManifest`, the functions this file exercises, are `@navecss/tokens`'s
 * OWN exported R27/R28 mechanism (`core-source.ts`) — reading core's real source at Nave's
 * own build time is that mechanism's entire job, not a test-only reach across the package
 * boundary. Relocating this file would move a test of `tokens`-owned code out of `tokens`.
 * The fix is `turbo.json`'s `"@navecss/tokens#test"` override instead: `inputs` extends
 * `$TURBO_DEFAULT$` with `../core/src/**` (widened from the two hardcoded files, since
 * the scanned set is a directory, not a census), so editing any
 * file under it invalidates this task's cache.
 */
const CORE_SRC = path.resolve(import.meta.dirname, '../../../core/src')
const CORE_SOURCE_PATHS = discoverSourceFiles(CORE_SRC)
const RECORDED_CONTRACT_PATH = path.resolve(
  import.meta.dirname,
  '../../core-contract.recorded.json',
)
const DIST_MANIFEST_PATH = path.resolve(import.meta.dirname, '../../dist/core-contract.json')

/**
 * Every value inside `value`, at any depth and of any type, that could have come from the
 * wall clock: an ISO-8601-looking string, or a number in the `Date.now()` millisecond range.
 * Returns their dotted paths (empty when there are none), so a failure names the offending
 * field rather than only reporting that one exists.
 */
function wallClockLike(value: unknown, at: string): string[] {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T/.test(value) ? [at] : []
  if (typeof value === 'number') return value > 1e12 && value < 1e14 ? [at] : []
  if (Array.isArray(value)) return value.flatMap((entry, i) => wallClockLike(entry, `${at}[${i}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => wallClockLike(entry, `${at}.${key}`))
  }
  return []
}

/**
 * Stands in for the CLI's future consumer-invocable validator entry point
 * (core-contract.ts's own docstring: "validateAgainstManifest ... is the CLI's
 * validator's core check"). An earlier request from the quality reviewer left the
 * sequencing question of whether the CLI's real implementation lands now or later
 * explicitly to engineering; building the full consumer-invocable token build is out of
 * scope here (a separate, much larger item). This wraps the same core check in the shape
 * an entry point actually has — an exit code plus reported names — without
 * pre-building the CLI itself.
 */
function runValidatorEntryPoint(
  manifest: ReturnType<typeof buildManifest>,
  emittedNames: ReadonlySet<string>,
): { exitCode: number; missing: string[] } {
  const missing = validateAgainstManifest(manifest, emittedNames)
  return { exitCode: missing.length > 0 ? 1 : 0, missing }
}

/**
 * Re-imports `core-source.ts` against a `core-contract.ts` whose `scanCoreContractFromDisk`
 * is replaced by `stub`, and hands back the freshly-wired `buildCoreContractManifest` plus
 * the error class from that same module graph (identity matters: `resetModules` gives a new
 * class object). Callers must `vi.doUnmock` + `vi.resetModules` in a `finally`.
 */
async function withStubbedScan(
  stub: (actual: typeof CoreContractModule, paths: readonly string[]) => string[],
): Promise<{ build: () => unknown; ErrorClass: unknown }> {
  vi.resetModules()
  vi.doMock('../../src/theming/core-contract.ts', async () => {
    const actual = await vi.importActual<typeof CoreContractModule>(
      '../../src/theming/core-contract.ts',
    )
    return {
      ...actual,
      scanCoreContractFromDisk: (paths: readonly string[]) => stub(actual, paths),
    }
  })
  const contract = await import('../../src/theming/core-contract.ts')
  const { buildCoreContractManifest: build } = await import('../../src/theming/core-source.ts')
  return { build, ErrorClass: contract.StaleContractPreconditionError }
}

describe('AC-theming-32 covers: R27', () => {
  it('emits the required core contract as a generated list rather than a hand-written one, WIDENED to every --nave-* reference and not only the colour namespace', () => {
    const contract = scanCoreContract([
      "background: 'var(--nave-color-surface-base)'",
      'color: var(--nave-color-content-primary);',
      // A live NON-COLOUR Nave token: the scan was widened from --nave-color-* to every
      // --nave-* reference, so this now counts (it did not before the widening).
      'outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus);',
      // A doc-comment example never counts, widened or not (rule 2 of that widening): a
      // BLOCK comment is stripped before matching, so a reference that lives only inside one —
      // the exact shape of postcss.ts's own docblock — contributes nothing.
      '/** e.g. background: var(--nave-color-does-not-exist) */',
    ])
    expect(contract).toEqual([
      '--nave-border-width-focus',
      '--nave-color-border-focus',
      '--nave-color-content-primary',
      '--nave-color-surface-base',
    ])
  })

  it("core's real run-time dependency today scans from every file under its src/ directory, not a hardcoded two-file list", () => {
    const contract = scanCoreContractFromDisk(CORE_SOURCE_PATHS)
    expect(contract).toContain('--nave-color-surface-base')
    expect(contract).toContain('--nave-color-content-primary')
    expect(contract).toContain('--nave-color-border-focus')
    expect(contract).toContain('--nave-color-border-default')
    // The widened scan also picks up core's real non-colour --nave-* dependency.
    expect(contract).toContain('--nave-border-width-focus')
    expect(contract).toContain('--nave-spacing-content-md')
    expect(contract).toContain('--nave-font-size-md')
    // every name is still --nave-*, but no longer only --nave-color-*
    for (const name of contract) expect(name.startsWith('--nave-')).toBe(true)
    expect(contract.some((name) => !name.startsWith('--nave-color-'))).toBe(true)
  })

  /**
   * A prior review round (item F5): `recursive: true` in `discoverSourceFiles`
   * was held by nothing — deleting it was measured 522/522 green and the drift check exit 0
   * EVEN with a real `var(--nave-…)` reference sitting in a `packages/core/src/sub/` file,
   * because `packages/core/src` is flat today and no fixture ever gave the recursion
   * anything to find. `discoverSourceFiles` takes its directory as a parameter, so the fence
   * is testable without planting a file in another package's shipped source: the fixture is
   * a temp tree, and nothing under `packages/core/src` is created or touched.
   */
  it('AC-theming-32: discoverSourceFiles walks NESTED directories, not only the top level (a package that grows a subdirectory joins the scan)', () => {
    const root = scratchDir('navecss-discover-')
    const nestedDir = path.join(root, 'sub', 'deeper')
    mkdirSync(nestedDir, { recursive: true })
    const topLevel = path.join(root, 'top.css')
    const nested = path.join(nestedDir, 'nested.ts')
    writeFileSync(topLevel, ':root { color: var(--nave-color-surface-base); }')
    writeFileSync(nested, 'const x = "var(--nave-radius-pill)"')
    // A non-matching extension, so the walk is shown to filter as well as recurse.
    writeFileSync(path.join(nestedDir, 'ignored.md'), 'var(--nave-color-ignored)')

    expect(discoverSourceFiles(root)).toEqual(
      [nested, topLevel].toSorted((a, b) => a.localeCompare(b)),
    )
    // And the names in the nested file really do reach the contract, not just the file list.
    expect(scanCoreContractFromDisk(discoverSourceFiles(root))).toContain('--nave-radius-pill')
  })

  /**
   * A prior review round (item F4): scope item 2 is "the scanned set is a
   * RULE, not a file list... do not implement this as a hardcoded include/exclude list", and
   * reverting the production caller to the exact forbidden two-file census was measured
   * 522/522 green with a byte-identical shipped manifest — because today's tree has no
   * discriminating input (core's `src/` happens to be flat and the two old files happen to
   * carry every referenced name). The test titled for this change composes
   * `discoverSourceFiles` with the scanner ITSELF and never drives the entry point, so it
   * proves the seam the TEST built, not the seam the generator builds.
   *
   * This one asserts the CALL SEQUENCE instead, which is a property no fixture can make
   * vacuous: `buildCoreContractManifest` must call `discoverSourceFiles` on core's own `src`
   * directory and scan EXACTLY what it returned. Replacing that call with a literal array
   * reddens here even while the resulting manifest stays byte-identical.
   */
  it("AC-theming-32: buildCoreContractManifest derives its scanned file set by RULE — it calls discoverSourceFiles on core's src directory and scans exactly what that returned, never a hardcoded list", async () => {
    vi.resetModules()
    try {
      const discoverCalls: string[] = []
      let discovered: string[] | undefined
      const scannedWith: (readonly string[])[] = []
      vi.doMock('../../src/theming/core-contract.ts', async () => {
        const actual = await vi.importActual<typeof CoreContractModule>(
          '../../src/theming/core-contract.ts',
        )
        return {
          ...actual,
          discoverSourceFiles: (dir: string, extensions?: readonly string[]) => {
            discoverCalls.push(dir)
            discovered = actual.discoverSourceFiles(dir, extensions)
            return discovered
          },
          scanCoreContractFromDisk: (paths: readonly string[]) => {
            scannedWith.push(paths)
            return actual.scanCoreContractFromDisk(paths)
          },
        }
      })
      const { buildCoreContractManifest: build } = await import('../../src/theming/core-source.ts')
      build()

      expect(
        discoverCalls,
        'buildCoreContractManifest did not derive its file set from discoverSourceFiles',
      ).toEqual([CORE_SRC])
      expect(scannedWith).toHaveLength(1)
      expect(scannedWith[0]).toEqual(discovered)
      // The rule is only distinguishable from the forbidden two-file census when it yields
      // more than two files; if core's src/ ever shrinks to two, this assertion says so.
      expect(discovered!.length).toBeGreaterThan(2)
    } finally {
      vi.doUnmock('../../src/theming/core-contract.ts')
      vi.resetModules()
    }
  })

  it("postcss.ts's doc-comment example is discovered (the file joins the scanned set) but contributes no name, since its only --nave- reference lives inside a comment", () => {
    const postcssPath = path.resolve(CORE_SRC, 'postcss.ts')
    expect(CORE_SOURCE_PATHS).toContain(postcssPath)
    const postcssOnly = scanCoreContractFromDisk([postcssPath])
    expect(postcssOnly).toEqual([])
  })

  it('CI fails and reports the difference when a token is added to core real usage without the recorded contract regenerated', () => {
    // A real Given: core gains a colour dependency the recorded contract does not know about.
    const recorded = ['--nave-color-surface-base', '--nave-color-content-primary']
    const emittedWithAddition = new Set([...recorded, '--nave-color-newly-added'])
    const drift = diffContract(recorded, emittedWithAddition)
    expect(drift.added).toEqual(['--nave-color-newly-added'])
    expect(drift.missing).toEqual([])
  })

  it('CI fails and reports the difference when a token is removed from core real usage without the recorded contract regenerated', () => {
    // A real Given: core stops using a colour the recorded contract still requires.
    const recorded = ['--nave-color-surface-base', '--nave-color-content-primary']
    const emittedWithRemoval = new Set(['--nave-color-surface-base'])
    const drift = diffContract(recorded, emittedWithRemoval)
    expect(drift.missing).toEqual(['--nave-color-content-primary'])
    expect(drift.added).toEqual([])
  })

  it('the checked-in recorded contract matches a fresh scan of the real shipped source (scripts/check-core-contract-drift.mjs, wired into scripts:check)', () => {
    // The actual artifact-level drift check: run against the real repository,
    // exercising exactly what CI runs (not a synthetic Given/When pair).
    const recordedFile = JSON.parse(readFileSync(RECORDED_CONTRACT_PATH, 'utf8')) as {
      tokens: string[]
    }
    const recorded = recordedFile.tokens
    const emitted = new Set(scanCoreContractFromDisk(CORE_SOURCE_PATHS))
    const drift = diffContract(recorded, emitted)
    expect(
      drift,
      `core-contract.recorded.json disagrees with core's real usage: ${JSON.stringify(drift)}`,
    ).toEqual({ missing: [], added: [] })
  })
})

// The block-comment-only stripper left `//` line comments unstripped, so a dead
// var(--nave-*) example written after `//` in a .ts file was recorded as live usage. Fixed
// by replacing the regex with a small context-stack scanner (`stripComments`): a template
// literal's ${...} interpolation is scanned as code (so a // inside it is a real comment, and
// template TEXT outside the interpolation stays literal), an unquoted CSS url-token (url( not
// followed by a quote) is recognised directly and copied through verbatim rather than guarded
// by a preceding colon, and a '/" string ends at an unescaped newline the same way ECMAScript
// and CSS Syntax both bound a string literal, so a stray quote (for example inside an unlexed
// regex literal) cannot swallow lines it was never part of. These tests pin the fix and the
// failure modes each of those choices closes.
describe('// line comments are stripped, without over-stripping CSS url() or TS string literals', () => {
  it.each([
    {
      label: 'a dead reference after // in a .ts-shaped source no longer counts',
      source:
        "// dead example: var(--nave-color-should-not-count)\nconst x = 'var(--nave-color-content-primary)'",
      expected: ['--nave-color-content-primary'],
    },
    {
      label: 'a // comment on its own line does not swallow a real reference on the NEXT line',
      source: '// a leading comment\nconst x = "var(--nave-color-content-primary)"',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        "an unquoted CSS url()'s :// is not mistaken for a line-comment opener, so a real reference on the SAME line still counts",
      source: 'background: url(https://example.com/x.png), var(--nave-color-surface-base);',
      expected: ['--nave-color-surface-base'],
    },
    {
      label:
        'a // sequence inside a quoted TS string literal is not mistaken for a comment opener, so a reference later on the same line still counts',
      source:
        'const url = "https://example.com"; const decl = \'var(--nave-color-content-primary)\'',
      expected: ['--nave-color-content-primary'],
    },
    {
      label: 'a // sequence inside a template literal is not mistaken for a comment opener',
      source: 'const url = `https://example.com`; const decl = `var(--nave-color-content-primary)`',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        'an escaped quote inside a string does not end the string early, and a // right after it is still just string content, not a comment: the reference at the end still counts',
      source: String.raw`const s = 'it\'s // not a comment var(--nave-color-content-primary)'`,
      expected: ['--nave-color-content-primary'],
    },
    {
      label: 'block comments and line comments both still strip correctly when mixed in one source',
      source: [
        '/* doc example: var(--nave-color-dead-block) */',
        '// dead line example: var(--nave-color-dead-line)',
        "const live = 'var(--nave-color-content-primary)'",
      ].join('\n'),
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        "a // inside a template literal's ${...} interpolation is a real comment: the interpolation is code, not CSS text",
      source: '`x${foo // var(--nave-color-dead)\n  ? "a" : "b"}`',
      expected: [],
    },
    {
      label: "a nested template literal's own ${...} interpolation is pinned as code, not text",
      source: '`a${`b${c // var(--nave-color-dead)\n}`}`',
      expected: [],
    },
    {
      label:
        'a nested template that closes inside the FIRST interpolation does not leave the SECOND interpolation mistaken for template text: its // is still a real comment',
      source: '`a${`b`} ${c // var(--nave-color-dead)\n}`',
      expected: [],
    },
    {
      label:
        'template TEXT after a closed interpolation stays literal: a // there is not a comment',
      source: '`${a} // not a comment var(--nave-color-content-primary)`',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        "a quoted '}' and a nested object literal's own braces inside an interpolation do not close the interpolation early",
      source: "`${ {k: '}'}.k } // text var(--nave-color-content-primary)`",
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        'a // right after a colon (a type annotation or an object key) is a real comment, not a guarded false positive',
      source:
        "const theme:// var(--nave-color-dead)\nconst x = 'var(--nave-color-content-primary)'",
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        'an unquoted protocol-relative url(//…) is a CSS url-token, not a line comment, so a real reference on the same line still counts',
      source: 'background: url(//cdn.example.com/x.png), var(--nave-color-surface-base);',
      expected: ['--nave-color-surface-base'],
    },
    {
      label:
        'the CSS url-token match is ASCII case-insensitive: URL(//…) is recognised the same way',
      source: 'background: URL(//cdn.example.com/x.png), var(--nave-color-surface-base);',
      expected: ['--nave-color-surface-base'],
    },
    {
      label:
        'a stray quote outside any string (here, inside an unlexed regex literal) does not open a phantom string that swallows a later real comment',
      source:
        "const r = /'/\n// var(--nave-color-dead)\nconst y = 'var(--nave-color-content-primary)'",
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        'a stray quote outside any string does not merge with a later real string, so a // inside that real string is still plain string content, not a comment',
      source: 'const r = /"/\nconst s = "a //b var(--nave-color-content-primary)"',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        "an unquoted url-token's verbatim span stops at a newline rather than crossing it to reach a ) on a later line, so a real comment after that newline is still stripped",
      source: 'url(x\n// var(--nave-color-dead)\n) + "var(--nave-color-content-primary)"',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        "an unquoted url-token's verbatim span stops before a quote rather than crossing it to reach a ) inside that string, so the string is scanned normally and its own // is not a comment",
      source: 'url(x, "a) // var(--nave-color-content-primary)")',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        'an unquoted url-token spanning whitespace and a newline before its closing ) is still copied through verbatim',
      source: 'a{background:url( x.png\n);color:var(--nave-color-content-primary)}',
      expected: ['--nave-color-content-primary'],
    },
    {
      label:
        'an escaped ) inside an unquoted url-token does not end the token early, so the real closing ) further on is what ends it, and a same-line reference after it still counts',
      source: String.raw`a{background:url(a\)b//x.png), var(--nave-color-surface-base);}`,
      expected: ['--nave-color-surface-base'],
    },
    {
      label:
        'a backslash-newline inside an unquoted url is not a CSS escape, so the url-token still ends at the newline and the real comment right after it is still stripped',
      source:
        'url(a\\' +
        '\n' +
        '// var(--nave-color-dead)' +
        '\n' +
        "const y = 'var(--nave-color-content-primary)'",
      expected: ['--nave-color-content-primary'],
    },
  ])('$label', ({ source, expected }) => {
    expect(scanCoreContract([source])).toEqual(expected)
  })
})

describe('AC-theming-33 covers: R28', () => {
  it('the manifest is generated by the R27 scan, not hand-written, and enumerates every token by name', () => {
    const contract = scanCoreContract(['var(--nave-color-a)', 'var(--nave-color-b)'])
    const manifest = buildManifest(contract, { name: '@navecss/core', version: '0.1.0' })
    expect(manifest.tokens).toEqual(['--nave-color-a', '--nave-color-b'])
  })

  it('the manifest is present in the shipped package (dist/core-contract.json, packages/tokens/package.json exports ./core-contract)', () => {
    expect(existsSync(DIST_MANIFEST_PATH), `${DIST_MANIFEST_PATH} does not exist`).toBe(true)
    const shipped = JSON.parse(readFileSync(DIST_MANIFEST_PATH, 'utf8')) as { tokens: string[] }
    expect(Array.isArray(shipped.tokens)).toBe(true)
    expect(shipped.tokens.length).toBeGreaterThan(0)
    expect(shipped.tokens).toEqual(scanCoreContractFromDisk(CORE_SOURCE_PATHS))

    const manifest = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'),
    ) as { exports: Record<string, string> }
    expect(manifest.exports['./core-contract']).toBe('./dist/core-contract.json')
  })

  it('the validator entry point exits non-zero and names every missing contract token, not a var() resolving to nothing', () => {
    const manifest = buildManifest(['--nave-color-a', '--nave-color-b', '--nave-color-c'], {
      name: '@navecss/core',
      version: '0.1.0',
    })
    const result = runValidatorEntryPoint(manifest, new Set(['--nave-color-a']))
    expect(result.exitCode).toBe(1)
    expect(result.missing).toEqual(['--nave-color-b', '--nave-color-c'])
  })

  it('the validator entry point exits zero when every contract token is present', () => {
    const manifest = buildManifest(['--nave-color-a', '--nave-color-b'], {
      name: '@navecss/core',
      version: '0.1.0',
    })
    const result = runValidatorEntryPoint(manifest, new Set(['--nave-color-a', '--nave-color-b']))
    expect(result.exitCode).toBe(0)
    expect(result.missing).toEqual([])
  })
})

describe('AC-token-build-13 covers: R13', () => {
  it('the manifest schema carries a manifest-format version integer and the producing package name and version, and no field derived from wall-clock time', () => {
    const manifest = buildManifest(['--nave-color-a'], { name: '@navecss/core', version: '0.1.0' })
    expect(Number.isSafeInteger(manifest.formatVersion)).toBe(true)
    expect(manifest.formatVersion).toBe(MANIFEST_FORMAT_VERSION)
    expect(manifest.producer).toEqual({ name: '@navecss/core', version: '0.1.0' })
    expect(manifest).not.toHaveProperty('generatedAt')

    // No wall-clock-derived field ANYWHERE in the schema. The scan is RECURSIVE (so
    // `producer`, an object, and `tokens`, an array, are inspected rather than skipped) and
    // TYPE-AGNOSTIC (so a numeric `Date.now()` stamp is caught as well as an ISO string). A
    // top-level, string-only scan passed over both by construction.
    expect(wallClockLike(manifest, 'manifest')).toEqual([])
  })

  it('the manifest generated twice from an identical source with a real time delay between runs is byte-identical', async () => {
    const tokens = scanCoreContract(['var(--nave-color-a)', 'var(--nave-color-b)'])
    const producer = { name: '@navecss/core', version: '0.1.0' }
    const first = JSON.stringify(buildManifest(tokens, producer))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = JSON.stringify(buildManifest(tokens, producer))
    expect(first).toBe(second)
  })
})

describe('AC-token-build-14 covers: R14', () => {
  it('a manifest recording a package version that does not match the installed @navecss/core fails with a named version-skew error naming both versions', () => {
    const manifest = buildManifest(['--nave-color-a'], { name: '@navecss/core', version: '0.1.0' })
    const skew = checkManifestVersionSkew(manifest, '0.2.0')
    expect(skew).toBeDefined()
    expect(skew).toEqual({ recorded: '0.1.0', installed: '0.2.0' })
  })

  it('no skew is reported when the recorded and installed versions match', () => {
    const manifest = buildManifest(['--nave-color-a'], { name: '@navecss/core', version: '0.1.0' })
    const skew = checkManifestVersionSkew(manifest, '0.1.0')
    expect(skew).toBeUndefined()
  })

  it("@navecss/core's package exports expose ./package.json", () => {
    const corePkg = JSON.parse(readFileSync(path.resolve(CORE_SRC, '../package.json'), 'utf8')) as {
      exports: Record<string, unknown>
    }
    expect(corePkg.exports['./package.json']).toBe('./package.json')
  })
})

describe('AC-token-build-31 covers: R31', () => {
  it('fails loud and would write no manifest when a name about to be recorded is not yet prefixed --nave- (simulated)', () => {
    const names = ['--nave-color-a', '--border-width-md']
    expect(() =>
      assertContractPreconditions(
        names,
        'color: var(--nave-color-a); outline: var(--border-width-md);',
      ),
    ).toThrow(StaleContractPreconditionError)
  })

  it("fails loud rather than silently shipping a manifest narrower than core's real run-time dependency (simulated: an old colour-only scan result against a source that also references a non-colour --nave-* property)", () => {
    const narrowlyScannedNames = ['--nave-color-a'] // as if only the old --nave-color-* pattern had run
    const rawSource = 'color: var(--nave-color-a); outline: var(--nave-spacing-md);'
    expect(() => assertContractPreconditions(narrowlyScannedNames, rawSource)).toThrow(
      StaleContractPreconditionError,
    )
  })

  it('does not fire on a fully-prefixed, fully-scanned set', () => {
    const names = ['--nave-color-a', '--nave-spacing-md']
    const rawSource = 'color: var(--nave-color-a); outline: var(--nave-spacing-md);'
    expect(() => assertContractPreconditions(names, rawSource)).not.toThrow()
  })

  it('does not fire on a source reference that lives only inside a comment (never simulates a real reference)', () => {
    const names = ['--nave-color-a']
    const rawSource = 'color: var(--nave-color-a); /* var(--nave-spacing-md) example only */'
    expect(() => assertContractPreconditions(names, rawSource)).not.toThrow()
  })

  it('converts the ordering constraint into a property of the generation step itself: building the manifest against the REAL, current core source does not trip either precondition', () => {
    expect(() => buildCoreContractManifest()).not.toThrow()
  })

  /**
   * A prior review round (findings F2/F3/F14): the three cases above are two direct
   * calls to `assertContractPreconditions` with hand-built arrays plus one
   * `.not.toThrow()`, and none of them can see the SEAM — whether the production entry point
   * (`buildCoreContractManifest`) actually calls the guard at all. `.not.toThrow()` cannot,
   * by construction: unwiring a guard REMOVES throws. The two cases below drive the entry
   * point and stub only the scan it feeds the guard, so deleting the
   * `assertContractPreconditions(...)` call from `core-source.ts` reddens both.
   */
  it('AC-token-build-31: the WIRED entry point refuses when the scan it runs returns a set narrower than the source real --nave-* usage (driven through buildCoreContractManifest rather than the guard in isolation)', async () => {
    try {
      const { build, ErrorClass } = await withStubbedScan((actual, paths) =>
        actual.scanCoreContractFromDisk(paths).filter((name) => name.startsWith('--nave-color-')),
      )
      let caught: unknown
      try {
        build()
      } catch (error) {
        caught = error
      }
      expect(caught, 'buildCoreContractManifest() did not throw').toBeInstanceOf(ErrorClass)
      expect((caught as Error).message).toMatch(/narrower than core's real run-time dependency/)
      expect((caught as Error).message).not.toMatch(/#\d/)
    } finally {
      vi.doUnmock('../../src/theming/core-contract.ts')
      vi.resetModules()
    }
  })

  it('AC-token-build-31: the WIRED entry point refuses when the scan it runs returns a name that is not yet prefixed --nave- (driven through buildCoreContractManifest rather than the guard in isolation)', async () => {
    try {
      const { build, ErrorClass } = await withStubbedScan((actual, paths) => [
        ...actual.scanCoreContractFromDisk(paths),
        '--border-width-md',
      ])
      let caught: unknown
      try {
        build()
      } catch (error) {
        caught = error
      }
      expect(caught, 'buildCoreContractManifest() did not throw').toBeInstanceOf(ErrorClass)
      expect((caught as Error).message).toMatch(/not yet prefixed --nave-/)
      expect((caught as Error).message).not.toMatch(/#\d/)
    } finally {
      vi.doUnmock('../../src/theming/core-contract.ts')
      vi.resetModules()
    }
  })
})
