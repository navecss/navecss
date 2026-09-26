#!/usr/bin/env node
/**
 * Licence allow-list gate, signed off by the project's maintainer:
 * `pnpm licenses list --prod --json` plus a small first-party allow-list
 * script. No new dependency, no counterparty (no FOSSA — a deliberate
 * choice by the licensing steward, not an oversight).
 *
 * `pnpm licenses list` documents no non-zero exit code on its own — it is
 * an inventory command, not a gate. So the gate is this script, over its
 * JSON, against `license-policy.json` (a repo file a human diffs, which is
 * the whole point of choosing this tool: the policy is visible and
 * versioned, not implicit in a scanner's defaults).
 *
 * This script decides no licensing question. Its buckets and their rules
 * were set by the project's licensing steward; this file only applies
 * them. Anything that trips either check is a review item for the
 * licensing steward, never resolved here.
 *
 * Buckets (the reasoning behind them is summarized inline below):
 *   A. Bundled into shipped output — not checked HERE. Bucket A is kept
 *      empty by construction by the no-inlined-dependency guards
 *      (packages/*\/test/no-inlined-dependency.test.ts, coverage asserted
 *      by scripts/check-bundling-guard-coverage.mjs). This script does not
 *      re-derive bucket A membership from the licenses list, because
 *      "bundled" is a build-output fact, not a licence-list fact.
 *   B. `dependencies` / `peerDependencies` (pnpm's own `--prod` scope):
 *      permissive only auto-passes (license-policy.json `prodPermissive`,
 *      an array of `{ id }` objects — an earlier revision carried a
 *      per-entry `signedBy`/`finding` field and a top-level `$source`,
 *      both later removed once the policy's provenance was reworked to be
 *      enumerated separately — matched on `id`; shape well-formedness is a
 *      separate gate, check-license-enumeration-provenance.mjs).
 *      Weak copyleft (MPL-2.0, LGPL) is a review item, not an auto-pass;
 *      strong copyleft (GPL, AGPL) is a stop. Both fail this gate the same
 *      way "not on the list" does, and are told apart only in the message.
 *      Compound SPDX expressions — ruled on by the project's licensing
 *      steward, then amended in a follow-up ruling — are handled over
 *      three tiers:
 *        Tier 1, a bare identifier: exact, case-sensitive match against
 *          `prodPermissive[].id`.
 *        Tier 2, an expression the gate can fully decompose into bare
 *          identifiers. First, trim the expression. Then, in a single
 *          left-to-right pass, remove every matched parenthesis pair
 *          that satisfies all three of: the `(` is at the start of the
 *          expression or is immediately preceded by a space; the `)` is
 *          at the end of the expression or is immediately followed by a
 *          space; and the text strictly between them is a single
 *          identifier matching `^[A-Za-z0-9.+-]+$`. A parenthesis with
 *          an identifier character immediately outside it is never
 *          removed, which is what keeps this a removal of grouping
 *          rather than an edit of an identifier. The pass is applied
 *          once and iterating it changes nothing, because a pair whose
 *          outside is a parenthesis is never removable and removing a
 *          pair creates no new removable pair.
 *          Decidable iff, after that, and after removing at most one
 *          matched paren pair that wraps the ENTIRE remaining
 *          expression and contains no other parenthesis, the remainder
 *          is `IDENT (OP IDENT)*` with a single operator used
 *          uniformly, `OP` one of the exact strings " OR " / " AND ",
 *          and every `IDENT` matching `^[A-Za-z0-9.+-]+$` (no residual
 *          space, no residual parenthesis, no " WITH "). Then: allowed
 *          iff EVERY identifier is admitted, for BOTH operators — the
 *          operator changes only the message, never the verdict.
 *        Tier 3, anything else: `{ allowed: false }` with a distinct
 *          reason — the gate cannot decompose the expression, so it
 *          declines to classify and flags it for the licensing steward to
 *          review, rather than approximating one operand and discarding
 *          the rest (an earlier version of this gate approximated
 *          `(MIT OR ISC) AND GPL-3.0-only` by keeping one operand and
 *          silently discarding the other, which is the failure mode this
 *          tier exists to avoid). Never folded into "not on the
 *          permissive allow-list", because those are different facts and
 *          a reader told the wrong one takes the wrong next step.
 *   C. `devDependencies`: any OSI-approved licence, deliberately broad —
 *      the only automated carve-out is `alwaysBlockedPatterns` (source-
 *      available USE-restricting licences, which condition on use rather
 *      than distribution and so are not made safe by "it's only a build
 *      tool"). The OTHER carve-out the licensing steward names — a dev
 *      dependency whose OUTPUT is encumbered — is a judgement call this
 *      script cannot make from a licence string and does not attempt to.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Cleared by the project's licensing steward: the second sentence printed on both the
 * invalid-JSON and the malformed-shape policy-file failure paths in this file. The two sites
 * carried identical text before this clearance and carry identical text after, by design, so
 * this constant is the one place a later tidy touches instead of two.
 */
