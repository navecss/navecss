import assert from 'node:assert/strict'
/**
 * Unit coverage for the pure classification logic in
 * check-license-parity.mjs, run with Node's built-in
 * test runner. Synthetic fixtures only, per the same reasoning as
 * check-bundling-guard-coverage.test.mjs and check-license-allowlist.test.mjs:
 * this is red/green evidence for the comparison logic without depending on
 * (or mutating) the real repo's LICENSE files.
 *
 * A follow-up remedy's unclaimed half adds a second layer: the SHIPPED script run
 * as a child process against a throwaway workspace, because the zero-scope wording lives
 * only in `main()`, which is not exported and runs only under the entry-point guard.
 *
 * A third layer reads the shipped script's own SOURCE and pins two comment blocks that carry
 * a cleared licensing position, so that deleting or re-wording one goes red instead of green.
 * See `normalizedDocblockBefore` and `commentBlocksIn` for what that layer does and does not
 * claim to be.
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  composeLicenseUnreadableMessage,
  composeManifestInvalidJsonMessage,
  composeManifestNotAnObjectMessage,
  composePackageLicenseUnreadableMessage,
  composePackageListUnreadableMessage,
  findLicenseMismatches,
  findWorkspaceGlobViolation,
  isNonPrivate,
  LICENSE_PREFIX_MISMATCH_REASON,
  main,
  mayCarryThirdPartySection,
  PARITY_FAILURE_GUIDANCE,
  PARITY_FAILURE_HEADER,
  reportLicenseParityViolations,
  THIRD_PARTY_SECTION_ALLOWLIST,
  THIRD_PARTY_SECTION_GUIDANCE,
  WORKSPACE_GLOB_VIOLATION_MESSAGE,
} from './check-license-parity.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_NAME = 'check-license-parity.mjs'
const SCRIPT_PATH = path.join(ROOT, 'scripts', SCRIPT_NAME)
const ROOT_LICENSE = Buffer.from('MIT License\n\nCopyright (c) 2026 Nave Contributors\n')
const VALID_WORKSPACE_YAML = "packages:\n  - 'packages/*'\n"

// The third-party attribution section, cleared by the project's licensing steward,
// packages/tokens/LICENSE carries after the root text, read here from the shipped file's own
// bytes (never retyped) so the pinning test below compares against a literal that cannot drift
// from what this repository actually ships.
//
// The block is WIDENED by one paragraph per clearance, never rewritten. The third paragraph
// credits the two token-format specifications this package implements: their own licence makes
// attribution a CONDITION of the copyright grant rather than a courtesy, which is why it names
// each document by specification name and version number, and why it says "published under"
// rather than "used under". Every byte above it is the earlier clearance, preserved exactly.
const TOKENS_THIRD_PARTY_SECTION = `
THIRD-PARTY MATERIAL

This package includes material copied from or derived from the CSS Color Module
Level 4 specification and its published sample code (css-color-4/conversions.js
in the w3c/csswg-drafts repository, at commit
af8661bfe903aac7dbb9c5d1e1eccb725b8c331d, and
https://drafts.csswg.org/css-color-4/#color-conversion-code). Copyright (c) 2026
World Wide Web Consortium. That specification, and the repository carrying its
sample code, are published under the W3C Software and Document License
(https://www.w3.org/copyright/software-license-2023/).

What is copied is the numeric constants used by src/theming/css-color-4.ts,
published as dist/lib/theming/css-color-4.js, and the order of the conversion
steps: the D50 white point, the CIE Lab kappa and epsilon, the Bradford D50 to
D65 adaptation matrix, the linear display-p3 to XYZ matrix, and the two XYZ to
OKLab matrices. The names, the types and the function bodies around them are
this package's own, and everything in this package is offered under the MIT
licence above.

Also copied from that specification are the names of its colour keywords, held
in src/theming/css-named-colours.ts and published as
dist/lib/theming/css-named-colours.js. What is copied there is the keyword names
alone, in alphabetical order, with none of the colour values the specification
gives for them.

This package implements the Design Tokens Format Module 2025.10 and the Design
Tokens Color Module 2025.10, Final Community Group Reports published 28 October
2025 by the Design Tokens Community Group under the W3C Community Final
Specification Agreement. Those documents are not W3C Standards. What this
package takes from them is the format's property names, type names and value
structures, and the Color Module's colour-space identifiers; the reader, its
diagnostics and everything around them are this package's own, and everything in
this package is offered under the MIT licence above.
`

/**
 * A throwaway workspace the SHIPPED script can be run against. The temp root is realpath'd
 * deliberately, and the reason is now DEFENSIVE rather than a live hazard.
 * On macOS `tmpdir()` is a symlink, and the entry-point guard this fixture drives used to
 * compare a realpath'd `import.meta.url` against an un-realpath'd
 * `pathToFileURL(process.argv[1]).href`, so an un-realpath'd fixture path made `main()` never
 * run and the child exit 0 printing nothing — a vacuous pass indistinguishable from a real
 * one. Realpathing BOTH sides closed that: measured at this head, all
 * four combinations of (fixture realpath'd, not) x (relative, absolute `argv[1]`) fire the
 * guard and print 388 bytes. The call is kept so the fixture path stays canonical whatever
 * the shipped guard's current strictness is, NOT because it is load-bearing today, and
 * `runScript` passes a relative `argv[1]` besides, which resolves against an already
 * canonical `cwd`. What actually catches a guard that stops firing is `runScript`'s own
 * zero-bytes assertion, not this call.
 *
 * `packages/` is created unconditionally, so `buildFixture({})` expresses "the directory
 * exists and is empty" rather than "the directory is missing", which is a different run
 * (the script throws on a missing `packages/`) and not the one the census fixtures mean.
 */
function buildFixture(packages) {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-license-parity-'))
  mkdirSync(path.join(dir, 'scripts'))
  mkdirSync(path.join(dir, 'packages'))
  cpSync(SCRIPT_PATH, path.join(dir, 'scripts', SCRIPT_NAME))
  writeFileSync(path.join(dir, 'LICENSE'), ROOT_LICENSE)
  writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
  for (const [dirName, manifest] of Object.entries(packages)) {
    const packagePath = path.join(dir, 'packages', dirName)
    mkdirSync(packagePath, { recursive: true })
    if (manifest !== null) {
      writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify(manifest, null, 2))
    }
  }
  return dir
}

/**
 * Run the shipped script as a child process from `cwd`'s root. Asserts the run PRODUCED
 * something, because the failure mode this layer guards against shows up as exit 0 with no
 * output at all, which passes any assertion written about a green run.
 */
function runScript(cwd) {
  const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
    cwd,
    encoding: 'utf8',
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  assert.ok(
    stdout.length + stderr.length > 0,
    'zero bytes on stdout AND stderr: either the entry-point guard did not fire and main() ' +
      'never ran, or main() ran and returned down a branch that prints nothing. Which of the ' +
      'two it was is not diagnosed here, only that neither is a run this layer can read. A ' +
      'silent exit 0 satisfies every assertion written about a green run, so this layer is ' +
      'worthless unless the run is known to have produced something.',
  )
  return { status: result.status, stderr, stdout }
}

