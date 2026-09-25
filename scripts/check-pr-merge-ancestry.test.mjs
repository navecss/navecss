/**
 * Coverage for check-pr-merge-ancestry.mjs, run with Node's built-in
 * test runner.
 *
 * This script's own reason for existing is a dependency shape none of its siblings have: it
 * needs network access and `gh` CLI auth to enumerate merged pull requests. The pure logic —
 * `parseArgs`, `repoFromRemoteUrl`, `mapGhPrListOutput`, and `checkAncestryAndReport` — is
 * covered directly. The orchestration in `runMergeAncestryCheck` routes every subprocess call
 * through one injected `run(command, args)`, so its branching (bad `--limit`, a non-GitHub
 * origin, a shallow checkout, a failing `gh` or `git fetch`, call ordering, and the happy path)
 * is covered the same way, with a synthetic `run` and never a real subprocess, network call, or
 * `gh` auth.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkAncestryAndReport,
  mapGhPrListOutput,
  parseArgs,
  realRun,
  repoFromRemoteUrl,
  runMergeAncestryCheck,
} from './check-pr-merge-ancestry.mjs'

/**
 * Every `--limit` form that must be rejected, shared by the parser and orchestration tests.
 */
const BAD_LIMIT_ARGVS = [['--limit'], ['--limit=abc'], ['--limit=0'], ['--limit=-3']]

test('parseArgs: defaults survive when nothing is passed', () => {
  assert.deepEqual(parseArgs([], { limit: 30 }), { limit: 30 })
})

test('parseArgs: --limit, space-separated', () => {
  assert.deepEqual(parseArgs(['--limit', '10'], { limit: 30 }), { limit: 10 })
})

test('parseArgs: --limit=, equals-joined', () => {
  assert.deepEqual(parseArgs(['--limit=5'], { limit: 30 }), { limit: 5 })
})

test('parseArgs: an unrecognised flag is ignored, not rejected', () => {
  assert.deepEqual(parseArgs(['--verbose', '--limit=7'], { limit: 30 }), { limit: 7 })
})

test('parseArgs: a --limit that is missing, non-integer or below 1 throws', () => {
  for (const argv of BAD_LIMIT_ARGVS) {
    assert.throws(() => parseArgs(argv, { limit: 30 }), undefined, `argv ${JSON.stringify(argv)}`)
  }
})

test('repoFromRemoteUrl: every GitHub remote shape maps to owner/name, anything else to null', () => {
  const cases = [
    ['git@github.com:owner/name.git', 'owner/name'],
    ['https://github.com/owner/name.git', 'owner/name'],
    ['https://github.com/owner/name', 'owner/name'],
    ['ssh://git@github.com/owner/name.git\n', 'owner/name'],
    ['ssh://git@github.com:22/owner/name.git', 'owner/name'],
    ['ssh://git@github.com:22/owner/name', 'owner/name'],
    ['git@gitlab.com:owner/name.git', null],
  ]
  for (const [url, expected] of cases) {
    assert.equal(repoFromRemoteUrl(url), expected, `url ${JSON.stringify(url)}`)
  }
})

test('mapGhPrListOutput: unwraps the mergeCommit Commit object to its bare oid', () => {
  const raw = [
    { number: 78, mergeCommit: { oid: '9299792' }, baseRefName: 'main', title: 'test(repo): x' },
  ]
  assert.deepEqual(mapGhPrListOutput(raw), [
    { number: 78, mergeCommit: '9299792', baseRefName: 'main', title: 'test(repo): x' },
  ])
})

test('mapGhPrListOutput: a PR with no mergeCommit at all maps to null, not a crash', () => {
  const raw = [{ number: 12, mergeCommit: null, baseRefName: 'main', title: 'x' }]
  assert.deepEqual(mapGhPrListOutput(raw), [
    { number: 12, mergeCommit: null, baseRefName: 'main', title: 'x' },
  ])
})

test('checkAncestryAndReport: every PR an ancestor of origin/main reports 0 failures and exit 0', () => {
  const prs = [
    { number: 1, mergeCommit: 'aaa', baseRefName: 'main' },
    { number: 2, mergeCommit: 'bbb', baseRefName: 'main' },
  ]
  const result = checkAncestryAndReport(prs, () => true)
  assert.equal(result.checked, 2)
  assert.deepEqual(result.failed, [])
  assert.equal(result.exitCode, 0)
  assert.match(result.report, /2 merged pull request\(s\) checked, all 2 an ancestor/)
})

test('checkAncestryAndReport: a PR whose merge commit is not an ancestor is named by number, exit 1', () => {
  // The shape this guard exists to catch: a merge commit that landed on an orphaned
  // branch, never on origin/main.
  const prs = [
    { number: 77, mergeCommit: 'aaa', baseRefName: 'main' },
    { number: 78, mergeCommit: '9299792', baseRefName: 'eng/425-license-parity-scope-comment' },
  ]
  const isAncestor = (sha) => sha === 'aaa'
  const result = checkAncestryAndReport(prs, isAncestor)
  assert.equal(result.checked, 2)
  assert.deepEqual(result.failed, [
    { number: 78, mergeCommit: '9299792', baseRefName: 'eng/425-license-parity-scope-comment' },
  ])
  assert.equal(result.exitCode, 1)
  assert.match(result.report, /2 merged pull request\(s\) checked, 1 not an ancestor/)
  assert.match(
    result.report,
    /#78 \(base eng\/425-license-parity-scope-comment\): merge commit 9299792/,
  )
})