export const POLICY_FILE_INVALID_GUIDANCE =
  'No package was classified. Repair the JSON syntax without changing which licences the ' +
  'file admits. Changing what the allow-list permits is not something to do in a pull ' +
  'request: open an issue proposing it instead.'

/**
 * `pnpm licenses list --json` prints the plain-text line "No licenses in
 * packages found" instead of `{}` when the scope is empty (observed
 * 2026-08-13 against this workspace's own `--prod` scope, which is empty
 * today). Treat that line, and any other non-JSON output, as "nothing
 * found" rather than crashing the gate on a JSON.parse error.
 */
export function parseLicensesJson(rawOutput) {
  const trimmed = rawOutput.trim()
  if (trimmed === '' || trimmed === 'No licenses in packages found') return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return {}
  }
}

/**
 * Flattens `pnpm licenses list --json` output (license string -> package
 * entries) into `{ name, version, license }` records.
 */
export function flattenLicenseGroups(licensesJson) {
  const packages = []
  for (const [license, entries] of Object.entries(licensesJson)) {
    for (const entry of entries) {
      for (const version of entry.versions ?? ['unknown']) {
        packages.push({ name: entry.name, version, license })
      }
    }
  }
  return packages
}

/**
 * The shape violation in the one policy key THIS gate reads and nothing
 * else validates, or `null` if it is well-formed.
 *
 * Scoped deliberately to `alwaysBlockedPatterns`: it is read here, by
 * `isAlwaysBlocked`, and nowhere else in the repo, so no other gate can
 * validate it. `prodPermissive`'s container and entry shapes belong to
 * check-license-enumeration-provenance.mjs, which `scripts:check` runs
 * first for exactly that reason. Each gate validates what it itself reads;
 * neither grows into a general policy-schema validator.
 *
 * Called from main() before any package is classified, so a malformed key
 * gives a designed message and a non-zero exit instead of a raw TypeError
 * from `.some` / `.toLowerCase` raised 500-odd packages into the run. It
 * must never degrade to "not blocked": a carve-out list the gate cannot
 * read is a stop, not an empty list.
 */
export function findPolicyShapeViolation(policy) {
  const patterns = policy.alwaysBlockedPatterns
  if (!Array.isArray(patterns)) {
    return (
      '"alwaysBlockedPatterns" is missing or not an array; it must be an array of ' +
      'licence-string patterns (the source-available use-restricting carve-out). This gate ' +
      'cannot apply a carve-out it cannot read, and it will not fall back to an empty one.'
    )
  }
  const badIndex = patterns.findIndex((pattern) => typeof pattern !== 'string')
  if (badIndex !== -1) {
    return (
      `"alwaysBlockedPatterns" index ${badIndex} (${JSON.stringify(patterns[badIndex])}) is ` +
      'not a string; every pattern is matched as a case-insensitive substring of a licence ' +
      'string, so every pattern must be one.'
    )
  }
  return null
}

/**
 * True if `license` matches any always-blocked pattern (case-insensitive
 * substring), the carve-out that applies in every bucket including dev.
 * Assumes `alwaysBlockedPatterns` is well-formed; main() asserts that with
 * findPolicyShapeViolation before any package reaches here.
 */
export function isAlwaysBlocked(license, policy) {
  return policy.alwaysBlockedPatterns.some((pattern) =>
    license.toLowerCase().includes(pattern.toLowerCase()),
  )
}

// SPDX-shaped identifier charset, per the project's licensing steward's ruling: no residual
// whitespace, no residual parenthesis, no ` WITH `.
const IDENTIFIER_RE = /^[A-Za-z0-9.+-]+$/