/**
 * The zero-scope verdict the shipped gate composes, written out once here so that re-wording
 * any clause of it in the script goes red rather than green. The three census numbers are, in
 * their order of appearance, the directories scanned, those skipped as private, and those
 * skipped for carrying no manifest; taking them as parameters is what makes hardcoding any one
 * of them in the script a failure rather than a silent regression.
 */
function zeroScopeVerdict(scanned, skippedPrivate, skippedNoManifest) {
  return (
    'License parity gate: 0 non-private package(s) examined, so this run compared NOTHING ' +
    `and must not be read as a run that compared and passed; ${scanned} director(ies) ` +
    `under packages/ were scanned, ${skippedPrivate} skipped because a private package ` +
    `publishes no tarball and ${skippedNoManifest} skipped for carrying no package.json. ` +
    'Exiting 0 because an empty non-private set is a legitimate state, not because ' +
    'anything was checked.'
  )
}

/**
 * The ordinary pass line the shipped gate composes, written out once here for the same reason
 * `zeroScopeVerdict` is: re-wording any clause of it in the script goes red rather than green.
 * The three census numbers are the same three, in the same order, that the zero-scope verdict
 * carries, so a counter wired to the wrong branch is visible on the passing path too and not
 * only on the empty one.
 *
 * A follow-up fix round: the fixtures this
 * helper serves (`licensed` packages written as byte-identical root copies, never a third-party
 * section) always resolve to every matched package being exact and none carrying a section, so
 * `matched` doubles as the exact count and the third-party count is always 0 here. That is a
 * property of THESE fixtures, not a simplification of the sentence: the dedicated fixture below
 * (mirroring today's real tree) is what exercises a non-zero third-party count.
 */
function passVerdict(matched, scanned, skippedPrivate, skippedNoManifest) {
  return (
    `License parity gate: ${matched} non-private package LICENSE file(s) carry the ` +
    `root LICENSE text (${matched} byte-identical to it, 0 carrying a third-party attribution ` +
    `section after it); ${scanned} director(ies) under packages/ were scanned, ` +
    `${skippedPrivate} skipped because a private package publishes no tarball and ` +
    `${skippedNoManifest} skipped for carrying no package.json.`
  )
}

