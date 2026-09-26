/**
 * R1-R4, R23: the narrow public façade `build`/`validate` (R2), exercised in-process.
 * `test/bin.test.ts` covers the compiled, out-of-process
 * `bin: navecss-tokens` surface (AC-01's third/fourth clauses, R4's real exit codes, R8, R9).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import type * as BuilderModule from '../src/builder.ts'
import type { SeedNormalization, TokensBuildResult } from '../src/facade.ts'
import type * as ConsumerBuildModule from '../src/theming/consumer-build.ts'

import {
  build,
  DuplicateTokenNameRefusal,
  MissingContractTokensError,
  SeedIngestRefusal,
  TokenCollisionRefusal,
  UsageError,
  validate,
} from '../src/facade.ts'
import { CONSUMER_LAYER } from '../src/theming/consumer-build.ts'
import { scratchDir as makeScratchDir, registerScratchCleanup } from './helpers/scratch-dir.ts'

registerScratchCleanup()

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..')
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  bin: Record<string, string>
  exports: Record<string, unknown>
}

function scratchDir(prefix = 'navecss-tokens-facade-'): string {
  return makeScratchDir(prefix)
}

/**
 * The shipped manifest was widened from six colour-only names to the 21
 * `@navecss/core` really references at run time (six colour, fifteen non-colour). R16's union
 * check (facade.ts's `build`) now validates the consumer's own source against ALL of them,
 * not only the colour subset the theming half supplies unconditionally — so a test fixture
 * exercising `build` with a real `--source` must declare the fifteen non-colour names or the
 * union check refuses it before the scenario under test (a collision, an override) is ever
 * reached. Named for what it discharges, not for any one test.
 */
const NON_COLOUR_CONTRACT_FIXTURE = {
  borderWidth: {
    focus: { $type: 'dimension', $value: { value: 2, unit: 'px' } },
    sm: { $type: 'dimension', $value: { value: 1, unit: 'px' } },
  },
  font: {
    family: {
      base: { $type: 'fontFamily', $value: 'sans-serif' },
      display: { $type: 'fontFamily', $value: 'serif' },
      mono: { $type: 'fontFamily', $value: 'monospace' },
    },
    size: { md: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } },
    weight: { bold: { $type: 'fontWeight', $value: 700 } },
  },
  lineHeight: {
    base: { $type: 'number', $value: 1.5 },
    tight: { $type: 'number', $value: 1.2 },
  },
  motion: {
    duration: { base: { $type: 'duration', $value: { value: 200, unit: 'ms' } } },
    easing: { standard: { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] } },
  },
  radius: {
    card: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
    control: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
    full: { $type: 'dimension', $value: { value: 9999, unit: 'px' } },
  },
  spacing: {
    content: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
  },
}

/**
Recursive merge of plain-object DTCG fixtures, `override` winning leaf-for-leaf.
 */
function deepMerge(base: unknown, override: unknown): unknown {
  if (
    base !== null &&
    override !== null &&
    typeof base === 'object' &&
    typeof override === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(override)
  ) {
    const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      merged[key] = Object.hasOwn(merged, key) ? deepMerge(merged[key], value) : value
    }
    return merged
  }
  return override
}

/**
 * A complete DTCG source satisfying every non-colour contract name, plus `extra` merged in —
 * the shape a test needs to reach past R16's union check into whatever it actually exercises.
 */
function completeSource(extra: object): unknown {
  return deepMerge(NON_COLOUR_CONTRACT_FIXTURE, extra)
}

/**
 * The property names `name` declares in the COMPILED `facade.d.ts`, sorted — the whitelist
 * half of R2/R3's "exactly the members R3 enumerates". Reads the emitted declarations rather
 * than the source interface, so it measures what a consumer's TypeScript actually sees.
 */
function declaredMembersOf(name: string): string[] {
  const dts = readFileSync(path.join(PACKAGE_ROOT, 'dist/lib/facade.d.ts'), 'utf8')
  const start = dts.indexOf(`interface ${name}`)
  expect(
    start,
    `dist/lib/facade.d.ts must declare ${name} (run \`pnpm run build\`)`,
  ).toBeGreaterThanOrEqual(0)
  const body = dts.slice(dts.indexOf('{', start) + 1, dts.indexOf('}', start))
  return body
    .matchAll(/^\s*(\w+)\??:/gm)
    .map((match) => match[1]!)
    .toArray()
    .toSorted((a, b) => a.localeCompare(b))
}

// R6's seven-artifact set, unordered.
const R6_ARTIFACTS = [
  'tokens.css',
  'tokens.js',
  'tokens.d.ts',
  'breakpoints.js',
  'breakpoints.d.ts',
  'palette-record.json',
  'build-record.json',
].toSorted((a, b) => a.localeCompare(b))

