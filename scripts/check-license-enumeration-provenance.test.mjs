/**
 * Unit coverage for the pure classification logic in
 * check-license-enumeration-provenance.mjs, reshaped to
 * execute a signed ruling, run with Node's
 * built-in test runner. Synthetic fixtures only, per the same reasoning as
 * check-license-allowlist.test.mjs and check-license-parity.test.mjs:
 * red/green evidence for the shape check without depending on (or
 * mutating) the real repo's license-policy.json.
 *
 * That reshaping removed `findSourceViolation` (the top-level
 * `"$source"` key it checked no longer exists in license-policy.json) and
 * removed the per-entry `signedBy`/`finding` checks from
 * `findProvenanceViolations` (those fields no longer exist on an entry
 * either). What survives, and what this file now covers: the container
 * must be an array, every entry must be a non-null, non-array object
 * carrying a non-empty, already-trimmed `id`, and no two entries may
 * share an `id`. The tests below were rewritten rather than trimmed, so
 * every remaining assertion exercises the current fixture shape
 * (`{ id }` only) rather than an accidentally-still-passing older one.
 *
 * Also carries the `scripts:check` CHAIN ORDER assertion at the bottom:
 * this gate must run before its consumer, and
 * that ordering lives in package.json, not in either module, so it has no
 * other natural home.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
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
  describeEntryForReport,
  findProvenanceViolations,
  PROVENANCE_FAILURE_GUIDANCE,
  PROVENANCE_FAILURE_HEADER,
  PROVENANCE_INVALID_JSON_GUIDANCE,
  readLicensePolicy,
} from './check-license-enumeration-provenance.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_NAME = 'check-license-enumeration-provenance.mjs'
const SCRIPT_PATH = path.join(ROOT, 'scripts', SCRIPT_NAME)

// readLicensePolicy used to be a bare
// `JSON.parse(readFileSync(...))` inline in main(), which crashed on a raw SyntaxError for a
// malformed policy file. This gate runs FIRST in scripts:check (fix 1b above), so it is the
// one that should surface a malformed policy with a designed message, not a downstream crash.
test('readLicensePolicy reads and parses the real policy file', () => {
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))
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

test('readLicensePolicy returns undefined (never throws) when the policy file is missing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  try {
    assert.equal(readLicensePolicy(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The invalid-JSON test above it captures and byte-anchors what gets printed; this path was
// asserted by return value only, never for what it prints. Mirrored here, but the diagnostic
// interpolates `error.code` (ENOENT on this path, but not one of the cleared bytes), so this
// asserts a stable substring rather than byte-exact equality.
test('readLicensePolicy prints a designed diagnostic, naming the error code, when the policy file is missing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  const printed = []
  const original = console.error
  console.error = (line) => printed.push(line)
  try {
    assert.equal(readLicensePolicy(dir), undefined)
  } finally {
    console.error = original
    rmSync(dir, { recursive: true, force: true })
  }

  assert.equal(printed.length, 1)
  assert.match(printed[0], /could not read/)
  assert.match(printed[0], /ENOENT/)
  assert.match(printed[0], /Fix or restore the policy file and re-run\./)
})

test('the real license-policy.json prodPermissive enumeration is clean (GREEN)', () => {
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))
  assert.deepEqual(findProvenanceViolations(policy), [])
})

test('the real license-policy.json no longer carries a top-level "$source" key', () => {
  // $source/$sourceComment named the brain-side signed enumeration entity by id — a
  // private-repository fact in a file every dependency of this project can open, which
  // the project's public-repository ruling forbids. Removed outright rather than reworded.
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))
  assert.equal(Object.hasOwn(policy, '$source'), false)
  assert.equal(Object.hasOwn(policy, '$sourceComment'), false)
})

test('the real license-policy.json entries no longer carry signedBy/finding', () => {
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))
  for (const entry of policy.prodPermissive) {
    assert.equal(Object.hasOwn(entry, 'signedBy'), false)
    assert.equal(Object.hasOwn(entry, 'finding'), false)
    assert.deepEqual(Object.keys(entry), ['id'])
  }
})

// The three prose strings in license-policy.json are CLEARED BYTES, transcribed verbatim from
// the project's licensing steward's clearance turn taken on this branch, not
// drafted here. A re-wording of any of them is a fresh clearance turn; a re-wrapping of the
// same bytes is not. Nothing anchored these byte-exact before, so a later tidy could re-word a
// cleared licensing-position string with every gate still green — this is that anchor, and it
// is deliberately an equality check rather than a pattern match.
test('the real license-policy.json prose strings equal the cleared bytes', () => {
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))

  assert.equal(
    policy.$comment,
    "Encodes the three licence buckets this project enforces automatically. This file is the diffable enforcement policy. Do not add a licence to permissive-prod without a written licensing review and the maintainer's approval — that is the whole point of this file being a human-diffed allow-list rather than an inference.",
  )
  assert.equal(
    policy.prodPermissiveComment,
    "Bucket B (dependencies/peerDependencies): permissive only auto-passes. Apache-2.0 is accepted but is NOT free — its NOTICE duty (§4(d)) becomes a real THIRD-PARTY-LICENSES obligation the moment anything under it is bundled (bucket A), which the no-inlined-dependency guard (packages/*/test/no-inlined-dependency.test.ts) is what keeps bucket A empty. Anything not on this list — including weak copyleft (MPL-2.0, LGPL) and strong copyleft (GPL, AGPL) — fails the gate and routes to the maintainer for a written licensing review before it can be added; a 'review item' is not an auto-pass, so it is not on this list until it has been reviewed by name, not by licence-family blanket.",
  )
  assert.equal(
    policy.prodPermissiveSchemaComment,
    "Each entry carries only its own licence identifier (id), and the object shape is load-bearing rather than stylistic: check-license-allowlist.mjs matches a package's declared licence against entry.id, so a bare string here would silently match nothing, and check-license-enumeration-provenance.mjs rejects any entry that is not an object with a non-empty, already-trimmed id, so that cannot happen quietly.",
  )
})

