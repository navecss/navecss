#!/usr/bin/env node
/**
 * Post-merge guard: a pull request GitHub records as merged is not, by that fact alone,
 * guaranteed to have its content reachable from `origin/main`.
 *
 * The failure mode this catches after the fact: a commit was merged into a feature branch,
 * and a DIFFERENT pull request squash-merged the same content into `main` shortly before.
 * GitHub still reports the feature branch's own pull request as "Merged" — the merge itself
 * genuinely happened, into a branch that was, at that moment, already retired — but its merge
 * commit never reaches `main`, because the base it merged into is now an orphan. Nothing
 * before this script asserted that a PR GitHub calls "merged" actually lands its content on
 * the tree that matters.
 *
 * For each of the last N merged pull requests on a repo, this fetches the PR's merge commit
 * SHA and asserts `git merge-base --is-ancestor <mergeCommit> origin/main`. A PR whose merge
 * commit is not an ancestor of `origin/main` is exactly that shape: GitHub calls it merged,
 * and the tree that matters never received it.
 *
 * This script decides no product or process question and never will: it is an instrument, in
 * the shape every sibling `scripts/check-*.mjs` already uses. Its only job is to make a
 * PR that shipped nowhere trip instead of sitting undiscovered until someone goes looking for
 * a "lost" commit by hand.
 *
 * UNLIKE EVERY SIBLING IN THIS DIRECTORY, this check needs network access and `gh` CLI auth:
 * it calls the live GitHub API (via `gh pr list`) and fetches from `origin` before comparing
 * against `origin/main`. Every other `scripts/check-*.mjs` runs offline against the working
 * tree alone. For that reason this is NOT wired into `scripts:check` or `ci:check` — doing so
 * would make an ordinary offline `pnpm run ci:check` fail on a machine with no network or no
 * `gh` auth, for a reason unrelated to the code under test. It is meant to be run manually
 * (`node scripts/check-pr-merge-ancestry.mjs`) or from a dedicated scheduled CI job, not as
 * part of the offline chain.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_LIMIT = 30
const DEFAULT_REPO = 'navecss/navecss'

/**
 * Parses `--limit <n>` / `--limit=<n>` and `--repo <owner/name>` / `--repo=<owner/name>` out
 * of `argv` (already sliced past `node script.mjs`), falling back to `defaults` for either
 * one left unset. Unrecognised arguments are ignored rather than rejected, matching this
 * repo's other flag-parsing scripts (e.g. `check-core-contract-drift.mjs`'s bare `--write`).
 */
export function parseArgs(argv, defaults) {
  const args = { ...defaults }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--limit') {
      args.limit = Number(argv[i + 1])
      i += 1
    } else if (arg.startsWith('--limit=')) {
      args.limit = Number(arg.slice('--limit='.length))
    } else if (arg === '--repo') {
      args.repo = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--repo=')) {
      args.repo = arg.slice('--repo='.length)
    }
  }
  return args
}

/**
 * Normalises `gh pr list --json number,mergeCommit,baseRefName,title`'s raw parsed JSON into
 * `{ number, mergeCommit, baseRefName, title }` records with `mergeCommit` as a plain SHA
 * string (or `null`). The GitHub API's `mergeCommit` field is a Commit object (`{ oid, ... }`),
 * not a bare string, so a caller reading `pr.mergeCommit` directly gets an object where it
 * expects a SHA; this is the one place that unwraps it.
 */
export function mapGhPrListOutput(rawPulls) {
  return rawPulls.map((pr) => ({
    number: pr.number,
    mergeCommit: pr.mergeCommit?.oid ?? null,
    baseRefName: pr.baseRefName,
    title: pr.title,
  }))
}

/**
 * The pure ancestry-check-and-report logic, with the GitHub API call factored all the way
 * out: `prs` is the already-normalised `{ number, mergeCommit, baseRefName }` list, and
 * `isAncestor(sha)` is the injected ancestry predicate (a real run passes a `git merge-base
 * --is-ancestor` wrapper; a test passes a synthetic function). Nothing in here shells out,
 * so a test drives every branch — all-ancestors, some-not, and a PR with no reported merge
 * commit at all — without a git checkout, a network call, or `gh` auth.
 *
 * A PR with no `mergeCommit` (should not happen for a PR the API calls "merged", but nothing
 * guarantees it) is treated as failing rather than silently skipped: a check that cannot
 * verify a claim it exists to verify must not report a pass by omission.
 */
export function checkAncestryAndReport(prs, isAncestor) {
  const failed = []
  for (const pr of prs) {
    const isKnownAncestor = pr.mergeCommit !== null && isAncestor(pr.mergeCommit)
    if (!isKnownAncestor) {
      failed.push(pr)
    }
  }

  const checked = prs.length
  const lines = []
  if (failed.length === 0) {
    lines.push(
      `PR merge-ancestry check: ${checked} merged pull request(s) checked, all ${checked} ` +
        'an ancestor of origin/main.',
    )
  } else {
    lines.push(
      `PR merge-ancestry check: ${checked} merged pull request(s) checked, ${failed.length} ` +
        'not an ancestor of origin/main:',
      '',
      ...failed.map(({ number, mergeCommit, baseRefName }) => {
        const shaText = mergeCommit ?? '(no merge commit reported by the API)'
        return `  - #${number} (base ${baseRefName}): merge commit ${shaText}`
      }),
    )
  }

  return { checked, failed, report: lines.join('\n'), exitCode: failed.length > 0 ? 1 : 0 }
}

/**
 * `git merge-base --is-ancestor <sha> origin/main`, run inside this checkout.
 */
function isAncestorOfOriginMain(sha) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'])
  return result.status === 0
}

/**
 * Fetches `origin/main`, then checks the last N merged PRs on `repo` for a PR GitHub reports
 * as merged whose merge commit never reached `origin/main`.
 */
function main() {
  const { limit, repo } = parseArgs(process.argv.slice(2), {
    limit: DEFAULT_LIMIT,
    repo: DEFAULT_REPO,
  })

  // The ancestry assertion below is only as good as `origin/main` being current.
  execFileSync('git', ['fetch', 'origin', 'main'], { stdio: 'inherit' })

  const raw = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'merged',
      '--limit',
      String(limit),
      '--json',
      'number,mergeCommit,baseRefName,title',
    ],
    { encoding: 'utf8' },
  )
  const prs = mapGhPrListOutput(JSON.parse(raw))

  const { report, exitCode } = checkAncestryAndReport(prs, isAncestorOfOriginMain)
  if (exitCode === 0) {
    console.log(report)
  } else {
    console.error(report)
  }
  process.exitCode = exitCode
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`.
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node; `process.argv[1]`
// is neither, so an invocation through a symlinked absolute path (macOS's `/tmp` ->
// `/private/tmp`, for one) makes the two sides disagree even under the fixed
// `pathToFileURL` form — `main()` silently never fires and the script exits 0 having
// printed nothing. `realpathSync` on both sides closes that gap too.
// The `process.argv[1] &&` limb is still load-bearing: `argv[1]` is undefined whenever this
// module is imported rather than run as an entry point.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