describe('AC-token-build-02 covers: R2', () => {
  it('the built exports map never mentions composeThemingOutputs, runPipeline, or anything under src/theming/', () => {
    const flat = JSON.stringify(PACKAGE_JSON.exports)
    expect(flat).not.toMatch(/theming|composeThemingOutputs|runPipeline/)
  })

  it("the compiled facade.d.ts's TokensBuildOptions interface declares EXACTLY R3's members — no 'env', no 'distDir', and no unanticipated sixth field either", () => {
    // A review found this was two negative matches (`env`, `distDir`) plus four
    // presence checks, which is a denylist wearing a whitelist's words. R2/R3's criterion is
    // "exactly the members this spec's R3 enumerates", and a denylist passes every member
    // nobody thought to name in advance. The member set is parsed and compared as a SET
    // instead, so a sixth field fails here by construction rather than by anticipation.
    expect(declaredMembersOf('TokensBuildOptions')).toEqual([
      'outDir',
      'overrides',
      'seed',
      'source',
    ])
  })

  it("the compiled facade.d.ts's TokensValidateOptions interface declares EXACTLY R3's one member", () => {
    expect(declaredMembersOf('TokensValidateOptions')).toEqual(['source'])
  })

  // A review round found `formatVersionSkewFact` re-exported here with no test pinning the
  // module's runtime export set — an incidental public export could slip in (or a real one
  // drop out) with nothing here to catch it. Read directly from `../src/facade.ts` (rather
  // than `dist/lib/facade.js`) so the pin holds before a build step runs, matching this
  // file's own in-process style; `declaredMembersOf` above already covers the compiled
  // `.d.ts` surface for the TYPE side.
  it('the façade module exports EXACTLY this sorted list of runtime bindings — a public export is a decision made here, not a side effect', async () => {
    const facadeModule: Record<string, unknown> = await import('../src/facade.ts')
    expect(Object.keys(facadeModule).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'build',
      'DuplicateTokenNameRefusal',
      'formatVersionSkewFact',
      'MissingContractTokensError',
      'SeedIngestRefusal',
      'TokenCollisionRefusal',
      'UsageError',
      'validate',
    ])
  })
})

/**
 * `TokensBuildResult.files` and `TokensValidateResult.output` keep a JSDoc comment in the
 * SOURCE. Pinned there rather than against the compiled `.d.ts`: this package's own
 * `tsconfig.build.json` sets `removeComments: true`, which strips every comment, JSDoc and
 * line comments alike, from `dist/lib/*.d.ts`, so no test against the compiled output could
 * tell a JSDoc comment from none. The source is what a contributor reads, so that is what
 * this pins.
 */
describe('TokensBuildResult.files and TokensValidateResult.output keep a JSDoc comment in the source', () => {
  const facadeSource = readFileSync(path.join(PACKAGE_ROOT, 'src/facade.ts'), 'utf8')

  it('TokensBuildResult.files carries a JSDoc comment directly above it in the source', () => {
    expect(facadeSource).toMatch(
      /\/\*\*(?:(?!\*\/)[\s\S])*?[A-Za-z](?:(?!\*\/)[\s\S])*?\*\/\s*\n\s*files\s*[?:]/,
    )
  })

  it('TokensValidateResult.output carries a JSDoc comment directly above it in the source', () => {
    expect(facadeSource).toMatch(
      /\/\*\*(?:(?!\*\/)[\s\S])*?[A-Za-z](?:(?!\*\/)[\s\S])*?\*\/\s*\n\s*output\s*[?:]/,
    )
  })
})

describe('AC-token-build-03 covers: R3', () => {
  // Neither scratch directory here is `process.cwd()` (fixed at
  // `packages/tokens` for every in-process test) or an ancestor of it, so this does NOT
  // establish that a cwd-and-ancestors config search is absent — only that build() behaves
  // the same across two directories that happen to differ in whether one holds a config
  // file neither is ever asked to look in. `test/bin.test.ts`'s "a plausible config file
  // sitting at the invoking cwd itself" test is the one that actually plants the file where
  // real discovery would look first.
  it('build succeeds identically across two scratch output directories regardless of an unrelated sibling config file', async () => {
    const withConfig = scratchDir()
    writeFileSync(
      path.join(withConfig, 'navecss.config.json'),
      JSON.stringify({ seed: 'oklch(0.1 0.3 10)' }),
    )
    const outWithConfig = path.join(withConfig, 'out')
    const withoutConfig = scratchDir()
    const outWithoutConfig = path.join(withoutConfig, 'out')

    const seed = 'oklch(0.55 0.18 250)'
    const resultA = await build({ seed, outDir: outWithConfig })
    const resultB = await build({ seed, outDir: outWithoutConfig })

    expect(resultA.files).toEqual(resultB.files)
    for (const file of resultA.files) {
      expect(readFileSync(path.join(outWithConfig, file), 'utf8')).toBe(
        readFileSync(path.join(outWithoutConfig, file), 'utf8'),
      )
    }
  })

  it('every R6 artifact and no other file lands in the output directory', async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: 'oklch(0.55 0.18 250)', outDir })
    expect(result.files).toEqual(R6_ARTIFACTS)
    expect(readdirSync(outDir).toSorted((a, b) => a.localeCompare(b))).toEqual(R6_ARTIFACTS)
  })
})

