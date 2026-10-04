#!/usr/bin/env node
/**
 * Tripwire for the current launch-scope call on which packages publish.
 *
 * A real release ends in `stage-release.mjs`, which selects the packages to
 * publish by importing `isPublishable` below: every workspace package whose
 * manifest is not `private: true`. So the ONE thing that keeps a workspace
 * package off npm on a real release is its own manifest's `private: true`,
 * and nothing before this script asserted that the set of non-private
 * packages matched the publishing scope decided for this release.
 *
 * Exactly `@navecss/tokens`, `@navecss/core`, `@navecss/stylelint-config` and
 * `@navecss/eslint-plugin` are meant to publish (`@navecss/bridge` publishes
 * the first time it ships non-empty content; `@navecss/cli` stays unpublished
 * until the component registry exists). `@navecss/stylelint-config` and
 * `@navecss/eslint-plugin` both version independently of the `tokens`/`core`
 * pair: neither shares that pair's token/component contract (`stylelint-config`'s
 * is with Stylelint and the `@nave` grammar; `eslint-plugin`'s is with ESLint
 * and a peer range on `@navecss/core`, never a `fixed` group). This script
 * fails the moment a
 * workspace package's `private` field stops matching that set — in either
 * direction, so a package that SHOULD stay private losing that field is
 * caught, and so is a package that should start publishing being left
 * `private: true` by mistake.
 *
 * The same gate also asserts that no package in the set is on `.changeset/config.json`'s
 * `ignore` list. `changeset version` skips every package named there, private or not, so a
 * package promoted to published but left on that list is never bumped and its changesets are
 * skipped; a changeset naming an ignored and a non-ignored package together fails outright.
 * Promoting a private package is therefore three edits in one pull request: drop `private`,
 * join `PUBLISHABLE_SET`, come off `ignore`. An "ignore" entry that is not a plain package name
 * (a glob or a negation, which Changesets expands) is refused rather than expanded: this gate
 * compares exact names, and the first pull request to need a pattern there extends it.
 *
 * This script decides no product or launch-scope question and never will:
 * PUBLISHABLE_SET is the current scope call, not
 * derived here. Its only job is to make a manifest drifting from that
 * call trip instead of rotting silently until a real release finds out on
 * release day.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findWorkspaceGlobViolation } from './check-license-parity.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
The set of package names meant to publish at 0.1.0.
 */
export const PUBLISHABLE_SET = new Set([
  '@navecss/tokens',
  '@navecss/core',
  '@navecss/stylelint-config',
  '@navecss/eslint-plugin',
])

// A plain npm package name, scoped or not; anything else (a glob, a negation, an empty string) is
// refused because this gate compares exact names and does not expand patterns.
const PLAIN_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

/**
 * This gate's own refusal, printed when `findWorkspaceGlobViolation` (imported from
 * check-license-parity.mjs) cannot confirm the workspace is still
 * exactly `packages/*`. This script states no licensing position, so unlike its sibling's
 * cleared bytes, this wording needs no licensing review: it is ordinary
 * mechanism prose,
 * scoped to this gate's own concern: matching workspace scope against PUBLISHABLE_SET.
 */
export const WORKSPACE_GLOB_VIOLATION_MESSAGE =
  'Publishable-set gate: refusing to run. This gate takes the package set from the ' +
  '`packages/` directory, which is the whole workspace only while the pnpm workspace is ' +
  'defined as exactly `packages/*`, and that could not be confirmed from ' +
  '`pnpm-workspace.yaml` as it now reads. Nothing has been compared against ' +
  'the set this repository intends to publish. If the workspace has genuinely widened, teach this gate the ' +
  "new layout in the same change that widens it; if only the file's shape moved, update " +
  'this check to match. Do not delete the check to get a green run: a package outside ' +
  '`packages/` could then publish unmeasured against the launch scope call.'

/**
 * This gate's own message when a workspace manifest cannot be parsed as JSON at all, printed
 * after the workspace-glob guard above has already passed. This file states no licensing
 * position, so this wording needs no licensing review, the same reasoning
 * WORKSPACE_GLOB_VIOLATION_MESSAGE above already carries. Ordinary mechanism prose, scoped to
 * this gate's own concern (PUBLISHABLE_SET) and never reusing the license-parity gate's cleared
 * bytes.
 */
export function composeManifestUnreadableMessage(manifestPath, reason) {
  return (
    `Publishable-set gate: refusing to run. ${manifestPath} is not valid JSON (${
      reason
    }). Nothing has been compared against the set this repository intends to publish. Repair the manifest and ` +
    `re-run.`
  )
}

