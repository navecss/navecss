/**
 * The licence gate's per-package list (`admitsPackages` in license-policy.json): a package a
 * consumer installs may be admitted by NAME and exact licence string, for bucket B only,
 * without admitting its licence as an identifier. The rows are the ones a signed enumeration
 * lists for the packages `next` brings in; the gate must be red on them without the list, green
 * with it, and red again on a package outside the list.
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { classifyBucketB, findPolicyShapeViolation, main } from './check-license-allowlist.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHIPPED_POLICY = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))

const LGPL = 'LGPL-3.0-or-later'
const ADMITTED = [
  ['caniuse-lite', 'CC-BY-4.0'],
  ...[
    'darwin-arm64',
    'darwin-x64',
    'linux-arm',
    'linux-arm64',
    'linux-ppc64',
    'linux-riscv64',
    'linux-s390x',
    'linux-x64',
    'linuxmusl-arm64',
    'linuxmusl-x64',
  ].map((platform) => [`@img/sharp-libvips-${platform}`, LGPL]),
  ['@img/sharp-win32-arm64', `Apache-2.0 AND ${LGPL}`],
  ['@img/sharp-win32-ia32', `Apache-2.0 AND ${LGPL}`],
  ['@img/sharp-win32-x64', `Apache-2.0 AND ${LGPL}`],
  ['@img/sharp-wasm32', `Apache-2.0 AND ${LGPL} AND MIT`],
]

/**
 * The shipped policy with `admitsPackages` replaced by `rows` (removed when `undefined`).
 */
function policyWith(rows) {
  const { admitsPackages: _removed, ...rest } = SHIPPED_POLICY
  return rows === undefined ? rest : { ...rest, admitsPackages: rows }
}

const row = (name, license) => ({ package: name, license, bucket: 'B' })
const ROWS = ADMITTED.map(([name, license]) => row(name, license))

test('without the list, the data table and the image-library builds are not admitted (the red)', () => {
  const policy = policyWith(undefined)
  for (const [name, license] of ADMITTED) {
    assert.equal(classifyBucketB(license, policy, name).allowed, false, `${name} (${license})`)
  }
})

test('with the list, each name with its exact licence string is admitted', () => {
  const policy = policyWith(ROWS)
  for (const [name, license] of ADMITTED) {
    assert.equal(classifyBucketB(license, policy, name).allowed, true, `${name} (${license})`)
  }
})

test('a package outside the list with the same licence is not admitted (the planted package)', () => {
  const policy = policyWith(ROWS)
  assert.equal(classifyBucketB('CC-BY-4.0', policy, 'other-data-table').allowed, false)
  assert.equal(classifyBucketB(LGPL, policy, '@img/sharp-libvips-freebsd-x64').allowed, false)
  assert.equal(classifyBucketB(LGPL, policy, undefined).allowed, false)
})

test('a listed name with any other licence string is not admitted', () => {
  const policy = policyWith(ROWS)
  assert.equal(classifyBucketB('CC-BY-4.0 OR MIT', policy, 'caniuse-lite').allowed, false)
  assert.equal(classifyBucketB('CC-BY-SA-4.0', policy, 'caniuse-lite').allowed, false)
  assert.equal(classifyBucketB(LGPL, policy, '@img/sharp-win32-x64').allowed, false)
})

test('the list admits no licence as an identifier', () => {
  const policy = policyWith(ROWS)
  assert.equal(classifyBucketB(LGPL, policy, 'some-other-package').allowed, false)
  assert.equal(classifyBucketB('CC-BY-4.0', policy, 'some-other-package').allowed, false)
  assert.ok(!policy.prodPermissive.some((entry) => entry.id === LGPL || entry.id === 'CC-BY-4.0'))
})

test('a use-restricting licence is refused even for a listed name', () => {
  const policy = policyWith([row('caniuse-lite', 'BUSL-1.1')])
  assert.equal(classifyBucketB('BUSL-1.1', policy, 'caniuse-lite').allowed, false)
})