describe('AC-token-build-04 covers: R4 (in-process: which error TYPE each failure surfaces as)', () => {
  it("an unparsable seed throws SeedIngestRefusal — bin.ts maps this to exit 2, R4's own worked example", async () => {
    const outDir = path.join(scratchDir(), 'out')
    await expect(build({ seed: 'not-a-colour', outDir })).rejects.toBeInstanceOf(SeedIngestRefusal)
  })

  it('a color() seed in a colour space this build does not convert (rec2020) throws SeedIngestRefusal too, never a silent misread as srgb', async () => {
    const outDir = path.join(scratchDir(), 'out')
    await expect(build({ seed: 'color(rec2020 0 1 0)', outDir })).rejects.toBeInstanceOf(
      SeedIngestRefusal,
    )
  })

  it('validate against a source missing contract tokens exits 1', async () => {
    const source = path.join(scratchDir(), 'consumer.css')
    writeFileSync(source, ':root { --nave-color-surface-base: white; }')
    const result = await validate({ source })
    expect(result.exitCode).toBe(1)
  })

  it('validate against a satisfying source exits 0', async () => {
    const outDir = path.join(scratchDir(), 'out')
    await build({ seed: 'oklch(0.55 0.18 250)', outDir })
    const result = await validate({ source: path.join(outDir, 'tokens.css') })
    expect(result.exitCode).toBe(0)
  })

  it("validating this package's OWN bundled tokens.json (which declares zero colour tokens) exits 0, because the theming half supplies every contract name unconditionally", async () => {
    const result = await validate({ source: path.join(PACKAGE_ROOT, 'tokens.json') })
    expect(result.exitCode).toBe(0)
    expect(result.output.join('\n')).toMatch(/supplied by|navecss-tokens build/i)
  })

  it('a validate source with neither a .css nor a .json extension throws UsageError (R15 clause 3 — never a guess)', async () => {
    const source = path.join(scratchDir(), 'tokens.yaml')
    writeFileSync(source, 'not css or json')
    await expect(validate({ source })).rejects.toBeInstanceOf(UsageError)
  })

  it('MissingContractTokensError is exported for callers to distinguish from a usage error', () => {
    expect(new MissingContractTokensError(['--nave-x']).name).toBe('MissingContractTokensError')
  })
})

/**
 * Precision on R16: the check's
 * subject is the UNION of both halves' emitted names, computed BEFORE either is composed.
 * Re-fixtured here (moved from `test/theming/consumer-build.test.ts`, where the OLD siting
 * lived) with the `Given` this criterion always named — a consumer TOKEN SOURCE missing one
 * or more contract tokens — instead of an artificially widened manifest carrying an invented
 * name. `NON_COLOUR_CONTRACT_FIXTURE` supplies the fifteen non-colour names the widened
 * manifest now requires and that the theming half never emits, which is exactly what makes a
 * real missing-token `Given` reachable at all: before the manifest widened to require these
 * non-colour names, the theming half alone always satisfied the whole (colour-only) manifest, so
 * no consumer source could ever trip this check — measured directly, not assumed.
 */
