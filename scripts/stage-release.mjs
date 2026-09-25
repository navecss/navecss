#!/usr/bin/env node
/**
 * The last step of the root `release` script: STAGE each publishable package on npm, never
 * publish it.
 *
 * A staged version is uploaded but not installable. It waits in the package's staging queue
 * until a maintainer approves it with two-factor authentication (`npm stage approve <id>`, or
 * the Staged Packages tab on npmjs.com). Run from `.github/workflows/release.yml`, npm
 * authenticates through the workflow's OIDC token against the package's trusted-publisher
 * entry, which allows staging only, and attaches provenance on its own for a public repository
 * and a public package. So the pipeline that builds a release can never make it live: that
 * takes a second credential, a person's, at approval time.
 *
 * WHY PACK WITH PNPM FIRST. `@navecss/core` depends on `@navecss/tokens` through `workspace:^`,
 * which only pnpm rewrites to a real range, and only when it packs. `npm stage publish` is
 * unaware of workspaces, but it accepts a tarball path (it is `npm publish`'s own code with the
 * upload switched to staging, checked in the npm 12.1.0 source), so each package is packed by
 * `pnpm pack` and that exact tarball is what gets staged.
 *
 * No lifecycle script runs on this path: npm runs `prepublishOnly` only for a directory, never
 * for a tarball. The release script runs the whole-workspace gates (`check:pack`, the orphaned
 * chunk check) before this step for that reason.
 *
 * WHAT IT STAGES: every non-private workspace package (the filter `check-publishable-set.mjs`
 * already pins against the intended set) whose manifest version is not on the registry yet, in
 * dependency order, which is also the order to approve them in: approving `core` before the
 * `tokens` version it depends on would leave a live `core` whose dependency does not resolve.
 * A version that is already live is skipped. A run with nothing to stage fails, because on a
 * release that almost always means `pnpm changeset version` was not run first.
 *
 * Every package is packed FIRST, as one pass, before any of them is staged: a pack failure never
 * leaves a partial staging behind. Staging then runs in order, and if one package fails to
 * stage, the failure names every package already staged and waiting for approval (or says
 * plainly that nothing was staged yet), so a maintainer knows what state the queue was left in
 * without re-reading the whole log.
 *
 * It refuses to run on an npm older than 11.15.0, the first version with `npm stage`.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isPublishable } from './check-publishable-set.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
The first npm CLI version that has the `stage` command.
 */
export const NPM_STAGE_FLOOR = '11.15.0'

const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']

/**
`[major, minor, patch]` of a plain `x.y.z` version, or null for anything else.
 */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  return match ? match.slice(1).map(Number) : null
}

/**
 * True if `version` (as printed by `npm --version`) is at or above `NPM_STAGE_FLOOR`, compared
 * numerically. An unreadable version never meets it.
 */
export function meetsStageFloor(version) {
  const actual = parseVersion(version)
  if (actual === null) return false
  const floor = parseVersion(NPM_STAGE_FLOOR)
  const firstDifference = floor.findIndex((part, index) => actual[index] !== part)
  return firstDifference === -1 || actual[firstDifference] > floor[firstDifference]
}

/**
The npm arguments that stage a packed tarball.
 */
export function stagePublishArgs(tarballPath) {
  return ['stage', 'publish', tarballPath]
}

/**
Names of the packages in `byName` that `manifest` depends on at install time.
 */
function workspaceDependencies(manifest, byName) {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})).filter((name) =>
    byName.has(name),
  )
}

/**
 * `manifests` ordered so every package comes after the workspace packages it depends on, input
 * order kept otherwise. Throws on a dependency cycle, which has no order to approve in.
 */
function dependencyOrder(manifests) {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
  const ordered = []
  const placed = new Set()
  const visiting = new Set()
  const visit = (manifest) => {
    if (placed.has(manifest.name)) return
    if (visiting.has(manifest.name)) {
      throw new Error(
        `Staging: a dependency cycle runs through ${manifest.name}; there is no order to stage in.`,
      )
    }
    visiting.add(manifest.name)
    for (const name of workspaceDependencies(manifest, byName)) visit(byName.get(name))
    visiting.delete(manifest.name)
    placed.add(manifest.name)
    ordered.push(manifest)
  }
  for (const manifest of manifests) visit(manifest)
  return ordered
}

