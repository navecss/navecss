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
 * For the N most recently updated merged pull requests on a repo, this fetches the PR's merge
 * commit SHA and asserts `git merge-base --is-ancestor <mergeCommit> origin/main`. A PR whose
 * merge commit is not an ancestor of `origin/main` is exactly that shape: GitHub calls it
 * merged, and the tree that matters never received it.
 *
 * A red means "not on `main` now", which is not always "never": a pull request merged into a
 * feature branch that is itself still open and headed for `main` reads the same until that
 * branch lands. The report prints each failing pull request's base branch for exactly that
 * reason: a base still open is a wait, a base already retired is the loss this check exists
 * to find.
 *
 * The repository is derived from the local checkout's `origin` remote, not a flag: the
 * ancestry assertion reads the LOCAL `origin/main`, so the pull requests listed must be
 * `origin`'s own — a repository named on the command line could check some other project's
 * pull requests against this checkout's history, which asserts nothing meaningful.
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
 * (`node scripts/check-pr-merge-ancestry.mjs`), not as part of the offline chain.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_LIMIT = 30

/**
 * Parses `--limit <n>` / `--limit=<n>` out of `argv` (already sliced past `node script.mjs`),
 * falling back to `defaults` for a limit left unset. Unrecognised arguments are ignored rather
 * than rejected, matching this repo's other flag-parsing scripts (e.g.
 * `check-core-contract-drift.mjs`'s bare `--write`).
 *
 * Throws when `--limit`'s value is missing, not an integer, or less than 1: a limit of 0 or
 * fewer asks `gh` for a window that cannot contain a PR, and a non-integer is a typo, neither
 * of which should run any command and report a hollow pass.
 */
export function parseArgs(argv, defaults) {
  const args = { ...defaults }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--limit') {
      args.limit = parseLimit(argv[i + 1])
      i += 1
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseLimit(arg.slice('--limit='.length))
    }
  }
  return args
}

/**
 * Coerces `raw` (a `--limit` value, still a string or `undefined`) to a positive integer,
 * throwing when it is missing, not an integer, or less than 1.
 */
function parseLimit(raw) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `--limit must be a positive integer, got: ${raw === undefined ? '(missing)' : raw}`,
    )
  }
  return n
}

/**
 * Extracts `owner/name` from a `git remote get-url origin` GitHub URL, in every shape `git`
 * actually hands back (`git@github.com:owner/name.git`, `https://github.com/owner/name.git`,
 * `https://github.com/owner/name`, `ssh://git@github.com/owner/name.git`; a trailing newline
 * from the subprocess call is tolerated). Returns `null` for anything not on `github.com`:
 * `gh pr list` only ever talks to GitHub, so a non-GitHub origin has no repository this script
 * can meaningfully query.
 */