describe('AC-token-build-16 covers: R16', () => {
  it('a consumer source missing one or more contract tokens fails with the validator missing-list error naming exactly the omitted name', async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    // The full non-colour fixture MINUS one required name (spacing.content.md), so the
    // Given is instantiated by an actual omission in the consumer's own source, never by
    // mutating the manifest.
    const { spacing: _omitted, ...rest } = NON_COLOUR_CONTRACT_FIXTURE
    writeFileSync(source, JSON.stringify(rest))
    const outDir = path.join(scratch, 'out')
    let caught: unknown
    try {
      await build({ seed: 'oklch(0.55 0.18 250)', outDir, source })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MissingContractTokensError)
    expect((caught as InstanceType<typeof MissingContractTokensError>).missing).toEqual([
      '--nave-spacing-content-md',
    ])
    // A review round (finding F13a) found that the `not.toMatch(/Slot not found for
    // contrast check/)` assertion that used to sit here is removed. That string is thrown
    // only by `findSlot` in `theming/contrast.ts`, which looks up the theming pipeline's own
    // resolved slots — a pure function of the seeds, never of the consumer's source — so
    // after the relocation to `facade.build` no source this test can construct reaches it.
    // It was meaningful in the OLD siting, where the consumer's names fed that lookup.
    expect(existsSync(outDir)).toBe(false)
  })

  it('a consumer source satisfying the full contract (the real, current manifest, not a fixture) builds to completion with no missing-token error', async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    writeFileSync(source, JSON.stringify(NON_COLOUR_CONTRACT_FIXTURE))
    const outDir = path.join(scratch, 'out')
    await expect(build({ seed: 'oklch(0.55 0.18 250)', outDir, source })).resolves.toBeDefined()
  })

  it('the bundled default source (no --source given) also satisfies the full contract: the DTCG half supplies the fifteen non-colour names and the theming half supplies the six colour ones', async () => {
    const outDir = path.join(scratchDir(), 'out')
    await expect(build({ seed: 'oklch(0.55 0.18 250)', outDir })).resolves.toBeDefined()
  })

  /**
   * A review round (tracked as F8) found that a prior ask said "computing the union first is
   * what preserves R16's ordering clause rather than trading it away — nothing generates before
   * the answer is known", and nothing held it: moving the whole validation block to sit AFTER
   * both compositions was measured 522/522 green. The R23 half (nothing
   * left on disk) IS held, by `expect(existsSync(outDir)).toBe(false)` above; "before either
   * half composes" is a strictly stronger, separate property and needs its own assertion.
   *
   * Both directions live in ONE test on purpose. The refusal case alone would pass just as
   * happily against a spy that never records anything, so the same spies are driven through
   * a COMPLETE source first and asserted to have been called — a positive control that turns
   * "the spy wiring silently stopped observing" into a named failure instead of a green.
   */
  it('AC-token-build-16: nothing generates before the answer is known — when the union check refuses, neither composeConsumerBuild nor the DTCG composition is ever invoked (the same spies fire on a complete source, as the positive control)', async () => {
    const scratch = scratchDir()
    const incompleteSource = path.join(scratch, 'incomplete.json')
    const { spacing: _omitted, ...rest } = NON_COLOUR_CONTRACT_FIXTURE
    writeFileSync(incompleteSource, JSON.stringify(rest))
    const completeSourcePath = path.join(scratch, 'complete.json')
    writeFileSync(completeSourcePath, JSON.stringify(NON_COLOUR_CONTRACT_FIXTURE))

    const themingCalls = vi.fn()
    const dtcgCalls = vi.fn()
    vi.resetModules()
    try {
      vi.doMock('../src/theming/consumer-build.ts', async () => {
        const actual = await vi.importActual<typeof ConsumerBuildModule>(
          '../src/theming/consumer-build.ts',
        )
        return {
          ...actual,
          composeConsumerBuild: (...args: Parameters<typeof actual.composeConsumerBuild>) => {
            themingCalls()
            return actual.composeConsumerBuild(...args)
          },
        }
      })
      vi.doMock('../src/builder.ts', async () => {
        const actual = await vi.importActual<typeof BuilderModule>('../src/builder.ts')
        return {
          ...actual,
          composeBuild: (...args: Parameters<typeof actual.composeBuild>) => {
            dtcgCalls()
            return actual.composeBuild(...args)
          },
        }
      })
      const facade = await import('../src/facade.ts')

      // Positive control FIRST: on a complete source both compositions really do run, so a
      // spy that observes nothing cannot masquerade as the property under test.
      await facade.build({
        seed: 'oklch(0.55 0.18 250)',
        outDir: path.join(scratch, 'out-complete'),
        source: completeSourcePath,
      })
      expect(themingCalls, 'the theming spy never observed a real call').toHaveBeenCalled()
      expect(dtcgCalls, 'the DTCG spy never observed a real call').toHaveBeenCalled()

      themingCalls.mockClear()
      dtcgCalls.mockClear()

      let caught: unknown
      try {
        await facade.build({
          seed: 'oklch(0.55 0.18 250)',
          outDir: path.join(scratch, 'out-incomplete'),
          source: incompleteSource,
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(facade.MissingContractTokensError)
      expect(
        themingCalls,
        'composeConsumerBuild ran before the union check refused',
      ).not.toHaveBeenCalled()
      expect(
        dtcgCalls,
        'the DTCG composition ran before the union check refused',
      ).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('../src/theming/consumer-build.ts')
      vi.doUnmock('../src/builder.ts')
      vi.resetModules()
    }
  })
})

/**
 * Mechanical detection ONLY. `composeBuild`'s DTCG-half names and the
 * theming half's emitted names are merged, string-appended, into the SAME layer and the SAME
 * `:root` with the theming half last — so a consumer following `validate`'s own printed
 * remedy ("declare these six names in your source") used to silently lose their authored
 * value the moment one of those names happened to be a contract name. This was
 * ruled: `build` now REFUSES (throws `TokenCollisionRefusal`, nothing written) rather than
 * silently letting the generated declaration win by merge order.
 */
describe('build() refuses when a name is declared by both the consumer source and the generated theming layer', () => {
  it('a consumer source declaring a contract name is refused, names the collision, and writes nothing', async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    writeFileSync(
      source,
      JSON.stringify(
        completeSource({
          color: {
            surface: { base: { $type: 'color', $value: '#ffffff' } }, // a real R14 contract name
            brand: { $type: 'color', $value: '#3355ff' }, // not a contract name
          },
        }),
      ),
    )
    const outDir = path.join(scratch, 'out')
    let caught: unknown
    try {
      await build({ seed: 'oklch(0.55 0.18 250)', outDir, source })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TokenCollisionRefusal)
    expect((caught as Error).message).toContain('--nave-color-surface-base')
    expect(existsSync(outDir)).toBe(false)
  })

  it("the refusal names the act available instead of the wrong 'rename it' advice", async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    writeFileSync(
      source,
      JSON.stringify(
        completeSource({ color: { surface: { base: { $type: 'color', $value: '#ffffff' } } } }),
      ),
    )
    const outDir = path.join(scratch, 'out')
    await expect(build({ seed: 'oklch(0.55 0.18 250)', outDir, source })).rejects.toThrow(
      /@layer overrides/,
    )
  })

  it('the bundled default source (no --source given) declares nothing that collides and builds cleanly', async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: 'oklch(0.55 0.18 250)', outDir })
    expect(result.collidingNames).toEqual([])
  })
})

