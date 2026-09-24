/**
 * Coverage for check-pr-merge-ancestry.mjs, run with Node's built-in
 * test runner.
 *
 * This script's own reason for existing is a dependency shape none of its siblings have: it
 * needs network access and `gh` CLI auth to enumerate merged pull requests. So the tests here
 * cover only the PURE logic — `parseArgs`, `mapGhPrListOutput`, and `checkAncestryAndReport` —
 * with the GitHub API call and the `git merge-base` call both factored out and injected,
 * never a real `gh` invocation or a real git checkout.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkAncestryAndReport, mapGhPrListOutput, parseArgs } from './check-pr-merge-ancestry.mjs'

test('parseArgs: defaults survive when nothing is passed', () => {
  assert.deepEqual(parseArgs([], { limit: 30, repo: 'navecss/temp-navecss' }), {
    limit: 30,
    repo: 'navecss/temp-navecss',
  })
})

test('parseArgs: --limit and --repo, space-separated', () => {
  assert.deepEqual(
    parseArgs(['--limit', '10', '--repo', 'navecss/other'], {
      limit: 30,
      repo: 'navecss/temp-navecss',
    }),
    { limit: 10, repo: 'navecss/other' },
  )
})

test('parseArgs: --limit= and --repo=, equals-joined', () => {
  assert.deepEqual(
    parseArgs(['--limit=5', '--repo=navecss/other'], { limit: 30, repo: 'navecss/temp-navecss' }),
    { limit: 5, repo: 'navecss/other' },
  )
})

test('parseArgs: an unrecognised flag is ignored, not rejected', () => {
  assert.deepEqual(
    parseArgs(['--verbose', '--limit=7'], { limit: 30, repo: 'navecss/temp-navecss' }),
    {
      limit: 7,
      repo: 'navecss/temp-navecss',
    },
  )
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