test('a well-formed entry passes (GREEN)', () => {
  const violations = findProvenanceViolations({ prodPermissive: [{ id: 'MIT' }] })
  assert.deepEqual(violations, [])
})

test('a bare string entry is a violation — the exact shape this gate exists to catch (RED)', () => {
  const violations = findProvenanceViolations({ prodPermissive: ['MIT'] })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not an object/)
})

test('a null entry is a violation (RED)', () => {
  const violations = findProvenanceViolations({ prodPermissive: [null] })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not an object/)
})

test('an entry with an empty-string "id" is a violation (RED)', () => {
  const violations = findProvenanceViolations({ prodPermissive: [{ id: '' }] })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /missing or empty "id"/)
})

test('an entry with no "id" key at all is a violation (RED)', () => {
  const violations = findProvenanceViolations({ prodPermissive: [{}] })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /missing or empty "id"/)
})

// Per the licensing steward's ruling: `id` gets no SPDX-shape check, deliberately — the one
// warranted check is that `id` equals its own trimmed form, since classifyBucketB
// (check-license-allowlist.mjs) matches it with no trimming on the entry side. Unaffected by
// the later reshaping that removed signedBy/finding, never this check.

test('an entry with a whitespace-padded "id" is a violation, naming the whitespace (RED)', () => {
  const violations = findProvenanceViolations({ prodPermissive: [{ id: '  MIT  ' }] })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /"id" \("  MIT  "\) carries leading or trailing whitespace/)
})

test('an "id" trimmed of leading/trailing whitespace only is not a violation (GREEN)', () => {
  const violations = findProvenanceViolations({ prodPermissive: [{ id: 'MIT' }] })
  assert.deepEqual(violations, [])
})

test('prodPermissive not being an array is its own single violation (RED)', () => {
  const violations = findProvenanceViolations({ prodPermissive: 'MIT' })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not an array/)
})

test('an entry carrying extra fields beyond id is not itself a violation (GREEN — this gate checks id shape, not exhaustive key membership)', () => {
  // Deliberately permissive: this gate's whole job is that `id` is present, trimmed and
  // unique, so downstream tooling can iterate object entries safely. It does not
  // assert entries carry NO other keys — that would make this file the place a stray extra
  // key gets caught, which is not this gate's job.
  const violations = findProvenanceViolations({ prodPermissive: [{ id: 'MIT', note: 'x' }] })
  assert.deepEqual(violations, [])
})

test('multiple entries report one violation each, well-formed entries pass through clean', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, 'ISC', { id: '0BSD' }],
  })
  assert.equal(violations.length, 1)
  assert.equal(violations[0].entry, 'ISC')
})