/**
 * The unconditional `nave`-strip makes `nave.X` and `X` emit ONE custom property, so a
 * source declaring both has two DTCG paths mapping to one name — a
 * pre-existing class in `kebabName` (many-to-one by design), not newly created, but newly
 * consumer-reachable now that `--source` exists. `build` refuses rather than silently
 * dropping the first-declared value and registering `@property` twice.
 */
describe('build() refuses when two paths in one token source resolve to the same emitted name', () => {
  it('a nave-wrapped path and its unwrapped sibling collide, are refused, name both paths, and write nothing', async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    writeFileSync(
      source,
      JSON.stringify(
        completeSource({
          nave: { brand: { x: { $type: 'color', $value: '#ff0000' } } },
          brand: { x: { $type: 'color', $value: '#00ff00' } },
        }),
      ),
    )
    const outDir = path.join(scratch, 'out')
    let caught: unknown
    try {
      await build({ seed: 'oklch(0.55 0.18 250)', outDir, source })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(DuplicateTokenNameRefusal)
    // 'nave.brand.x' contains 'brand.x' as a substring, so three
    // independent toContain calls cannot distinguish a message naming both colliding paths
    // from one naming only 'nave.brand.x'. Assert the composed detail (both paths, in order)
    // as one sequence instead, which the title's "name both paths" claim actually requires.
    expect((caught as Error).message).toMatch(/--nave-brand-x \(from brand\.x and nave\.brand\.x\)/)
    expect(existsSync(outDir)).toBe(false)
  })

  it('an ordinary camelCase pair collides with no `nave` involved (a pre-existing class, not newly created)', async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    writeFileSync(
      source,
      JSON.stringify(
        completeSource({
          fontSize: { md: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } },
          font: { size: { md: { $type: 'dimension', $value: { value: 2, unit: 'rem' } } } },
        }),
      ),
    )
    const outDir = path.join(scratch, 'out')
    await expect(build({ seed: 'oklch(0.55 0.18 250)', outDir, source })).rejects.toBeInstanceOf(
      DuplicateTokenNameRefusal,
    )
  })

  it('the refusal names renaming a colliding path as the remedy, not the cross-half `@layer overrides` advice', async () => {
    const scratch = scratchDir()
    const source = path.join(scratch, 'source.json')
    writeFileSync(
      source,
      JSON.stringify(
        completeSource({
          nave: { brand: { x: { $type: 'color', $value: '#ff0000' } } },
          brand: { x: { $type: 'color', $value: '#00ff00' } },
        }),
      ),
    )
    const outDir = path.join(scratch, 'out')
    await expect(build({ seed: 'oklch(0.55 0.18 250)', outDir, source })).rejects.toThrow(
      /rename one of the colliding paths/i,
    )
  })

  it('the bundled default source (no --source given) declares no such pair and builds cleanly', async () => {
    const outDir = path.join(scratchDir(), 'out')
    await expect(build({ seed: 'oklch(0.55 0.18 250)', outDir })).resolves.toBeDefined()
  })
})

describe('AC-token-build-23 covers: R23 (in-process third clause: a refusal leaves no output on disk)', () => {
  it('a refused build writes nothing to the output directory at all', async () => {
    const outDir = path.join(scratchDir(), 'out')
    expect(existsSync(outDir)).toBe(false)
    await expect(build({ seed: 'not-a-colour', outDir })).rejects.toThrow()
    // Never created at all — not created-then-emptied, never created.
    expect(existsSync(outDir)).toBe(false)
  })
})

