/**
 * Coverage for stage-release.mjs, the last step of the root `release` script, run with Node's
 * built-in test runner against synthetic manifests. Nothing here reaches the registry: the
 * registry lookup is passed in as a predicate, so the planning logic is exercised on its own.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { meetsStageFloor, planStaging, stagePublishArgs } from './stage-release.mjs'

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