// --- Duplicate `id` detection (a decision made during implementation: build the
// uniqueness assertion — see the reasoning comment in
// findProvenanceViolations for why a duplicate ADDITION is worth catching
// mechanically even though bucket B carries 0 prod packages today) ---

test('two entries with the same id are a violation, even if both are individually well-formed (RED)', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: 'MIT' }],
  })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /duplicate "id"/)
  assert.match(violations[0].reason, /MIT/)
})

test('three entries sharing an id report one duplicate violation per repeat, not per group', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: 'MIT' }, { id: 'MIT' }],
  })
  assert.equal(violations.length, 2)
  for (const violation of violations) {
    assert.match(violation.reason, /duplicate "id"/)
  }
})

test('distinct ids do not trigger the duplicate check (GREEN)', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: 'ISC' }],
  })
  assert.deepEqual(violations, [])
})

test('a shape-malformed entry (no id) does not corrupt duplicate tracking for later entries', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [null, { id: 'MIT' }],
  })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not an object/)
})

// --- Round-2 hardening of the duplicate pass ---

test('the duplicate message identifies both entries by POSITION (RED)', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: 'MIT' }],
  })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /duplicate "id"/)
  assert.match(violations[0].reason, /index 0/)
  assert.match(violations[0].reason, /index 1/)
})

// A prior review round (consulting the licensing steward) named this reason as one whose
// docblock made no byte-exact claim, without measuring it. Measured here: every prior assertion
// on this reason matched only a FRAGMENT (/duplicate "id"/, /index 0/, /index 1/), which is
// what let the STATIC words around those fragments drift with the whole suite staying green —
// rewording "each id must appear at most once in prodPermissive" to a paraphrase left every
// test above green. This is the byte-exact backstop, not the gate: the primary control is the
// reasoning comment above `findProvenanceViolations`'s duplicate-detection block. CHANGING THIS
// LITERAL IS A WORDING CHANGE TO A CHECK'S OWN OUTPUT, NOT A TEST FIXUP — if this goes red
// because the source message was reworded, restore the wording or get it decided, never edit
// the literal to match.
test('the duplicate message is byte-exact, not only fragment-matched', () => {
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: 'MIT' }],
  })
  assert.equal(violations.length, 1)
  assert.equal(
    violations[0].reason,
    'duplicate "id" ("MIT"): the entry at index 1 repeats the id first carried by the entry ' +
      'at index 0; each id must appear at most once in prodPermissive',
  )
})

test('an untrimmed "id" is caught at the per-entry stage before the duplicate pass ever sees it (RED)', () => {
  // Before the per-entry whitespace check existed, an untrimmed id reached the
  // duplicate-detection pass unflagged, and that pass's own defensive `.trim()` on the map
  // key is what caught " MIT" colliding with "MIT" here — this test used to assert a
  // "duplicate" reason. The per-entry whitespace check now flags (and `flagged.add()`s) the
  // untrimmed entry BEFORE the duplicate pass runs, so it is reported for its OWN defect and
  // never reaches the duplicate-detection code path at all.
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: ' MIT' }],
  })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /"id" \(" MIT"\) carries leading or trailing whitespace/)
})

test('duplicate detection does NOT fold case, because the consumer does not (GREEN, deliberate)', () => {
  // classifyBucketB matches `entry.id === value` exactly, so "MIT" and
  // "mit" are distinct rows to the consumer. Folding case here would report
  // a duplicate for a pair the consumer treats as two identifiers.
  const violations = findProvenanceViolations({
    prodPermissive: [{ id: 'MIT' }, { id: 'mit' }],
  })
  assert.deepEqual(violations, [])
})

test('an array entry gets the designed "not an object" message, not the missing-id one (RED)', () => {
  // typeof [] === 'object', so an array used to fall through to the id check and report a
  // missing-id violation instead of the message that actually describes it.
  const violations = findProvenanceViolations({ prodPermissive: [['MIT']] })
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not an object/)
  assert.doesNotMatch(violations[0].reason, /missing or empty/)
})

// --- The printed strings, anchored byte-exact (cleared by the project's licensing steward) ---

