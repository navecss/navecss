/**
 * Unit coverage for the pure classification logic in
 * check-license-allowlist.mjs, run with Node's
 * built-in test runner. Synthetic fixtures only, per the same reasoning as
 * check-bundling-guard-coverage.test.mjs: this is red/green evidence for
 * the classification logic without fabricating a real GPL dependency in
 * the repo to prove the gate would catch one.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ALLOWLIST_FAILURE_GUIDANCE,
  ALLOWLIST_FAILURE_HEADER,
  ALLOWLIST_NOTHING_CLASSIFIED_LINE,
  BUCKET_B_UNDECIDABLE_REASON,
  classifyBucketB,
  classifyBucketC,
  composeLicenseEnumeratorUnrunnableMessage,
  findPolicyShapeViolation,
  flattenLicenseGroups,
  formatAllowlistSuccessLine,
  LicenseEnumeratorError,
  main,
  parseLicensesJson,
  POLICY_FILE_INVALID_GUIDANCE,
  readLicensePolicy,
  reportAllowlistViolations,
  runLicensesList,
} from './check-license-allowlist.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))

test('parseLicensesJson treats the empty-scope plain-text line as no packages', () => {
  assert.deepEqual(parseLicensesJson('No licenses in packages found'), {})
  assert.deepEqual(parseLicensesJson('  No licenses in packages found  \n'), {})
})

test('parseLicensesJson parses real JSON output', () => {
  assert.deepEqual(parseLicensesJson('{"MIT": []}'), { MIT: [] })
})

// readLicensePolicy used to be a bare
// `JSON.parse(readFileSync(...))` inline in main(), which crashed on a raw SyntaxError for
// a malformed policy file instead of this gate's own designed failure message.
test('readLicensePolicy reads and parses the real policy file', () => {
  assert.deepEqual(readLicensePolicy(ROOT), policy)
})

test('readLicensePolicy returns undefined (never throws) on invalid JSON, printing a designed message', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  try {
    writeFileSync(path.join(dir, 'license-policy.json'), '{ not valid json')
    assert.equal(readLicensePolicy(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Cleared by the project's licensing steward: both the invalid-JSON path here and main()'s
// shape-violation path used to end "...route the licensing question to the licensing steward,
// never resolve it here...", naming the gatekeeper in a message printed to every contributor
// who hits either failure. Byte-anchored on the shared exported constant, which is the one
// place both call sites now source it from, so a re-wording of either printed message goes red.
// A follow-up fix: the doesNotMatch check used to sit here, on the
// constant alone. Mutation testing proved it was dead at this level (the block above it aborts
// on a failing equality before this line ever runs, and it is logically implied by the
// hardcoded literal on the passing branch), so it moved to the composed-output tests below,
// where it covers ground the byte anchor above cannot see: each print site's own HEADER.
test("POLICY_FILE_INVALID_GUIDANCE is the licensing steward's cleared bytes, byte-exact, and names no persona", () => {
  assert.equal(
    POLICY_FILE_INVALID_GUIDANCE,
    'No package was classified. Repair the JSON syntax without changing which licences the ' +
      'file admits. Changing what the allow-list permits is not something to do in a pull ' +
      'request: open an issue proposing it instead.',
  )
})

test('readLicensePolicy prints exactly POLICY_FILE_INVALID_GUIDANCE on invalid JSON, not a paraphrase of it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  const originalError = console.error
  let printed = ''
  console.error = (message) => {
    printed = message
  }
  try {
    writeFileSync(path.join(dir, 'license-policy.json'), '{ not valid json')
    readLicensePolicy(dir)
  } finally {
    console.error = originalError
    rmSync(dir, { recursive: true, force: true })
  }
  assert.match(printed, /\n\n/)
  assert.equal(printed.split('\n\n', 2)[1], POLICY_FILE_INVALID_GUIDANCE)
  assert.doesNotMatch(printed, /STEWARD/)
})

// (g)'s printed composition is
// anchored above; this is (h)'s. The hoist makes ONE constant the source for both call sites,
// which is exactly why the constant's own byte anchor cannot see either of them: a call site
// that stops reading the constant and inlines a paraphrase leaves the constant byte-exact and
// the printed message uncleared, and no assertion in this file distinguishes the two. The
// malformed policy returns before any `pnpm licenses list` call, so this needs no fixture
// project. `main()` sets `process.exitCode`, which outlives the test and would fail the whole
// run, so it is saved and restored alongside console.error (the shape
// check-license-allowlist-routing.test.mjs uses for the same reason).
test('main() prints exactly POLICY_FILE_INVALID_GUIDANCE on a shape violation, not a paraphrase of it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  const originalError = console.error
  const originalExitCode = process.exitCode
  let printed = ''
  let exitCode
  console.error = (message) => {
    printed = message
  }
  try {
    writeFileSync(path.join(dir, 'license-policy.json'), JSON.stringify({ prodPermissive: [] }))
    main(dir)
    exitCode = process.exitCode
  } finally {
    console.error = originalError
    process.exitCode = originalExitCode
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(exitCode, 1)
  assert.match(printed, /\n\n/)
  // A prior review round found the SECOND paragraph was the only half pinned here — mutation
  // testing proved it by mutating "is malformed. " to "is broken. " and the suite stayed green.
  // The first paragraph is asserted byte-exact too, built from the same
  // `findPolicyShapeViolation` call the source itself makes over this test's own fixture, not a
  // hand-copied string.
  assert.equal(
    printed.split('\n\n', 2)[0],
    `Licence allow-list gate: license-policy.json is malformed. ${findPolicyShapeViolation({ prodPermissive: [] })}`,
  )
  assert.equal(printed.split('\n\n', 2)[1], POLICY_FILE_INVALID_GUIDANCE)
  assert.doesNotMatch(printed, /STEWARD/)
})

// A prior review round found only the return value was pinned here, so
// EITHER paragraph of the printed refusal could be reworded with nothing going red — mutation
// testing proved it by mutating "could not read " to "cannot read the file " and the suite stayed
// green. Both paragraphs are asserted now. The first is byte-exact but not a bare literal:
// `policyPath` and `error.code` are read off this test's own `dir`, not hand-copied, so the
// assertion tracks the real composed template rather than one snapshot of it.
test('readLicensePolicy returns undefined (never throws) when the policy file is missing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  const policyPath = path.join(dir, 'license-policy.json')
  const originalError = console.error
  let printed = ''
  console.error = (message) => {
    printed = message
  }
  try {
    assert.equal(readLicensePolicy(dir), undefined)
  } finally {
    console.error = originalError
    rmSync(dir, { recursive: true, force: true })
  }
  assert.match(printed, /\n\n/)
  assert.equal(
    printed.split('\n\n', 2)[0],
    `Licence allow-list gate: could not read ${policyPath} (ENOENT).`,
  )
  assert.equal(
    printed.split('\n\n', 2)[1],
    'No package was classified. Fix or restore the policy file and re-run.',
  )
})

// prodCount and devOnlyCount are both counts of packages, printed on one line with no test at
// all covering its literal format before this. TWO cases, at different sizes, because one case
// cannot tell a computed count from the literal it happens to equal: substituting either
// coordinate for a constant satisfies at most one of these rows. The pairs also invert
// (3 < 11, then 7 > 2), so a min/max or sort substitution fails on one of them too. Both pairs
// are synthetic and neither is a live workspace number: this workspace's real counts move on
// any `pnpm add -D`, and a fixture that tracks them invites a "refresh" of a pure function's
// expected value every time the dependency tree shifts.
//
// What this test does NOT reach: which count is bound to which slot. That is decided at the
// call site in main(), which this function cannot see, and it has its own test at the end of
// this file.
test('formatAllowlistSuccessLine: the literal format, with the two counts pairwise distinct so a transposition inside this function reddens (the binding of each count to its slot is pinned at the call site, not here)', () => {
  assert.equal(
    formatAllowlistSuccessLine(3, 11),
    'Licence allow-list gate: 3 prod package(s), 11 dev-only package(s), all clear.',
  )
  assert.equal(
    formatAllowlistSuccessLine(7, 2),
    'Licence allow-list gate: 7 prod package(s), 2 dev-only package(s), all clear.',
  )
})

// formatAllowlistSuccessLine(0, 0)
// reads identically to a real clean pass with only the numerals differing. This line is printed
// INSTEAD of it when both counts are zero.
test("ALLOWLIST_NOTHING_CLASSIFIED_LINE is the licensing steward's cleared bytes, byte-exact", () => {
  assert.equal(
    ALLOWLIST_NOTHING_CLASSIFIED_LINE,
    'Licence allow-list gate: 0 prod package(s) and 0 dev-only package(s) were classified, so ' +
      'this run classified NOTHING and must not be read as a run that classified and passed. ' +
      'Exiting 0 because a workspace with no dependencies breaches nothing. If this workspace ' +
      'does have dependencies, the licence enumerator returned no usable output: run ' +
      '`pnpm install` and re-run.',
  )
  assert.equal(Buffer.byteLength(ALLOWLIST_NOTHING_CLASSIFIED_LINE), 366)
  assert.notEqual(ALLOWLIST_NOTHING_CLASSIFIED_LINE, formatAllowlistSuccessLine(0, 0))
})

// This is the case a human
// actually hits: `runLicensesList`'s execFileSync used to raw-crash with an uncaught Error
// when `pnpm licenses list` itself could not be run (no lockfile, or pnpm absent), before any
// package was classified. It now throws a designed LicenseEnumeratorError instead.
test('runLicensesList throws LicenseEnumeratorError, never the raw execFileSync error, when the command cannot be run', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-allowlist-enumerator-'))
  try {
    // No package.json, no lockfile: `pnpm licenses list` fails immediately.
    assert.throws(() => runLicensesList([], scratch), LicenseEnumeratorError)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('composeLicenseEnumeratorUnrunnableMessage composes the cleared bytes', () => {
  const message = composeLicenseEnumeratorUnrunnableMessage('ENOENT')
  assert.equal(
    message,
    'Licence allow-list gate: the licence enumerator could not be run (ENOENT).\n\n' +
      'No package was classified, so this run must not be read as a run that classified and ' +
      "passed. This gate reads `pnpm licenses list --json`, which needs the workspace's " +
      'dependencies installed: run `pnpm install` and re-run. If it keeps failing with the ' +
      'dependencies installed, open an issue rather than removing this gate from the check ' +
      'chain: a dependency whose licence nothing classified is exactly what this gate exists ' +
      'to notice.',
  )
  assert.equal(Buffer.byteLength(message), 506)
})

// Ruled by the project's licensing steward on that review round:
// `pnpm` writes its own diagnostics to stderr, and execFileSync appends that whole dump to
// `error.message`, so the interpolated reason can arrive multi-line. Reachable with this
// gate's hardcoded arguments, measured: a malformed `pnpm-workspace.yaml` (exit 1, a seven-line
// YAML diagnostic) and a bad `NODE_OPTIONS` in the environment (exit 9) both do it. Raw, that
// dump breaks the cleared opening sentence across several lines, orphans its closing `).` on a
// line of its own, and pushes the load-bearing "no package was classified" rider down behind a
// copy of text pnpm already printed above. The composer narrows the slot to its first line,
// which mints no new resolved string: it maps onto the single-line form
// already measured.
test('composeLicenseEnumeratorUnrunnableMessage keeps its opening sentence on one line when pnpm fails noisily', () => {
  const firstLine = 'Command failed: pnpm licenses list --prod --json'
  const noisy =
    `${firstLine}\n` +
    '[ERROR] unexpected end of the stream within a double quoted scalar (4:1)\n' +
    'For help, run: pnpm help licenses\n'
  const message = composeLicenseEnumeratorUnrunnableMessage(noisy)
  assert.equal(message, composeLicenseEnumeratorUnrunnableMessage(firstLine))
  assert.equal(
    message.split('\n', 1)[0],
    `Licence allow-list gate: the licence enumerator could not be run (${firstLine}).`,
  )
  assert.equal(Buffer.byteLength(message), 548)
})

test('main(): a workspace where the licence enumerator cannot run refuses with the cleared message, never an uncaught exception', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-allowlist-enumerator-'))
  try {
    // A valid policy file, but no package.json / lockfile at all, so `pnpm licenses list`
    // fails immediately without needing a slow real `pnpm install`.
    writeFileSync(path.join(scratch, 'license-policy.json'), JSON.stringify(policy))
    let threw = null
    let exitCode
    const originalExitCode = process.exitCode
    const calls = []
    const originalConsoleError = console.error
    console.error = (message) => calls.push(message)
    try {
      main(scratch)
      exitCode = process.exitCode
    } catch (error) {
      threw = error
    } finally {
      console.error = originalConsoleError
      process.exitCode = originalExitCode
    }
    assert.equal(threw, null, `main() must refuse, never throw: ${threw?.stack}`)
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 1)
    assert.match(calls[0], /the licence enumerator could not be run/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('flattenLicenseGroups produces one record per package per version', () => {
  const grouped = { MIT: [{ name: 'foo', versions: ['1.0.0', '2.0.0'] }] }
  assert.deepEqual(flattenLicenseGroups(grouped), [
    { name: 'foo', version: '1.0.0', license: 'MIT' },
    { name: 'foo', version: '2.0.0', license: 'MIT' },
  ])
})

// --- Bucket B (prod: dependencies/peerDependencies) ---

test('bucket B: MIT is allowed (permissive)', () => {
  assert.equal(classifyBucketB('MIT', policy).allowed, true)
})

test('bucket B: Apache-2.0 is allowed (permissive, NOTICE duty handled elsewhere)', () => {
  assert.equal(classifyBucketB('Apache-2.0', policy).allowed, true)
})

test('bucket B: GPL-3.0 is blocked (strong copyleft, RED)', () => {
  const result = classifyBucketB('GPL-3.0-only', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /not on the permissive allow-list/)
})

test('bucket B: MPL-2.0 is blocked (weak copyleft is a review item, not an auto-pass, RED)', () => {
  const result = classifyBucketB('MPL-2.0', policy)
  assert.equal(result.allowed, false)
})

test('bucket B: BUSL-1.1 is blocked regardless of prod/dev (always-blocked, RED)', () => {
  const result = classifyBucketB('BUSL-1.1', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /source-available use-restricting/)
})

test('bucket B: an OR expression passes only if every alternative is permissive (per the licensing steward: election is not a signed guarantee)', () => {
  assert.equal(classifyBucketB('(MIT OR CC0-1.0)', policy).allowed, true)
})

test('bucket B: an OR expression with a non-permissive branch is a review item, not an auto-pass (RED, was the bug where such an OR auto-passed instead of routing to review)', () => {
  const result = classifyBucketB('(GPL-3.0-only OR MIT)', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /election|not a signed guarantee/)
  // A prior review round consulted the licensing steward: the `assert.match` above pins the
  // ROUTING, not the bytes — the licensing steward measured that rewording this reason leaves
  // the suite 65/65 green. It carries the licensing steward's ruling in contributor-facing
  // words, so the wording is the product and not a paraphrase anyone may tune. Same discipline
  // as WORKSPACE_GLOB_VIOLATION_MESSAGE's anchor in
  // check-license-parity.test.mjs: if this fails, restore the reason, do not update the
  // expectation. A reword is a fresh clearance and returns to the licensing steward.
  assert.equal(
    result.reason,
    'an OR expression carrying at least one non-permissive branch — whether the licensee ' +
      'may elect the permissive term and never bind the other is not a signed guarantee ' +
      'here — review item, not an auto-pass',
  )
})

test('bucket B: an OR expression fails if no alternative is permissive (RED)', () => {
  assert.equal(classifyBucketB('(GPL-3.0-only OR AGPL-3.0-only)', policy).allowed, false)
})

test('bucket B: an AND expression requires every part to be permissive', () => {
  assert.equal(classifyBucketB('(MIT AND Apache-2.0)', policy).allowed, true)
  assert.equal(classifyBucketB('(MIT AND GPL-3.0-only)', policy).allowed, false)
})

// --- Nested compound expressions: Tier 3, refuse to classify ---
// An earlier defect: splitExpression branched on ` OR ` before ` AND `, so a nested
// compound silently discarded its AND term and leaked strong/network copyleft as
// "permissive". Per the licensing steward's ruling: reordering the branches is
// not the fix (it swaps which direction leaks), the gate must REFUSE to classify anything
// it cannot fully decompose. The two shapes below are the exact pair that ruling names as
// mattering most, one per leak direction.

test('bucket B: a nested compound that would have leaked AGPL is refused, not passed (RED before the fix, reproducing the OR-before-AND branch-order defect)', () => {
  const result = classifyBucketB('(MIT OR ISC) AND AGPL-3.0-only', policy)
  assert.equal(result.allowed, false)
  assert.notEqual(result.reason, 'permissive')
  assert.match(result.reason, /cannot decompose/)
})

// Cleared by the project's licensing steward: the tier-3 undecidable reason used to end "...and
// routes to the licensing steward", composing with the printed frame around it into a message
// that names the gatekeeper a second time inside its own middle. Byte-anchored so a re-wording
// of this cleared sentence goes red; re-wrapping it across different line breaks does not,
// since only the concatenated VALUE is compared.
// A follow-up fix: the doesNotMatch this test carried on the constant alone is dropped for
// the same reason as POLICY_FILE_INVALID_GUIDANCE's (dead by the same mutation proof); it is
// NOT relocated to a composed-output test here, because no such test in this file interpolates
// this reason into its own printed header today (unlike (g)/(h)'s two call sites) — a residual
// left open rather than closed by inventing a new composed test out of this round's scope.
test("BUCKET_B_UNDECIDABLE_REASON is the licensing steward's cleared bytes, byte-exact, and names no persona", () => {
  assert.equal(
    BUCKET_B_UNDECIDABLE_REASON,
    'this gate cannot decompose the expression into identifiers it can classify with ' +
      'confidence, and it declines to approximate a licensing question rather than guess',
  )
})

test('bucket B: an undecidable expression’s reason is exactly BUCKET_B_UNDECIDABLE_REASON, not a paraphrase of it', () => {
  const result = classifyBucketB('(MIT OR Apache-2.0) AND BSD-3-Clause', policy)
  assert.equal(result.allowed, false)
  assert.equal(result.reason, BUCKET_B_UNDECIDABLE_REASON)
})

// A round-2 review (blue finding 1): BUCKET_B_UNDECIDABLE_REASON's own byte
// anchor above proves the CONSTANT is clean; it cannot see whether a violation carrying that
// reason still prints clean once composed into reportAllowlistViolations' contributor-facing
// line, because no test drove a real undecidable violation through the reporter. Mirrors the
// (g)/(h) composed-output tests already covering POLICY_FILE_INVALID_GUIDANCE's two call
// sites, closing the same class of gap for (f)'s one call site (classifyBucketB's tier-3
// return, consumed by main()'s bucket-B loop, printed by reportAllowlistViolations).
test('a bucket-B tier-3 violation composes into the contributor-facing line with exactly BUCKET_B_UNDECIDABLE_REASON, naming no persona', () => {
  const { reason } = classifyBucketB('(MIT OR ISC) AND GPL-3.0-only', policy)
  const violations = [
    {
      name: 'undecidable-pkg',
      version: '1.0.0',
      license: '(MIT OR ISC) AND GPL-3.0-only',
      bucket: 'B (prod)',
      reason,
    },
  ]

  const calls = []
  const originalConsoleError = console.error
  console.error = (message) => {
    calls.push(message)
  }
  try {
    reportAllowlistViolations(violations)
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(
    calls[1],
    `  - [bucket B (prod)] undecidable-pkg@1.0.0: "(MIT OR ISC) AND GPL-3.0-only" — ${
      BUCKET_B_UNDECIDABLE_REASON
    }`,
  )
  assert.doesNotMatch(calls[1], /STEWARD/)
})

test("bucket B: a nested compound that is entirely permissive is refused rather than approximated as blocked (the fail-closed false-stop found during the licensing steward's review)", () => {
  const result = classifyBucketB('MIT AND (ISC OR GPL-3.0-only)', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
  assert.doesNotMatch(result.reason, /not on the permissive allow-list/)
})

test('bucket B: the (MIT OR ISC) AND GPL-3.0-only shape that leaked under the OR-before-AND branch-order defect is refused, not "permissive"', () => {
  const result = classifyBucketB('(MIT OR ISC) AND GPL-3.0-only', policy)
  assert.equal(result.allowed, false)
  assert.notEqual(result.reason, 'permissive')
})

test('bucket B: a mixed-operator expression with no wrapping parens is refused too', () => {
  const result = classifyBucketB('MIT OR ISC AND GPL-3.0-only', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: isAlwaysBlocked still fires on a nested compound (parser-independent)', () => {
  const result = classifyBucketB('(MIT OR ISC) AND BUSL-1.1', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /source-available use-restricting/)
})

test('bucket B: tier-1 identifier matching is case-sensitive (a value matching only case-insensitively has already degraded to "custom")', () => {
  const result = classifyBucketB('mit', policy)
  assert.equal(result.allowed, false)
})

// --- Regression fixtures for the shapes the quality reviewer and the licensing steward
// probed live during a review round (and its own self-correction) ---
// `MIT+`, `LicenseRef-Proprietary` and `WITH` land where they do because
// the charset (IDENTIFIER_RE) governs over its own looser prose elsewhere,
// which the licensing steward corrected against itself in this review. `MIT  OR  ISC`
// decomposing as tier 2 (allowed: true) is deliberate and must not be
// "hardened" out: it cannot admit an unadmitted identifier, because the
// verdict is `every`.

test('bucket B: MIT+ is a bare identifier that fails the exact match, not an unparseable expression (tier 1: the charset admits +)', () => {
  const result = classifyBucketB('MIT+', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /not on the permissive allow-list/)
})

test('bucket B: LicenseRef-Proprietary is a bare identifier that fails the exact match (tier 1)', () => {
  const result = classifyBucketB('LicenseRef-Proprietary', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /not on the permissive allow-list/)
})

test('bucket B: a WITH expression is undecomposable, the spaces break the charset (tier 3)', () => {
  const result = classifyBucketB('Apache-2.0 WITH LLVM-exception', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: double-wrapped parens are undecomposable, the inner text contains parentheses (tier 3)', () => {
  const result = classifyBucketB('((MIT))', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: an empty expression is undecomposable (tier 3)', () => {
  const result = classifyBucketB('', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: a whitespace-only expression is undecomposable (tier 3)', () => {
  const result = classifyBucketB('   ', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

// A paren pair wrapping a SINGLE operand is now decidable (the widened tier 2), provided the
// pair sits at a string boundary or a space immediately outside each of its two characters —
// the falsifier's own boundary property, which is why the four glued/split shapes below stay
// tier 3 unchanged.
test('bucket B: a paren pair wrapping a single operand decomposes (tier 2, widened)', () => {
  const result = classifyBucketB('(MIT) OR ISC', policy)
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'permissive')
})

test('bucket B: single-operand parens on both sides of a compound decompose (tier 2, widened)', () => {
  const result = classifyBucketB('(MIT) AND (ISC)', policy)
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'permissive')
})

test('bucket B: a three-operand expression with a single-operand paren on each operand decomposes (tier 2, widened)', () => {
  const result = classifyBucketB('(MIT) OR (ISC) OR (0BSD)', policy)
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'permissive')
})

test('bucket B: a single-operand paren wrapping a non-permissive identifier still fails on admission, not decomposition (tier 2, widened)', () => {
  const result = classifyBucketB('MIT OR (GPL-3.0-only)', policy)
  assert.equal(result.allowed, false)
  assert.doesNotMatch(result.reason, /cannot decompose/)
})

// The falsifier's own boundary property: a parenthesis with an identifier character
// immediately outside it is never removed, so the widening can neither merge two
// identifiers nor split one. All four stay tier 3, unchanged by the tier-2 widening.
for (const glued of ['MI(T)', 'M(IT)', '(MI)T', 'MIT(ISC)']) {
  test(`bucket B: ${JSON.stringify(glued)} stays undecomposable — no space or boundary outside the paren (tier 3, the tier-2 widening does not reach this)`, () => {
    const result = classifyBucketB(glued, policy)
    assert.equal(result.allowed, false)
    assert.match(result.reason, /cannot decompose/)
  })
}

test('bucket B: a paren with a space inside it is not a single-operand pair and stays undecomposable (tier 3, unaffected by the tier-2 widening)', () => {
  const result = classifyBucketB('( MIT ) OR ISC', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: a paren immediately followed by an operand with no space stays undecomposable (tier 3, unaffected by the tier-2 widening)', () => {
  const result = classifyBucketB('(MIT)OR ISC', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: a real nested compound (a paren wrapping more than one identifier) stays undecomposable (the tier-2 widening does not reach this)', () => {
  const result = classifyBucketB('MIT AND (ISC OR GPL-3.0-only)', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /cannot decompose/)
})

test('bucket B: an OR expression with double-spaced operands still decomposes, operands are trimmed (tier 2, deliberate)', () => {
  const result = classifyBucketB('MIT  OR  ISC', policy)
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'permissive')
})

// --- Malformed prodPermissive entries fail closed ---
// classifyBucketB matches on `entry.id`; a null/undefined entry used to
// throw a raw TypeError instead of returning the same `{ allowed: false }`
// shape a malformed bare-string entry already produces. These fixtures use
// a synthetic policy object, not the tracked license-policy.json.

test('bucket B: a null prodPermissive entry fails closed, does not throw (RED before the guard)', () => {
  const malformedPolicy = { alwaysBlockedPatterns: [], prodPermissive: [null] }
  const result = classifyBucketB('MIT', malformedPolicy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /not on the permissive allow-list/)
})

test('bucket B: an undefined prodPermissive entry fails closed, does not throw (RED before the guard)', () => {
  const malformedPolicy = { alwaysBlockedPatterns: [], prodPermissive: [undefined] }
  const result = classifyBucketB('MIT', malformedPolicy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /not on the permissive allow-list/)
})

test('bucket B: a null entry does not block matching a well-formed entry later in the array', () => {
  const mixedPolicy = {
    alwaysBlockedPatterns: [],
    prodPermissive: [null, { id: 'MIT' }],
  }
  assert.equal(classifyBucketB('MIT', mixedPolicy).allowed, true)
})

test('bucket B: a bare-string prodPermissive entry still fails closed (pre-existing behaviour, unchanged)', () => {
  const malformedPolicy = { alwaysBlockedPatterns: [], prodPermissive: ['MIT'] }
  const result = classifyBucketB('MIT', malformedPolicy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /not on the permissive allow-list/)
})

// --- The alwaysBlockedPatterns shape pre-flight ---
// isAlwaysBlocked reads a key NOTHING validates, and it runs through
// classifyBucketC over every dev-only package (526 today), so a malformed
// alwaysBlockedPatterns is the REACHABLE crash path. findPolicyShapeViolation
// runs in main() before any package is classified, so the operator gets a
// designed message and a non-zero exit instead of a raw TypeError, and never
// a silent "not blocked".

test('the real license-policy.json passes the shape pre-flight (GREEN)', () => {
  assert.equal(findPolicyShapeViolation(policy), null)
})

test('a missing alwaysBlockedPatterns is a shape violation (RED)', () => {
  const violation = findPolicyShapeViolation({ prodPermissive: [] })
  assert.match(violation, /"alwaysBlockedPatterns"/)
  assert.match(violation, /array of/)
})

test('a non-array alwaysBlockedPatterns is a shape violation (RED)', () => {
  assert.match(findPolicyShapeViolation({ alwaysBlockedPatterns: 'SSPL' }), /alwaysBlockedPatterns/)
  assert.match(findPolicyShapeViolation({ alwaysBlockedPatterns: null }), /alwaysBlockedPatterns/)
})

test('a non-string pattern inside alwaysBlockedPatterns is a shape violation (RED)', () => {
  // `pattern.toLowerCase()` throws on a non-string just as `.some` throws on
  // a non-array; both are the same designed-message case.
  const violation = findPolicyShapeViolation({ alwaysBlockedPatterns: ['SSPL', 42] })
  assert.match(violation, /alwaysBlockedPatterns/)
  assert.match(violation, /index 1/)
})

test('an empty alwaysBlockedPatterns is well-formed, not a violation (GREEN)', () => {
  // Empty means "no carve-out", which is a policy question, not a shape one.
  // The synthetic fixtures above rely on this.
  assert.equal(findPolicyShapeViolation({ alwaysBlockedPatterns: [] }), null)
})

// A prior review round found: the four assertions above are all
// `assert.match` on a fragment, and main()'s own pin composes its expected value by CALLING
// findPolicyShapeViolation, so the interpolated tail moves on both sides together
// (a self-reference shape). That review measured the gap: a re-wording that PRESERVES
// `"alwaysBlockedPatterns"` and `index 1` ships with nothing going red. These two pin the
// composed bytes outright, which is what makes the fragment matches above safe to keep as the
// readable statement of intent. This is the text that tells a contributor what is wrong with
// the policy file, and the gate refuses to run until they fix it, so the wording is the product.
test('both shape-violation messages are pinned byte-for-byte, not by fragment', () => {
  assert.equal(
    findPolicyShapeViolation({ prodPermissive: [] }),
    '"alwaysBlockedPatterns" is missing or not an array; it must be an array of ' +
      'licence-string patterns (the source-available use-restricting carve-out). This gate ' +
      'cannot apply a carve-out it cannot read, and it will not fall back to an empty one.',
  )
  assert.equal(
    findPolicyShapeViolation({ alwaysBlockedPatterns: ['SSPL', 7] }),
    '"alwaysBlockedPatterns" index 1 (7) is ' +
      'not a string; every pattern is matched as a case-insensitive substring of a licence ' +
      'string, so every pattern must be one.',
  )
})

// --- Bucket C (dev-only: devDependencies) ---

test('bucket C: GPL-3.0 is allowed (broad by design — devDependencies is not bucket B)', () => {
  assert.equal(classifyBucketC('GPL-3.0-only', policy).allowed, true)
})

test('bucket C: any OSI-ish licence string passes', () => {
  assert.equal(classifyBucketC('0BSD', policy).allowed, true)
  assert.equal(classifyBucketC('(MIT OR CC0-1.0)', policy).allowed, true)
})

test('bucket C: SSPL is blocked even in dev (the carve-out that makes the bucket not simply "anything", RED)', () => {
  const result = classifyBucketC('SSPL-1.0', policy)
  assert.equal(result.allowed, false)
  assert.match(result.reason, /source-available use-restricting/)
})

test('bucket C: Elastic-2.0 is blocked even in dev', () => {
  assert.equal(classifyBucketC('Elastic-2.0', policy).allowed, false)
})

test('bucket C: a licence combined with Commons-Clause is blocked even in dev', () => {
  assert.equal(classifyBucketC('Apache-2.0 WITH Commons-Clause', policy).allowed, false)
})

// The two printed strings are cleared bytes: a re-wording of either is a fresh clearance
// turn, not a tidy. This anchors the CONSTANTS' own bytes, so a tidy that re-words either one
// goes red here instead of shipping an uncleared wording silently. It does not exercise a red
// run at all; that is the test below, which anchors the COMPOSED output
// `reportAllowlistViolations` prints, plus the real entry point that calls it, driven end to
// end in check-license-allowlist-routing.test.mjs.
test('the exported header and guidance constants equal the cleared bytes', () => {
  assert.equal(
    ALLOWLIST_FAILURE_HEADER,
    'Licence allow-list gate: violations found (do not resolve this in your pull request):\n',
  )
  assert.equal(
    ALLOWLIST_FAILURE_GUIDANCE,
    '\nThe allow-list is not a file to edit to make a pull request pass. If you need a dependency whose licence this gate rejects, open an issue naming the package, its version and its licence, and leave it out of the pull request until that issue is answered.',
  )
})

// The composed message, captured through console.error rather than assembled by hand. The
// constants above prove their own bytes match the clearance; this proves
// `reportAllowlistViolations` still calls them, in this order, with nothing inlined or dropped
// in between. console.error is saved, replaced with a collector, and restored in a `finally`
// so a failing assertion cannot leak a patched global into a later test.
test('reportAllowlistViolations prints the cleared header, one line per violation, then the cleared guidance, in that order', () => {
  const violations = [
    {
      name: 'badpkg',
      version: '1.0.0',
      license: 'GPL-3.0-only',
      bucket: 'B (prod)',
      reason: 'not on the permissive allow-list',
    },
    {
      name: 'some-build-tool',
      version: '3.0.0',
      license: 'BUSL-1.1',
      bucket: 'C (dev)',
      reason: 'source-available use-restricting licence',
    },
  ]

  const calls = []
  const originalConsoleError = console.error
  console.error = (message) => {
    calls.push(message)
  }
  try {
    reportAllowlistViolations(violations)
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(calls.length, 4)
  assert.equal(
    calls[0],
    'Licence allow-list gate: violations found (do not resolve this in your pull request):\n',
  )
  assert.equal(
    calls[1],
    '  - [bucket B (prod)] badpkg@1.0.0: "GPL-3.0-only" — not on the permissive allow-list',
  )
  assert.equal(
    calls[2],
    '  - [bucket C (dev)] some-build-tool@3.0.0: "BUSL-1.1" — source-available use-restricting licence',
  )
  assert.equal(
    calls[3],
    '\nThe allow-list is not a file to edit to make a pull request pass. If you need a dependency whose licence this gate rejects, open an issue naming the package, its version and its licence, and leave it out of the pull request until that issue is answered.',
  )
})

// An inline copy of the cleared bytes at the call site is byte-identical to reading the
// constant, so no output comparison anywhere in this file can tell the two apart, and the copy
// is then free to drift from the constant the clearance is anchored on. The only observable
// difference is in the source text, so that is what this reads: the reporter must NAME both
// constants and must contain no string literal of its own.
test('reportAllowlistViolations reads the constants and inlines no cleared bytes', () => {
  const source = reportAllowlistViolations.toString()

  assert.ok(source.includes('ALLOWLIST_FAILURE_HEADER'))
  assert.ok(source.includes('ALLOWLIST_FAILURE_GUIDANCE'))
  assert.ok(!source.includes('Licence allow-list gate:'))
  assert.ok(!source.includes('The allow-list is not a file to edit'))
})

// --- The success line's CALL SITE ---
//
// `formatAllowlistSuccessLine`'s own fixture above pins the FORMAT. It cannot pin which count
// reaches which slot, because the formatter has no knowledge of which count is which: swapping
// the two arguments at main()'s call site prints "627 prod package(s), 0 dev-only package(s)"
// on this repository — a licensing gate reporting it cleared 627 production dependency licences
// when it compared none — with the whole suite green and `scripts:check` exit 0.
//
// This drives the real main() over a scratch pnpm project, the harness
// check-license-allowlist-routing.test.mjs already uses for the failure path, and asserts the
// SUCCESS line it prints. main() sets `process.exitCode`, which outlives the test and would
// fail the whole run, so it is saved and restored alongside console.log.

// The one prod package at index 0 is given this fictional licence instead of MIT, and the
// scratch policy's `prodPermissive` is the real one PLUS an entry admitting it. Real MIT
// packages classify identically whichever of the two policies main() reads, so on its own
// that pair could not discriminate `readLicensePolicy(rootDir)` from a `rootDir`-dropping
// mutant reading THIS repo's own policy instead: that policy lacks the marker id, so the
// mutant reads it, the marker package fails bucket B, and the gate reports a violation
// instead of the success line the test asserts — the case this marker exists to catch.
const SCRATCH_ONLY_LICENSE_ID = 'Nave-Scratch-Marker-Only-1.0'

/**
 * A standalone scratch pnpm project (never inside this repo's workspace) with `prod` local
 * `file:` packages under `dependencies` and `dev` under `devDependencies`. A real `pnpm
 * install` runs, so `pnpm licenses list` reads real installed manifests rather than a
 * hand-written double. The scratch policy is the repository's own, plus one marker entry
 * (`SCRATCH_ONLY_LICENSE_ID`) that only this workspace's policy admits — see that constant.
 */
