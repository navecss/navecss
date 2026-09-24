#!/usr/bin/env node
/**
 * Shape gate for `license-policy.json`'s `prodPermissive` enumeration.
 *
 * Each `prodPermissive` entry is an object carrying only its licence identifier, `id`.
 *
 * **`prodPermissive` must never become a bare `string[]`.** The object shape is the file's
 * format, not a convenience of whichever script reads it today. `classifyBucketB` in
 * `check-license-allowlist.mjs` matches a package's declared licence against `entry.id` with
 * no trimming on the entry side, so a bare string (which has no `id`) or an untrimmed id
 * matches nothing: the licence that row names silently stops being admitted, and without this
 * gate nothing would report the row as the cause. Moving the file to bare strings is a change
 * to its format and is proposed in an issue, like any change to what the file admits, never
 * made to simplify one reader. So this gate asserts: every entry is a non-null, non-array
 * object; every entry's `id` is a non-empty string equal to its own trimmed form; and no two
 * entries share an `id` (a duplicate is a shape defect this check can catch mechanically, in
 * CI, every time).
 *
 * What this gate does NOT do: decide a licensing question, mint a citation, or decide which
 * licences belong on the list. Adding one takes a written licensing review and the
 * maintainer's approval, as this file's own `$comment` says, and starts as an issue, as the
 * "Adding a dependency" item in `.github/CONTRIBUTING.md` describes. This gate guarantees only
 * the shape.
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Given the parsed `license-policy.json`, the list of shape violations in
 * its `prodPermissive` enumeration: a non-array field, a bare-string entry
 * (no `id` to check at all), an entry missing (or malformed) `id`, or a
 * duplicate `id` shared by two entries. Empty array
 * means clean.
 */
export function findProvenanceViolations(policy) {
  const violations = []
  const entries = policy.prodPermissive

  if (!Array.isArray(entries)) {
    violations.push({ entry: entries, index: -1, reason: 'prodPermissive is not an array' })
    return violations
  }

  // Entries the per-entry loop below flags, so the duplicate pass can skip
  // them: one entry yields at most one violation, which is the convention
  // this file's own tests name in their titles.
  const flagged = new Set()

  for (const [index, entry] of entries.entries()) {
    // `typeof [] === 'object'`, so arrays are excluded explicitly: without
    // that they fall through to the id check and get reported as a
    // missing-id violation instead of the message that describes them.
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      violations.push({
        entry,
        index,
        reason:
          'entry is not an object — a bare identifier carries no "id" field, so nothing ' +
          'can match it by name and the automated checks over this list cannot iterate ' +
          'it; entries must stay objects, never bare strings',
      })
      flagged.add(index)
      continue
    }

    // `id` gets no SPDX-shape check — an SPDX grammar regex or a fixed token allow-list were
    // both declined, the former
    // because it can only ever reject a well-formed identifier the grammar has not caught up
    // with, the latter because it would put a second copy of that authoritative set inside the file
    // that IS the copy. The one check that IS warranted is a property of USE, not shape:
    // classifyBucketB (check-license-allowlist.mjs) matches `entry.id === value` with no
    // trimming on the entry side, so an untrimmed id ("  MIT  ") silently never matches
    // anything a real package declares and the row is inert — a previously approved identifier
    // stops being admitted with nothing reporting it. Fails closed either way; this only
    // converts the silence into a named violation.
    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      violations.push({ entry, index, reason: 'missing or empty "id"' })
      flagged.add(index)
      continue
    }
    if (entry.id !== entry.id.trim()) {
      violations.push({
        entry,
        index,
        reason: `"id" ("${entry.id}") carries leading or trailing whitespace, so it can never match a licence string`,
      })
      flagged.add(index)
    }
  }

  // Duplicate `id` detection: two entries can each be
  // well-formed yet share an `id`, which the per-entry loop cannot see.
  //
  // DECISION: the discriminator is failure DIRECTION,
  // not diff visibility: a member DISAPPEARING goes unchecked because it
  // fails closed, and a duplicate fails closed on membership too. What
  // earns it a check is that a second row under one id is a shape defect
  // this artifact's whole purpose (one row per admitted identifier) rules
  // out, mechanically decidable from this file alone.
  const seenAt = new Map()
  for (const [index, entry] of entries.entries()) {
    // Already reported once above; one entry, one violation. Whatever
    // reaches past this line therefore has a non-empty string `id`.
    if (flagged.has(index)) continue
    // Trim, do not fold case. Case is left alone deliberately: classifyBucketB
    // matches `entry.id === value` exactly, so folding it here would report
    // a duplicate for two ids the consumer treats as distinct. The trim itself is defense
    // in depth only, not load-bearing: the check above flags (and skips into `flagged`)
    // any entry whose id is not already equal to its own trimmed form, so every id reaching
    // this line is already trimmed — this call cannot currently change a key's value.
    const id = entry.id.trim()
    const firstSeenAt = seenAt.get(id)
    if (firstSeenAt === undefined) {
      seenAt.set(id, index)
      continue
    }
    violations.push({
      entry,
      index,
      reason:
        `duplicate "id" ("${id}"): the entry at index ${index} repeats the id first ` +
        `carried by the entry at index ${firstSeenAt}; each id must appear at most once ` +
        'in prodPermissive',
    })
  }

  return violations
}