test('checkAncestryAndReport: names every failing PR, not just the first', () => {
  const prs = [
    { number: 1, mergeCommit: 'aaa', baseRefName: 'main' },
    { number: 2, mergeCommit: 'bbb', baseRefName: 'main' },
  ]
  const result = checkAncestryAndReport(prs, () => false)
  assert.deepEqual(
    result.failed.map((f) => f.number),
    [1, 2],
  )
  assert.match(result.report, /#1 /)
  assert.match(result.report, /#2 /)
})

test('checkAncestryAndReport: a PR with no reported merge commit fails rather than passing by omission', () => {
  const prs = [{ number: 5, mergeCommit: null, baseRefName: 'main' }]
  let called = false
  const isAncestor = () => {
    called = true
    return true
  }
  const result = checkAncestryAndReport(prs, isAncestor)
  assert.equal(called, false, 'isAncestor must not be called for a PR with no merge commit')
  assert.equal(result.exitCode, 1)
  assert.deepEqual(result.failed, [{ number: 5, mergeCommit: null, baseRefName: 'main' }])
  assert.match(result.report, /no merge commit reported by the API/)
})

test('checkAncestryAndReport: zero merged PRs is a legitimate, non-failing state', () => {
  const result = checkAncestryAndReport([], () => {
    throw new Error('isAncestor must not be called with an empty PR list')
  })
  assert.equal(result.checked, 0)
  assert.deepEqual(result.failed, [])
  assert.equal(result.exitCode, 0)
  assert.match(result.report, /0 merged pull request\(s\) checked, all 0 an ancestor/)
})

// ── runMergeAncestryCheck: the orchestration, with a synthetic `run` ─────────────────────

const ORIGIN_URL = 'https://github.com/navecss/navecss.git'

function makeRun(responses) {
  const calls = []
  const run = (command, args) => {
    calls.push({ command, args })
    for (const { when, reply } of responses) {
      if (when(command, args)) {
        return reply
      }
    }
    throw new Error(`unexpected call: ${command} ${JSON.stringify(args)}`)
  }
  return { calls, run }
}

const isOriginUrlCall = (command, args) =>
  command === 'git' && args[0] === 'remote' && args[1] === 'get-url'
const isShallowCall = (command, args) => command === 'git' && args[0] === 'rev-parse'
const isGhListCall = (command) => command === 'gh'
const isFetchCall = (command, args) => command === 'git' && args[0] === 'fetch'
const isMergeBaseCall = (command, args) => command === 'git' && args[0] === 'merge-base'

const HEALTHY_REPLIES = {
  origin: { status: 0, stdout: ORIGIN_URL },
  shallow: { status: 0, stdout: 'false\n' },
  gh: { status: 0, stdout: '[]' },
  fetch: { status: 0, stdout: '' },
  mergeBase: { status: 0, stdout: '' },
}
const CALL_MATCHERS = {
  origin: isOriginUrlCall,
  shallow: isShallowCall,
  gh: isGhListCall,
  fetch: isFetchCall,
  mergeBase: isMergeBaseCall,
}

/**
 * A runner answering every call as a healthy checkout would, except the replies in `overrides`.
 */
function runWith(overrides = {}) {
  const unknown = Object.keys(overrides).filter((key) => !Object.hasOwn(CALL_MATCHERS, key))
  if (unknown.length > 0) {
    throw new Error(`runWith: unknown override key(s): ${unknown.join(', ')}`)
  }
  const replies = { ...HEALTHY_REPLIES, ...overrides }
  return makeRun(
    Object.entries(CALL_MATCHERS).map(([key, when]) => ({ when, reply: replies[key] })),
  )
}

test('runWith: a misspelled override key throws instead of falling back to the healthy reply', () => {
  assert.throws(() => runWith({ fetech: { status: 1, stdout: '', stderr: '' } }), /fetech/)
})

test('runMergeAncestryCheck: a bad --limit exits 2 and never calls the runner', () => {
  for (const argv of BAD_LIMIT_ARGVS) {
    const { calls, run } = makeRun([])
    const result = runMergeAncestryCheck(argv, run)
    assert.equal(result.exitCode, 2, `argv ${JSON.stringify(argv)}`)
    assert.equal(calls.length, 0, `argv ${JSON.stringify(argv)} should call the runner zero times`)
  }
})

test('runMergeAncestryCheck: a non-GitHub origin exits 2 and never calls gh', () => {
  const { calls, run } = runWith({
    origin: { status: 0, stdout: 'git@gitlab.com:owner/name.git\n' },
  })
  const result = runMergeAncestryCheck([], run)
  assert.equal(result.exitCode, 2)
  assert.match(result.stderr, /not a GitHub remote/)
  assert.equal(
    calls.some((c) => isGhListCall(c.command)),
    false,
  )
})

test('runMergeAncestryCheck: a shallow checkout exits 2, names --unshallow, never calls gh', () => {
  const { calls, run } = runWith({ shallow: { status: 0, stdout: 'true\n' } })
  const result = runMergeAncestryCheck([], run)
  assert.equal(result.exitCode, 2)
  assert.match(result.stderr, /--unshallow/)
  assert.equal(
    calls.some((c) => isGhListCall(c.command)),
    false,
  )
})

test('runMergeAncestryCheck: gh pr list runs before git fetch origin main', () => {
  const { calls, run } = runWith()
  const result = runMergeAncestryCheck([], run)
  assert.equal(result.exitCode, 0)
  const ghIndex = calls.findIndex((c) => isGhListCall(c.command))
  const fetchIndex = calls.findIndex((c) => isFetchCall(c.command, c.args))
  assert.ok(ghIndex !== -1 && fetchIndex !== -1, 'both gh and fetch must be called')
  assert.ok(ghIndex < fetchIndex, 'gh pr list must run before git fetch origin main')
})

test('runMergeAncestryCheck: gh pr list is sorted by sort:updated-desc, not creation date', () => {
  const { calls, run } = runWith()
  runMergeAncestryCheck([], run)
  const ghCall = calls.find((c) => isGhListCall(c.command))
  const searchIndex = ghCall.args.indexOf('--search')
  assert.ok(searchIndex !== -1, '--search must be present')
  assert.equal(ghCall.args[searchIndex + 1], 'sort:updated-desc')
})

test('runMergeAncestryCheck: a failing gh call exits 2 with a stderr message, whether or not the runner supplied one', () => {
  const cases = [
    {
      name: 'gh reports its own error',
      reply: { status: 1, stdout: '', stderr: 'gh: authentication required' },
      messagePattern: /authentication required/,
    },
    {
      name: 'gh exits with no status and no stderr',
      reply: { status: null, stdout: '', stderr: '' },
      messagePattern: null,
    },
  ]
  for (const { name, reply, messagePattern } of cases) {
    const { run } = runWith({ gh: reply })
    const result = runMergeAncestryCheck([], run)
    assert.equal(result.exitCode, 2, name)
    assert.ok(result.stderr.length > 0, `${name}: stderr must not be empty`)
    if (messagePattern) {
      assert.match(result.stderr, messagePattern, name)
    }
    assert.doesNotMatch(result.stdout, /merged pull request/, name)
  }
})

test('runMergeAncestryCheck: a shallow check that fails to run exits 2 and never calls gh', () => {
  const { calls, run } = runWith({
    shallow: { status: 128, stdout: '', stderr: 'fatal: not a git repository' },
  })
  const result = runMergeAncestryCheck([], run)
  assert.equal(result.exitCode, 2)
  assert.equal(
    calls.some((c) => isGhListCall(c.command)),
    false,
  )
})

test('runMergeAncestryCheck: a failing git fetch exits 2 with a stderr message and makes no merge-base call, whether or not the runner supplied one', () => {
  const cases = [
    {
      name: 'fetch reports its own error',
      reply: { status: 1, stdout: '', stderr: 'fatal: could not read from remote' },
      messagePattern: /could not read from remote/,
    },
    {
      name: 'fetch exits with no stderr',
      reply: { status: 1, stdout: '', stderr: '' },
      messagePattern: null,
    },
  ]
  for (const { name, reply, messagePattern } of cases) {
    const { calls, run } = runWith({ fetch: reply })
    const result = runMergeAncestryCheck([], run)
    assert.equal(result.exitCode, 2, name)
    assert.ok(result.stderr.length > 0, `${name}: stderr must not be empty`)
    if (messagePattern) {
      assert.match(result.stderr, messagePattern, name)
    }
    assert.equal(
      calls.some((c) => isMergeBaseCall(c.command, c.args)),
      false,
      name,
    )
  }
})

test('realRun: a command that does not exist returns status null and a non-empty ENOENT stderr', () => {
  const result = realRun('navecss-no-such-command-for-test', [])
  assert.equal(result.status, null)
  assert.ok(result.stderr.length > 0, 'stderr must not be empty on a spawn failure')
  assert.match(result.stderr, /ENOENT/)
})

test('runMergeAncestryCheck: happy path, two merged PRs both ancestors, exit 0', () => {
  const prsJson = JSON.stringify([
    { number: 1, mergeCommit: { oid: 'aaa' }, baseRefName: 'main', title: 'one' },
    { number: 2, mergeCommit: { oid: 'bbb' }, baseRefName: 'main', title: 'two' },
  ])
  const { run } = runWith({ gh: { status: 0, stdout: prsJson } })
  const result = runMergeAncestryCheck([], run)
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /2 merged pull request\(s\) checked, all 2 an ancestor/)
})
