#!/usr/bin/env node
/**
 * Tripwire for the project's published licensing requirement.
 *
 * Condition 2 of the published `licensing` overview §2, signed off by the
 * project's maintainer, requires each published tarball to carry its own
 * licence text, and names its remedy in a preference order: "a copy, or a
 * build step, or a verified-packing symlink, in that order of preference".
 * The project took the first — `packages/{tokens,core,bridge,cli}/LICENSE`
 * are copies of the root `LICENSE` — and nothing before this script asserted
 * the copies actually still MATCH the root they were taken from.
 *
 * `pnpm check:pack` (`publint` + `attw`) asserts a `LICENSE` is PRESENT in
 * each packed tarball, never that it agrees with the root. So the equality
 * that makes Condition 2 true was held by whoever remembered to update all
 * five files together, and it had already been exercised once by hand: an
 * earlier review named `LICENSE` and the copyright line turned out to
 * live in five files, caught by the developer-relations reviewer running the
 * class rather than the list. This script converts "whoever remembers" into
 * an assertion.
 *
 * The package set is every directory under `packages/` that carries a
 * manifest, not a hand-listed set, so a new package added there is covered
 * the day it is created. That is the whole workspace only while the workspace
 * is defined as exactly `packages/*`. Scanning a directory cannot establish
 * that, so `findWorkspaceGlobViolation` checks the definition itself before
 * any package is scanned, and refuses rather than reporting a pass over a
 * narrower set than the workspace actually holds. Widening the workspace is
 * therefore a deliberate act that has to change this gate in the same commit.
 * Only NON-PRIVATE packages are checked: a `private: true` package never
 * produces a published tarball, so Condition 2 does not apply to it (mirrors
 * the `!manifest.private` publishable test
 * `scripts/check-publishable-set.mjs` uses for the same reason, on a
 * different question).
 *
 * Source tree only, and deliberately so: a packed tarball's LICENSE presence
 * is already asserted by `check:pack` (`publint`/`attw`), and a byte-copy of
 * the source-tree file is exactly what npm packs (no build step touches
 * `LICENSE`), so re-running this check against `npm pack` output would
 * duplicate the source-tree check without covering anything new.
 *
 * This script decides no licensing question and never will: it is an
 * instrument, in the shape `scripts/check-license-allowlist.mjs` and
 * `scripts/check-bundling-guard-coverage.mjs` already use. Its only job is to
 * make Condition 2's equality trip instead of drifting silently.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * True if `manifest` would ship a published tarball (private packages
 * never do, so Condition 2's per-tarball licence-text requirement does not
 * apply to them). Reused by scripts/check-readme-export-coverage.mjs (a
 * documentation gate) to scope which packages' READMEs
 * it checks; that reuse does not make this predicate a documentation
 * concern — it stays Condition 2's, and moves only for Condition 2
 * reasons.
 */
export function isNonPrivate(manifest) {
  return manifest.private !== true
}

/**
 * Package directory names cleared to carry a third-party attribution section AFTER the
 * root licence text, per the licensing steward's ruling: "The
 * exception is per-package and named, not a general relaxation. A blanket startsWith
 * over all four packages would let any package append anything for ever with the gate
 * green, which trades a real assertion for a convenience." `tokens` carries that ruling's
 * block, appended to packages/tokens/LICENSE after the MIT
 * text. Adding a package here is a review change landing a block cleared by the licensing
 * steward, never a test fixup for a gate that started failing.
 */
export const THIRD_PARTY_SECTION_ALLOWLIST = new Set(['tokens'])

/**
 * True if `dir` (a packages/* directory name) is cleared to carry a third-party
 * attribution section after the root licence text.
 */
export function mayCarryThirdPartySection(dir) {
  return THIRD_PARTY_SECTION_ALLOWLIST.has(dir)
}

/**
 * The reason string, cleared by the project's licensing steward, for a
 * THIRD_PARTY_SECTION_ALLOWLIST package whose LICENSE does not even begin with the root licence
 * text. Condition 2 is not weakened by the allowlist above: an allowlisted package still must
 * carry the root text verbatim, as a prefix; only what may follow it changes. Anchored
 * byte-exact in check-license-parity.test.mjs.
 */
