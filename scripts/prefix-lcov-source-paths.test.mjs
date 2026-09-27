import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import * as subject from './prefix-lcov-source-paths.mjs'

const { main, prefixLcovSourcePaths } = subject

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