describe('AC-token-build-14 covers: R14 (facade wiring — the named gap slice 1 left open)', () => {
  it("validate reads the manifest from this INSTALLED package, never from a consumer's own output directory", () => {
    // Structural, not behavioural: `TokensValidateOptions` carries no field that could name
    // a manifest path or an output directory at all — `source` is its only member — so
    // there is no parameter through which a consumer's own directory could ever be read as
    // the manifest's source. The compiled `.d.ts` is the artifact a consumer actually sees.
    const dts = readFileSync(path.join(PACKAGE_ROOT, 'dist/lib/facade.d.ts'), 'utf8')
    const start = dts.indexOf('interface TokensValidateOptions')
    expect(
      start,
      'dist/lib/facade.d.ts must declare TokensValidateOptions (run `pnpm run build`)',
    ).toBeGreaterThanOrEqual(0)
    const body = dts.slice(start, dts.indexOf('}', start))
    const fieldNames = body
      .matchAll(/^\s*(\w+)\s*[?:]/gm)
      .map((match) => match[1])
      .toArray()
    expect(fieldNames).toEqual(['source'])
  })

  /**
   * The quality reviewer refuted the structural test's own argument ("no PARAMETER could
   * ever name a consumer directory") with a mutation using no parameter at all —
   * `readManifest()` preferring `path.join(process.cwd(), 'out', 'core-contract.json')` when
   * present — and the suite stayed 454/454 green. This is the behavioural test that mutation
   * demanded: a decoy manifest sitting exactly where that mutation would read it, with a
   * declared format version this build does not understand, so ANY read of it is loudly
   * visible in the report.
   */
  it("a decoy core-contract.json at <cwd>/out/core-contract.json (the shape a consumer's own output directory takes) has no effect on the result", async () => {
    const cwdBefore = process.cwd()
    const scratch = scratchDir('navecss-tokens-facade-decoy-cwd-')
    const decoyDir = path.join(scratch, 'out')
    mkdirSync(decoyDir, { recursive: true })
    writeFileSync(
      path.join(decoyDir, 'core-contract.json'),
      JSON.stringify({
        formatVersion: 999,
        producer: { name: 'decoy', version: '0.0.0' },
        tokens: ['--decoy-only'],
      }),
    )
    process.chdir(scratch)
    try {
      const source = path.join(scratch, 'consumer.css')
      writeFileSync(source, ':root { --nave-color-surface-base: white; }')
      const result = await validate({ source })
      const joined = result.output.join('\n')
      // If the decoy manifest were read instead of this package's own installed one, its
      // unrecognised format (999) would trigger R13's refusal, or its "decoy" producer name
      // would appear — neither happens, because validate() never reads process.cwd() at all.
      expect(joined).not.toContain('decoy')
      expect(joined).not.toContain('999')
    } finally {
      process.chdir(cwdBefore)
    }
  })
})