// A parenthesis pair wrapping a SINGLE operand is stripped before decomposition, provided
// the pair sits at a string boundary or a space immediately outside each of its two
// characters. That boundary condition is the
// whole safety property — a parenthesis with an identifier character immediately outside it
// is never matched, so this can neither merge two identifiers (`MI(T)` stays untouched) nor
// split one (`M(IT)` stays untouched). Matched with a single global regex pass (`replace`
// scans left to right over the ORIGINAL string and does not re-scan its own output), which
// is why iterating it is unnecessary: a pair whose outside is a parenthesis is never
// removable, and removing a pair creates no new removable pair.
const SINGLE_OPERAND_PAREN_RE = /(^|(?<= ))\(([A-Za-z0-9.+-]+)\)(?=$| )/g

/**
 * Decomposes a licence expression into its identifiers and (if compound)
 * its single uniform operator, or returns `null` if the expression is not
 * DECIDABLE by this gate, per the project's licensing steward's ruling
 * (later amended in a follow-up ruling): the gate declines to approximate
 * an expression it cannot fully decompose rather than guess at one operand
 * and silently discard the rest, which is the failure mode an earlier
 * version of this gate hit (`(MIT OR ISC) AND GPL-3.0-only` discarding its
 * `AND` term entirely).
 *
 * Decidable means: after trimming, after stripping every single-operand
 * paren pair (`SINGLE_OPERAND_PAREN_RE`), and after removing at
 * most one matched paren pair that wraps the ENTIRE remaining expression
 * and contains no other parenthesis, the remainder is `IDENT (OP IDENT)*`
 * with ONE operator used uniformly (never a mix of ` AND ` and ` OR ` in
 * the same expression, which is what a nested compound like
 * `(MIT OR ISC) AND GPL-3.0-only` always produces), and every `IDENT`
 * matches `IDENTIFIER_RE`.
 */
function decomposeExpression(expression) {
  const trimmed = expression.trim().replaceAll(SINGLE_OPERAND_PAREN_RE, '$2')
  const inner = trimmed.slice(1, -1)
  const isWholeExpressionParen =
    trimmed.startsWith('(') && trimmed.endsWith(')') && !inner.includes('(') && !inner.includes(')')
  const body = isWholeExpressionParen ? inner : trimmed

  if (IDENTIFIER_RE.test(body)) return { operator: null, identifiers: [body] }

  const hasOr = body.includes(' OR ')
  const hasAnd = body.includes(' AND ')
  if (hasOr === hasAnd) return null // both true (mixed operator) or both false (not compound)

  const operator = hasOr ? ' OR ' : ' AND '
  const identifiers = body.split(operator).map((part) => part.trim())
  if (identifiers.some((id) => !IDENTIFIER_RE.test(id))) return null
  return { operator: operator.trim(), identifiers }
}

/**
 * Cleared by the project's licensing steward: the trailing routing clause is dropped, not
 * restated — the surrounding printed frame (header + closing guidance) already names the
 * "open an issue" route once, and naming it a second time inside this reason read as an
 * instruction to a named agent rather than a description of why the row is a violation.
 */
export const BUCKET_B_UNDECIDABLE_REASON =
  'this gate cannot decompose the expression into identifiers it can classify with ' +
  'confidence, and it declines to approximate a licensing question rather than guess'

/**
 * Bucket B: prod dependency licence check, over the three tiers ruled on
 * by the project's licensing steward. Tier 1 (bare identifier) and
 * tier 2 (a fully decidable expression) both require EVERY identifier to
 * be admitted, for BOTH operators — the disjunction case is not exempted,
 * because "the licensee may elect the permissive branch" is itself an
 * unsigned licensing proposition, not arithmetic, and a
 * disjunction whose branches are all admitted needs no election rule at
 * all. Tier 3 (undecidable) refuses to classify and flags it for the
 * licensing steward to review, rather than approximating. Returns
 * `{ allowed, reason }`.
 */