/**
 * This gate's own message when a workspace manifest parses as valid JSON but is not a usable
 * manifest object (`null`, an array, a string, a number, or a boolean), printed after the
 * JSON-parse guard above has already passed. Mirrors the sibling gate's
 * `composeManifestNotAnObjectMessage` mechanism: every one of
 * those shapes crashes `isPublishable`'s `manifest.private` read the same way `null` alone did
 * before this guard existed for `null`, an array or a string do not crash but instead
 * misattribute a false failure to the wrong packages (this gate would report the manifest
 * itself as unexpectedly publishable under an `undefined` name, and separately misreport the
 * real set members as unexpectedly private, since they were never scanned). Ordinary mechanism
 * prose, scoped to this gate's own concern (PUBLISHABLE_SET) and
 * never reusing the license-parity gate's cleared bytes, the same convention
 * `composeManifestUnreadableMessage` above already follows.
 */
export function composeManifestNotAnObjectMessage(manifestPath, parsedAs) {
  return (
    `Publishable-set gate: refusing to run. ${
      manifestPath
    } is valid JSON but is not a package manifest (it parsed to ${
      parsedAs
    }, not an object). Nothing has been compared against the set this repository intends to publish. Repair ` +
    `the manifest and re-run.`
  )
}

/**
 * This gate's own message when the `packages/` directory itself cannot be listed — a
 * missing directory, or an entry that cannot be `stat`-ed (a dangling symlink, or a
 * readdir/stat race) — before any manifest is examined. This gate states no licensing
 * position, so unlike its sibling's cleared bytes for the same fault, this wording needs
 * no licensing review and never reuses check-license-parity.mjs's cleared
 * bytes — it mirrors this file's own composeManifestUnreadableMessage convention instead.
 */
export function composePackageListUnreadableMessage(packagesDir, reason) {
  return (
    `Publishable-set gate: refusing to run. ${packagesDir} could not be read (${
      reason
    }). Nothing has been compared against the set this repository intends to publish. Repair the tree and ` +
    `re-run.`
  )
}

/**
 * This gate's own message when `.changeset/config.json` cannot be used to read the `ignore`
 * list: missing, not valid JSON, or not a config object with an array `ignore`. `reason` names
 * which. Reading any of those as an empty list would let a set member on the list pass, so
 * the gate refuses instead, as it does for an unreadable manifest.
 */
export function composeChangesetConfigUnusableMessage(configPath, reason) {
  return (
    `Publishable-set gate: refusing to run. ${configPath} ${reason}. Nothing has been ` +
    `compared against the Changesets "ignore" list. Repair the file and re-run.`
  )
}

/**
 * The members of `PUBLISHABLE_SET` named in a Changesets `ignore` list. In the set's own
 * declaration order, which is the same on every runner.
 */
function findIgnoredSetMembers(ignore) {
  return [...PUBLISHABLE_SET].filter((name) => ignore.includes(name))
}

/**
 * The `ignore` list of a parsed Changesets config, or the reason it cannot be read: the
 * config must be an object, and `ignore` (absent means empty, Changesets' own default) must be
 * an array of strings, each a plain package name.
 */
function readIgnoreList(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { reason: 'is not a usable Changesets config (it is not an object)' }
  }
  if (config.ignore === undefined) return { ignore: [] }
  if (!Array.isArray(config.ignore) || config.ignore.some((entry) => typeof entry !== 'string')) {
    return { reason: 'is not a usable Changesets config ("ignore" is not an array of strings)' }
  }
  const unusableEntry = config.ignore.find((entry) => !PLAIN_PACKAGE_NAME.test(entry))
  if (unusableEntry !== undefined) {
    return {
      reason: `is not a usable Changesets config ("ignore" entry ${JSON.stringify(unusableEntry)} is not a plain package name, and this gate compares exact names without expanding patterns)`,
    }
  }
  return { ignore: config.ignore }
}

/**
 * The Changesets `ignore` list under `rootDir`, or the refusal message to print when
 * `.changeset/config.json` is missing, not valid JSON, or not a usable config.
 */
function loadIgnoreList(rootDir) {
  const configPath = path.join(rootDir, '.changeset', 'config.json')
  let rawConfig
  try {
    rawConfig = readFileSync(configPath, 'utf8')
  } catch (error) {
    const reason = `could not be read (${error.code ?? error.message})`
    return { refusal: composeChangesetConfigUnusableMessage(configPath, reason) }
  }
  let config
  try {
    config = JSON.parse(rawConfig)
  } catch (error) {
    const reason = `is not valid JSON (${error.message})`
    return { refusal: composeChangesetConfigUnusableMessage(configPath, reason) }
  }
  const { ignore, reason } = readIgnoreList(config)
  if (reason !== undefined) {
    return { refusal: composeChangesetConfigUnusableMessage(configPath, reason) }
  }
  return { ignore }
}

/**
 * Prints the ignore-list fault: the set members found on the list, and how to fix it.
 */
