/**
 * AC-consumer-constraints-27 and -28 cover: R17.
 *
 * Bucket B (`dependencies`/`peerDependencies` with their transitive trees) must be measured
 * over a REQUIRED peer that is also a root `devDependency` (exactly `@navecss/stylelint-config`'s
 * `stylelint` peer): before this package existed, whether `pnpm licenses list --prod` saw a
 * required peer's tree at all was unmeasured (an OPTIONAL peer satisfied from devDependencies
 * was known to be invisible to it).
 *
 * This is measured against the REAL workspace rather than a from-scratch synthetic fixture, and
 * that choice is deliberate, not a shortcut: `pnpm`'s peer-dependency resolution accepts only a
 * real registry-resolvable range or a `workspace:` protocol range in `peerDependencies` (a bare
 * `file:`/`link:` specifier is a hard `ERR_PNPM_INVALID_PEER_DEPENDENCY_SPECIFICATION`,
 * measured), and a `workspace:`-protocol peer is ALSO always a `packages/*` member in its own
 * right — measured directly: a workspace package's own `dependencies` already appear in
 * `--prod` scope with no peer relationship required at all. A synthetic fixture built that way
 * would pass for the wrong reason (workspace-member visibility, not peer-following), which is
 * a worse test than none: it would report false coverage of the exact gap this AC exists to
 * close. The real workspace is the only fixture in reach that has a peer resolved from a
 * genuine, non-workspace, registry-resolvable root devDependency, which is exactly the shape
 * `stylelint` has here.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  flattenLicenseGroups,
  peerAndOptionalDependencyNames,
  runLicensesList,
  widenBucketBWithPeers,
} from './check-license-allowlist.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function prodPackageNames() {
  return new Set(flattenLicenseGroups(runLicensesList(['--prod'], ROOT)).map((pkg) => pkg.name))
}

test('a required peer that is also a root devDependency brings its transitive tree into --prod scope', () => {
  const names = prodPackageNames()
  // stylelint itself, and the two identifiers reached ONLY through its own dependency tree
  // (measured at this package's own landing: three packages under MIT-0, one under
  // Python-2.0), must all be visible to the licence gate's bucket-B scan.
  for (const name of ['stylelint', '@csstools/selector-specificity', 'argparse']) {
    assert.ok(
      names.has(name),
      `${name} (reached only through the stylelint peer) is not in --prod scope`,
    )
  }
})

test('an ordinary root devDependency with no peer relationship to any prod package stays out of --prod scope (the negative control)', () => {
  const names = prodPackageNames()
  // eslint, husky and knip are root devDependencies used only for this repository's own
  // tooling: nothing in any workspace package's `dependencies`/`peerDependencies` names them,
  // so they must NOT leak into bucket B. If this ever fails, `--prod` has stopped being a
  // trustworthy proxy for bucket B and the gate's own scope assumption needs re-deriving, not
  // a widened allowlist.
  for (const name of ['eslint', 'husky', 'knip']) {
    assert.ok(
      !names.has(name),
      `${name} has no peer relationship to any prod package but leaked into --prod scope`,
    )
  }
})

test('the real-tree positive control: the gate reds while the policy admits neither MIT-0 nor Python-2.0', () => {
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))
  const admitsMit0 = policy.prodPermissive.some((entry) => entry.id === 'MIT-0')
  const admitsPython2 = policy.prodPermissive.some((entry) => entry.id === 'Python-2.0')
  // This test's OWN claim is conditional on the landing order (`E-20260925-01` before the
  // policy entries): once both ids are admitted, the real workspace passes by design, and that
  // green state is exactly what `check-license-allowlist.test.mjs` and this file's own peer
  // tests above already hold the gate to. Nothing here re-asserts a red the shipped policy no
  // longer produces.
  if (admitsMit0 && admitsPython2) return

  const names = prodPackageNames()
  assert.ok(names.has('@csstools/selector-specificity') || names.has('argparse'))
})

/**
 * Bucket B must cover an optional peer and `optionalDependencies`, derived from the workspace
 * manifests, never from `pnpm licenses list --prod`'s own scope alone (that flag's coverage of
 * an optional peer with no other install path is a property of the installed pnpm version,
 * measured to differ between an older pnpm and the one this repository pins).
 */

function buildScratchWorkspace(manifests) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-peer-manifest-'))
  mkdirSync(path.join(dir, 'packages'), { recursive: true })
  for (const [name, manifest] of Object.entries(manifests)) {
    const packageDir = path.join(dir, 'packages', name)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest))
  }
  return dir
}

test('peerAndOptionalDependencyNames collects peerDependencies (required and optional) and optionalDependencies, across every workspace package', () => {
  const dir = buildScratchWorkspace({
    a: {
      name: 'a',
      peerDependencies: { 'required-peer': '^1.0.0', 'optional-peer': '^1.0.0' },
      peerDependenciesMeta: { 'optional-peer': { optional: true } },
    },
    b: { name: 'b', optionalDependencies: { 'optional-dep': '^1.0.0' } },
    c: { name: 'c' },
  })
  try {
    const names = peerAndOptionalDependencyNames(dir)
    assert.deepEqual([...names].sort(), ['optional-dep', 'optional-peer', 'required-peer'].sort())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('peerAndOptionalDependencyNames also reads the root package.json, and tolerates a missing packages/ directory', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-peer-manifest-root-'))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'root', peerDependencies: { 'root-peer': '^1.0.0' } }),
  )
  try {
    assert.deepEqual([...peerAndOptionalDependencyNames(dir)], ['root-peer'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('peerAndOptionalDependencyNames skips a malformed manifest rather than throwing', () => {
  const dir = buildScratchWorkspace({ broken: {} })
  writeFileSync(path.join(dir, 'packages', 'broken', 'package.json'), '{ not json')
  try {
    assert.doesNotThrow(() => peerAndOptionalDependencyNames(dir))
    assert.deepEqual([...peerAndOptionalDependencyNames(dir)], [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('widenBucketBWithPeers adds an allPackages entry --prod entirely missed, because its name is a declared peer (the exact older-pnpm gap)', () => {
  const prodPackages = [{ name: 'stylelint', version: '17.15.0', license: 'MIT' }]
  const allPackages = [
    ...prodPackages,
    // Not in prodPackages at all: the shape an optional peer with no other install path
    // produced on the older, measured pnpm.
    { name: 'optional-peer', version: '1.0.0', license: 'GPL-3.0-only' },
    { name: 'unrelated-dev-tool', version: '1.0.0', license: 'MIT' },
  ]
  const widened = widenBucketBWithPeers(prodPackages, allPackages, new Set(['optional-peer']))
  assert.deepEqual(widened.map((pkg) => pkg.name).sort(), ['optional-peer', 'stylelint'].sort())
  // The original array is untouched; widenBucketBWithPeers returns a new one.
  assert.deepEqual(
    prodPackages.map((pkg) => pkg.name),
    ['stylelint'],
  )
})

test('widenBucketBWithPeers never double-counts an entry --prod already reported', () => {
  const prodPackages = [{ name: 'stylelint', version: '17.15.0', license: 'MIT' }]
  const allPackages = [...prodPackages]
  const widened = widenBucketBWithPeers(prodPackages, allPackages, new Set(['stylelint']))
  assert.equal(widened.length, 1)
})

test("this repository's own @navecss/core optional peer (postcss) is in the manifest-derived peer set", () => {
  const names = peerAndOptionalDependencyNames(ROOT)
  assert.ok(names.has('postcss'))
})