export function classifyBucketB(license, policy) {
  if (isAlwaysBlocked(license, policy)) {
    return { allowed: false, reason: 'source-available use-restricting licence' }
  }

  const decomposed = decomposeExpression(license)
  if (decomposed === null) {
    return {
      allowed: false,
      reason: BUCKET_B_UNDECIDABLE_REASON,
    }
  }

  // prodPermissive entries are id-bearing objects, not bare strings
  // (`{ id }`, checked for well-formedness by check-license-enumeration-provenance.mjs) —
  // match on the entry's `id`, exact and case-sensitive (per the licensing steward's ruling:
  // a value matching only case-insensitively has already degraded to "custom"). Do not
  // lowercase either side.
  // Guard against a null/undefined ENTRY the same way a bare string is
  // already handled above: no `id` to match means "not permissive", not a
  // thrown TypeError. Entry-level only, deliberately: a missing or
  // non-array `prodPermissive` still throws here, and that container case
  // is check-license-enumeration-provenance.mjs's ("prodPermissive is not
  // an array"), which scripts:check runs first for exactly that reason.
  const isPermissive = (id) =>
    policy.prodPermissive.some((entry) => entry != null && entry.id === id)

  const allowed = decomposed.identifiers.every(isPermissive)
  if (allowed) return { allowed: true, reason: 'permissive' }

  if (decomposed.operator === 'OR') {
    return {
      allowed: false,
      reason:
        'an OR expression carrying at least one non-permissive branch — whether the licensee ' +
        'may elect the permissive term and never bind the other is not a signed guarantee ' +
        'here — review item, not an auto-pass',
    }
  }
  return {
    allowed: false,
    reason:
      'not on the permissive allow-list (weak/strong copyleft, or unrecognized) — review item, not an auto-pass',
  }
}

/**
 * Bucket C: devDependency licence check. Broad by design; only the
 * always-blocked carve-out fails it. Returns `{ allowed, reason }`.
 */
export function classifyBucketC(license, policy) {
  if (isAlwaysBlocked(license, policy)) {
    return { allowed: false, reason: 'source-available use-restricting licence' }
  }
  return { allowed: true, reason: 'devDependency, broad allow' }
}

/**
 * The message printed when `pnpm licenses list` itself cannot be run — a non-zero exit, or
 * `pnpm` absent entirely — cleared by the project's licensing steward: this is the case a
 * human actually hits, since running this gate in a fresh clone before `pnpm install` dies
 * on a raw stack trace without it. `reason` is `error.code ?? error.message` from the caught
 * error, the same idiom the sibling gate's read guards use, narrowed HERE to its FIRST LINE:
 * when `pnpm` fails noisily, execFileSync appends the whole stderr dump to `error.message`,
 * and interpolating that raw breaks the opening sentence across several lines, orphans its
 * closing `).`, and pushes the load-bearing "no package was classified" rider down behind a
 * copy of text pnpm has already written to the inherited stderr above. Nothing is lost, and
 * no new resolved string is minted: every mode resolves to one of the two single-line forms
 * already measured and verified. The narrowing is a PRINTING constraint, so it lives here and
 * not at the LicenseEnumeratorError throw site, where it would silently narrow the error for
 * a future consumer that does not print. Anchored byte-exact in
 * check-license-allowlist.test.mjs.
 */
export function composeLicenseEnumeratorUnrunnableMessage(reason) {
  const [firstLine] = reason.split(/\r?\n/, 1)
  return (
    `Licence allow-list gate: the licence enumerator could not be run (${firstLine}).\n\n` +
    `No package was classified, so this run must not be read as a run that classified and ` +
    `passed. This gate reads \`pnpm licenses list --json\`, which needs the workspace's ` +
    `dependencies installed: run \`pnpm install\` and re-run. If it keeps failing with the ` +
    `dependencies installed, open an issue rather than removing this gate from the check ` +
    `chain: a dependency whose licence nothing classified is exactly what this gate exists ` +
    `to notice.`
  )
}

/**
 * Raised by `runLicensesList` (rather than the raw execFileSync error) when the licence
 * enumerator command itself cannot be run.
 */
export class LicenseEnumeratorError extends Error {}

/**
 * Runs `pnpm licenses list [--prod] --json` and returns the parsed JSON
 * (never throws on empty/non-JSON output; see parseLicensesJson). `cwd` defaults to this
 * repo's ROOT (what `main()` actually runs against); exported and parameterised so a test's
 * routing instrument can point it at a scratch pnpm workspace instead of mutating the real
 * repo's dependency graph. Raises `LicenseEnumeratorError` (rather than the raw execFileSync
 * error) when the command itself cannot be run, so `main()` can print the message cleared by
 * the project's licensing steward above instead of an uncaught crash.
 */
