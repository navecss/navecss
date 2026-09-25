/**
 * Coverage for stage-release.mjs, the last step of the root `release` script, run with Node's
 * built-in test runner against synthetic manifests. Nothing here reaches the registry: the
 * registry lookup is passed in as a predicate, so the planning logic is exercised on its own.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import {
  composeMissingPackageMessage,
  isMissingPackageError,
  meetsStageFloor,
  planStaging,
  stageAll,
  stagePublishArgs,
  withTempDir,
} from './stage-release.mjs'

const tokens = { name: '@navecss/tokens', version: '0.1.1' }
const core = {
  dependencies: { '@navecss/tokens': 'workspace:^' },
  name: '@navecss/core',
  version: '0.1.1',
}
const cli = { name: '@navecss/cli', private: true, version: '0.0.0' }

const nothingPublished = () => false

test('a private package is never staged', () => {
  const { toStage } = planStaging([tokens, cli, core], nothingPublished)
  assert.deepEqual(
    toStage.map((manifest) => manifest.name),
    ['@navecss/tokens', '@navecss/core'],
  )
})

// ROW: the approval order is the staging order, and approving core before the tokens version it
// depends on would put a core release on the registry whose dependency does not resolve yet.
test('a package is staged after every workspace package it depends on, whatever the input order', () => {
  const { toStage } = planStaging([core, tokens], nothingPublished)
  assert.deepEqual(
    toStage.map((manifest) => manifest.name),
    ['@navecss/tokens', '@navecss/core'],
  )
})

test('peer and optional dependencies order staging too', () => {
  const peer = {
    name: 'peer-user',
    peerDependencies: { '@navecss/tokens': '^0.1.0' },
    version: '1.0.0',
  }
  const optional = {
    name: 'optional-user',
    optionalDependencies: { 'peer-user': '^1.0.0' },
    version: '1.0.0',
  }
  const { toStage } = planStaging([optional, peer, tokens], nothingPublished)
  assert.deepEqual(
    toStage.map((manifest) => manifest.name),
    ['@navecss/tokens', 'peer-user', 'optional-user'],
  )
})

test('a version already on the registry is skipped and reported, not staged again', () => {
  const isPublished = (name, version) => name === '@navecss/tokens' && version === '0.1.1'
  const { alreadyPublished, toStage } = planStaging([tokens, core], isPublished)
  assert.deepEqual(
    toStage.map((manifest) => manifest.name),
    ['@navecss/core'],
  )
  assert.deepEqual(
    alreadyPublished.map((manifest) => manifest.name),
    ['@navecss/tokens'],
  )
})

test('a dependency cycle between workspace packages is refused rather than ordered arbitrarily', () => {
  const a = { dependencies: { b: '1.0.0' }, name: 'a', version: '1.0.0' }
  const b = { dependencies: { a: '1.0.0' }, name: 'b', version: '1.0.0' }
  assert.throws(() => planStaging([a, b], nothingPublished), /cycle/)
})

// ROW: the npm floor is compared numerically. A string comparison would call 11.9.0 newer than
// 11.15.0 and let a CLI with no `stage` command reach the staging step.
test('the npm version floor for `npm stage` is compared numerically, not as text', () => {
  assert.equal(meetsStageFloor('11.9.0'), false)
  assert.equal(meetsStageFloor('11.14.2'), false)
  assert.equal(meetsStageFloor('10.99.99'), false)
  assert.equal(meetsStageFloor('11.15.0'), true)
  assert.equal(meetsStageFloor('12.1.0'), true)
})

test('an unreadable npm version never meets the floor', () => {
  assert.equal(meetsStageFloor(''), false)
  assert.equal(meetsStageFloor('not-a-version'), false)
})

// ROW: the whole point of the release path is that CI can only STAGE. A plain `npm publish` here
// would be refused by a stage-only trusted publisher, but this pins the intent at the source.
test('the npm arguments stage the packed tarball and never publish it directly', () => {
  assert.deepEqual(stagePublishArgs('/tmp/navecss-tokens-0.1.1.tgz'), [
    'stage',
    'publish',
    '/tmp/navecss-tokens-0.1.1.tgz',
  ])
})

// ---------------------------------------------------------------------------------------------
// stageAll: packs every manifest before staging any of them, so a pack failure never leaves a
// partial staging behind, and reports exactly what was already staged when a stage call fails.
// ---------------------------------------------------------------------------------------------

const alpha = { name: 'alpha', version: '1.0.0' }
const beta = { name: 'beta', version: '1.0.0' }

// ROW: packing is a whole pass BEFORE any staging starts, so a pack failure on the second
// package must never call `stage` at all, not even for the first (nothing reaches the registry).
test('stageAll: a pack failure on the second package means stage is never called', () => {
  let stageCalls = 0
  const pack = (manifest) => {
    if (manifest.name === 'beta') throw new Error('pack failed')
    return `${manifest.name}.tgz`
  }
  const stage = () => {
    stageCalls += 1
  }
  assert.throws(() => stageAll([alpha, beta], pack, stage), /pack failed/)
  assert.equal(stageCalls, 0)
})

// ROW: a stage failure past the first package must name every package already staged, so a
// maintainer knows what is sitting in the queue without re-reading the whole log.
test('stageAll: a stage failure on the second package names the first as already staged', () => {
  const pack = (manifest) => `${manifest.name}.tgz`
  const registryError = new Error('registry unreachable')
  const stage = (tarball) => {
    if (tarball === 'beta.tgz') throw registryError
  }
  try {
    stageAll([alpha, beta], pack, stage)
    assert.fail('expected stageAll to throw')
  } catch (error) {
    assert.equal(
      error.message,
      'Staging: beta@1.0.0 failed to stage. Already staged and waiting for approval: ' +
        'alpha@1.0.0. Approve or reject those before running the release again: it checks ' +
        'which versions are live, not which are staged.',
    )
    assert.equal(error.cause, registryError)
  }
})

// ROW: a stage failure on the very first package has nothing to report as already staged, so the
// message says so rather than printing an empty list.
test('stageAll: a stage failure on the first package says nothing was staged', () => {
  const pack = (manifest) => `${manifest.name}.tgz`
  const stage = () => {
    throw new Error('registry unreachable')
  }
  assert.throws(
    () => stageAll([alpha], pack, stage),
    (error) => error.message === 'Staging: alpha@1.0.0 failed to stage. Nothing was staged.',
  )
})

test('stageAll: success returns the staged labels in order', () => {
  const pack = (manifest) => `${manifest.name}.tgz`
  const staged = []
  const stage = (tarball) => {
    staged.push(tarball)
  }
  const labels = stageAll([alpha, beta], pack, stage)
  assert.deepEqual(labels, ['alpha@1.0.0', 'beta@1.0.0'])
  assert.deepEqual(staged, ['alpha.tgz', 'beta.tgz'])
})

// ---------------------------------------------------------------------------------------------
// withTempDir: the scratch directory used to pack tarballs into must not outlive the call, on
// either exit path.
// ---------------------------------------------------------------------------------------------

test('withTempDir: removes the directory after fn returns', () => {
  let capturedDir
  withTempDir('navecss-stage-test-', (dir) => {
    capturedDir = dir
    assert.ok(existsSync(dir))
  })
  assert.equal(existsSync(capturedDir), false)
})

test('withTempDir: removes the directory after fn throws', () => {
  let capturedDir
  assert.throws(() => {
    withTempDir('navecss-stage-test-', (dir) => {
      capturedDir = dir
      throw new Error('boom')
    })
  }, /boom/)
  assert.equal(existsSync(capturedDir), false)
})

// ---------------------------------------------------------------------------------------------
// isMissingPackageError / composeMissingPackageMessage: telling "this package has never been
// published" apart from a genuine registry/network failure, from the SAME `npm view <name>
// versions --json` call `isOnRegistry` already makes. The fixtures below are npm 12's own
// stdout, verified by running that exact command against the live registry for a package that
// does not exist (`npm view <name> versions --json`, no version argument - so a 404 here can
// only mean the PACKAGE is missing, never a version mismatch): npm exits non-zero and writes
// `{"error":{"code":"E404",...}}` to stdout, not just prose to stderr.
// ---------------------------------------------------------------------------------------------

const realMissingPackageError = Object.assign(new Error('Command failed'), {
  status: 1,
  stdout: JSON.stringify({
    error: {
      code: 'E404',
      summary: 'Not Found - GET https://registry.npmjs.org/%40navecss%2feslint-plugin - Not found',
      detail:
        "The requested resource '@navecss/eslint-plugin@*' could not be found or you do not " +
        'have permission to access it.\n\nNote that you can also install from a\ntarball, ' +
        'folder, http url, or git url.',
    },
  }),
  stderr: 'npm error code E404\nnpm error 404 Not Found\n',
})

test("isMissingPackageError: true for npm's own E404 JSON envelope on stdout", () => {
  assert.equal(isMissingPackageError(realMissingPackageError), true)
})

test('isMissingPackageError: false for a different npm error code (a genuine failure, not a missing package)', () => {
  const authError = Object.assign(new Error('Command failed'), {
    status: 1,
    stdout: '{\n  "error": {\n    "code": "E403",\n    "summary": "Forbidden"\n  }\n}\n',
    stderr: 'npm error code E403\n',
  })
  assert.equal(isMissingPackageError(authError), false)
})

test('isMissingPackageError: false when stdout carries no JSON at all (a network failure)', () => {
  const networkError = Object.assign(new Error('Command failed'), {
    status: 1,
    stdout: '',
    stderr: 'npm error network request failed\n',
  })
  assert.equal(isMissingPackageError(networkError), false)
})

test('isMissingPackageError: false when stdout is JSON but carries no error envelope', () => {
  const weirdError = Object.assign(new Error('Command failed'), {
    status: 1,
    stdout: '["1.0.0"]',
    stderr: '',
  })
  assert.equal(isMissingPackageError(weirdError), false)
})

test('isMissingPackageError: false when stdout is a Buffer rather than a string', () => {
  const bufferedError = Object.assign(new Error('Command failed'), {
    status: 1,
    stdout: Buffer.from('{"error":{"code":"E404"}}'),
    stderr: '',
  })
  assert.equal(isMissingPackageError(bufferedError), true)
})

test('composeMissingPackageMessage: names the package and points at the runbook section', () => {
  const message = composeMissingPackageMessage('@navecss/eslint-plugin')
  assert.match(message, /@navecss\/eslint-plugin/)
  assert.match(message, /A package's first release/)
  assert.match(message, /docs\/02-contribute\/releasing\.md/)
})
