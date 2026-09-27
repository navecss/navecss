import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as subject from './prefix-lcov-source-paths.mjs'

const { main, packageDirsFromReportPaths, prefixLcovSourcePaths } = subject

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_NAME = 'prefix-lcov-source-paths.mjs'

test('prefixLcovSourcePaths: an SF: line is prefixed with the package directory', () => {
  const content = 'TN:\nSF:src/atoms.ts\nDA:1,1\nend_of_record\n'
  const result = prefixLcovSourcePaths(content, 'packages/core')
  assert.match(result, /^SF:packages\/core\/src\/atoms\.ts$/m)
})

test('prefixLcovSourcePaths: every SF: line across multiple records is prefixed', () => {
  const content = [
    'TN:',
    'SF:src/a.ts',
    'end_of_record',
    'TN:',
    'SF:src/b.ts',
    'end_of_record',
    '',
  ].join('\n')
  const result = prefixLcovSourcePaths(content, 'packages/tokens')
  const sfLines = result.split('\n').filter((line) => line.startsWith('SF:'))
  assert.deepEqual(sfLines, ['SF:packages/tokens/src/a.ts', 'SF:packages/tokens/src/b.ts'])
})

test('prefixLcovSourcePaths: a line that merely CONTAINS "SF:" but does not start with it is untouched', () => {
  const content = 'TN:\nSF:src/a.ts\n# not an SF: line, just mentions SF:src/a.ts in a comment\n'
  const result = prefixLcovSourcePaths(content, 'packages/core')
  assert.ok(result.includes('# not an SF: line, just mentions SF:src/a.ts in a comment'))
})

test('prefixLcovSourcePaths: non-SF: lines (DA/FN/end_of_record) pass through unchanged', () => {
  const content = 'TN:\nSF:src/a.ts\nFN:1,foo\nDA:1,1\nend_of_record\n'
  const result = prefixLcovSourcePaths(content, 'packages/core')
  assert.match(result, /^TN:$/m)
  assert.match(result, /^FN:1,foo$/m)
  assert.match(result, /^DA:1,1$/m)
  assert.match(result, /^end_of_record$/m)
})

test('prefixLcovSourcePaths: an already-prefixed SF: line is unchanged (a second run is a no-op)', () => {
  const content = 'TN:\nSF:packages/core/src/a.ts\nend_of_record\n'
  const result = prefixLcovSourcePaths(content, 'packages/core')
  assert.match(result, /^SF:packages\/core\/src\/a\.ts$/m)
})

test('prefixLcovSourcePaths: an absolute SF: line is unchanged', () => {
  const content = 'TN:\nSF:/home/runner/work/x/packages/core/src/a.ts\nend_of_record\n'
  const result = prefixLcovSourcePaths(content, 'packages/core')
  assert.match(result, /^SF:\/home\/runner\/work\/x\/packages\/core\/src\/a\.ts$/m)
})

function buildFixtureRoot(packagesWithLcov) {
  const root = mkdtempSync(path.join(tmpdir(), 'lcov-prefix-'))
  for (const [packageDir, lcovContent] of Object.entries(packagesWithLcov)) {
    const coverageDir = path.join(root, packageDir, 'coverage')
    mkdirSync(coverageDir, { recursive: true })
    writeFileSync(path.join(coverageDir, 'lcov.info'), lcovContent)
  }
  return root
}