export const LICENSE_PREFIX_MISMATCH_REASON = 'LICENSE does not begin with the root LICENSE text'

/**
True if `content` begins with `rootContent`, byte for byte (Buffer has no startsWith).
 */
function startsWithBuffer(content, rootContent) {
  return (
    content.length >= rootContent.length &&
    content.subarray(0, rootContent.length).equals(rootContent)
  )
}

/**
 * Given the root LICENSE content (a `Buffer`) and a list of
 * `{ name, dir, exists, content }` records for each non-private package,
 * the violations: a missing `LICENSE` file, one whose content differs
 * from the root byte for byte, or — for a THIRD_PARTY_SECTION_ALLOWLIST
 * package — one that does not even begin with the
 * root text.
 */
export function findLicenseMismatches(rootContent, packages) {
  const violations = []
  for (const pkg of packages) {
    if (!pkg.exists) {
      violations.push({ name: pkg.name, dir: pkg.dir, reason: 'no LICENSE file' })
      continue
    }
    if (mayCarryThirdPartySection(pkg.dir)) {
      if (!startsWithBuffer(pkg.content, rootContent)) {
        violations.push({ name: pkg.name, dir: pkg.dir, reason: LICENSE_PREFIX_MISMATCH_REASON })
      }
      continue
    }
    if (!pkg.content.equals(rootContent)) {
      violations.push({
        name: pkg.name,
        dir: pkg.dir,
        reason: 'LICENSE differs from the root LICENSE',
      })
    }
  }
  return violations
}

/**
Workspace package directory names under `packagesDir`, sorted for stable output.
 */
function listPackageDirs(packagesDir) {
  return readdirSync(packagesDir)
    .filter((entry) => statSync(path.join(packagesDir, entry)).isDirectory())
    .sort()
}

/**
 * The refusal, cleared by the project's licensing steward, this gate prints when
 * `pnpm-workspace.yaml` cannot confirm the
 * `packages/*` assumption `findWorkspaceGlobViolation` below exists to check.
 * Transcribed, not re-worded. Anchored byte-exact in
 * check-license-parity.test.mjs.
 */
export const WORKSPACE_GLOB_VIOLATION_MESSAGE =
  'License parity gate: refusing to run. This gate takes the package set from the `packages/` ' +
  'directory, which is the whole workspace only while the pnpm workspace is defined as exactly ' +
  '`packages/*`, and that could not be confirmed from `pnpm-workspace.yaml` as it now reads. ' +
  'Nothing has been compared. If the workspace has genuinely widened, teach this gate the new ' +
  "layout in the same change that widens it; if only the file's shape moved, update this check " +
  'to match. Do not delete the check to get a green run: a package outside `packages/` would ' +
  'then publish with its LICENSE never compared to the root.'