function buildScratchWorkspace(prodCount, devCount) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'nave-allowlist-callsite-')))
  const dependencies = {}
  const devDependencies = {}
  const addLocalPackage = (name, into, license = 'MIT') => {
    const depDir = path.join(scratch, name)
    mkdirSync(depDir, { recursive: true })
    writeFileSync(
      path.join(depDir, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', license }, undefined, 2),
    )
    into[name] = `file:./${name}`
  }
  for (let index = 0; index < prodCount; index += 1) {
    const license = index === 0 ? SCRATCH_ONLY_LICENSE_ID : 'MIT'
    addLocalPackage(`scratch-prod-${index}`, dependencies, license)
  }
  for (let index = 0; index < devCount; index += 1)
    addLocalPackage(`scratch-dev-${index}`, devDependencies)

  writeFileSync(
    path.join(scratch, 'package.json'),
    JSON.stringify(
      {
        name: 'scratch-allowlist-callsite-project',
        version: '1.0.0',
        private: true,
        dependencies,
        devDependencies,
      },
      undefined,
      2,
    ),
  )
  const scratchPolicy = {
    ...policy,
    prodPermissive: [...policy.prodPermissive, { id: SCRATCH_ONLY_LICENSE_ID }],
  }
  writeFileSync(
    path.join(scratch, 'license-policy.json'),
    JSON.stringify(scratchPolicy, undefined, 2),
  )
  // `pnpm licenses list` requires a lockfile to exist (ERR_PNPM_LICENSES_NO_LOCKFILE
  // otherwise), so a plain `pnpm install` is used, not `--no-lockfile`.
  execFileSync('pnpm', ['install'], { cwd: scratch, encoding: 'utf8' })
  return scratch
}