function reportIgnoredSetMembers(names) {
  console.error('The Changesets "ignore" list names packages this repository intends to publish:\n')
  for (const name of names) {
    console.error(
      `  - ${name}: in the publishable set but listed in "ignore" in .changeset/config.json`,
    )
  }
  console.error(
    '\nChangesets never versions a package on that list. Remove each one from "ignore" in ' +
      '.changeset/config.json, in the same pull request that adds it to PUBLISHABLE_SET.',
  )
}

/**
 * A short descriptor of a parsed-JSON value that is not a usable manifest object, for
 * `composeManifestNotAnObjectMessage`'s `parsedAs` parameter. `typeof null === 'object'` in
 * JavaScript, so `null` and arrays both need their own check ahead of the `typeof` fallback.
 * A local copy of the sibling gate's same-shaped (unexported) helper: kept duplicated rather
 * than imported, since this file must never reach into the parity gate's cleared bytes.
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
Workspace package directory names under `packagesDir`, sorted for stable output.
 */
function listPackageDirs(packagesDir) {
  return readdirSync(packagesDir)
    .filter((entry) => statSync(path.join(packagesDir, entry)).isDirectory())
    .sort()
}

/**
 * True if `manifest` would be published by a real release: the
 * `!pkg.packageJson.private` filter `@changesets/cli` uses, which
 * `stage-release.mjs` applies through this function.
 */
export function isPublishable(manifest) {
  return manifest.private !== true
}

/**
 * Given every workspace manifest, the mismatches against `PUBLISHABLE_SET`:
 * a publishable package not in the set, or a set member not publishable.
 */
export function findMismatches(manifests) {
  const publishable = new Set(manifests.filter((m) => isPublishable(m)).map((m) => m.name))

  const unexpectedlyPublishable = [...publishable].filter((name) => !PUBLISHABLE_SET.has(name))
  const unexpectedlyPrivate = [...PUBLISHABLE_SET].filter((name) => !publishable.has(name))

  return { unexpectedlyPublishable, unexpectedlyPrivate }
}

/**
 * `rootDir` defaults to this repository's own root, which is what a real run checks. It is a
 * parameter, and this function is exported, so a test can drive the real entry point over a
 * scratch tree (mirrors the sibling gate's testable shape, check-license-parity.mjs's
 * `main(rootDir = ROOT)`).
 */
export function main(rootDir = ROOT) {
  const workspaceGlobViolation = findWorkspaceGlobViolation(rootDir)
  if (workspaceGlobViolation !== null) {
    console.error(WORKSPACE_GLOB_VIOLATION_MESSAGE)
    process.exitCode = 1
    return
  }

  const packagesDir = path.join(rootDir, 'packages')
  let packageDirs
  try {
    packageDirs = listPackageDirs(packagesDir)
  } catch (error) {
    console.error(composePackageListUnreadableMessage(packagesDir, error.code ?? error.message))
    process.exitCode = 1
    return
  }

  const manifests = []
  for (const dir of packageDirs) {
    const manifestPath = path.join(packagesDir, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      console.error(composeManifestUnreadableMessage(manifestPath, error.message))
      process.exitCode = 1
      return
    }
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      console.error(
        composeManifestNotAnObjectMessage(manifestPath, describeManifestShape(manifest)),
      )
      process.exitCode = 1
      return
    }
    manifests.push(manifest)
  }

  const { unexpectedlyPublishable, unexpectedlyPrivate } = findMismatches(manifests)

  if (unexpectedlyPublishable.length > 0 || unexpectedlyPrivate.length > 0) {
    console.error(
      'The publishable package set does not match the set this repository intends to publish:\n',
    )
    for (const name of unexpectedlyPublishable) {
      console.error(`  - ${name}: publishable (no "private": true) but not in the expected set`)
    }
    for (const name of unexpectedlyPrivate) {
      console.error(`  - ${name}: "private": true but expected to publish at 0.1.0`)
    }
    console.error(
      '\nIf this is a deliberate scope change, update PUBLISHABLE_SET in ' +
        'scripts/check-publishable-set.mjs alongside the manifest change. Making a package ' +
        'publish for the first time is a release decision and not only a manifest edit: do not ' +
        'flip it in a pull request on its own, open an issue proposing it.',
    )
    process.exitCode = 1
    return
  }

  const { ignore, refusal } = loadIgnoreList(rootDir)
  if (refusal !== undefined) {
    console.error(refusal)
    process.exitCode = 1
    return
  }

  const ignoredSetMembers = findIgnoredSetMembers(ignore)
  if (ignoredSetMembers.length > 0) {
    reportIgnoredSetMembers(ignoredSetMembers)
    process.exitCode = 1
    return
  }

  // Plain `.sort()`: code-unit order is the same on every CI runner, where `localeCompare` would
  // follow the runner's locale.
  console.log(
    `Publishable set: exactly {${[...PUBLISHABLE_SET].sort().join(', ')}} would publish, as intended.`,
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