/**
 * Reads `rootDir/pnpm-workspace.yaml` and confirms the ONE fact this gate depends on: the
 * workspace's top-level `packages:` block-list key is exactly `['packages/*']`. Every other
 * top-level key in the file (`onlyBuiltDependencies`, `overrides`, anything else pnpm keeps
 * there) is ignored on purpose: this must not refuse because an unrelated key was added or
 * changed.
 *
 * No YAML-parsing dependency: this repo has none of its own, and adding one for a single key
 * was rejected on the issue thread. Instead: find the line matching `^packages:\s*$` (a
 * block-style key with nothing inline after the colon). A `packages:` line that is NOT
 * block-style (something inline, e.g. a flow-style list) cannot be cheaply and correctly
 * parsed here, so that shape is treated as "cannot confirm" too. Then read the block sequence
 * that follows, collecting every line matching `^\s*-\s*(.+)$` and stripping surrounding
 * quotes from the captured value. A blank line and a whole-line comment inside the sequence
 * are SKIPPED rather than stopped on: both are lawful there, pnpm resolves such a file as one
 * list (verified by running it), and stopping on them would read only a PREFIX of the
 * sequence. The block ends at the first line that is none of those three. After both skips, a
 * line whose leading indentation contains a TAB character refuses immediately rather than being
 * read as an item: pnpm itself fatally refuses a `pnpm-workspace.yaml` that indents a list ITEM
 * with a tab (verified by running it), while tolerating one that indents a comment or a blank
 * line there, so this gate must not report a pass over a file whose item lines pnpm itself
 * refuses to parse.
 *
 * That asymmetry is the property to preserve if this is ever rewritten: `null` must never be
 * reachable from a PARTIAL read. Returning `null` asserts that the whole `packages:` list was
 * seen and held exactly `packages/*`; a scan that stopped early has confirmed nothing about
 * what follows it, and this gate would then compare the `packages/` directory while the
 * workspace held members outside it. Every shape this parser does not handle resolves the
 * other way, to the refusal, which is safe because the refusal claims only that the fact could
 * not be confirmed: a trailing comment after an item's value, a trailing comment after
 * `packages:`, and a `---` document separator are all read as "cannot confirm" rather than
 * special-cased, and each is a false red at worst.
 *
 * Returns `null` when the collected list is exactly `['packages/*']`. Returns
 * `WORKSPACE_GLOB_VIOLATION_MESSAGE` otherwise: the file is unreadable or missing (wrapped in
 * try/catch so a missing file reaches this designed refusal, never an uncaught ENOENT), the
 * `packages:` key is absent, it is not block-style, a tab-indented item line was found inside
 * the sequence, or the collected list is not exactly that one entry.
 */
export function findWorkspaceGlobViolation(rootDir = ROOT) {
  const workspacePath = path.join(rootDir, 'pnpm-workspace.yaml')
  let raw
  try {
    raw = readFileSync(workspacePath, 'utf8')
  } catch {
    return WORKSPACE_GLOB_VIOLATION_MESSAGE
  }

  const lines = raw.split('\n')
  const keyIndex = lines.findIndex((line) => line.startsWith('packages:'))
  if (keyIndex === -1) return WORKSPACE_GLOB_VIOLATION_MESSAGE

  const afterColon = lines[keyIndex].slice('packages:'.length)
  if (afterColon.trim() !== '') return WORKSPACE_GLOB_VIOLATION_MESSAGE

  const items = []
  for (let i = keyIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    if (/^[ \t]*\t/.test(line)) return WORKSPACE_GLOB_VIOLATION_MESSAGE
    const match = /^\s*-\s*(.+)$/.exec(line)
    if (!match) break
    let value = match[1].trim()
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1)
    }
    items.push(value)
  }

  if (items.length === 1 && items[0] === 'packages/*') return null
  return WORKSPACE_GLOB_VIOLATION_MESSAGE
}

/**
 * The two strings a red run prints, verbatim as cleared by the project's licensing steward.
 * Transcribed, not re-worded: a re-wording is a fresh
 * clearance turn, a re-wrapping of the same bytes is not. The requirement sentence stays
 * because it is this file's own encoded position, but it was restated rather than kept
 * verbatim: the citations and the persona went, the subject moved from the published
 * tarball to the published package, the modality from "Condition 2 requires" to a bare
 * "must", and the closing sentence now forbids changing the licence text in a pull request
 * rather than only forbidding silencing the check. The published position is unchanged;
 * these are the cleared bytes, not a paraphrase of them.
 * Anchored byte-exact in check-license-parity.test.mjs.
 */
export const PARITY_FAILURE_HEADER =
  'License parity gate: package LICENSE files do not match the root LICENSE:\n'

/**
 * The sentence, cleared by the project's licensing steward, acknowledging
 * THIRD_PARTY_SECTION_ALLOWLIST, appended to
 * PARITY_FAILURE_GUIDANCE after its existing last sentence, nothing else in the guidance
 * moving. Anchored byte-exact,
 * standalone, in check-license-parity.test.mjs — its own byte count (139) is measured on
 * the sentence alone, before the leading space PARITY_FAILURE_GUIDANCE joins it with.
 */
export const THIRD_PARTY_SECTION_GUIDANCE =
  'A package may carry a third-party attribution section after the licence text; that ' +
  'section is additional and never replaces any part of it.'