// Three of the four strings this gate can print were rewritten by that reshape, and the
// clearance turn returned cleared bytes for all three. Nothing anchored them,
// so a later re-wording would have shipped green and silent; these are equality checks, not
// pattern matches, for exactly that reason. The header and the guidance are read from the
// exported constants rather than captured off a red run: a red run proves the composition,
// which the source-text check below covers, while these prove the bytes.
test('the exported header and guidance constants equal the cleared bytes', () => {
  assert.equal(
    PROVENANCE_FAILURE_HEADER,
    'License enumeration provenance gate: prodPermissive entries with a shape defect:\n',
  )
  assert.equal(
    PROVENANCE_FAILURE_GUIDANCE,
    '\nEvery entry in license-policy.json\'s prodPermissive must be an object carrying an "id" that is a non-empty string with no leading or trailing whitespace, and no two entries may repeat an id. Do not add a bare string, and do not add a new identifier here to make a check pass: open an issue proposing it instead.',
  )
})

// Neither sentence of this guidance is pre-existing branch text: the text that reshape
// replaced named per-entry provenance fields and routed to a named persona, and both sentences that
// stand here were drafted in a clearance turn rather than written at the call site. The SECOND
// is the one drafted in the clearance turn cited above, unchanged since. The FIRST was drafted
// at an earlier review turn, which cleared the branch's own wording on the licensing axis and
// then replaced it: "untrimmed-safe" was a coinage that did not state the rule it was enforcing.
// Anchored separately so the boundary stays visible to whoever reads this next, and so a
// re-wording of either half cannot hide inside a full-string diff of the whole constant.
test('the guidance ends with the cleared second sentence, byte-exact', () => {
  assert.equal(
    PROVENANCE_FAILURE_GUIDANCE.endsWith(
      'Do not add a bare string, and do not add a new identifier here to make a check pass: open an issue proposing it instead.',
    ),
    true,
  )
})

// The non-object reason is interpolated into a violation row rather than printed directly, so
// it is anchored through the real code path that produces it.
test('the non-object entry reason equals the cleared bytes', () => {
  const violations = findProvenanceViolations({ prodPermissive: ['MIT'] })

  assert.equal(violations.length, 1)
  assert.equal(
    violations[0].reason,
    'entry is not an object — a bare identifier carries no "id" field, so nothing can match it by name and the automated checks over this list cannot iterate it; entries must stay objects, never bare strings',
  )
})

