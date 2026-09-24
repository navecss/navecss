import assert from 'node:assert/strict'
/**
 * Unit coverage for the pure classification logic in
 * check-bundling-guard-coverage.mjs, run with
 * Node's built-in test runner rather than a new dependency, per the
 * "no dependency, no counterparty" framing this instrument was cleared under.
 * Synthetic manifests only — this never touches the real workspace, so it
 * is safe to run standalone as red/green evidence without mutating
 * anything (unlike probing the tripwire itself, which requires deleting a
 * real guard file and is done manually, once, and reported on the issue).
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  bundlingCapabilityReasons,
  formatCoverageSummary,
} from './check-bundling-guard-coverage.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_NAME = 'check-bundling-guard-coverage.mjs'
const SCRIPT_PATH = path.join(ROOT, 'scripts', SCRIPT_NAME)

test('a package with no bundler, bin, or non-workspace runtime dependency does not qualify', () => {
  const manifest = {
    scripts: { build: 'node build.ts' },
    dependencies: { '@navecss/tokens': 'workspace:*' },
  }
  assert.deepEqual(bundlingCapabilityReasons(manifest), [])
})

test('a bundler step in the build script qualifies', () => {
  const manifest = { scripts: { build: 'tsup src/index.ts --format esm --dts --clean' } }
  assert.deepEqual(bundlingCapabilityReasons(manifest), ['bundler step in build script'])
})

test('a bin entry qualifies, even with an otherwise inert build script', () => {
  const manifest = { scripts: { build: 'node build.js' }, bin: { navecss: './dist/index.js' } }
  assert.deepEqual(bundlingCapabilityReasons(manifest), ['bin entry'])
})

test('a non-workspace runtime dependency qualifies', () => {
  const manifest = { dependencies: { postcss: '^8' } }
  assert.deepEqual(bundlingCapabilityReasons(manifest), ['non-workspace runtime dependency'])
})

test('a workspace-only dependency does not count as a non-workspace runtime dependency', () => {
  const manifest = { dependencies: { '@navecss/tokens': 'workspace:*' } }
  assert.deepEqual(bundlingCapabilityReasons(manifest), [])
})

test('a peerDependency is checked the same way as a dependency', () => {
  const manifest = { peerDependencies: { postcss: '^8' } }
  assert.deepEqual(bundlingCapabilityReasons(manifest), ['non-workspace runtime dependency'])
})

test('all three reasons are reported together when all three are present', () => {
  const manifest = {
    scripts: { build: 'tsup src/index.ts' },
    bin: { navecss: './dist/index.js' },
    dependencies: { postcss: '^8' },
  }
  assert.deepEqual(bundlingCapabilityReasons(manifest), [
    'bundler step in build script',
    'bin entry',
    'non-workspace runtime dependency',
  ])
})

// The summary must name a denominator, not just assert a bare universal.
test('formatCoverageSummary names the denominator and the excluded set', () => {
  const summary = formatCoverageSummary(
    ['@navecss/core', '@navecss/tokens', '@navecss/cli', '@navecss/bridge'],
    ['@navecss/core', '@navecss/tokens', '@navecss/cli'],
    ['@navecss/bridge'],
  )
  assert.equal(
    summary,
    'Bundling-guard coverage: 4 package(s) read, 3 capable of bundling, all 3 have a ' +
      'no-inlining guard; not capable (not examined): @navecss/bridge.',
  )
})

test('formatCoverageSummary omits the excluded-set clause when nothing was excluded', () => {
  const summary = formatCoverageSummary(['@navecss/core'], ['@navecss/core'], [])
  assert.equal(
    summary,
    'Bundling-guard coverage: 1 package(s) read, 1 capable of bundling, all 1 have a ' +
      'no-inlining guard.',
  )
  assert.ok(!summary.includes('not capable'))
})

test('formatCoverageSummary handles zero capable packages without a stray "all 0" reading as false confidence', () => {
  const summary = formatCoverageSummary(['@navecss/bridge'], [], ['@navecss/bridge'])
  assert.equal(
    summary,
    'Bundling-guard coverage: 1 package(s) read, 0 capable of bundling, all 0 have a ' +
      'no-inlining guard; not capable (not examined): @navecss/bridge.',
  )
})

// A review finding (principal-engineer and quality review), updated in a later slice (R1's `bin:
// navecss-tokens` landed): `AC-token-build-28`'s second clause obliges
// check-bundling-guard-coverage.mjs to find @navecss/tokens's guard file and pass. Until R1
// landed, the package had no `bin`, so `bundlingCapabilityReasons` returned `[]` and `main()`'s
// `continue` skipped the package before it ever reached the `guardPath` check — an untested
// premise, deliberately converted into a tripwire by the two tests below rather than left silent.
// **The tripwire has now TRIPPED, exactly as designed**: `hasBin(manifest)` is true (`bin:
// navecss-tokens`), so the reasons are `['bin entry']` — `hasBundlerStep` stays false because
// R8's compile step is `tsc` (per `BUNDLER_PATTERN` above, never a bundler by design, R30's
// licensing fence). The SECOND test below is what makes this the real R28 clause rather than a
// premise flip: the guard file `packages/tokens/test/no-inlined-dependency.test.ts` (R28's own
// deliverable, landed in an earlier slice) must exist, or the armed tripwire would fire for real.

// A review found: asserted with `includes` and deliberately NOT as an exact set.
// The premise this test exists to hold is "the package qualifies, so main() reaches the
// guardPath check below" — and `deepEqual(reasons, ['bin entry'])` reddens the day
// @navecss/tokens gains a non-workspace runtime dependency (which R29's own gate contemplates
// as a normal event), for a reason that is not a coverage failure and with the real gate
// unaffected. A check that goes red when nothing it guards has broken is a known anti-pattern, and
// the exact-set pin bought nothing the `includes` does not: the reason SET is already
// enumerated exhaustively by the seven synthetic-manifest tests above.
test('R28: the real @navecss/tokens manifest qualifies as bundling-capable (bin entry, R1)', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(ROOT, 'packages', 'tokens', 'package.json'), 'utf8'),
  )
  const reasons = bundlingCapabilityReasons(manifest)
  assert.ok(
    reasons.includes('bin entry'),
    `expected the real manifest to qualify via its bin entry; got ${JSON.stringify(reasons)}`,
  )
})

test('R28: the required no-inlining guard exists for @navecss/tokens, so the armed tripwire does not fire', () => {
  const guardPath = path.join(ROOT, 'packages', 'tokens', 'test', 'no-inlined-dependency.test.ts')
  assert.equal(
    existsSync(guardPath),
    true,
    `${guardPath} must exist now that @navecss/tokens qualifies`,
  )
})

// A review finding: every test above exercises `formatCoverageSummary` DIRECTLY,
// never `main()`'s call site — the argument-binding property that finding measured (`read` and
// `capable` swapped at the call, no test noticing) is invisible to a unit test on the
// formatter alone. This drives the real shipped script end to end against a synthetic
// `packages/` tree built with `read`, `capable` and `notCapable` all DIFFERENT sizes, so a
// swap at the call site prints a wrong-but-plausible-looking line rather than one that
// happens to still be numerically correct by coincidence.
//
// A follow-up finding from that same review (round 2), sizes CORRECTED in round 3:
// ONE fixture size is not enough. Measured: `formatCoverageSummary(new Array(3), capable,
// notCapable)` at `check-bundling-guard-coverage.mjs:152` leaves the whole
// `pnpm run scripts:test` suite GREEN against the single 3/2/1 case below (measured before this
// second case existed), because `read.length` there is coincidentally already 3 — the gate
// prints "3 package(s) read" when 4 are really read, exit 0. A single fixture pins the three
// counts against each OTHER (so a swap still reds) but never against the real set, so nothing
// binds the printed number to the variable it claims to report.
//
// What a SECOND case has to beat is an affine substitution, not merely a constant, and "two
// different sizes" does not get there on its own. Round 3 measured this against the 3/2/1 plus
// 5/3/2 pair the comment first shipped: substituting `capable` at the call site with
// `new Array(notCapable.length + 1)` leaves the whole suite GREEN and prints "2 capable of
// bundling, all 2 have a no-inlining guard" on the real repository, where the truth is 3,
// because `capable` happens to equal `notCapable + 1` in BOTH of those cases. The two cases are
// therefore 3/2/1 and 8/5/3, chosen so that every coordinate differs (3/8, 2/5, 1/3), every
// pairwise DIFFERENCE differs (1, 2, 1 against 3, 5, 2) and every pairwise RATIO differs, which
// is what separates the constant, offset and scaling classes at once. The loop shape is the one
// `check-license-enumeration-provenance.test.mjs` uses for row 1.
//
// ONE class is deliberately not claimed closed, because no fixture can close it: `read` is
// structurally `capable + notCapable` in `main()`, so `read.length` and
// `Math.max(read.length, capable.length, notCapable.length)` are equal on every possible input.
// That substitution survives (measured GREEN) and is not a defect — it can never print a wrong
// number. Do not add a case trying to separate it.
function bundlingFixtureDir(packages) {
  const dir = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'nave-bundling-coverage-'))
  mkdirSync(path.join(dir, 'scripts'))
  cpSync(SCRIPT_PATH, path.join(dir, 'scripts', SCRIPT_NAME))
  for (const [name, { manifest, guarded }] of Object.entries(packages)) {
    const pkgDir = path.join(dir, 'packages', name)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(manifest, null, 2))
    if (guarded) {
      mkdirSync(path.join(pkgDir, 'test'), { recursive: true })
      writeFileSync(path.join(pkgDir, 'test', 'no-inlined-dependency.test.ts'), '// fixture\n')
    }
  }
  return dir
}

// Two cases, sized for the property the docblock above `bundlingFixtureDir` states: read=3/
// capable=2/notCapable=1 and read=8/capable=5/notCapable=3. Within each case the three numbers
// are distinct, so substituting any one count for another at the print call site produces a
// distinguishable line; across the two cases every coordinate, every pairwise difference and
// every pairwise ratio differs, so no constant, offset or scaling satisfies both at once.
const BUNDLING_FIXTURE_CASES = [
  {
    packages: {
      'a-bundler': {
        manifest: { name: '@navecss/a-bundler', scripts: { build: 'tsup' } },
        guarded: true,
      },
      'b-bin': {
        manifest: { name: '@navecss/b-bin', bin: { x: './bin.js' } },
        guarded: true,
      },
      'c-plain': {
        manifest: { name: '@navecss/c-plain', scripts: { build: 'node build.ts' } },
        guarded: false,
      },
    },
    expectedLine:
      'Bundling-guard coverage: 3 package(s) read, 2 capable of bundling, all 2 have a ' +
      'no-inlining guard; not capable (not examined): @navecss/c-plain.',
  },
  {
    packages: {
      'd-bundler': {
        manifest: { name: '@navecss/d-bundler', scripts: { build: 'esbuild src/index.ts' } },
        guarded: true,
      },
      'e-bin': {
        manifest: { name: '@navecss/e-bin', bin: { y: './bin.js' } },
        guarded: true,
      },
      'f-dep': {
        manifest: { name: '@navecss/f-dep', dependencies: { postcss: '^8' } },
        guarded: true,
      },
      'g-rollup': {
        manifest: { name: '@navecss/g-rollup', scripts: { build: 'rollup -c' } },
        guarded: true,
      },
      'h-vite': {
        manifest: { name: '@navecss/h-vite', scripts: { build: 'vite build' } },
        guarded: true,
      },
      'i-plain': {
        manifest: { name: '@navecss/i-plain', scripts: { build: 'node build.ts' } },
        guarded: false,
      },
      'j-plain': {
        manifest: { name: '@navecss/j-plain', scripts: { build: 'node build.ts' } },
        guarded: false,
      },
      'k-plain': {
        manifest: { name: '@navecss/k-plain', scripts: { build: 'node build.ts' } },
        guarded: false,
      },
    },
    // The not-capable clause's ORDER comes from the script's own `.sort()` in
    // `listPackageDirs` (check-bundling-guard-coverage.mjs:89), which sorts DIRECTORY names —
    // `readdirSync` alone is not alphabetical on every filesystem, so this is a pin on the
    // script's sort and not on the platform. Measured: replacing that `.sort()` with
    // `.sort().reverse()` reds exactly this case.
    expectedLine:
      'Bundling-guard coverage: 8 package(s) read, 5 capable of bundling, all 5 have a ' +
      'no-inlining guard; not capable (not examined): @navecss/i-plain, @navecss/j-plain, ' +
      '@navecss/k-plain.',
  },
]

for (const { packages, expectedLine } of BUNDLING_FIXTURE_CASES) {
  test(`end to end: the shipped script's call site prints read/capable/notCapable counts that are all different sizes, and they must not be swapped (${expectedLine.match(/coverage: (\d+)/)[1]} read)`, () => {
    const dir = bundlingFixtureDir(packages)
    try {
      const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
        cwd: dir,
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, `expected a clean pass, got stderr: ${result.stderr}`)
      assert.ok(
        (result.stdout ?? '').includes(expectedLine),
        `expected the exact line, got: ${JSON.stringify(result.stdout)}`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