test('the shipped policy lists exactly the signed packages and strings, never more', () => {
  const rows = SHIPPED_POLICY.admitsPackages
  assert.ok(Array.isArray(rows), 'license-policy.json has no admitsPackages list')
  const key = (name, license) => `${name}\u0000${license}`
  const signed = new Set(ADMITTED.map(([name, license]) => key(name, license)))
  assert.equal(rows.length, signed.size)
  for (const entry of rows) {
    assert.ok(signed.has(key(entry.package, entry.license)), `${entry.package} is not signed`)
    assert.equal(entry.bucket, 'B')
  }
})

test('the policy shape check refuses a malformed list and accepts a well-formed one', () => {
  assert.equal(findPolicyShapeViolation(policyWith(undefined)), null)
  assert.equal(findPolicyShapeViolation(policyWith(ROWS)), null)
  for (const bad of [
    'caniuse-lite',
    [null],
    [{ package: '', license: 'CC-BY-4.0', bucket: 'B' }],
    [{ package: 'caniuse-lite', license: '', bucket: 'B' }],
    [{ package: 'caniuse-lite', license: 'CC-BY-4.0', bucket: 'A' }],
    [{ package: 'caniuse-lite', license: 'CC-BY-4.0' }],
    [row('caniuse-lite', 'CC-BY-4.0'), row('caniuse-lite', 'CC-BY-4.0')],
  ]) {
    assert.match(
      findPolicyShapeViolation(policyWith(bad)) ?? '',
      /admitsPackages/,
      JSON.stringify(bad),
    )
  }
})

/**
 * Runs `main(rootDir, listLicenses)` with output captured and the exit code restored after.
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

/**
 * A workspace whose one package peers on `host`, with `host` installed beside the data table it
 * depends on, a policy carrying `rows`, and licence listings that leave both out of `--prod`.
 */
function buildFixture(rows, dataName = 'caniuse-lite') {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-admits-packages-'))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'root', private: true }))
  copyFileSync(path.join(ROOT, 'license-policy.json'), path.join(dir, 'license-policy.json'))
  writeFileSync(path.join(dir, 'license-policy.json'), JSON.stringify(policyWith(rows)))
  mkdirSync(path.join(dir, 'packages', 'pub'), { recursive: true })
  writeFileSync(
    path.join(dir, 'packages', 'pub', 'package.json'),
    JSON.stringify({ name: 'pub', peerDependencies: { host: '>=1.0.0' } }),
  )
  const installed = {
    host: { name: 'host', version: '1.0.0', dependencies: { [dataName]: '^1.0.0' } },
    [dataName]: { name: dataName, version: '1.0.0' },
  }
  for (const [name, manifest] of Object.entries(installed)) {
    mkdirSync(path.join(dir, 'node_modules', name), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), JSON.stringify(manifest))
  }
  const entry = (name, license) => ({
    [license]: [{ name, versions: ['1.0.0'], paths: [path.join(dir, 'node_modules', name)] }],
  })
  const all = { ...entry('host', 'MIT'), ...entry(dataName, 'CC-BY-4.0') }
  return { dir, listLicenses: (args) => (args.includes('--prod') ? {} : all) }
}

test('main(): a peer whose tree holds a listed package is green with the list and red without it', () => {
  for (const [rows, expectRed] of [
    [undefined, true],
    [ROWS, false],
  ]) {
    const { dir, listLicenses } = buildFixture(rows)
    try {
      const { exitCode, output } = runGate(dir, listLicenses)
      if (expectRed) {
        assert.equal(exitCode, 1, output)
        assert.match(output, /\[bucket B \(prod\)\] caniuse-lite@1\.0\.0: "CC-BY-4\.0"/)
      } else {
        assert.notEqual(exitCode, 1, output)
        assert.match(output, /all clear\.$/)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('main(): a planted package outside the list stays red while the list is in place', () => {
  const { dir, listLicenses } = buildFixture(ROWS, 'planted-data-table')
  try {
    const { exitCode, output } = runGate(dir, listLicenses)
    assert.equal(exitCode, 1, output)
    assert.match(output, /planted-data-table@1\.0\.0: "CC-BY-4\.0"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