// An inline copy of the cleared bytes at the call site is byte-identical to reading the
// constant, so no output comparison in this file can tell the two apart, and the copy is then
// free to drift from the constant the clearance is anchored on. The only observable difference
// is in the source text, so that is what this reads: each cleared string must appear exactly
// once in the module, at its own definition.
//
// The phrase counted below is searched for in a SPLICED copy of the source, not the raw text
// (found during a round-2 verification read): a cleared constant's own literal can be
// re-wrapped across a `+` boundary that happens to split the very phrase this test counts,
// which would report zero copies of a phrase that still runs byte-identical — a false red on a
// faithful re-wrap, not a real duplicate. Splicing every `'...' + '...'`/`"..." + "..."` join
// back together first makes the count immune to where a literal wraps; a genuine second copy of
// the phrase, however it is itself wrapped, is spliced the same way and still counts twice.
function spliceWrappedLiterals(source) {
  return source.replaceAll(/(['"])\s*\+\s*(['"])/g, '')
}

test('the gate module carries exactly one copy of each cleared printed string', () => {
  const source = readFileSync(
    path.join(ROOT, 'scripts/check-license-enumeration-provenance.mjs'),
    'utf8',
  )
  const spliced = spliceWrappedLiterals(source)

  assert.equal(spliced.split('License enumeration provenance gate: prodPermissive').length - 1, 1)
  assert.equal(spliced.split('do not add a new identifier here to make a check pass').length - 1, 1)
  assert.equal(spliced.split('Repair the JSON syntax').length - 1, 1)
  assert.equal(spliced.split('entries must stay objects, never bare strings').length - 1, 1)
  assert.equal(source.includes('PROVENANCE_FAILURE_HEADER'), true)
  assert.equal(source.includes('PROVENANCE_FAILURE_GUIDANCE'), true)
})

// The invalid-JSON path's second sentence is cleared bytes too, cleared by the project's
// licensing steward. It is the same public route cleared for the two sibling sites in the
// allow-list gate, so four copies of one sentence converge instead of diverging — which holds
// only for as long as nothing re-words one of them, and that is what this anchors.
test('the exported invalid-JSON guidance equals the cleared bytes', () => {
  assert.equal(
    PROVENANCE_INVALID_JSON_GUIDANCE,
    'Repair the JSON syntax without changing which licences the file admits. Changing what the allow-list permits is not something to do in a pull request: open an issue proposing it instead.',
  )
})

// The constant proves its own bytes; this proves readLicensePolicy still PRINTS them, appended
// to the diagnostic line rather than inlined as a second copy. console.error is saved, replaced
// with a collector and restored in a finally, so a failing assertion cannot leak a patched
// global into a later test.
test('readLicensePolicy prints the cleared invalid-JSON guidance, appended to the diagnostic', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-license-policy-'))
  const printed = []
  const original = console.error
  console.error = (line) => printed.push(line)
  try {
    writeFileSync(path.join(dir, 'license-policy.json'), '{ not valid json')
    assert.equal(readLicensePolicy(dir), undefined)
  } finally {
    console.error = original
    rmSync(dir, { recursive: true, force: true })
  }

  assert.equal(printed.length, 1)
  assert.equal(printed[0].endsWith(PROVENANCE_INVALID_JSON_GUIDANCE), true)
  assert.match(printed[0], /is not valid JSON/)
})

// --- The `scripts:check` chain order ---

test('scripts:check runs the provenance gate BEFORE the allow-list gate (RED against the earlier order)', () => {
  // Green on this branch by construction: an earlier fix already
  // set the order. Verified red by running this file against origin/main's
  // package.json, which still has the allow-list gate first.
  const chain = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts[
    'scripts:check'
  ]
  const provenanceAt = chain.indexOf('check-license-enumeration-provenance.mjs')
  const allowlistAt = chain.indexOf('check-license-allowlist.mjs')

  assert.notEqual(provenanceAt, -1, 'check-license-enumeration-provenance.mjs is not in the chain')
  assert.notEqual(allowlistAt, -1, 'check-license-allowlist.mjs is not in the chain')
  assert.ok(
    provenanceAt < allowlistAt,
    'scripts:check must run check-license-enumeration-provenance.mjs BEFORE ' +
      'check-license-allowlist.mjs. The shape gate has to validate license-policy.json ' +
      'before its consumer reads it: the allow-list gate is tolerant of malformed ' +
      'prodPermissive entries by design (it fails them closed), so running it first ' +
      'prints a false "all clear" over a malformed policy and the designed message ' +
      'explaining the malformation is never reached. Do not reorder this chain to ' +
      'alphabetize it or to slot a new gate in.',
  )
})

// The violation report used to print
// `JSON.stringify(entry)`, which serialised fields that could carry brain-only data.
// describeEntryForReport replaces it with a projection that only ever prints position and id.
test('describeEntryForReport prints only position and id, never any other field the entry carries', () => {
  const entry = { id: 'MIT', note: 'a field this gate does not check or need to print' }
  const description = describeEntryForReport(entry, 3)
  assert.doesNotMatch(description, /note this gate/)
  assert.match(description, /entry at index 3/)
  assert.match(description, /"MIT"/)
})

test('describeEntryForReport falls back to position alone when the entry has no usable id', () => {
  assert.equal(describeEntryForReport({}, 2), 'entry at index 2')
  assert.equal(describeEntryForReport('not-an-object', 5), 'entry at index 5')
  assert.equal(describeEntryForReport(null, 0), 'entry at index 0')
})

test('describeEntryForReport reports the container itself when index is -1 (prodPermissive is not an array)', () => {
  assert.equal(describeEntryForReport('a string, not an array', -1), 'prodPermissive')
})

// --- End-to-end subprocess coverage of main() ---
//
// Every test above exercises findProvenanceViolations, readLicensePolicy and
// describeEntryForReport directly — none of them ever calls main(), so main()'s whole job
// (print the report, set process.exitCode = 1) had zero coverage: replacing its body with a
// console.log and no process.exitCode still shipped 35/35 green and exit 0. These two tests
// spawn the SHIPPED script as a child process so main() itself is on the hook.
//
// The violating case copies the script into a throwaway root rather than pointing an env var
// or flag at it: main() calls readLicensePolicy() with no argument, so it always resolves ROOT
// from the script's own file location, and the module imports only Node builtins, so a
// single-file copy into <tmp>/scripts/ is a complete, self-contained root — no production
// change needed for testability. The temp root is realpath'd deliberately (mirroring
// check-license-parity.test.mjs's buildFixture): on macOS
// /tmp -> /private/tmp, and the shipped entry-point guard
// (`import.meta.url === pathToFileURL(process.argv[1]).href`) compares an internally-resolved
// (symlink-following) import.meta.url against an un-realpath'd argv[1], so an un-realpath'd
// fixture path would make the guard never fire, main() never run, and the child exit 0 printing
// nothing — a vacuous pass indistinguishable from a real one. Realpathing here means these
// tests also exercise that guard correctly; if it regressed, these would go red.

test('end to end: the shipped script passes against the real repository root, printing the designed success line', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.ok(
    (result.stdout ?? '').includes('prodPermissive entr(y/ies), all carry a well-formed id'),
    `expected the success line in stdout, got: ${JSON.stringify(result.stdout)}`,
  )
})

test('end to end: the shipped script fails on a bare-string entry, printing the designed header and guidance', () => {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-license-provenance-'))
  try {
    mkdirSync(path.join(dir, 'scripts'))
    cpSync(SCRIPT_PATH, path.join(dir, 'scripts', SCRIPT_NAME))
    writeFileSync(
      path.join(dir, 'license-policy.json'),
      JSON.stringify({ prodPermissive: ['MIT'] }, null, 2),
    )

    const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
      cwd: dir,
      encoding: 'utf8',
    })

    assert.equal(result.status, 1)
    const stderr = result.stderr ?? ''
    assert.ok(
      stderr.includes(PROVENANCE_FAILURE_HEADER),
      `expected PROVENANCE_FAILURE_HEADER in stderr, got: ${JSON.stringify(stderr)}`,
    )
    assert.ok(
      stderr.includes(PROVENANCE_FAILURE_GUIDANCE),
      `expected PROVENANCE_FAILURE_GUIDANCE in stderr, got: ${JSON.stringify(stderr)}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A census measured the shipped pass line printing "6 prodPermissive
// entr(y/ies)" against `pnpm run scripts:test` staying 350/350 GREEN, because the test above this
// one asserts only the SUFFIX ("...all carry a well-formed id"), never the count. The pass line's
// count IS pinnable against a fixture at this call site: the pass line here has exactly one OTHER
// same-typed count in scope (`violations.length`), and it is structurally zero on this path
// (`main()` returns early when it is non-empty), so a fixture that differs in SIZE from the real
// repository's own `license-policy.json` separates the stale-or-hardcoded class and the
// zero-valued neighbour at once. The predicate is the SCOPE, not the printed line
// (that census's own opening diagnosis); a second, differently-sized case closes the
// one-fixture-happens-to-match gap on top of that.
function provenanceFixtureDir(entryIds) {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-license-provenance-count-'))
  mkdirSync(path.join(dir, 'scripts'))
  cpSync(SCRIPT_PATH, path.join(dir, 'scripts', SCRIPT_NAME))
  writeFileSync(
    path.join(dir, 'license-policy.json'),
    JSON.stringify({ prodPermissive: entryIds.map((id) => ({ id })) }, null, 2),
  )
  return dir
}

for (const entryIds of [['a'], ['a', 'b', 'c', 'd', 'e']]) {
  test(`end to end: the pass line's count tracks a ${entryIds.length}-entry fixture, not a stale or hardcoded value`, () => {
    const dir = provenanceFixtureDir(entryIds)
    try {
      const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
        cwd: dir,
        encoding: 'utf8',
      })
      assert.equal(result.status, 0)
      // This pins the licensing gate's cleared pass-line sentence at a SECOND test site: `:488`
      // above anchors the suffix only (pre-existing), this one anchors the full sentence
      // including its count. A future cleared rewording of that sentence now updates both. This
      // test asserts an existing string and rewords nothing, so no clearance turn is owed by it
      // (row 1's own note, this file's docblock above).
      assert.ok(
        (result.stdout ?? '').includes(
          `License enumeration provenance gate: ${entryIds.length} prodPermissive entr(y/ies), all carry a well-formed id.`,
        ),
        `expected the pass line to print the real count ${entryIds.length}, got: ${JSON.stringify(result.stdout)}`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