/**
 * Which of `manifests` to stage, in staging (and approval) order, and which are skipped because
 * `isPublished(name, version)` says that version is already on the registry. Private packages
 * appear in neither list.
 */
export function planStaging(manifests, isPublished) {
  const plan = { alreadyPublished: [], toStage: [] }
  const publishable = manifests.filter((candidate) => isPublishable(candidate))
  for (const manifest of dependencyOrder(publishable)) {
    const list = isPublished(manifest.name, manifest.version) ? plan.alreadyPublished : plan.toStage
    list.push(manifest)
  }
  return plan
}

/**
Every workspace manifest under `packages/`, with the directory it was read from.
 */
function readWorkspaceManifests() {
  const packagesDir = path.join(ROOT, 'packages')
  return readdirSync(packagesDir)
    .sort()
    .map((entry) => path.join(packagesDir, entry))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(path.join(dir, 'package.json')))
    .map((dir) => ({ ...JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')), dir }))
}

/**
 * Runs `command` (always `npm` or `pnpm`, never taken from input) resolved from PATH.
 *
 * NOSONAR on the one spawn line below (rule S4036, PATH-resolved executable): resolving the tool
 * from PATH is deliberate. In the release workflow PATH is the toolchain that workflow installs
 * and then checks (`npm --version` must read 12.1.0 before this script runs), so an absolute
 * path would bypass the very npm that was verified; run by hand, it is the maintainer's own
 * toolchain, and the npm floor below is checked either way.
 */
function runTool(command, args, options) {
  return execFileSync(command, args, options) // NOSONAR
}

/**
 * True if `error` (thrown by the `npm view <name> versions --json` call below) is npm's own
 * structured 404 for a package that has never been published at all - never a version mismatch,
 * because this script never asks `npm view` for one specific version, only for the whole
 * `versions` list, so a 404 on that call means the package itself is missing: never published, or
 * restricted and not visible to this run (npm answers both the same way; no package here is meant
 * to be restricted). Verified directly against the installed npm 12 CLI (not inferred from docs):
 * npm writes `{"error":{"code":"E404",...}}` to STDOUT for this case, the same "an E404 exit, not
 * empty output" surprise `isOnRegistry`'s own call already has to handle for a missing version.
 * Reads the structured `error.code` field, never `error.message` or stderr prose, so a real
 * failure with a different or absent code (a network error, an auth error) is left for the caller
 * to throw unchanged.
 */
export function isMissingPackageError(error) {
  const stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : error.stdout
  if (typeof stdout !== 'string' || stdout.length === 0) return false
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return false
  }
  return parsed?.error?.code === 'E404'
}

/**
 * The remedy for a publishable package `name` that has never been published: what
 * `isOnRegistry` throws instead of letting npm's raw E404 surface. Points at the runbook section
 * rather than repeating its steps inline, so the two cannot drift apart.
 */
export function composeMissingPackageMessage(name) {
  return (
    `Staging: ${name} is not on the npm registry yet, or is not visible to this run (npm ` +
    "answers a restricted package it cannot read the same way). npm's trusted publishing " +
    'cannot create a package - every credential-free path it offers requires the package to ' +
    `already exist - so this run cannot stage anything until ${name}'s first version is ` +
    'published by hand. See "A package\'s first release" in docs/02-contribute/releasing.md ' +
    'for the steps, then run this release again.'
  )
}

/**
 * True if `name@version` is on the registry, read from the package's full list of published
 * versions (a staged, unapproved version is not in it). Not `npm view name@version`: npm 12
 * answers a missing version with an E404 exit rather than empty output, and telling that E404
 * from a real failure would mean parsing error text. When the package has never been published
 * at all, `npm view` 404s the same way and this throws a named remedy instead
 * (`composeMissingPackageMessage`) rather than npm's raw error. Any OTHER failure here (a
 * network error, an auth error) is still thrown as-is, because guessing could stage the wrong
 * set. `run` defaults to spawning npm; tests pass a stub.
 */
export function isOnRegistry(name, version, run = runTool) {
  let output
  try {
    output = run('npm', ['view', name, 'versions', '--json'], { encoding: 'utf8' })
  } catch (error) {
    if (isMissingPackageError(error)) {
      throw new Error(composeMissingPackageMessage(name), { cause: error })
    }
    throw error
  }
  return [JSON.parse(output)].flat().includes(version)
}

/**
Packs the package in `dir` with pnpm into `destination` and returns the tarball's path.
 */
function packTarball(dir, destination) {
  const before = new Set(readdirSync(destination))
  runTool('pnpm', ['pack', '--pack-destination', destination], { cwd: dir, stdio: 'inherit' })
  const created = readdirSync(destination).filter((file) => !before.has(file))
  if (created.length !== 1) {
    throw new Error(
      `Staging: expected pnpm pack to write one tarball for ${dir}, found ${created.length}.`,
    )
  }
  return path.join(destination, created[0])
}

/**
 * Runs `fn` with a fresh temporary directory (created under `os.tmpdir()` with `prefix`) as its
 * only argument, and removes that directory again once `fn` settles, whether it returns or
 * throws. Returns whatever `fn` returns.
 */
export function withTempDir(prefix, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Packs every manifest in `toStage` with `pack` FIRST, as one pass, so a pack failure on any of
 * them throws before `stage` is called for any: nothing reaches the registry over a release that
 * was never going to finish packing. Only once every tarball exists does it call `stage` on each
 * in order, collecting `name@version` labels as it goes.
 *
 * A `stage` failure throws a new Error, with `cause` set to the original one, naming what is
 * already staged and waiting for approval, or saying plainly that nothing was staged yet, so a
 * maintainer reading the failure knows what state the release left the queue in without
 * re-reading the whole log. Returns the staged labels, in order, on success.
 */
export function stageAll(toStage, pack, stage) {
  const packed = toStage.map((manifest) => ({ manifest, tarball: pack(manifest) }))
  const staged = []
  for (const { manifest, tarball } of packed) {
    const label = `${manifest.name}@${manifest.version}`
    try {
      stage(tarball)
    } catch (error) {
      const detail =
        staged.length > 0
          ? `Staging: ${label} failed to stage. Already staged and waiting for approval: ` +
            `${staged.join(', ')}. Approve or reject those before running the release again: ` +
            'it checks which versions are live, not which are staged.'
          : `Staging: ${label} failed to stage. Nothing was staged.`
      throw new Error(detail, { cause: error })
    }
    staged.push(label)
  }
  return staged
}

/**
Checks the npm floor, plans the release, then packs and stages each package in order.
 */
function main() {
  const npmVersion = runTool('npm', ['--version'], { encoding: 'utf8' }).trim()
  if (!meetsStageFloor(npmVersion)) {
    console.error(
      `Staging: npm ${npmVersion} has no \`stage\` command; npm ${NPM_STAGE_FLOOR} or newer is required.`,
    )
    process.exitCode = 1
    return
  }

  const { alreadyPublished, toStage } = planStaging(readWorkspaceManifests(), isOnRegistry)
  for (const manifest of alreadyPublished) {
    console.log(
      `Staging: ${manifest.name}@${manifest.version} is already on the registry, skipped.`,
    )
  }
  if (toStage.length === 0) {
    console.error(
      'Staging: nothing to stage. Every publishable version is already on the registry; run ' +
        '`pnpm changeset version` and merge the result before releasing.',
    )
    process.exitCode = 1
    return
  }

  const labels = withTempDir('navecss-stage-', (destination) =>
    stageAll(
      toStage,
      (manifest) => packTarball(manifest.dir, destination),
      (tarball) => runTool('npm', stagePublishArgs(tarball), { stdio: 'inherit' }),
    ),
  )

  console.log(
    `Staging: staged ${labels.join(', ')}. Nothing is live yet. Approve each with two-factor ` +
      'authentication, in this order, with `npm stage approve <id>` or from the Staged Packages ' +
      'tab on npmjs.com. Do not run the release again until each is approved or rejected.',
  )
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