test('end to end: a workspace with zero non-private packages says the run compared NOTHING, never a reassuring zero', () => {
  // Per a follow-up remedy and the published `licensing` overview §4-§5's own rider: a run
  // that compared nothing must not read as a run that compared and passed. Exit stays 0: a
  // package that publishes no tarball breaches nothing, and the defect this wording fixes is
  // the explanation, never the exit.
  //
  // Exact equality on the whole line, not a substring or a regex. A `doesNotMatch` guarding
  // the absence of the pass line only pins where that sentence may NOT appear: without the
  // `m` flag `^` anchors to byte 0 of the capture, so the gate could print the honest verdict
  // and then the pass line after it and still pass. Equality has no such position dependence.
  const dir = buildFixture({
    cli: { name: '@navecss/cli', private: true },
    dev: { name: '@navecss/dev', private: true },
  })
  try {
    const { status, stdout } = runScript(dir)
    assert.equal(status, 0)
    assert.equal(stdout.trim(), zeroScopeVerdict(2, 2, 0))
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('end to end: the zero-scope census reports the real reason the non-private set is empty, in every shape that empties it', () => {
  // The closing clause names what the branch tested (an empty non-private SET) and the census
  // names why it is empty. A set emptied by directories carrying no package.json is not an
  // all-private workspace, so these are different runs and must print different numbers.
  // Three shapes beyond the all-private one above; together the four pin all three counters,
  // because no single literal substituted for any one of them survives all four.
  const cases = [
    { census: [1, 0, 1], name: 'one bare directory, no manifest', packages: { bare: null } },
    {
      census: [2, 1, 1],
      name: 'one private package and one bare directory',
      packages: { bare: null, cli: { name: '@navecss/cli', private: true } },
    },
    { census: [0, 0, 0], name: 'packages/ exists and is empty', packages: {} },
  ]
  for (const { census, name, packages } of cases) {
    const dir = buildFixture(packages)
    try {
      const { status, stdout } = runScript(dir)
      assert.equal(status, 0, name)
      assert.equal(stdout.trim(), zeroScopeVerdict(...census), name)
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  }
})

test('end to end: the ordinary pass line counts the packages it compared, distinguishably from every other count in scope', () => {
  // Two properties. The first was always here; the second is what these workspace shapes exist
  // for, and it is the one a "simplified" fixture silently gives back.
  //
  // (1) NOT A LITERAL. Two different sizes, so no constant satisfies both. A single fixture
  //     holding one package cannot tell a computed count from the literal it happens to equal.
  //
  // (2) NOT A DIFFERENT COUNT IN SCOPE. `main()` holds five count-bearing expressions at this
  //     print site (`packages.length`, `scanned`, `skippedPrivate`, `skippedNoManifest`,
  //     `violations.length`), and the pass line is pinned to the FIRST of them. A fixture built
  //     only from satisfied non-private packages makes `packages.length` and `scanned`
  //     numerically EQUAL, so substituting one for the other stays green — while on the real
  //     repository the two differ (4 directories scanned, 2 non-private) and the gate would
  //     print "4 non-private package LICENSE file(s) match" having compared 2. That is a false
  //     sentence in the output of a licensing instrument, in the permissive direction: it
  //     over-claims coverage. Each case below therefore carries private packages and
  //     manifest-less directories in numbers that leave every counter DIFFERENT from
  //     `packages.length`, in each case on its own:
  //
  //       case          packages.length  scanned  skippedPrivate  skippedNoManifest  violations
  //       one licensed                1        6               2                  3           0
  //       two licensed                2        4               1                  1           0
  //
  //     Do NOT reduce these workspaces to their licensed packages. The private and
  //     manifest-less entries are the entire discriminator; removing them restores the defect
  //     with the whole suite still green.
  const cases = [
    {
      census: [6, 2, 3],
      expected: 1,
      licensed: ['tokens'],
      workspace: {
        bareA: null,
        bareB: null,
        bareC: null,
        cli: { name: '@navecss/cli', private: true },
        dev: { name: '@navecss/dev', private: true },
        tokens: { name: '@navecss/tokens' },
      },
    },
    {
      census: [4, 1, 1],
      expected: 2,
      licensed: ['core', 'tokens'],
      workspace: {
        bareA: null,
        cli: { name: '@navecss/cli', private: true },
        core: { name: '@navecss/core' },
        tokens: { name: '@navecss/tokens' },
      },
    },
  ]
  for (const { census, expected, licensed, workspace } of cases) {
    const dir = buildFixture(workspace)
    for (const p of licensed) {
      writeFileSync(path.join(dir, 'packages', p, 'LICENSE'), ROOT_LICENSE)
    }
    try {
      const { status, stdout } = runScript(dir)
      assert.equal(status, 0)
      assert.equal(stdout.trim(), passVerdict(expected, ...census))
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  }
})

// Cleared by the project's licensing steward:
// the pass line's own vocabulary fixes "match" as verbatim equality (this file's failure header
// reads "do not match the root LICENSE"), so it went false the moment packages/tokens/LICENSE
// started carrying a cleared third-party section after the root text and was never compared for
// equality at all. This drives the real main(scratchRoot) over a scratch workspace reproducing
// TODAY'S shape — two private packages, one non-private package byte-identical to root, one
// non-private (allowlisted) package carrying a third-party section after the root text — and
// pins the exact resolved sentence, byte for byte. A "cleared" claim never belongs in this
// sentence: this gate checks bytes, not clearance.
test('main(): the pass line names both the byte-identical count and the third-party-section count, never a bare "match" over a package that only starts with the root text', () => {
  const dir = buildFixture({
    bridge: { name: '@navecss/bridge', private: true },
    cli: { name: '@navecss/cli', private: true },
    core: { name: '@navecss/core' },
    tokens: { name: '@navecss/tokens' },
  })
  try {
    writeFileSync(path.join(dir, 'packages', 'core', 'LICENSE'), ROOT_LICENSE)
    writeFileSync(
      path.join(dir, 'packages', 'tokens', 'LICENSE'),
      Buffer.concat([
        ROOT_LICENSE,
        Buffer.from('\nTHIRD-PARTY MATERIAL\n\nSome cleared attribution text.\n'),
      ]),
    )

    const calls = []
    const originalConsoleLog = console.log
    const originalExitCode = process.exitCode
    let exitCode
    console.log = (message) => calls.push(message)
    try {
      main(dir)
      exitCode = process.exitCode
    } finally {
      console.log = originalConsoleLog
      process.exitCode = originalExitCode
    }

    assert.equal(exitCode, undefined)
    assert.equal(calls.length, 1)
    assert.equal(
      calls[0],
      'License parity gate: 2 non-private package LICENSE file(s) carry the root LICENSE text ' +
        '(1 byte-identical to it, 1 carrying a third-party attribution section after it); 4 ' +
        'director(ies) under packages/ were scanned, 2 skipped because a private package ' +
        'publishes no tarball and 0 skipped for carrying no package.json.',
    )
    assert.equal(Buffer.byteLength(calls[0]), 314)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

/**
 * Every comment block inside the region bounded by two content anchors — from the end of
 * `startNeedle`'s own line to the start of `stopNeedle` — each normalized for WHITESPACE ONLY so
 * that a re-wrap or a reindent cannot register as a new one. A block is either a delimited
 * `/* … *\/` comment or an UNBROKEN run of `//` lines; a blank line or any code line closes a run,
 * so two runs with something between them are two blocks.
 *
 * What this exists for (a review's finding B4). `normalizedDocblockBefore`
 * pins a cleared block's WORDING and its adjacency to the declaration below it, and nothing pinned
 * what sits ABOVE it: `lastIndexOf('/**', anchor)` takes the block nearest the declaration, so a
 * contradicting docblock inserted above the cleared one is outside what that helper reads. Measured
 * before this helper existed, not reasoned about: inserted above either cleared block, a docblock
 * asserting the opposite licensing position shipped 16/16 green. Counting the blocks in the region
 * the licensing review defined as a block's HOME closes exactly that — for the header docblock the
 * home is the file's first line to its first code line, for `isNonPrivate`'s it is the end of the
 * preceding declaration to the declaration it documents. One block in the home region, plus the
 * cleared wording adjacent to the declaration, together say "the cleared block is what is there,
 * and it is the only thing there".
 *
 * Deliberately a COUNT and not a second wording comparison. `normalizedDocblockBefore` owns the
 * wording (the licensing steward's discriminator, whose five mutations keep their
 * verdicts across this change); a second comparison here would give one cleared literal two owners
 * and two places to update in the commit that must update neither.
 *
 * What it still does NOT pin, stated here rather than left to be rediscovered:
 * - anything OUTSIDE the two anchors. A contradicting block placed elsewhere in the file (below the
 *   imports, after `isNonPrivate`) is in neither home region and stays green. The claim is about a
 *   cleared block's home, never about the whole file.
 * - A review finding (S6), a literal `/**` spliced into the cleared block's own content. It
 *   re-points `normalizedDocblockBefore`'s opener while leaving the compared tail identical, and it
 *   adds no second block here either, so it stays green. Cosmetic, visible in any diff, and not
 *   what this closes.
 * - correctness against JavaScript. This is a lexical line scanner, not a parser: a comment
 *   delimiter inside a string literal would be read as a comment. Neither region it is pointed at
 *   contains a string literal, and both are bounded by content anchors that would fail loudly
 *   rather than silently widen if that stopped being true.
 */
function commentBlocksIn(source, startNeedle, stopNeedle) {
  const start = source.indexOf(startNeedle)
  assert.notEqual(start, -1, `start anchor not found in the shipped script: ${startNeedle}`)
  const stop = source.indexOf(stopNeedle, start)
  assert.notEqual(stop, -1, `stop anchor not found after the start anchor: ${stopNeedle}`)

  const blocks = []
  let current = null
  let inDelimitedComment = false
  for (const rawLine of source.slice(start, stop).split('\n').slice(1)) {
    const line = rawLine.trim()
    if (inDelimitedComment) {
      current.push(line)
      if (line.includes('*/')) {
        blocks.push(current)
        current = null
        inDelimitedComment = false
      }
      continue
    }
    if (line.startsWith('/*')) {
      if (current !== null) blocks.push(current)
      current = [line]
      inDelimitedComment = !line.includes('*/', '/*'.length)
      if (!inDelimitedComment) {
        blocks.push(current)
        current = null
      }
      continue
    }
    if (line.startsWith('//')) {
      if (current === null) current = []
      current.push(line)
      continue
    }
    if (current !== null) {
      blocks.push(current)
      current = null
    }
  }
  assert.ok(!inDelimitedComment, `an unterminated comment block precedes ${stopNeedle}`)
  if (current !== null) blocks.push(current)
  return blocks.map((lines) => lines.join(' ').replaceAll(/\s+/g, ' ').trim())
}

/**
 * The comment block immediately preceding `needle` in `source`, normalized for WHITESPACE ONLY:
 * the block-comment delimiters dropped, then a leading `*` plus at most one following space
 * stripped per line, then every whitespace run collapsed to a single space.
 *
 * Whitespace-only is the whole of the discriminator's correctness, and it is narrower than it
 * looks on purpose. Re-wrapping the same words across different line breaks, or reindenting
 * them, changes nothing a reader relies on and must stay green; re-wording a clause, or
 * dropping a comma, changes the position the block states and must go red. A normalizer that
 * also folded case or stripped punctuation would let the comma edit through while still
 * catching the re-wording, which is worse than no check: it blesses one class of edit silently.
 *
 * The star strip is anchored (`^[ \t]*\*[ \t]?`) rather than global, or a `*` inside the prose
 * is eaten. The block is located by searching back from the anchor's own text, never by line
 * number, so an unrelated edit above it does not re-point the anchor. The WHOLE block is
 * compared, or a deletion at its end passes.
 *
 * It reads the block it finds and nothing above that block, which is the position half rather than
 * the wording half; `commentBlocksIn` carries that half and states its own limits.
 */
function normalizedDocblockBefore(source, needle) {
  const anchor = source.indexOf(needle)
  assert.notEqual(anchor, -1, `anchor text not found in the shipped script: ${needle}`)
  const open = source.lastIndexOf('/**', anchor)
  assert.notEqual(open, -1, `no docblock precedes the anchor: ${needle}`)
  const close = source.indexOf('*/', open)
  assert.ok(close !== -1 && close < anchor, `the docblock preceding ${needle} is unterminated`)
  return source
    .slice(open + '/**'.length, close)
    .split('\n')
    .map((line) => line.replace(/^[ \t]*\*[ \t]?/, ''))
    .join('\n')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

/**
 * The two expected literals below are a BACKSTOP, not the gate. The primary control is the
 * licensing review these blocks passed; this only makes deleting or re-wording one loud, and
 * it cannot tell a deliberate re-wording from an accidental one.
 *
 * CHANGING EITHER LITERAL IS A LICENSING-REVIEW CHANGE, NOT A TEST FIXUP. If one of these goes
 * red because the comment it mirrors was edited, do NOT update the expected value to match the
 * file: updating both in one commit buys a green suite and an uncleared re-wording. Restore the
 * wording the file had, or open an issue proposing the new wording and get the maintainer's
 * approval before this literal moves. Re-wrapping or reindenting the same words is lawful and
 * stays green here without touching anything, which is exactly the case the normalizer above is
 * built to let through.
 */
const EXPECTED_HEADER_DOCBLOCK =
  'Tripwire for the project\'s published licensing requirement. Condition 2 of the published `licensing` overview §2, signed off by the project\'s maintainer, requires each published tarball to carry its own licence text, and names its remedy in a preference order: "a copy, or a build step, or a verified-packing symlink, in that order of preference". The project took the first — `packages/{tokens,core,bridge,cli}/LICENSE` are copies of the root `LICENSE` — and nothing before this script asserted the copies actually still MATCH the root they were taken from. `pnpm check:pack` (`publint` + `attw`) asserts a `LICENSE` is PRESENT in each packed tarball, never that it agrees with the root. So the equality that makes Condition 2 true was held by whoever remembered to update all five files together, and it had already been exercised once by hand: an earlier review named `LICENSE` and the copyright line turned out to live in five files, caught by the developer-relations reviewer running the class rather than the list. This script converts "whoever remembers" into an assertion. The package set is every directory under `packages/` that carries a manifest, not a hand-listed set, so a new package added there is covered the day it is created. That is the whole workspace only while the workspace is defined as exactly `packages/*`. Scanning a directory cannot establish that, so `findWorkspaceGlobViolation` checks the definition itself before any package is scanned, and refuses rather than reporting a pass over a narrower set than the workspace actually holds. Widening the workspace is therefore a deliberate act that has to change this gate in the same commit. Only NON-PRIVATE packages are checked: a `private: true` package never produces a published tarball, so Condition 2 does not apply to it (mirrors the `!manifest.private` publishable test `scripts/check-publishable-set.mjs` uses for the same reason, on a different question). Source tree only, and deliberately so: a packed tarball\'s LICENSE presence is already asserted by `check:pack` (`publint`/`attw`), and a byte-copy of the source-tree file is exactly what npm packs (no build step touches `LICENSE`), so re-running this check against `npm pack` output would duplicate the source-tree check without covering anything new. This script decides no licensing question and never will: it is an instrument, in the shape `scripts/check-license-allowlist.mjs` and `scripts/check-bundling-guard-coverage.mjs` already use. Its only job is to make Condition 2\'s equality trip instead of drifting silently.'

const EXPECTED_IS_NON_PRIVATE_DOCBLOCK =
  "True if `manifest` would ship a published tarball (private packages never do, so Condition 2's per-tarball licence-text requirement does not apply to them). Reused by scripts/check-readme-export-coverage.mjs (a documentation gate) to scope which packages' READMEs it checks; that reuse does not make this predicate a documentation concern — it stays Condition 2's, and moves only for Condition 2 reasons."

test('source anchor: the reviewed docblocks in the shipped script are unchanged, word for word', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8')
  assert.equal(
    normalizedDocblockBefore(source, 'export function isNonPrivate'),
    EXPECTED_IS_NON_PRIVATE_DOCBLOCK,
  )
  assert.equal(normalizedDocblockBefore(source, 'import { existsSync'), EXPECTED_HEADER_DOCBLOCK)
})

// The test above pins each cleared block's WORDING and its adjacency to the declaration it
// documents. This one pins its POSITION: the region the licensing review treated as that block's
// home holds exactly one comment block, so a second licensing position cannot be parked beside a
// cleared one where the wording anchor never looks. The regions are named by content anchors, never
// by line number, for the same reason `normalizedDocblockBefore` searches by content.
test('source anchor: each cleared docblock is the only comment block in its home region', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8')
  const regions = [
    {
      block: 'the header docblock',
      home: "the file's first line to its first code line",
      start: '#!/usr/bin/env node',
      stop: 'import { existsSync',
    },
    {
      block: "isNonPrivate's docblock",
      home: 'the end of the preceding declaration to the declaration it documents',
      start: 'const ROOT = path.resolve(',
      stop: 'export function isNonPrivate',
    },
  ]
  for (const { block, home, start, stop } of regions) {
    const blocks = commentBlocksIn(source, start, stop)
    assert.equal(
      blocks.length,
      1,
      `${block}'s home region (${home}) holds ${blocks.length} comment blocks, not 1. A second ` +
        'block there is a second licensing position sitting where the cleared one lives, which ' +
        `the wording anchor above cannot see: ${JSON.stringify(
          blocks.map((text) => `${text.slice(0, 60)}…`),
        )}`,
    )
  }
})

test('isNonPrivate: a manifest with no "private" field is non-private', () => {
  assert.equal(isNonPrivate({ name: '@navecss/tokens' }), true)
})

test('isNonPrivate: "private": false is non-private', () => {
  assert.equal(isNonPrivate({ name: '@navecss/tokens', private: false }), true)
})

test('isNonPrivate: "private": true is private', () => {
  assert.equal(isNonPrivate({ name: '@navecss/cli', private: true }), false)
})

test('findLicenseMismatches: a byte-identical LICENSE passes (GREEN)', () => {
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: true, content: Buffer.from(ROOT_LICENSE) },
  ])
  assert.deepEqual(violations, [])
})

test('findLicenseMismatches: no violations across several identical packages (GREEN)', () => {
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: true, content: Buffer.from(ROOT_LICENSE) },
    { name: '@navecss/core', dir: 'core', exists: true, content: Buffer.from(ROOT_LICENSE) },
    { name: '@navecss/bridge', dir: 'bridge', exists: true, content: Buffer.from(ROOT_LICENSE) },
  ])
  assert.deepEqual(violations, [])
})

test('findLicenseMismatches: a missing LICENSE file is a violation (RED)', () => {
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: false, content: null },
  ])
  assert.equal(violations.length, 1)
  assert.equal(violations[0].name, '@navecss/tokens')
  assert.match(violations[0].reason, /no LICENSE file/)
})