export const PARITY_FAILURE_GUIDANCE =
  `\nEach published package must ship its own licence text, matching the repository root ` +
  `LICENSE verbatim. Copy the current root LICENSE into the named package(s). If a different ` +
  `remedy is intended (a build step, or a verified-packing symlink), do not change the licence ` +
  `text in your pull request: open an issue proposing it instead. ${THIRD_PARTY_SECTION_GUIDANCE}`

/**
 * Prints the composed red-run message for `violations` to stderr: the cleared header, one
 * line per violation, then the cleared guidance. This is the exact three-call shape `main()`
 * used to inline, owned here so a test can anchor the COMPOSED output and not only the two
 * constants above, which anchor their own bytes but cannot see whether `main()` still calls
 * them, in this order.
 *
 * It reads the two constants and inlines neither, which is asserted over this function's own
 * source text in check-license-parity.test.mjs: an inline copy of the cleared bytes is
 * byte-identical today and free to drift tomorrow, and no output comparison can tell the two
 * apart.
 */
export function reportLicenseParityViolations(violations) {
  console.error(PARITY_FAILURE_HEADER)
  for (const { name, dir, reason } of violations) {
    console.error(`  - ${name} (packages/${dir}/LICENSE): ${reason}`)
  }
  console.error(PARITY_FAILURE_GUIDANCE)
}

/**
 * The message, cleared by the project's licensing steward, printed when the repository root
 * LICENSE cannot be read at all, before any package is compared. `reason` is `error.code ??
 * error.message` from the caught read error — the same idiom `check-license-allowlist.mjs`'s
 * `readLicensePolicy` already uses for its own ENOENT branch. Extracted into its own function
 * rather than inlined in `main()`, so a test can pin these bytes independently of whether
 * `main()` still calls it (mirrors `reportLicenseParityViolations` above). Anchored byte-exact
 * in check-license-parity.test.mjs.
 */
export function composeLicenseUnreadableMessage(licensePath, reason) {
  return (
    `License parity gate: the repository root LICENSE could not be read (${licensePath}: ${
      reason
    }).\n\n` +
    `No package was compared, so this run must not be read as a run that compared and passed. ` +
    `Restore the root LICENSE and re-run. If the licence text is meant to change, do not change ` +
    `it in a pull request: open an issue proposing it instead.`
  )
}

/**
 * The message, cleared by the project's licensing steward, printed when a package manifest
 * is not valid JSON, refusing on the FIRST bad manifest rather than skipping it and
 * scanning past it: a skipped-and-continued package is a worse defect than a crash, per this
 * file's own "a run that compared nothing must not read as a run that compared and passed"
 * rider, applied per-package here. Deliberately asymmetric with
 * `composeLicenseUnreadableMessage`: no closing "open an issue" sentence, because a malformed
 * manifest is not a licensing question. Anchored byte-exact in check-license-parity.test.mjs.
 */
export function composeManifestInvalidJsonMessage(manifestPath, errorMessage) {
  return (
    `License parity gate: ${manifestPath} is not valid JSON (${errorMessage}).\n\n` +
    `No package was compared, so this run must not be read as a run that compared and passed. ` +
    `Repair the manifest and re-run.`
  )
}

/**
 * The message, cleared by the project's licensing steward, printed when a non-private
 * package's own LICENSE cannot be read
 * at all, after the workspace and root-LICENSE guards above it have
 * already passed. `reason` is `error.code ?? error.message` from the caught read error, the
 * same idiom `composeLicenseUnreadableMessage` above already uses. Extracted into its own
 * function rather than inlined in `main()`, so a test can pin these bytes independently of
 * whether `main()` still calls it. Anchored byte-exact in check-license-parity.test.mjs.
 */
export function composePackageLicenseUnreadableMessage(licensePath, reason) {
  return (
    `License parity gate: a package LICENSE could not be read (${licensePath}: ${reason}).\n\n` +
    `No package was compared, so this run must not be read as a run that compared and passed. ` +
    `Make that file readable and re-run. If the licence text is meant to change, do not change ` +
    `it in a pull request: open an issue proposing it instead.`
  )
}