/**
 * Printed when the policy file is not valid JSON. Its two sentences are, word for word, the
 * last two of POLICY_FILE_INVALID_GUIDANCE in check-license-allowlist.mjs, so both gates give
 * a contributor the same repair and the same route. The wording is fixed on purpose: re-wording
 * it is not a tidy-up, so open an issue proposing the new wording and get the maintainer's
 * approval first. Anchored byte-exact in check-license-enumeration-provenance.test.mjs.
 */
export const PROVENANCE_INVALID_JSON_GUIDANCE =
  'Repair the JSON syntax without changing which licences the file admits. Changing what ' +
  'the allow-list permits is not something to do in a pull request: open an issue ' +
  'proposing it instead.'

/**
 * Reading and parsing `license-policy.json` used
 * to be a bare `JSON.parse(readFileSync(...))` inline in `main()`, so a malformed policy file
 * (invalid JSON) died on a raw `SyntaxError` — a crash with a Node stack trace, not this
 * gate's own designed message. This gate runs FIRST in `scripts:check`:
 * a malformed policy should surface HERE, not as a downstream
 * consumer's crash one gate later. Returns `undefined` (never throws) on a parse failure.
 */
export function readLicensePolicy(rootDir = ROOT) {
  const policyPath = path.join(rootDir, 'license-policy.json')
  let raw
  try {
    raw = readFileSync(policyPath, 'utf8')
  } catch (error) {
    console.error(
      `License enumeration provenance gate: could not read ${policyPath} ` +
        `(${error.code ?? error.message}).\n\nFix or restore the policy file and re-run.`,
    )
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error(
      `License enumeration provenance gate: ${policyPath} is not valid JSON ` +
        `(${error.message}).\n\n${PROVENANCE_INVALID_JSON_GUIDANCE}`,
    )
    return undefined
  }
}

/**
 * Identifies a flagged entry for a violation report WITHOUT serialising it wholesale:
 * `JSON.stringify(entry)` printed fields
 * that could carry data with no business appearing in a public failure message. A reader
 * locating the offending row needs only its position and, where usable, its own `id`.
 */
export function describeEntryForReport(entry, index) {
  const hasUsableId =
    entry != null &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof entry.id === 'string' &&
    entry.id.trim() !== ''
  const position = index === -1 ? 'prodPermissive' : `entry at index ${index}`
  return hasUsableId ? `${position} (id: ${JSON.stringify(entry.id)})` : position
}

/**
 * The header and guidance a red run prints. The guidance's first sentence states the whole
 * rule this gate enforces, so a contributor can repair the entry without opening this file;
 * its second sentence refuses the two shortcuts a red run invites and gives the route instead,
 * the same route the sibling allow-list gate prints. The wording is fixed on purpose.
 * Re-wrapping these source lines is harmless, but re-wording either string is not a tidy-up:
 * open an issue proposing the new wording and get the maintainer's approval first. Anchored
 * byte-exact in check-license-enumeration-provenance.test.mjs, which also pins where the first
 * sentence ends and the second begins.
 */
export const PROVENANCE_FAILURE_HEADER =
  'License enumeration provenance gate: prodPermissive entries with a shape defect:\n'

export const PROVENANCE_FAILURE_GUIDANCE =
  "\nEvery entry in license-policy.json's prodPermissive must be an object carrying an " +
  '"id" that is a non-empty string with no leading or trailing whitespace, and no two ' +
  'entries may repeat an id. Do not add a bare string, and ' +
  'do not add a new identifier here to make a check pass: open an issue proposing it instead.'

/**
 * Reads the license policy and reports every provenance violation it finds, exiting non-zero
 * if the policy cannot be read or any entry is malformed.
 */
function main() {
  const policy = readLicensePolicy()
  if (policy === undefined) {
    process.exitCode = 1
    return
  }
  const violations = findProvenanceViolations(policy)

  if (violations.length > 0) {
    console.error(PROVENANCE_FAILURE_HEADER)
    for (const { entry, index, reason } of violations) {
      console.error(`  - ${describeEntryForReport(entry, index)}: ${reason}`)
    }
    console.error(PROVENANCE_FAILURE_GUIDANCE)
    process.exitCode = 1
    return
  }

  console.log(
    `License enumeration provenance gate: ${policy.prodPermissive.length} prodPermissive entr(y/ies), all carry a well-formed id.`,
  )
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`.
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node; `process.argv[1]`
// is neither, so an invocation through a symlinked absolute path (macOS's `/tmp` ->
// `/private/tmp`, for one) makes the two sides disagree even under the fixed
// `pathToFileURL` form — `main()` silently never fires and the script exits 0 having
// printed nothing. `realpathSync` on both sides closes that gap too.
// The `process.argv[1] &&` limb is still load-bearing: `argv[1]` is undefined whenever this
// module is imported rather than run as an entry point.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
