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
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  flattenLicenseGroups,
  main,
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

/**
 * Runs `main(rootDir, listLicenses)` with console output captured and `process.exitCode`
 * restored afterwards (it outlives the call and would otherwise fail the whole run).
 */
function runGate(rootDir, listLicenses) {
  const originalError = console.error
  const originalLog = console.log
  const originalExitCode = process.exitCode
  const printed = []
  console.error = (message) => printed.push(String(message))
  console.log = (message) => printed.push(String(message))
  let exitCode
  try {
    process.exitCode = undefined
    main(rootDir, listLicenses)
    exitCode = process.exitCode
  } finally {
    console.error = originalError
    console.log = originalLog
    process.exitCode = originalExitCode
  }
  return { exitCode, output: printed.join('\n') }
}

test('the real-tree positive control: the gate names MIT-0 and Python-2.0 while the policy admits neither, and is green once it admits both', () => {
  const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))
  const admitsMit0 = policy.prodPermissive.some((entry) => entry.id === 'MIT-0')
  const admitsPython2 = policy.prodPermissive.some((entry) => entry.id === 'Python-2.0')
  const { exitCode, output } = runGate(ROOT)
  // The two ids reach this workspace only through the required `stylelint` peer's own tree, so
  // which verdict is right depends on whether the policy admits them. The ids were added to the
  // policy only after their enumeration was recorded, so the green branch is the one the shipped
  // policy takes; the red branch is what the same gate printed before that entry landed.
  if (admitsMit0 && admitsPython2) {
    assert.notEqual(exitCode, 1, output)
    assert.match(output, /all clear\.$/)
  } else {
    assert.equal(exitCode, 1)
    assert.match(output, /"MIT-0"/)
    assert.match(output, /"Python-2.0"/)
  }
})

/**
 * A fixture root for driving `main()` itself: a workspace whose one package declares `p` as an
 * optional peer, `p` installed at `node_modules/p` with a dependency `p-dep` installed beside
 * it, and a copy of this repository's policy. The licence listings are supplied by the test in
 * place of `pnpm licenses list`, shaped as that command prints them, with `--prod` leaving both
 * packages out: the shape of an optional peer that is also a devDependency of the package
 * declaring it.
 */
function buildPeerClosureFixture({ declarePeer }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-peer-closure-'))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'root', private: true }))
  copyFileSync(path.join(ROOT, 'license-policy.json'), path.join(dir, 'license-policy.json'))
  mkdirSync(path.join(dir, 'packages', 'pub'), { recursive: true })
  writeFileSync(
    path.join(dir, 'packages', 'pub', 'package.json'),
    JSON.stringify(
      declarePeer
        ? {
            name: 'pub',
            peerDependencies: { p: '^1.0.0' },
            peerDependenciesMeta: { p: { optional: true } },
          }
        : { name: 'pub' },
    ),
  )
  const installed = {
    p: { name: 'p', version: '1.0.0', dependencies: { 'p-dep': '^1.0.0' } },
    'p-dep': { name: 'p-dep', version: '1.0.0' },
  }
  for (const [name, manifest] of Object.entries(installed)) {
    mkdirSync(path.join(dir, 'node_modules', name), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), JSON.stringify(manifest))
  }
  const entry = (name, license) => ({
    [license]: [{ name, versions: ['1.0.0'], paths: [path.join(dir, 'node_modules', name)] }],
  })
  const listings = {
    prod: {},
    all: { ...entry('p', 'GPL-3.0-only'), ...entry('p-dep', 'WTFPL') },
  }
  const listLicenses = (extraArgs) => (extraArgs.includes('--prod') ? listings.prod : listings.all)
  return { dir, listLicenses }
}

test('main() grades a declared optional peer that --prod left out, with the packages it depends on, as bucket B', () => {
  const { dir, listLicenses } = buildPeerClosureFixture({ declarePeer: true })
  try {
    const { exitCode, output } = runGate(dir, listLicenses)
    assert.equal(exitCode, 1, output)
    assert.match(output, /\[bucket B \(prod\)\] p@1\.0\.0: "GPL-3\.0-only"/)
    assert.match(output, /\[bucket B \(prod\)\] p-dep@1\.0\.0: "WTFPL"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main() on the same fixture with the peer declaration removed passes (the control that attributes the red to the peer)', () => {
  const { dir, listLicenses } = buildPeerClosureFixture({ declarePeer: false })
  try {
    const { exitCode, output } = runGate(dir, listLicenses)
    assert.notEqual(exitCode, 1, output)
    assert.match(output, /0 prod package\(s\), 2 dev-only package\(s\), all clear\.$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Bucket B must cover an optional peer and `optionalDependencies`, derived from the workspace
 * manifests, never from `pnpm licenses list --prod`'s own scope alone. On the pnpm this
 * repository pins (10.30.3), an optional peer that the declaring package also lists in its own
 * `devDependencies` (as `@navecss/core` does with `postcss`) is outside `--prod`, while an
 * optional peer with no other install path is inside it: which shapes the flag covers is a
 * property of the package manager, not of this repository.
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

test('widenBucketBWithPeers adds an allPackages entry --prod entirely missed, because its name is a declared peer (an optional peer that is also a devDependency)', () => {
  const prodPackages = [{ name: 'stylelint', version: '17.15.0', license: 'MIT' }]
  const allPackages = [
    ...prodPackages,
    // Not in prodPackages at all: the shape `--prod` gives an optional peer that the declaring
    // package also lists in its own devDependencies.
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

test('peerAndOptionalDependencyNames skips a dangling entry under packages/ rather than aborting', () => {
  const dir = buildScratchWorkspace({ a: { name: 'a', peerDependencies: { 'a-peer': '^1.0.0' } } })
  symlinkSync(path.join(dir, 'does-not-exist'), path.join(dir, 'packages', 'dangling'))
  try {
    assert.deepEqual([...peerAndOptionalDependencyNames(dir)], ['a-peer'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("this repository's own @navecss/core optional peer (postcss) is in the manifest-derived peer set", () => {
  const names = peerAndOptionalDependencyNames(ROOT)
  assert.ok(names.has('postcss'))
})