/**
 * The message, cleared by the project's licensing steward, printed when the `packages/`
 * directory itself cannot be
 * listed — a missing `packages/` directory, or an entry under it that cannot be `stat`-ed
 * (a dangling symlink, or a readdir/stat race) — before any package is examined (the same
 * fact to a reader regardless of which of the two calls failed, so ONE message
 * covers both). `reason` is `error.code ?? error.message` from the caught error, the same
 * idiom every other read guard in this file uses. Anchored byte-exact in
 * check-license-parity.test.mjs.
 */
export function composePackageListUnreadableMessage(packagesDir, reason) {
  return (
    `License parity gate: the package list could not be read (${packagesDir}: ${reason}).\n\n` +
    `No package was compared, so this run must not be read as a run that compared and passed. ` +
    `This gate takes the package set from the \`packages/\` directory, having already confirmed ` +
    `the workspace is defined as exactly \`packages/*\`, so it expects that directory to exist ` +
    `and every entry in it to be readable. Repair the tree and re-run.`
  )
}

/**
 * The message, cleared by the project's licensing steward, printed when a package manifest
 * parses as valid JSON but is not a usable manifest object: `null`, an array, a string, a
 * number, or a boolean. Keyed on "not a usable manifest object" rather than on `null` alone,
 * because every other non-object shape raises no exception at all and instead produces a
 * printed FALSE PASS — `main()` would report a real "N non-private package LICENSE file(s)
 * match" over a directory never established to be a package, which is worse in kind than the
 * crash `null` alone would catch. `parsedAs` is a short descriptor of what the value actually
 * parsed to (`describeManifestShape` below computes it: `'null'`, `'an array'`, `'a string'`,
 * `'a number'`, `'a boolean'`). Extracted into its own function rather than inlined in
 * `main()`, so a test can pin these bytes independently of whether `main()` still calls it.
 * Anchored byte-exact in check-license-parity.test.mjs.
 */
export function composeManifestNotAnObjectMessage(manifestPath, parsedAs) {
  return (
    `License parity gate: ${
      manifestPath
    } is valid JSON but is not a package manifest (it parsed to ${parsedAs}, not an object).\n\n` +
    `No package was compared, so this run must not be read as a run that compared and passed. ` +
    `Repair the manifest and re-run.`
  )
}

/**
 * A short descriptor of a parsed-JSON value that is not a usable manifest object, for
 * `composeManifestNotAnObjectMessage`'s `parsedAs` parameter. `typeof null === 'object'` in
 * JavaScript, so `null` and arrays both need their own check ahead of the `typeof` fallback.
 */
function describeManifestShape(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'string') return 'a string'
  if (typeof value === 'number') return 'a number'
  if (typeof value === 'boolean') return 'a boolean'
  return typeof value
}

/**
 * Reads every non-private package under `packagesDir` into the `{ name, dir, exists, content }`
 * records `findLicenseMismatches` takes, counting into `census` the directories scanned and the
 * two reasons one is skipped (no manifest, private package) that both success lines report.
 *
 * Returns `null` when a tree fault stops the scan, having ALREADY printed this gate's designed
 * refusal for that fault and set the exit code, so its caller returns without printing a second
 * verdict over the first. Lifted out of `main()` with its behaviour unchanged, one fault path at
 * a time, when bringing `scripts/` into eslint's scope made `main()` exceed
 * `max-lines-per-function` and `complexity` once the package-list guard and
 * the section census had both landed in it.
 */
function collectNonPrivatePackages(packagesDir, packageDirs, census) {
  const packages = []
  for (const dir of packageDirs) {
    census.scanned += 1
    const manifestPath = path.join(packagesDir, dir, 'package.json')
    if (!existsSync(manifestPath)) {
      census.skippedNoManifest += 1
      continue
    }
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      console.error(composeManifestInvalidJsonMessage(manifestPath, error.message))
      process.exitCode = 1
      return null
    }
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      console.error(
        composeManifestNotAnObjectMessage(manifestPath, describeManifestShape(manifest)),
      )
      process.exitCode = 1
      return null
    }
    if (!isNonPrivate(manifest)) {
      census.skippedPrivate += 1
      continue
    }

    const licensePath = path.join(packagesDir, dir, 'LICENSE')
    const exists = existsSync(licensePath)
    let content = null
    if (exists) {
      try {
        content = readFileSync(licensePath)
      } catch (error) {
        console.error(
          composePackageLicenseUnreadableMessage(licensePath, error.code ?? error.message),
        )
        process.exitCode = 1
        return null
      }
    }
    packages.push({
      name: manifest.name ?? dir,
      dir,
      exists,
      content,
    })
  }
  return packages
}

