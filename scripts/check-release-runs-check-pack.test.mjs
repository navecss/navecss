#!/usr/bin/env node
/**
 * Wiring test for the release packaging checks.
 *
 * The release stages packages one after another in dependency order, and it stages packed
 * tarballs, for which npm runs no lifecycle script: a package's own `prepublishOnly` never fires
 * on this path. So the release runs `check:pack` for the whole workspace once, with the cache
 * bypassed, before the staging step starts. Each package's `prepublishOnly` also keeps
 * `check:pack`, because a package published on its own by hand never runs the root `release`
 * script, and that per-package hook is the only packaging check on that path.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function rootScripts() {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts
}

function packageScripts(pkg) {
  return JSON.parse(readFileSync(path.join(ROOT, 'packages', pkg, 'package.json'), 'utf8')).scripts
}

const STAGE_STEP = 'node scripts/stage-release.mjs'

test('the release script runs check:pack, and runs it before the staging step', () => {
  const release = rootScripts().release
  const gateIndex = release.indexOf('turbo run check:pack --force')
  const stageIndex = release.indexOf(STAGE_STEP)
  assert.ok(gateIndex !== -1, `release must run check:pack; it reads: ${release}`)
  assert.ok(stageIndex !== -1, `release must run the staging step; it reads: ${release}`)
  assert.ok(
    gateIndex < stageIndex,
    `check:pack must run BEFORE the staging step; release reads: ${release}`,
  )
})

// ROW: the release ENDS by staging, as its own && token, and nothing in it publishes directly.
// A direct publish would be refused by a stage-only trusted publisher in CI, but run by hand it
// would put a version live with no approval step and no provenance.
test('the release ends with the staging step and runs no direct publish', () => {
  const release = rootScripts().release
  const tokens = release.split(' && ').map((token) => token.trim())
  assert.equal(tokens.at(-1), STAGE_STEP, `release must end by staging; it reads: ${release}`)
  assert.doesNotMatch(release, /changeset publish|pnpm publish|npm publish/)
})

// ROW: pins the SHELL SEMANTICS of the wiring, not just substring order, the same mutant
// shape the release gate above and its `check-no-pending-changesets` sibling guard against
// (`|| true` swallowing the exit status).
test('check:pack is its own whole && token in release, not merely a substring of one', () => {
  const release = rootScripts().release
  const tokens = release.split(' && ').map((token) => token.trim())
  assert.ok(
    tokens.includes('turbo run check:pack --force'),
    `release must run check:pack as its own && token, with nothing appended to its exit status; release reads: ${release}`,
  )
})

test('check:pack runs after the build, not before it', () => {
  const release = rootScripts().release
  assert.ok(
    release.indexOf('turbo run build') < release.indexOf('turbo run check:pack --force'),
    `check:pack packs and validates built dist (publint/attw); it must run after the build; release reads: ${release}`,
  )
})

test('the release-wide check:pack step bypasses turbo cache', () => {
  const release = rootScripts().release
  const packSteps = release
    .split(' && ')
    .map((token) => token.trim())
    .filter((token) => token.includes('check:pack'))
  assert.ok(
    packSteps.length > 0 && packSteps.every((token) => token === 'turbo run check:pack --force'),
    `every release step that runs check:pack must bypass turbo's cache (a cache hit replays an ` +
      `earlier pass without running publint/attw against the tarballs about to be published); ` +
      `release reads: ${release}`,
  )
})

test('every package still runs check:pack from its own prepublishOnly', () => {
  for (const pkg of ['core', 'tokens', 'cli', 'bridge']) {
    const scripts = packageScripts(pkg)
    const tokens = scripts.prepublishOnly.split(' && ').map((token) => token.trim())
    assert.ok(
      tokens.includes('pnpm run check:pack'),
      `${pkg}: prepublishOnly must still run check:pack as its own && token (a hand publish of ` +
        `a single package never runs the root release script); prepublishOnly reads: ${scripts.prepublishOnly}`,
    )
  }
})

test('prepublishOnly still runs the orphaned-chunks backstop', () => {
  for (const pkg of ['core', 'tokens', 'cli', 'bridge']) {
    const scripts = packageScripts(pkg)
    assert.match(
      scripts.prepublishOnly,
      /check-no-orphaned-chunks\.mjs/,
      `${pkg}: prepublishOnly must keep the orphaned-chunks backstop; prepublishOnly reads: ${scripts.prepublishOnly}`,
    )
  }
})

test('each package still carries a check:pack script that runs publint through the dry-run wrapper', () => {
  for (const pkg of ['core', 'tokens', 'cli', 'bridge']) {
    const scripts = packageScripts(pkg)
    assert.match(
      scripts['check:pack'],
      /without-dry-run\.mjs publint/,
      `${pkg}: check:pack script must still exist for the root release chain to invoke via turbo`,
    )
  }
})