test('main(rootDir, packageDirs): rewrites each named package coverage/lcov.info in place', () => {
  const root = buildFixtureRoot({
    'packages/core': 'SF:src/atoms.ts\nend_of_record\n',
    'packages/tokens': 'SF:src/builder.ts\nend_of_record\n',
  })
  try {
    main(root, ['packages/core', 'packages/tokens'])
    assert.match(
      readFileSync(path.join(root, 'packages/core/coverage/lcov.info'), 'utf8'),
      /^SF:packages\/core\/src\/atoms\.ts$/m,
    )
    assert.match(
      readFileSync(path.join(root, 'packages/tokens/coverage/lcov.info'), 'utf8'),
      /^SF:packages\/tokens\/src\/builder\.ts$/m,
    )
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('main(rootDir, packageDirs): a named package with no coverage/lcov.info fails loudly', () => {
  const root = buildFixtureRoot({ 'packages/core': 'SF:src/atoms.ts\nend_of_record\n' })
  try {
    assert.throws(() => main(root, ['packages/core', 'packages/cli']), /packages\/cli/)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('packageDirsFromReportPaths: reads the package list from sonar.javascript.lcov.reportPaths, trimming each entry', () => {
  const propertiesText = [
    '# a comment',
    'sonar.organization=navecss',
    'sonar.javascript.lcov.reportPaths=packages/core/coverage/lcov.info, packages/tokens/coverage/lcov.info',
    '',
  ].join('\n')
  assert.deepEqual(packageDirsFromReportPaths(propertiesText), ['packages/core', 'packages/tokens'])
})

test('packageDirsFromReportPaths: throws naming the offending entry when one is not <dir>/coverage/lcov.info', () => {
  const propertiesText = 'sonar.javascript.lcov.reportPaths=packages/core/lcov.info\n'
  assert.throws(() => packageDirsFromReportPaths(propertiesText), /packages\/core\/lcov\.info/)
})

test('packageDirsFromReportPaths: throws naming the key when sonar.javascript.lcov.reportPaths is absent', () => {
  const propertiesText = 'sonar.organization=navecss\n'
  assert.throws(
    () => packageDirsFromReportPaths(propertiesText),
    /sonar\.javascript\.lcov\.reportPaths/,
  )
})

test('packageDirsFromReportPaths: whitespace around the = separator parses (Java .properties syntax)', () => {
  const propertiesText = 'sonar.javascript.lcov.reportPaths = packages/a/coverage/lcov.info\n'
  assert.deepEqual(packageDirsFromReportPaths(propertiesText), ['packages/a'])
})

test('packageDirsFromReportPaths: a : separator parses (Java .properties syntax)', () => {
  const propertiesText = 'sonar.javascript.lcov.reportPaths:packages/a/coverage/lcov.info\n'
  assert.deepEqual(packageDirsFromReportPaths(propertiesText), ['packages/a'])
})

test('packageDirsFromReportPaths: a repeated key uses the LAST occurrence (Java properties semantics)', () => {
  const propertiesText = [
    'sonar.javascript.lcov.reportPaths=packages/a/coverage/lcov.info',
    'sonar.javascript.lcov.reportPaths=packages/b/coverage/lcov.info',
    '',
  ].join('\n')
  assert.deepEqual(packageDirsFromReportPaths(propertiesText), ['packages/b'])
})

function readPropertyValue(propertiesText, key) {
  const line = propertiesText.split('\n').find((l) => l.startsWith(`${key}=`))
  if (line === undefined) {
    throw new Error(`sonar-project.properties has no ${key} line.`)
  }
  return line
    .slice(`${key}=`.length)
    .split(',')
    .map((entry) => entry.trim())
}

test('sync with the real repo: sonar.cpd.exclusions carries the same globs as sonar.test.inclusions', () => {
  const propertiesText = readFileSync(path.join(ROOT, 'sonar-project.properties'), 'utf8')
  assert.deepEqual(
    readPropertyValue(propertiesText, 'sonar.cpd.exclusions'),
    readPropertyValue(propertiesText, 'sonar.test.inclusions'),
  )
})

test('sync with the real repo: packages with a test:coverage script match sonar.javascript.lcov.reportPaths', () => {
  const packagesDir = path.join(ROOT, 'packages')
  const packagesWithCoverageScript = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const packageJsonPath = path.join(packagesDir, entry.name, 'package.json')
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
        return Boolean(packageJson.scripts && packageJson.scripts['test:coverage'])
      } catch {
        return false
      }
    })
    .map((entry) => `packages/${entry.name}`)

  const propertiesText = readFileSync(path.join(ROOT, 'sonar-project.properties'), 'utf8')
  const reportedPackageDirs = packageDirsFromReportPaths(propertiesText)

  assert.deepEqual(new Set(packagesWithCoverageScript), new Set(reportedPackageDirs))
})

// ── End to end: the SHIPPED script, driven as a child process (the way the workflow runs it) ──

function buildCliFixture(packagesWithLcov) {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'lcov-prefix-cli-'))
  mkdirSync(path.join(root, 'scripts'), { recursive: true })
  cpSync(path.join(ROOT, 'scripts', SCRIPT_NAME), path.join(root, 'scripts', SCRIPT_NAME))
  writeFileSync(
    path.join(root, 'sonar-project.properties'),
    'sonar.javascript.lcov.reportPaths=packages/core/coverage/lcov.info,packages/tokens/coverage/lcov.info\n',
  )
  for (const [packageDir, lcovContent] of Object.entries(packagesWithLcov)) {
    const coverageDir = path.join(root, packageDir, 'coverage')
    mkdirSync(coverageDir, { recursive: true })
    writeFileSync(path.join(coverageDir, 'lcov.info'), lcovContent)
  }
  return root
}

test("CLI: a fresh root with both packages' lcov.info exits 0 and rewrites both files", () => {
  const root = buildCliFixture({
    'packages/core': 'SF:src/atoms.ts\nend_of_record\n',
    'packages/tokens': 'SF:src/builder.ts\nend_of_record\n',
  })
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', SCRIPT_NAME)], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0)
    assert.match(
      readFileSync(path.join(root, 'packages/core/coverage/lcov.info'), 'utf8'),
      /^SF:packages\/core\/src\/atoms\.ts$/m,
    )
    assert.match(
      readFileSync(path.join(root, 'packages/tokens/coverage/lcov.info'), 'utf8'),
      /^SF:packages\/tokens\/src\/builder\.ts$/m,
    )
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("CLI: a root missing one package's lcov.info exits 1 and names that package in stderr", () => {
  const root = buildCliFixture({ 'packages/core': 'SF:src/atoms.ts\nend_of_record\n' })
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', SCRIPT_NAME)], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /packages\/tokens/)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