describe('AC-token-build-35 covers: R35 (in-process: resolvedSeed is the RESOLVED value the pipeline built from)', () => {
  // A review found that `resolvedSeed` returned `options.seed` verbatim, so it was the
  // raw input under a name (and a `bin.ts` docblock) that both promise the resolved one. The
  // property asserted here is the one the raw input cannot satisfy: two DIFFERENT spellings
  // of the SAME colour resolve to the SAME value. Deliberately not `formatOklch(ingestSeed(x))`
  // recomputed here, which would pass against any implementation including the broken one.
  it('two spellings of the same colour produce one identical resolvedSeed, and neither is the input string', async () => {
    const hexOut = path.join(scratchDir(), 'out')
    const rgbOut = path.join(scratchDir(), 'out')

    const fromHex = await build({ seed: '#3366ff', outDir: hexOut })
    const fromRgb = await build({ seed: 'rgb(51 102 255)', outDir: rgbOut })

    expect(fromHex.resolvedSeed).toBe(fromRgb.resolvedSeed)
    expect(fromHex.resolvedSeed).not.toBe('#3366ff')
    expect(fromHex.resolvedSeed).not.toBe('rgb(51 102 255)')
    expect(fromHex.resolvedSeed).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/)
  })

  // `resolvedSeed` used to return the pre-normalisation INGEST value (`formatOklch(primary.value)`),
  // which is what `parseSeed` produced before R5's gamut mapping ever ran — identical to the
  // ingested value for an in-gamut seed like the two above, so neither exposes this. An
  // out-of-gamut seed does: the pipeline actually builds from the chroma-reduced value.
  it('an out-of-gamut seed reports the GAMUT-MAPPED value the pipeline actually built from, not the pre-normalisation ingest value', async () => {
    const outDir = path.join(scratchDir(), 'out')
    // L=0.5, C=0.5 is far outside sRGB at any hue; normalizeSeed must reduce chroma.
    const result = await build({ seed: 'oklch(0.5 0.5 200)', outDir })

    expect(result.resolvedSeed).not.toBe('oklch(0.5 0.5 200)')
    const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(result.resolvedSeed)
    expect(match).not.toBeNull()
    const [, l, c, h] = match!
    expect(Number(l)).toBeCloseTo(0.5, 1)
    expect(Number(c)).toBeLessThan(0.5)
    expect(Number(h)).toBeCloseTo(200, 0)

    // Cross-checked against the SAME artifact a consumer would read, so the stdout-facing
    // value and the on-disk record can never silently disagree.
    const buildRecord = JSON.parse(
      readFileSync(path.join(outDir, 'build-record.json'), 'utf8'),
    ) as { seeds: { primary: { resolved: { c: number } } } }
    expect(Number(c)).toBeCloseTo(buildRecord.seeds.primary.resolved.c, 3)
  })

  it("seedNormalization is 'chroma-reduced' when gamut normalisation moved the primary seed's chroma to fit sRGB", async () => {
    const outDir = path.join(scratchDir(), 'out')
    // L=0.5, C=0.5 is far outside sRGB at any hue; normalizeSeed must reduce chroma.
    const result = await build({ seed: 'oklch(0.5 0.5 200)', outDir })
    expect(result.seedNormalization).toBe('chroma-reduced')
  })

  it("seedNormalization is 'none' for a seed already in gamut (used exactly as given)", async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: '#3366ff', outDir })
    expect(result.seedNormalization).toBe('none')
  })

  it("seedNormalization is 'none' for a seed that only hits the lightness band clamp — that clamp leaves the seed, its hue and every ramp lightness untouched, which is not a moved seed", async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: 'oklch(0.95 0.03 90)', outDir })
    expect(result.seedNormalization).toBe('none')
  })

  it("a seed whose OKLCH lightness is at or above 1 maps to exactly white: resolvedSeed is 'oklch(1 0 0)', seedNormalization is 'mapped-to-white', and the build record names the mapping", async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: 'color(srgb 1.2 1.2 1.2)', outDir })
    expect(result.resolvedSeed).toBe('oklch(1 0 0)')
    expect(result.seedNormalization).toBe('mapped-to-white')
    const buildRecord = JSON.parse(
      readFileSync(path.join(outDir, 'build-record.json'), 'utf8'),
    ) as { seeds: { primary: { substitutions: { normalized: { reason?: string } } } } }
    expect(buildRecord.seeds.primary.substitutions.normalized.reason).toBe(
      'seed lightness is at or above 1, where no sRGB colour has any chroma, so it was mapped to white, once, at ingest, as CSS Color 4 gamut mapping does',
    )
  })

  it("a seed whose OKLCH lightness is at or below 0 maps to exactly black: resolvedSeed is 'oklch(0 0 0)', seedNormalization is 'mapped-to-black', and the build record names the mapping", async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: 'color(srgb -0.2 -0.1 0)', outDir })
    expect(result.resolvedSeed).toBe('oklch(0 0 0)')
    expect(result.seedNormalization).toBe('mapped-to-black')
    const buildRecord = JSON.parse(
      readFileSync(path.join(outDir, 'build-record.json'), 'utf8'),
    ) as { seeds: { primary: { substitutions: { normalized: { reason?: string } } } } }
    expect(buildRecord.seeds.primary.substitutions.normalized.reason).toBe(
      'seed lightness is at or below 0, where no sRGB colour has any chroma, so it was mapped to black, once, at ingest, as CSS Color 4 gamut mapping does',
    )
  })

  it("seedNormalization is 'none' for a seed already exactly white (the endpoint itself, not something mapped to it)", async () => {
    const outDir = path.join(scratchDir(), 'out')
    const result = await build({ seed: '#ffffff', outDir })
    expect(result.seedNormalization).toBe('none')
  })

  // `TokensBuildResult.seedNormalization` is typed `SeedNormalization`, but `./build` did not
  // export that type, so a consumer could not name it (`import type { SeedNormalization }` had
  // nothing to import). This is a compile-time property: it is `pnpm run typecheck`, not
  // `vitest run`, that goes red without the fix, because the whole file fails to type-check.
  // A type-only assertion: the plugin's `expect-expect` rule does not recognise `expectTypeOf`,
  // and this test's whole verdict is `pnpm run typecheck` passing or failing below, never a
  // runtime `expect()`.
  // eslint-disable-next-line vitest/expect-expect
  it('SeedNormalization is exported from ./build, and TokensBuildResult.seedNormalization is exactly that type', () => {
    expectTypeOf<TokensBuildResult['seedNormalization']>().toEqualTypeOf<SeedNormalization>()
  })

  it("the compiled facade.d.ts exports the SeedNormalization type by name, not only TokensBuildResult's field", () => {
    const dts = readFileSync(path.join(PACKAGE_ROOT, 'dist/lib/facade.d.ts'), 'utf8')
    expect(dts).toMatch(
      /export type \{[^}]*\bSeedNormalization\b[^}]*\}|export type SeedNormalization\b/,
    )
  })
})