test('findLicenseMismatches: a one-byte drift (e.g. a stale copyright year) is a violation (RED)', () => {
  // Not `dir: 'tokens'`: that package is THIRD_PARTY_SECTION_ALLOWLISTed
  // and checked by prefix rather than exact equality, which is a different reason string and
  // its own dedicated test below. `core` exercises the ordinary exact-equality path.
  const drifted = Buffer.from('MIT License\n\nCopyright (c) 2024 Nave Contributors\n')
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/core', dir: 'core', exists: true, content: drifted },
  ])
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /differs from the root LICENSE/)
})

test('findLicenseMismatches: names every offending package, not just the first (RED)', () => {
  const drifted = Buffer.from('MIT License\n\nCopyright (c) 2024 Nave Contributors\n')
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: true, content: Buffer.from(ROOT_LICENSE) },
    { name: '@navecss/core', dir: 'core', exists: true, content: drifted },
    { name: '@navecss/bridge', dir: 'bridge', exists: false, content: null },
  ])
  assert.equal(violations.length, 2)
  assert.deepEqual(
    violations.map((v) => v.name),
    ['@navecss/core', '@navecss/bridge'],
  )
})

// A THIRD_PARTY_SECTION_ALLOWLIST package (only `tokens` today) is held
// to a PREFIX match, not exact equality — Condition 2 is not weakened (the root text must
// still be a verbatim prefix), only what may follow it changes.
test('mayCarryThirdPartySection: only "tokens" is allowlisted today', () => {
  assert.equal(mayCarryThirdPartySection('tokens'), true)
  assert.equal(mayCarryThirdPartySection('core'), false)
  assert.equal(mayCarryThirdPartySection('bridge'), false)
  assert.equal(mayCarryThirdPartySection('cli'), false)
})