export function repoFromRemoteUrl(url) {
  const trimmed = url.trim()
  const patterns = [
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) {
      return `${match[1]}/${match[2]}`
    }
  }
  return null
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
 * The orchestration, with every subprocess call factored out to the injected `run(command,
 * args)` (returning `{ status, stdout, stderr }`, mirroring `spawnSync`'s shape closely enough
 * that the real wiring in `main()` is a thin pass-through). Nothing in here spawns anything
 * itself, so a test drives every branch — bad `--limit`, a non-GitHub origin, a shallow
 * checkout, a failing `gh` or `git fetch`, and the happy path — with a synthetic `run` and no
 * real subprocess, network call, or `gh` auth.
 *
 * The call order is deliberate and each step short-circuits the rest on failure:
 *
 * 1. `--limit` is validated before any command runs — a bad flag should not spend a network
 *    call before reporting.
 * 2. `origin`'s remote URL is read and mapped to `owner/name`; a non-GitHub origin stops here,
 *    before any `gh` or `git` history call, because `gh pr list` cannot query a repository
 *    that is not on GitHub.
 * 3. The checkout is asserted non-shallow before `gh pr list` runs. In a shallow clone an
 *    older merge commit is simply absent from history, `git merge-base --is-ancestor` exits
 *    non-zero on the missing object, and every such PR would be reported as not reaching
 *    `main` — a false failure, not a true one.
 * 4. `gh pr list` runs BEFORE `git fetch origin main`, not after: a pull request merged in the
 *    gap between an earlier fetch and a later list would carry a merge commit not yet in the
 *    fetched `origin/main`, and would read as a false failure too. Listing first and fetching
 *    second closes that gap.
 * 5. Only then does the ancestry check run, against the just-fetched `origin/main`.
 *
 * `gh pr list` sorts by `sort:updated-desc`, not creation date (`gh`'s default): a long-lived
 * pull request merged yesterday can fall outside a creation-ordered window, while merging a
 * pull request updates it, so an update-ordered window contains every recently merged pull
 * request unless N others were updated even more recently.
 */
export function runMergeAncestryCheck(argv, run) {
  let limit
  try {
    ;({ limit } = parseArgs(argv, { limit: DEFAULT_LIMIT }))
  } catch (error) {
    return { exitCode: 2, stdout: '', stderr: error.message }
  }

  const originResult = run('git', ['remote', 'get-url', 'origin'])
  if (originResult.status !== 0) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: originResult.stderr || 'could not read the `origin` remote URL',
    }
  }

  const repo = repoFromRemoteUrl(originResult.stdout)
  if (repo === null) {
    return {
      exitCode: 2,
      stdout: '',
      stderr:
        '`origin` is not a GitHub remote. The ancestry assertion reads the local ' +
        "`origin/main`, so the pull requests listed must be `origin`'s own.",
    }
  }

  const shallowResult = run('git', ['rev-parse', '--is-shallow-repository'])
  if (shallowResult.status !== 0) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: shallowResult.stderr || 'could not determine whether this checkout is shallow',
    }
  }
  if (shallowResult.stdout.trim() === 'true') {
    return {
      exitCode: 2,
      stdout: '',
      stderr:
        'this checkout is shallow: run `git fetch --unshallow origin` first. In a shallow ' +
        'clone an older merge commit is simply absent, and `git merge-base --is-ancestor` ' +
        'would report every such pull request as not reaching main.',
    }
  }

  const ghResult = run('gh', [
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'merged',
    '--search',
    'sort:updated-desc',
    '--limit',
    String(limit),
    '--json',
    'number,mergeCommit,baseRefName,title',
  ])
  if (ghResult.status !== 0) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: ghResult.stderr || '`gh pr list` failed with no output',
    }
  }
  const prs = mapGhPrListOutput(JSON.parse(ghResult.stdout))

  const fetchResult = run('git', ['fetch', 'origin', 'main'])
  if (fetchResult.status !== 0) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: fetchResult.stderr || '`git fetch origin main` failed with no output',
    }
  }

  const isAncestor = (sha) =>
    run('git', ['merge-base', '--is-ancestor', sha, 'origin/main']).status === 0

  const { report, exitCode } = checkAncestryAndReport(prs, isAncestor)
  return exitCode === 0
    ? { exitCode, stdout: report, stderr: '' }
    : { exitCode: 1, stdout: '', stderr: report }
}

/**
 * The one spawn line in this file, wiring `runMergeAncestryCheck`'s injected `run` to a real
 * subprocess call.
 */
function realRun(command, args) {
  // NOSONAR on the one spawn line in this file (rule S4036, PATH-resolved executable): this
  // is a manual tool a maintainer runs in their own checkout, and running THEIR git and gh is
  // the point. It never runs in CI and never takes a command from its input. The shipped
  // gates spawn pnpm and npm the same way.
  const result = spawnSync(command, args, { encoding: 'utf8' }) // NOSONAR
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? `${command}: ${result.error.message}` : ''),
  }
}

/**
 * Entry point: wires `runMergeAncestryCheck` to the real subprocess runner and prints its
 * result.
 */
function main() {
  const { exitCode, stdout, stderr } = runMergeAncestryCheck(process.argv.slice(2), realRun)
  if (stdout) {
    console.log(stdout)
  }
  if (stderr) {
    console.error(stderr)
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