describe('AC-theming-06 covers: R5 (endpoint clause: a seed mapped to white or black normalizes nothing on a re-run)', () => {
  it.each([
    ['color(srgb 1.2 1.2 1.2)', 'mapped-to-white'],
    ['color(srgb -0.2 -0.1 0)', 'mapped-to-black'],
  ])(
    '%s is mapped once; building again from the recorded value normalizes nothing',
    async (seed, mapping) => {
      const first = await build({ seed, outDir: path.join(scratchDir(), 'out') })
      expect(first.seedNormalization).toBe(mapping)

      const again = await build({
        seed: first.resolvedSeed,
        outDir: path.join(scratchDir(), 'out'),
      })
      expect(again.seedNormalization).toBe('none')
      expect(again.resolvedSeed).toBe(first.resolvedSeed)
    },
  )

  it('a seed already exactly black inside sRGB is not normalized', async () => {
    const result = await build({ seed: '#000000', outDir: path.join(scratchDir(), 'out') })
    expect(result.seedNormalization).toBe('none')
  })
})

describe("a colour on its own space's neutral axis selects the achromatic branch through the full build, not only at ingest", () => {
  it('a seed written as lch(50 0 0) selects the achromatic branch (build-record.json)', async () => {
    const outDir = path.join(scratchDir(), 'out')
    await build({ seed: 'lch(50 0 0)', outDir })
    const record = JSON.parse(readFileSync(path.join(outDir, 'build-record.json'), 'utf8')) as {
      achromaticBranch: { selected: boolean }
    }
    expect(record.achromaticBranch.selected).toBe(true)
  })

  // Pinning: two exact-zero seeds of different FORM and different LIGHTNESS select the same
  // Nave-authored achromatic column — a hex grey and an oklch grey written directly.
  // Byte-identical tokens.css makes the shared-column claim mechanical rather than argued.
  it('#808080 and oklch(0.3 0 0) — different form, different lightness, both exactly achromatic — emit byte-identical tokens.css', async () => {
    const hexOut = path.join(scratchDir(), 'out')
    const oklchOut = path.join(scratchDir(), 'out')
    await build({ seed: '#808080', outDir: hexOut })
    await build({ seed: 'oklch(0.3 0 0)', outDir: oklchOut })
    expect(readFileSync(path.join(hexOut, 'tokens.css'), 'utf8')).toBe(
      readFileSync(path.join(oklchOut, 'tokens.css'), 'utf8'),
    )
  })

  it('#808080 selects the achromatic branch', async () => {
    const outDir = path.join(scratchDir(), 'out')
    await build({ seed: '#808080', outDir })
    const record = JSON.parse(readFileSync(path.join(outDir, 'build-record.json'), 'utf8')) as {
      achromaticBranch: { selected: boolean }
    }
    expect(record.achromaticBranch.selected).toBe(true)
  })
})

/**
 * A quality review (finding 3, a PINNING test — green at HEAD by design) noted that
 * `facade.ts` carries its own module-private `const CONSUMER_LAYER = 'tokens.presets'` for
 * the DTCG-reader half (`composeDtcgOutputs`) rather than importing `consumer-build.ts`'s
 * exported one, while `composeDtcgOutputs`'s own docblock says both halves target the SAME
 * R10 layer. They agree today — nothing pins it. facade.ts's own constant is not exported, so
 * there is no binding to import and compare directly; this reads the REAL merged tokens.css
 * `build()` writes and asserts every `@layer` block it contains — one from each half — names
 * the SAME layer as the exported `CONSUMER_LAYER`.
 */
describe('facade.ts and consumer-build.ts agree on the R10 consumer layer', () => {
  it("every @layer block in the merged tokens.css — the DTCG half's and the theming half's — names the exported CONSUMER_LAYER, not merely a literal that happens to match it today", async () => {
    const outDir = path.join(scratchDir(), 'out')
    await build({ seed: 'oklch(0.55 0.18 250)', outDir })
    const css = readFileSync(path.join(outDir, 'tokens.css'), 'utf8')
    const layers = css
      .matchAll(/@layer ([\w.]+) \{/g)
      .map((match) => match[1])
      .toArray()
    // Both halves actually emitted a layer block — otherwise an empty match set would pass
    // the loop below vacuously, which is not evidence of the two constants agreeing.
    expect(layers.length).toBeGreaterThan(1)
    for (const layer of layers) {
      expect(layer).toBe(CONSUMER_LAYER)
    }
  })
})