test(
  'main() binds the prod count to the prod slot and the dev-only count to the dev-only slot, over a scratch project where the two differ',
  { timeout: 180_000 },
  () => {
    // TWO cases, and every number in each case is different from every other number in scope
    // at that call site, which is what makes each substitution individually observable.
    //
    // main() holds these counts when it composes the success line:
    //
    //   case  prodPackages  devOnlyPackages  allPackages  violations
    //      1             2                3            5           0
    //      2             3                1            4           0
    //
    // Do NOT "simplify" either case to equal prod and dev counts, and do not drop one of the
    // two: equal counts make a transposition print a byte-identical line (which is exactly the
    // real repository's failure mode in the other direction, 0 and 627 being unequal only by
    // coincidence), and a single case cannot tell a computed count from the literal it happens
    // to equal. The two cases also invert (2 < 3, then 3 > 1), so a min/max substitution fails
    // on one of them. `prodKeys.size` is deliberately NOT in the table: it is the size of the
    // `name@version` set built from `prodPackages`, and it equals that array's length on every
    // input `pnpm licenses list` can produce, so no fixture built from a real installer run can
    // separate the two and none should be asked for. That is the ground, and it is deliberately
    // NOT the absolute "equal for every possible input" this said before: `flattenLicenseGroups`
    // pushes one row per (license, name, version) triple with no dedup, so one `name@version`
    // listed under two license keys gives length 2 with size 1 (measured against the exported
    // function). pnpm does not emit that shape; the exclusion rests on the reachable inputs.
    const cases = [
      { devOnly: 3, prod: 2 },
      { devOnly: 1, prod: 3 },
    ]
    for (const { devOnly, prod } of cases) {
      const scratch = buildScratchWorkspace(prod, devOnly)
      try {
        const lines = []
        const originalConsoleLog = console.log
        const originalExitCode = process.exitCode
        let exitCode
        console.log = (message) => {
          lines.push(message)
        }
        try {
          main(scratch)
          exitCode = process.exitCode
        } finally {
          console.log = originalConsoleLog
          process.exitCode = originalExitCode
        }

        // The success path never touches `process.exitCode`, so it must still read what it read
        // before the call; asserting a literal 0/undefined here would pin the runner's ambient
        // value rather than anything main() does.
        assert.equal(
          exitCode,
          originalExitCode,
          `case ${prod}/${devOnly}: the gate should have passed without setting a failure code`,
        )
        assert.equal(lines.length, 1, `case ${prod}/${devOnly}`)
        assert.equal(
          lines[0],
          `Licence allow-list gate: ${prod} prod package(s), ${devOnly} dev-only package(s), all clear.`,
          `case ${prod}/${devOnly}`,
        )
      } finally {
        rmSync(scratch, { force: true, recursive: true })
      }
    }
  },
)

// Wired end to end:
// a real scratch project with zero dependencies (a real `pnpm install`, real
// `pnpm licenses list`, both legitimately empty) prints ALLOWLIST_NOTHING_CLASSIFIED_LINE,
// never formatAllowlistSuccessLine(0, 0), and still exits 0.
test(
  'main(): a workspace with zero dependencies prints ALLOWLIST_NOTHING_CLASSIFIED_LINE, not a reassuring zero',
  { timeout: 180_000 },
  () => {
    const scratch = buildScratchWorkspace(0, 0)
    try {
      const lines = []
      const originalConsoleLog = console.log
      const originalExitCode = process.exitCode
      let exitCode
      console.log = (message) => {
        lines.push(message)
      }
      try {
        main(scratch)
        exitCode = process.exitCode
      } finally {
        console.log = originalConsoleLog
        process.exitCode = originalExitCode
      }
      assert.equal(exitCode, originalExitCode, 'a legitimately empty workspace must still exit 0')
      assert.equal(lines.length, 1)
      assert.equal(lines[0], ALLOWLIST_NOTHING_CLASSIFIED_LINE)
    } finally {
      rmSync(scratch, { force: true, recursive: true })
    }
  },
)