// mayCarryThirdPartySection is a closed-world check over TODAY'S
// four directories, so the test above never notices a fifth entry landing in
// THIRD_PARTY_SECTION_ALLOWLIST itself — this pins the SET's own membership, the docblock's own
// "adding a package here is a review change" rider, mechanically.
test('THIRD_PARTY_SECTION_ALLOWLIST is exactly {tokens} today', () => {
  assert.deepEqual([...THIRD_PARTY_SECTION_ALLOWLIST], ['tokens'])
})

test('findLicenseMismatches: an allowlisted package carrying the root text plus a third-party section passes (GREEN)', () => {
  const withNotice = Buffer.concat([
    ROOT_LICENSE,
    Buffer.from('\nTHIRD-PARTY MATERIAL\n\nSome cleared attribution text.\n'),
  ])
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: true, content: withNotice },
  ])
  assert.deepEqual(violations, [])
})

test('findLicenseMismatches: a non-allowlisted package carrying the same appended section still fails exact equality (RED)', () => {
  const withNotice = Buffer.concat([
    ROOT_LICENSE,
    Buffer.from('\nTHIRD-PARTY MATERIAL\n\nSome cleared attribution text.\n'),
  ])
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/core', dir: 'core', exists: true, content: withNotice },
  ])
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /differs from the root LICENSE/)
})

test('findLicenseMismatches: an allowlisted package whose LICENSE does not begin with the root text fails with the cleared prefix-mismatch reason (RED)', () => {
  const notPrefixed = Buffer.from('Something else entirely, not the MIT text at all.\n')
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: true, content: notPrefixed },
  ])
  assert.equal(violations.length, 1)
  assert.equal(violations[0].reason, LICENSE_PREFIX_MISMATCH_REASON)
  assert.equal(violations[0].reason, 'LICENSE does not begin with the root LICENSE text')
})

test('findLicenseMismatches: an allowlisted package whose LICENSE is a truncated prefix of the root text still fails (RED)', () => {
  const truncated = ROOT_LICENSE.subarray(0, -5)
  const violations = findLicenseMismatches(ROOT_LICENSE, [
    { name: '@navecss/tokens', dir: 'tokens', exists: true, content: truncated },
  ])
  assert.equal(violations.length, 1)
  assert.equal(violations[0].reason, LICENSE_PREFIX_MISMATCH_REASON)
})

// `listPackageDirs`
// used to raw-crash with an uncaught ENOENT when `packages/` was missing or an entry under it
// could not be `stat`-ed, before any package was compared.
test('composePackageListUnreadableMessage composes the cleared bytes', () => {
  const message = composePackageListUnreadableMessage('/repo/packages', 'ENOENT')
  assert.equal(
    message,
    'License parity gate: the package list could not be read (/repo/packages: ENOENT).\n\n' +
      'No package was compared, so this run must not be read as a run that compared and passed. ' +
      'This gate takes the package set from the `packages/` directory, having already confirmed ' +
      'the workspace is defined as exactly `packages/*`, so it expects that directory to exist ' +
      'and every entry in it to be readable. Repair the tree and re-run.',
  )
  assert.equal(Buffer.byteLength(message), 414)
})