/**
 * Compares every non-private package's LICENSE under `rootDir` against that tree's root
 * LICENSE, printing the composed red-run message and setting a non-zero exit code when any
 * of them differs or is missing.
 *
 * `rootDir` defaults to this repository's own root, which is what a real run checks. It is a
 * parameter, and this function is exported, so a test can drive the real entry point over a
 * scratch tree. Without that, a `main()` that stops calling the reporter entirely prints
 * nothing on either stream and still exits 1: the composed-output anchor cannot see it,
 * because it calls the reporter itself.
 */
export function main(rootDir = ROOT) {
  const workspaceGlobViolation = findWorkspaceGlobViolation(rootDir)
  if (workspaceGlobViolation !== null) {
    console.error(workspaceGlobViolation)
    process.exitCode = 1
    return
  }

  const packagesDir = path.join(rootDir, 'packages')
  const rootLicensePath = path.join(rootDir, 'LICENSE')
  let rootContent
  try {
    rootContent = readFileSync(rootLicensePath)
  } catch (error) {
    console.error(composeLicenseUnreadableMessage(rootLicensePath, error.code ?? error.message))
    process.exitCode = 1
    return
  }

  let packageDirs
  try {
    packageDirs = listPackageDirs(packagesDir)
  } catch (error) {
    console.error(composePackageListUnreadableMessage(packagesDir, error.code ?? error.message))
    process.exitCode = 1
    return
  }

  const census = { scanned: 0, skippedNoManifest: 0, skippedPrivate: 0 }
  const packages = collectNonPrivatePackages(packagesDir, packageDirs, census)
  if (packages === null) return
  const { scanned, skippedNoManifest, skippedPrivate } = census

  const violations = findLicenseMismatches(rootContent, packages)

  if (violations.length > 0) {
    reportLicenseParityViolations(violations)
    process.exitCode = 1
    return
  }

  if (packages.length === 0) {
    // A run that compared nothing must not read as a run that compared and passed (published
    // `licensing` overview §4/§5's rider). Two halves, both load-bearing. The closing clause
    // names what the branch actually tested, an empty non-private set, and not why it is empty:
    // a set emptied by directories carrying no package.json is not an all-private workspace.
    // The census is what tells a legitimately empty set from one emptied by a discovery that
    // skipped everything. The exit stays 0 in both cases, because a package that publishes no
    // tarball breaches nothing; the defect this wording fixes is the explanation, never the
    // exit.
    console.log(
      'License parity gate: 0 non-private package(s) examined, so this run compared NOTHING ' +
        `and must not be read as a run that compared and passed; ${scanned} director(ies) ` +
        `under packages/ were scanned, ${skippedPrivate} skipped because a private package ` +
        `publishes no tarball and ${skippedNoManifest} skipped for carrying no package.json. ` +
        'Exiting 0 because an empty non-private set is a legitimate state, not because ' +
        'anything was checked.',
    )
    return
  }

  const withSection = packages.filter(
    (pkg) => mayCarryThirdPartySection(pkg.dir) && pkg.content.length > rootContent.length,
  ).length
  const exact = packages.length - withSection

  console.log(
    `License parity gate: ${packages.length} non-private package LICENSE file(s) carry the ` +
      `root LICENSE text (${exact} byte-identical to it, ${withSection} carrying a third-party ` +
      `attribution section after it); ${scanned} director(ies) under packages/ were scanned, ` +
      `${skippedPrivate} skipped because a private package publishes no tarball and ` +
      `${skippedNoManifest} skipped for carrying no package.json.`,
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