export function runLicensesList(extraArgs, cwd = ROOT) {
  let raw
  try {
    // Spawns `pnpm` by name, resolved via PATH. Accepted: this is a repo-only lint script run
    // by this repo's own CI/dev workflows, which already control PATH; there is no untrusted
    // input choosing which `pnpm` runs, and pinning an absolute binary path here would only
    // trade that for a platform-specific path this script would then have to rediscover anyway.
    raw = execFileSync('pnpm', ['licenses', 'list', ...extraArgs, '--json'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    throw new LicenseEnumeratorError(error.code ?? error.message)
  }
  return parseLicensesJson(raw)
}

/**
 * Reading and parsing `license-policy.json` used
 * to be a bare `JSON.parse(readFileSync(...))` inline in `main()`, so a malformed policy file
 * (invalid JSON, not merely the wrong SHAPE `findPolicyShapeViolation` below already guards)
 * died on a raw `SyntaxError` (a real crash with a Node stack trace), not the designed
 * failure message every other failure path in this file prints. Returns `undefined`
 * (never throws) on a parse failure, printing that designed message itself, so `main()`
 * can treat it exactly like the shape violation below.
 */
export function readLicensePolicy(rootDir = ROOT) {
  const policyPath = path.join(rootDir, 'license-policy.json')
  let raw
  try {
    raw = readFileSync(policyPath, 'utf8')
  } catch (error) {
    console.error(
      `Licence allow-list gate: could not read ${policyPath} (${error.code ?? error.message}).\n\n` +
        'No package was classified. Fix or restore the policy file and re-run.',
    )
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error(
      `Licence allow-list gate: ${policyPath} is not valid JSON (${error.message}).\n\n${
        POLICY_FILE_INVALID_GUIDANCE
      }`,
    )
    return undefined
  }
}

/**
 * `prodCount` and `devOnlyCount` are both counts of packages, printed as the two
 * coordinates of one line, with nothing before this asserting they could not be silently
 * swapped. Whether they happen to differ in this workspace on any given day is not a
 * property to rely on: bucket B's population is a fact with its own re-check trigger and it
 * is not recorded here. The fixture supplies values that differ by construction instead.
 *
 * The printed bytes are unchanged by this extraction (byte-identical to the pre-extraction
 * inline form) and were examined and found clean by the project's licensing steward.
 * Re-wrapping is not re-wording; a reword is.
 *
 * Extracting a formatter pins the FORMAT and nothing else: which count reaches which slot is
 * bound at the call site in `main()`, which this function cannot see. That binding carries
 * its own end-to-end test over a scratch project, in check-license-allowlist.test.mjs.
 */
export function formatAllowlistSuccessLine(prodCount, devOnlyCount) {
  return `Licence allow-list gate: ${prodCount} prod package(s), ${devOnlyCount} dev-only package(s), all clear.`
}

/**
 * The line cleared by the project's licensing steward, printed INSTEAD of
 * formatAllowlistSuccessLine when BOTH counts are zero:
 * formatAllowlistSuccessLine(0, 0) reads identically to a real clean pass with only the
 * numerals differing, which published `licensing` overview §4/§5's rider forbids — what a
 * gate prints when it compared nothing must differ from what it prints when it compared
 * and passed. The exit stays 0 deliberately, mirroring the sibling parity gate's own
 * zero-non-private-package branch: a workspace with no dependencies breaches nothing.
 */
export const ALLOWLIST_NOTHING_CLASSIFIED_LINE =
  'Licence allow-list gate: 0 prod package(s) and 0 dev-only package(s) were classified, ' +
  'so this run classified NOTHING and must not be read as a run that classified and passed. ' +
  'Exiting 0 because a workspace with no dependencies breaches nothing. If this workspace ' +
  'does have dependencies, the licence enumerator returned no usable output: run ' +
  '`pnpm install` and re-run.'

/**
 * The two strings a red run prints, verbatim as cleared by the project's licensing steward.
 * Transcribed, not re-worded: a re-wording is a fresh
 * clearance turn, a re-wrapping of the same bytes is not. The guidance block is new: this
 * gate printed no guidance block before it, only the routing parenthetical the header
 * replacement removes. Anchored byte-exact in check-license-allowlist.test.mjs.
 */
export const ALLOWLIST_FAILURE_HEADER =
  'Licence allow-list gate: violations found (do not resolve this in your pull request):\n'

export const ALLOWLIST_FAILURE_GUIDANCE =
  '\nThe allow-list is not a file to edit to make a pull request pass. If you need a ' +
  'dependency whose licence this gate rejects, open an issue naming the package, its version ' +
  'and its licence, and leave it out of the pull request until that issue is answered.'

/**
 * Prints the composed red-run message for `violations` to stderr: the cleared header, one
 * line per violation, then the cleared guidance. This is the exact three-call shape `main()`
 * used to inline, owned here so a test can anchor the COMPOSED output and not only the two
 * constants above, which anchor their own bytes but cannot see whether `main()` still calls
 * them, in this order.
 *
 * It reads the two constants and inlines neither, which is asserted over this function's own
 * source text in check-license-allowlist.test.mjs: an inline copy of the cleared bytes is
 * byte-identical today and free to drift tomorrow, and no output comparison can tell the two
 * apart.
 */
export function reportAllowlistViolations(violations) {
  console.error(ALLOWLIST_FAILURE_HEADER)
  for (const { name, version, license, bucket, reason } of violations) {
    console.error(`  - [bucket ${bucket}] ${name}@${version}: "${license}" — ${reason}`)
  }
  console.error(ALLOWLIST_FAILURE_GUIDANCE)
}

/**
 * Classifies every prod and dev-only package licence in the pnpm project at `rootDir` against
 * that tree's `license-policy.json`, printing the composed red-run message and setting a
 * non-zero exit code on any violation.
 *
 * `rootDir` defaults to this repository's own root, which is what a real run checks. It is a
 * parameter, and this function is exported, so a test can drive the real entry point over a
 * scratch pnpm project (the one `runLicensesList` already accepts a `cwd` for). Without that,
 * a `main()` that stops calling the reporter entirely prints nothing on either stream and
 * still exits 1: the composed-output anchor cannot see it, because it calls the reporter
 * itself.
 */
export function main(rootDir = ROOT) {
  const policy = readLicensePolicy(rootDir)
  if (policy === undefined) {
    process.exitCode = 1
    return
  }

  const shapeViolation = findPolicyShapeViolation(policy)
  if (shapeViolation) {
    console.error(
      `Licence allow-list gate: license-policy.json is malformed. ${shapeViolation}\n\n${
        POLICY_FILE_INVALID_GUIDANCE
      }`,
    )
    process.exitCode = 1
    return
  }

  let prodPackages
  let allPackages
  try {
    prodPackages = flattenLicenseGroups(runLicensesList(['--prod'], rootDir))
    allPackages = flattenLicenseGroups(runLicensesList([], rootDir))
  } catch (error) {
    if (!(error instanceof LicenseEnumeratorError)) throw error
    console.error(composeLicenseEnumeratorUnrunnableMessage(error.message))
    process.exitCode = 1
    return
  }

  const prodKeys = new Set(prodPackages.map((pkg) => `${pkg.name}@${pkg.version}`))
  const devOnlyPackages = allPackages.filter((pkg) => !prodKeys.has(`${pkg.name}@${pkg.version}`))

  const violations = []

  for (const pkg of prodPackages) {
    const { allowed, reason } = classifyBucketB(pkg.license, policy)
    if (!allowed) violations.push({ ...pkg, bucket: 'B (prod)', reason })
  }

  for (const pkg of devOnlyPackages) {
    const { allowed, reason } = classifyBucketC(pkg.license, policy)
    if (!allowed) violations.push({ ...pkg, bucket: 'C (dev)', reason })
  }

  if (violations.length > 0) {
    reportAllowlistViolations(violations)
    process.exitCode = 1
    return
  }

  if (prodPackages.length === 0 && devOnlyPackages.length === 0) {
    console.log(ALLOWLIST_NOTHING_CLASSIFIED_LINE)
    return
  }

  console.log(formatAllowlistSuccessLine(prodPackages.length, devOnlyPackages.length))
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