test('main(): a missing packages/ directory refuses with the cleared message, never an uncaught ENOENT', () => {
  const scratch = mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-license-parity-'))
  try {
    writeFileSync(path.join(scratch, 'LICENSE'), ROOT_LICENSE)
    writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
    // Deliberately no packages/ directory created at all.

    const calls = []
    const originalConsoleError = console.error
    const originalExitCode = process.exitCode
    let exitCode
    let threw = null
    console.error = (message) => {
      calls.push(message)
    }
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
    assert.match(calls[0], /the package list could not be read/)
    assert.match(calls[0], /packages/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

// The two printed strings are cleared bytes: a re-wording of either is a fresh clearance
// turn, not a tidy. This anchors the CONSTANTS' own bytes, so a tidy that re-words either one
// goes red here instead of shipping an uncleared wording silently. It does not exercise a red
// run at all; that is the pair of tests below, which anchor the COMPOSED output
// `reportLicenseParityViolations` prints and then the real entry point that calls it.
test('the exported header and guidance constants equal the cleared bytes', () => {
  assert.equal(
    PARITY_FAILURE_HEADER,
    'License parity gate: package LICENSE files do not match the root LICENSE:\n',
  )
  assert.equal(
    PARITY_FAILURE_GUIDANCE,
    '\nEach published package must ship its own licence text, matching the repository root LICENSE verbatim. Copy the current root LICENSE into the named package(s). If a different remedy is intended (a build step, or a verified-packing symlink), do not change the licence text in your pull request: open an issue proposing it instead. A package may carry a third-party attribution section after the licence text; that section is additional and never replaces any part of it.',
  )
})

// The addendum sentence is cleared
// standalone (139 bytes), before the leading space PARITY_FAILURE_GUIDANCE joins it with.
test('THIRD_PARTY_SECTION_GUIDANCE equals the cleared bytes, standalone', () => {
  assert.equal(
    THIRD_PARTY_SECTION_GUIDANCE,
    'A package may carry a third-party attribution section after the licence text; that section is additional and never replaces any part of it.',
  )
  assert.equal(Buffer.byteLength(THIRD_PARTY_SECTION_GUIDANCE), 139)
})

// The composed message, captured through console.error rather than assembled by hand. The
// constants above prove their own bytes match the clearance; this proves
// `reportLicenseParityViolations` still calls them, in this order, with nothing inlined or
// dropped in between. console.error is saved, replaced with a collector, and restored in a
// `finally` so a failing assertion cannot leak a patched global into a later test.
test('reportLicenseParityViolations prints the cleared header, one line per violation, then the cleared guidance, in that order', () => {
  const violations = [
    { name: '@navecss/core', dir: 'core', reason: 'LICENSE differs from the root LICENSE' },
    { name: '@navecss/cli', dir: 'cli', reason: 'no LICENSE file' },
  ]

  const calls = []
  const originalConsoleError = console.error
  console.error = (message) => {
    calls.push(message)
  }
  try {
    reportLicenseParityViolations(violations)
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(calls.length, 4)
  assert.equal(
    calls[0],
    'License parity gate: package LICENSE files do not match the root LICENSE:\n',
  )
  assert.equal(
    calls[1],
    '  - @navecss/core (packages/core/LICENSE): LICENSE differs from the root LICENSE',
  )
  assert.equal(calls[2], '  - @navecss/cli (packages/cli/LICENSE): no LICENSE file')
  assert.equal(
    calls[3],
    '\nEach published package must ship its own licence text, matching the repository root LICENSE verbatim. Copy the current root LICENSE into the named package(s). If a different remedy is intended (a build step, or a verified-packing symlink), do not change the licence text in your pull request: open an issue proposing it instead. A package may carry a third-party attribution section after the licence text; that section is additional and never replaces any part of it.',
  )
})

// The test above calls the reporter itself, so it is blind to the one mutation that empties
// the whole printed surface: `main()` no longer calling the reporter at all, which prints zero
// bytes on both streams and still exits 1. Silence is the worst failure this gate has, because
// a contributor reading it learns nothing and the exit code alone routes them nowhere.
//
// So this drives the REAL entry point, over a scratch tree built under the OS temp directory
// (never inside this repo, which must not be mutated to exercise its own gate). `main()` sets
// `process.exitCode`, which outlives the test and would fail the whole run, so it is saved and
// restored alongside console.error.
test('main() prints the composed cleared message and exits non-zero on a real red tree', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-license-parity-'))
  try {
    writeFileSync(path.join(scratch, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026\n')
    writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)

    // Sorted directory order is cli, core, private-thing, which is the violation order below.
    const writePackage = (dir, manifest, licenseText) => {
      const packageDir = path.join(scratch, 'packages', dir)
      mkdirSync(packageDir, { recursive: true })
      writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest))
      if (licenseText !== undefined) writeFileSync(path.join(packageDir, 'LICENSE'), licenseText)
    }
    writePackage('cli', { name: '@navecss/cli' }, undefined)
    writePackage('core', { name: '@navecss/core' }, 'MIT License\n\nCopyright (c) 2025\n')
    // Private packages ship no tarball, so they are skipped even with no LICENSE at all; if
    // this one ever appears in the output below, the non-private filter has been lost.
    writePackage('private-thing', { name: '@navecss/private-thing', private: true }, undefined)

    const calls = []
    const originalConsoleError = console.error
    const originalExitCode = process.exitCode
    let exitCode
    console.error = (message) => {
      calls.push(message)
    }
    try {
      main(scratch)
      exitCode = process.exitCode
    } finally {
      console.error = originalConsoleError
      process.exitCode = originalExitCode
    }

    assert.equal(exitCode, 1)
    assert.equal(calls.length, 4)
    assert.equal(calls[0], PARITY_FAILURE_HEADER)
    assert.equal(calls[1], '  - @navecss/cli (packages/cli/LICENSE): no LICENSE file')
    assert.equal(
      calls[2],
      '  - @navecss/core (packages/core/LICENSE): LICENSE differs from the root LICENSE',
    )
    assert.equal(calls[3], PARITY_FAILURE_GUIDANCE)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

// An inline copy of the cleared bytes at the call site is byte-identical to reading the
// constant, so no output comparison anywhere in this file can tell the two apart, and the copy
// is then free to drift from the constant the clearance is anchored on. The only observable
// difference is in the source text, so that is what this reads: the reporter must NAME both
// constants and must contain no string literal of its own.
test('reportLicenseParityViolations reads the constants and inlines no cleared bytes', () => {
  const source = reportLicenseParityViolations.toString()

  assert.ok(source.includes('PARITY_FAILURE_HEADER'))
  assert.ok(source.includes('PARITY_FAILURE_GUIDANCE'))
  assert.ok(!source.includes('License parity gate:'))
  assert.ok(!source.includes('Each published package must ship'))
})

// findWorkspaceGlobViolation confirms the ONE fact this gate depends
// on (the workspace's top-level `packages:` block-list key is exactly `['packages/*']`)
// without a YAML-parsing dependency. A throwaway directory holding only `pnpm-workspace.yaml`
// is enough for these; nothing else the function reads needs to exist.
function buildWorkspaceYamlFixture(content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-workspace-glob-'))
  if (content !== null) {
    writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), content)
  }
  return dir
}

test('findWorkspaceGlobViolation: the real shipped pnpm-workspace.yaml confirms no violation', () => {
  // Read directly against this repository's own root: the real, tracked file, never mutated.
  assert.equal(findWorkspaceGlobViolation(ROOT), null)
})

test('findWorkspaceGlobViolation: a second glob added alongside packages/* is a violation', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n  - 'packages/*'\n  - 'tools/*'\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('findWorkspaceGlobViolation: the glob changed to a different single path is a violation', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n  - 'apps/*'\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('findWorkspaceGlobViolation: a missing pnpm-workspace.yaml is a violation, not a crash', () => {
  const dir = buildWorkspaceYamlFixture(null)
  try {
    assert.doesNotThrow(() => findWorkspaceGlobViolation(dir))
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('findWorkspaceGlobViolation: an unrelated top-level key alongside the correct packages: block is NOT a violation', () => {
  // The licensing steward's explicit correctness bar: this must key ONLY on the top-level
  // `packages:` key, ignoring every other key pnpm keeps in this file (onlyBuiltDependencies,
  // overrides, anything else). A gate that refused here would trip on every unrelated
  // pnpm-workspace.yaml edit, not only a genuine widening.
  const dir = buildWorkspaceYamlFixture(
    "onlyBuiltDependencies:\n  - foo\npackages:\n  - 'packages/*'\n",
  )
  try {
    assert.equal(findWorkspaceGlobViolation(dir), null)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('findWorkspaceGlobViolation: an inline (flow-style) packages: value cannot be confirmed and is a violation', () => {
  const dir = buildWorkspaceYamlFixture("packages: ['packages/*']\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// A fix round: a blank line or a whole-line comment inside the
// packages: block sequence used to BREAK the scan early, reading only a PREFIX of the
// sequence and reporting null (no violation) over a workspace that had actually widened past
// packages/*. The licensing steward measured this against real pnpm (both shapes resolve to
// one list) and drafted the fix: skip blank/comment lines in the sequence instead of stopping
// on them.
test('findWorkspaceGlobViolation: a blank line inside the packages: block sequence does not truncate the read', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n  - 'packages/*'\n\n  - 'tools/*'\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('findWorkspaceGlobViolation: a whole-line comment inside the packages: block sequence does not truncate the read', () => {
  const dir = buildWorkspaceYamlFixture(
    "packages:\n  - 'packages/*'\n  # a comment\n  - 'tools/*'\n",
  )
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// A distinct counterexample the blank/comment skip alone does not close: real pnpm fatally
// refuses to parse a pnpm-workspace.yaml that uses a tab for indentation (measured against
// real pnpm: "[ERROR] tab characters must not be used in indentation"), so this gate must not
// report a pass over a file pnpm itself cannot resolve.
test('findWorkspaceGlobViolation: tab-indented block items cannot be confirmed (pnpm itself refuses to parse them)', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n\t- 'packages/*'\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// A corpus-gated tail fix: the tab-refusal check above used to run BEFORE the blank/comment
// skip, so a tab-indented comment or a tab-only blank line inside an otherwise-lawful packages:
// block falsely refused a workspace real pnpm resolves fine. Measured against real pnpm by the
// quality reviewer (PR comment 5602791504): pnpm fatally refuses a tab indenting an actual list
// item, but tolerates one indenting a comment or a blank line.
test('findWorkspaceGlobViolation: a tab-indented comment line inside the packages: block sequence does not falsely refuse (pnpm resolves this file fine, verified by running it)', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n  - 'packages/*'\n\t# comment\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), null)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('findWorkspaceGlobViolation: a tab-only blank line inside the packages: block sequence does not falsely refuse (pnpm resolves this file fine, verified by running it)', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n  - 'packages/*'\n\t\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), null)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// A PINNING row: this already refuses at the PR head and must stay green, so
// the blank/comment-skip fix above does not quietly widen to "skip anything after a glob" too.
test('findWorkspaceGlobViolation: a trailing comment after an item value still refuses (regression guard)', () => {
  const dir = buildWorkspaceYamlFixture("packages:\n  - 'packages/*' # trailing comment\n")
  try {
    assert.equal(findWorkspaceGlobViolation(dir), WORKSPACE_GLOB_VIOLATION_MESSAGE)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// Integration: main() itself refuses, before any scanning, when the workspace-glob guard
// fires — the FIRST guard in the family, ahead of the missing-root-LICENSE and
// malformed-manifest guards below.
test('main() refuses on a bad pnpm-workspace.yaml before scanning anything, printing the workspace-glob message', () => {
  const dir = buildFixture({ tokens: { name: '@navecss/tokens' } })
  try {
    writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")
    // No LICENSE copy under packages/tokens either: if the guard did not fire FIRST, this
    // fixture would instead fail with a missing-LICENSE violation, not the workspace-glob
    // refusal, which is exactly the ordering this test pins.
    const { status, stderr, stdout } = runScript(dir)
    assert.equal(status, 1)
    assert.equal(stderr.trim(), WORKSPACE_GLOB_VIOLATION_MESSAGE)
    assert.equal(stdout, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

// The two guards below replace a raw Node crash (an uncaught ENOENT /
// SyntaxError) with a designed refusal. Both drive the REAL exported main(rootDir) against a
// mkdtemp fixture tree, never the real tracked root LICENSE or a real manifest.
test('composeLicenseUnreadableMessage and composeManifestInvalidJsonMessage compose the cleared bytes', () => {
  assert.equal(
    composeLicenseUnreadableMessage('/repo/LICENSE', 'ENOENT'),
    'License parity gate: the repository root LICENSE could not be read (/repo/LICENSE: ENOENT).\n\n' +
      'No package was compared, so this run must not be read as a run that compared and passed. ' +
      'Restore the root LICENSE and re-run. If the licence text is meant to change, do not change ' +
      'it in a pull request: open an issue proposing it instead.',
  )
  assert.equal(
    composeManifestInvalidJsonMessage('/repo/packages/core/package.json', 'Unexpected token }'),
    'License parity gate: /repo/packages/core/package.json is not valid JSON (Unexpected token }).\n\n' +
      'No package was compared, so this run must not be read as a run that compared and passed. ' +
      'Repair the manifest and re-run.',
  )
})

// A prior review round (consulting the licensing steward, finding 5):
// WORKSPACE_GLOB_VIOLATION_MESSAGE's own docblock says it is "Anchored byte-exact in
// check-license-parity.test.mjs" — and until this test it was not. Every assertion on it in this
// file and in check-publishable-set.test.mjs compares it to its own imported symbol, which pins
// ROUTING (does this branch print THIS constant) and nothing about the bytes;
// check-publishable-set.test.mjs:259-263 already says exactly that about its own copy, so two
// artifacts disagreed and the source one was wrong. The licensing steward proved it by mutation: of
// the nine constants whose docblocks claim a byte-exact anchor, eight red correctly when reworded
// and this one alone stayed green.
//
// A claimed check that does not exist is worse than an absent one, because it stops the reader who
// did the right thing. These are bytes cleared by the project's licensing steward, transcribed and
// never re-worded: if this assertion ever fails, the fix is to restore the message, NOT to update
// the expectation. A reword is a fresh clearance and returns to the licensing steward.
test('WORKSPACE_GLOB_VIOLATION_MESSAGE is anchored byte-exact, as its docblock claims', () => {
  assert.equal(
    WORKSPACE_GLOB_VIOLATION_MESSAGE,
    'License parity gate: refusing to run. This gate takes the package set from the `packages/` ' +
      'directory, which is the whole workspace only while the pnpm workspace is defined as exactly ' +
      '`packages/*`, and that could not be confirmed from `pnpm-workspace.yaml` as it now reads. ' +
      'Nothing has been compared. If the workspace has genuinely widened, teach this gate the new ' +
      "layout in the same change that widens it; if only the file's shape moved, update this check " +
      'to match. Do not delete the check to get a green run: a package outside `packages/` would ' +
      'then publish with its LICENSE never compared to the root.',
  )
})

test('main(): a missing root LICENSE refuses with the cleared message, comparing nothing', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-license-parity-guard1-'))
  try {
    writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
    // Deliberately no root LICENSE file at all.
    mkdirSync(path.join(scratch, 'packages', 'tokens'), { recursive: true })
    writeFileSync(
      path.join(scratch, 'packages', 'tokens', 'package.json'),
      JSON.stringify({ name: '@navecss/tokens' }),
    )

    const calls = []
    const originalConsoleError = console.error
    const originalExitCode = process.exitCode
    let exitCode
    console.error = (message) => calls.push(message)
    try {
      main(scratch)
      exitCode = process.exitCode
    } finally {
      console.error = originalConsoleError
      process.exitCode = originalExitCode
    }

    const licensePath = path.join(scratch, 'LICENSE')
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 1)
    // Hardcoded literal, not a second call to composeLicenseUnreadableMessage: a self-call
    // here would build the expected value from the same function under test, so a wrong edit
    // to the composed TEXT would move both sides together and this assertion would stay green.
    assert.equal(
      calls[0],
      `License parity gate: the repository root LICENSE could not be read (${
        licensePath
      }: ENOENT).\n\n` +
        `No package was compared, so this run must not be read as a run that compared and passed. ` +
        `Restore the root LICENSE and re-run. If the licence text is meant to change, do not change ` +
        `it in a pull request: open an issue proposing it instead.`,
    )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('main(): a malformed package manifest refuses with the cleared message on the FIRST bad manifest, comparing nothing', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-license-parity-guard2-'))
  try {
    writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
    writeFileSync(path.join(scratch, 'LICENSE'), ROOT_LICENSE)
    const brokenManifestPath = path.join(scratch, 'packages', 'core', 'package.json')
    mkdirSync(path.dirname(brokenManifestPath), { recursive: true })
    writeFileSync(brokenManifestPath, '{ invalid json')

    const calls = []
    const originalConsoleError = console.error
    const originalExitCode = process.exitCode
    let exitCode
    console.error = (message) => calls.push(message)
    try {
      main(scratch)
      exitCode = process.exitCode
    } finally {
      console.error = originalConsoleError
      process.exitCode = originalExitCode
    }

    assert.equal(exitCode, 1)
    assert.equal(calls.length, 1)
    assert.match(calls[0], /^License parity gate: .*package\.json is not valid JSON \(/)
    assert.ok(calls[0].endsWith('Repair the manifest and re-run.'))
    assert.ok(!calls[0].includes('open an issue'))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

// The literal-comparison anchor for the two composers below, mirroring the existing
// composeLicenseUnreadableMessage/composeManifestInvalidJsonMessage anchor above: nothing else
// in this suite would notice a later re-wording of these cleared bytes, since the guard tests
// below only assert against the composers themselves.
test('composePackageLicenseUnreadableMessage and composeManifestNotAnObjectMessage compose the cleared bytes', () => {
  assert.equal(
    composePackageLicenseUnreadableMessage('/repo/packages/tokens/LICENSE', 'EISDIR'),
    'License parity gate: a package LICENSE could not be read (/repo/packages/tokens/LICENSE: EISDIR).\n\n' +
      'No package was compared, so this run must not be read as a run that compared and passed. ' +
      'Make that file readable and re-run. If the licence text is meant to change, do not change ' +
      'it in a pull request: open an issue proposing it instead.',
  )
  assert.equal(
    composeManifestNotAnObjectMessage('/repo/packages/tokens/package.json', 'null'),
    'License parity gate: /repo/packages/tokens/package.json is valid JSON but is not a package ' +
      'manifest (it parsed to null, not an object).\n\n' +
      'No package was compared, so this run must not be read as a run that compared and passed. ' +
      'Repair the manifest and re-run.',
  )
})

// A fix round (finding B): main()'s per-package LICENSE read (`content: exists ?
// readFileSync(licensePath) : null`) sat two lines below the guarded root LICENSE read and
// raw-crashed on a directory or an unreadable file, the exact "raw Node stack trace instead of a
// designed message" class this fix exists to close. A reviewer's consult landed these two rows
// without saving/restoring console.error/process.exitCode; every sibling guard test in this file
// does (see guard1/guard2 above). Without it, main()'s designed `process.exitCode = 1` return
// leaks past the test into the file's overall run and the printed message goes to the real stderr
// instead of being captured — the two rows still show green individually, but node --test then
// fails the FILE's own synthetic top-level test (observed: "tests 49, pass 48, fail 1" with the
// one failure being the file itself), which defeats the point of a green suite. Same fixtures and
// assertions as drafted; wrapped to match this file's own established discipline instead.
test('main(): a package LICENSE that is a directory refuses, never an uncaught EISDIR', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-license-parity-guard3-'))
  try {
    writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
    writeFileSync(path.join(scratch, 'LICENSE'), ROOT_LICENSE)
    const pkgDir = path.join(scratch, 'packages', 'tokens')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@navecss/tokens' }))
    mkdirSync(path.join(pkgDir, 'LICENSE')) // LICENSE is a directory, not a file

    const originalConsoleError = console.error
    const originalExitCode = process.exitCode
    console.error = () => {}
    try {
      assert.doesNotThrow(() => main(scratch))
    } finally {
      console.error = originalConsoleError
      process.exitCode = originalExitCode
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('main(): a package LICENSE that is unreadable (EACCES) refuses, never an uncaught exception', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-license-parity-guard4-'))
  const licensePath = path.join(scratch, 'packages', 'tokens', 'LICENSE')
  try {
    writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
    writeFileSync(path.join(scratch, 'LICENSE'), ROOT_LICENSE)
    mkdirSync(path.dirname(licensePath), { recursive: true })
    writeFileSync(
      path.join(scratch, 'packages', 'tokens', 'package.json'),
      JSON.stringify({ name: '@navecss/tokens' }),
    )
    writeFileSync(licensePath, ROOT_LICENSE)
    chmodSync(licensePath, 0o000)

    const originalConsoleError = console.error
    const originalExitCode = process.exitCode
    console.error = () => {}
    try {
      assert.doesNotThrow(() => main(scratch))
    } finally {
      console.error = originalConsoleError
      process.exitCode = originalExitCode
    }
  } finally {
    chmodSync(licensePath, 0o644)
    rmSync(scratch, { recursive: true, force: true })
  }
})

// A fix round (finding C), widened per the licensing steward's determination
// (consult 2 section 3): a manifest that parses to `null`, an array, or a string is not a
// usable manifest object. `null` alone raw-crashes; the other shapes raise no exception at all
// and instead ship a printed FALSE PASS over a directory never established to be a package,
// which is worse in kind. The guard is keyed on "not a usable object", not on `null` alone.
test('main(): a package manifest that is valid JSON but not a usable object refuses, never an uncaught exception or a silent false pass', () => {
  const shapes = [
    { json: 'null', parsedAs: 'null' },
    { json: '[]', parsedAs: 'an array' },
    { json: '"hello"', parsedAs: 'a string' },
  ]
  for (const { json, parsedAs } of shapes) {
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-license-parity-guard5-'))
    try {
      writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), VALID_WORKSPACE_YAML)
      writeFileSync(path.join(scratch, 'LICENSE'), ROOT_LICENSE)
      const manifestPath = path.join(scratch, 'packages', 'tokens', 'package.json')
      mkdirSync(path.dirname(manifestPath), { recursive: true })
      writeFileSync(manifestPath, json)

      const calls = []
      const originalConsoleError = console.error
      const originalExitCode = process.exitCode
      let exitCode
      console.error = (message) => calls.push(message)
      try {
        assert.doesNotThrow(() => main(scratch), json)
        exitCode = process.exitCode
      } finally {
        console.error = originalConsoleError
        process.exitCode = originalExitCode
      }

      assert.equal(exitCode, 1, json)
      assert.equal(calls.length, 1, json)
      assert.equal(calls[0], composeManifestNotAnObjectMessage(manifestPath, parsedAs), json)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
})

// The appended section's OWN bytes are
// pinned here, against the real packages/tokens/LICENSE, because findLicenseMismatches checks
// only that an allowlisted package BEGINS with the root text and asserts nothing whatever about
// what follows it. Without this row the cleared attribution can be re-worded, truncated or
// deleted outright with ci:check green. Changing this literal is a review change landing a
// re-cleared block, never a test fixup for a row that started failing.
test('packages/tokens/LICENSE is the root LICENSE text verbatim followed by the cleared third-party section, byte for byte', () => {
  const rootLicense = readFileSync(path.join(ROOT, 'LICENSE'))
  const tokensLicense = readFileSync(path.join(ROOT, 'packages', 'tokens', 'LICENSE'))
  assert.ok(
    tokensLicense.subarray(0, rootLicense.length).equals(rootLicense),
    'packages/tokens/LICENSE must begin with the root LICENSE text, byte for byte',
  )
  assert.equal(
    tokensLicense.subarray(rootLicense.length).toString('utf8'),
    TOKENS_THIRD_PARTY_SECTION,
  )
  assert.equal(tokensLicense.length, rootLicense.length + 1945)
})
