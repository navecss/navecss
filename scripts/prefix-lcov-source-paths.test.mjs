import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
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

test('packageDirsFromReportPaths: a properties file with CRLF line endings parses', () => {
  const propertiesText =
    'x=1\r\nsonar.javascript.lcov.reportPaths=packages/a/coverage/lcov.info\r\ny=2\r\n'
  assert.deepEqual(packageDirsFromReportPaths(propertiesText), ['packages/a'])
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

test('the real repo has no .sonarcloud.properties: a CI-driven scan reads sonar-project.properties only', () => {
  assert.equal(existsSync(path.join(ROOT, '.sonarcloud.properties')), false)
})

/**
True when a vitest config's `coverage` block sets `enabled: true` on a line that is not a comment.
 */
function coverageTurnedOn(configText) {
  const code = configText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
  return /coverage:\s*\{[^}]*\benabled:\s*true\b/.test(code)
}

test('coverageTurnedOn ignores a commented-out enabled: true', () => {
  assert.equal(coverageTurnedOn("coverage: {\n  // enabled: true,\n  provider: 'v8',\n}"), false)
  assert.equal(coverageTurnedOn("coverage: {\n  enabled: true,\n  provider: 'v8',\n}"), true)
})

/**
 * The root `scripts:test` command, as package.json spells it.
 */
function scriptsTestCommand() {
  const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return scripts['scripts:test']
}

test('sync with the real repo: scripts:test writes its lcov report where sonar.javascript.lcov.reportPaths reads it', () => {
  const command = scriptsTestCommand()
  assert.match(command, /--experimental-test-coverage/)
  const destination = /--test-reporter-destination=(\S+lcov\.info)/.exec(command)?.[1]
  assert.ok(destination, `scripts:test has no lcov reporter destination: ${command}`)
  const propertiesText = readFileSync(path.join(ROOT, 'sonar-project.properties'), 'utf8')
  assert.ok(
    readPropertyValue(propertiesText, 'sonar.javascript.lcov.reportPaths').includes(destination),
    `${destination} is not in sonar.javascript.lcov.reportPaths`,
  )
})

test('scripts:test measures the scripts, not their tests: its lcov names run-ci-check.mjs and no *.test.mjs', () => {
  // Runs the shipped command's own flags over one small test file (it imports run-ci-check.mjs and
  // starts no processes), with the report redirected to a scratch directory, so this does not
  // start the whole suite from inside itself.
  // Node does not create the report's directory, so the command makes it first; drop that part.
  const words = scriptsTestCommand().split(' && ').at(-1).split(/\s+/)
  assert.equal(words[0], 'node')
  const scratch = mkdtempSync(path.join(realpathSync(tmpdir()), 'scripts-lcov-'))
  const lcovPath = path.join(scratch, 'lcov.info')
  try {
    const args = words
      .slice(1)
      .map((word) =>
        word === 'scripts/*.test.mjs'
          ? 'scripts/check-ci-jobs-match-ci-check.test.mjs'
          : word.replace(/=\S*lcov\.info$/, () => `=${lcovPath}`),
      )
    // Inside a `node --test` run these two would make the nested run behave as one of its tests.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => key !== 'NODE_TEST_CONTEXT' && key !== 'NODE_V8_COVERAGE',
      ),
    )
    const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const sourceFiles = readFileSync(lcovPath, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('SF:'))
      .map((line) => line.slice(3))
    assert.ok(sourceFiles.includes('scripts/run-ci-check.mjs'), sourceFiles.join('\n'))
    assert.deepEqual(
      sourceFiles.filter((file) => file.endsWith('.test.mjs')),
      [],
    )
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
})

test('the rewrite leaves Node’s lcov SF: paths repo-root-relative, for every report the properties list', () => {
  // Node writes `SF:` relative to the directory it ran in, which for scripts:test is the
  // repository root already, so a report in scripts/coverage must come out unchanged.
  const nodeLcov = [
    'TN:',
    'SF:scripts/run-script-in-test-helper.mjs',
    'FN:14,runScriptIn',
    'DA:1,4',
    'end_of_record',
    '',
  ].join('\n')
  const propertiesText = readFileSync(path.join(ROOT, 'sonar-project.properties'), 'utf8')
  const dirs = packageDirsFromReportPaths(propertiesText)
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'lcov-nodes-'))
  try {
    for (const dir of dirs) {
      mkdirSync(path.join(root, dir, 'coverage'), { recursive: true })
      writeFileSync(
        path.join(root, dir, 'coverage', 'lcov.info'),
        dir === 'scripts' ? nodeLcov : 'SF:src/a.ts\nend_of_record\n',
      )
    }
    main(root, dirs)
    assert.ok(dirs.includes('scripts'))
    assert.equal(
      readFileSync(path.join(root, 'scripts', 'coverage', 'lcov.info'), 'utf8'),
      nodeLcov,
    )
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

/**
 * True when a vitest config sets `execArgv` to a list holding `--no-sparkplug` on a line that is
 * not a comment.
 */
function runsWorkersWithoutSparkplug(configText) {
  const code = configText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
  return /\bexecArgv:\s*\[[^\]]*'--no-sparkplug'[^\]]*\]/.test(code)
}

test('runsWorkersWithoutSparkplug ignores a commented-out execArgv', () => {
  assert.equal(runsWorkersWithoutSparkplug("// execArgv: ['--no-sparkplug'],"), false)
  assert.equal(runsWorkersWithoutSparkplug("test: {\n  execArgv: ['--no-sparkplug'],\n}"), true)
})

test('scripts:test runs node without the baseline compiler, and node --test hands that on to its test files', () => {
  assert.match(scriptsTestCommand(), /\bnode --no-sparkplug --test\b/)
})

test('sync with the real repo: every package vitest config runs its workers without the baseline compiler', () => {
  // A V8 crash in Node 24's baseline compiler kills a test worker with SIGSEGV, so each node
  // config sets the flag. Reading the files means a new package cannot drop it unnoticed.
  const packagesDir = path.join(ROOT, 'packages')
  const missing = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/vitest.config.ts`)
    .filter((file) => existsSync(path.join(ROOT, file)))
    .filter((file) => !runsWorkersWithoutSparkplug(readFileSync(path.join(ROOT, file), 'utf8')))
  assert.deepEqual(missing, [])
})

test('sync with the real repo: packages whose test run writes coverage match sonar.javascript.lcov.reportPaths', () => {
  // A package's `test` writes a coverage report when its vitest config turns coverage on, so
  // that switch is what decides which lcov files exist for the scan to read.
  const packagesDir = path.join(ROOT, 'packages')
  const packagesWritingCoverage = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      try {
        const config = readFileSync(path.join(packagesDir, entry.name, 'vitest.config.ts'), 'utf8')
        return coverageTurnedOn(config)
      } catch {
        return false
      }
    })
    .map((entry) => `packages/${entry.name}`)
  // The repo-root scripts are measured by `node --test` itself, which `scripts:test` asks to.
  if (scriptsTestCommand().includes('--experimental-test-coverage')) {
    packagesWritingCoverage.push('scripts')
  }

  const propertiesText = readFileSync(path.join(ROOT, 'sonar-project.properties'), 'utf8')
  const reportedPackageDirs = packageDirsFromReportPaths(propertiesText)

  assert.deepEqual(new Set(packagesWritingCoverage), new Set(reportedPackageDirs))
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
