#!/usr/bin/env node
/**
 * Tripwire for pinning GitHub Actions references to a commit SHA.
 *
 * A `uses:` reference in a GitHub Actions workflow pinned to a mutable tag (`actions/checkout@v7`)
 * or a branch name can change WHAT RUNS without any diff in this repository: the tag's owner
 * can repoint it to a different commit at any time, and every workflow using it picks up
 * whatever that commit contains on its next run, unreviewed. Pinning to a full 40-character
 * commit SHA (`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`) makes what runs a
 * property of this repository's own history instead of a third party's tag pointer. A trailing
 * `# v7` comment stays useful (it is what a human reads to know which release the SHA IS) and is
 * not itself a pin, so this check ignores it entirely rather than parsing it.
 *
 * Parsed as plain text (a `uses:\s*([^\s#]+)` line match), not a YAML parser: this repo's other
 * `scripts/check-*.mjs` files avoid that dependency for the same reason
 * (`check-adr-structure.mjs`'s own frontmatter reader is the same choice on a different
 * shape of file), and a workflow's `uses:` grammar is simple enough that a full parse buys
 * nothing here.
 *
 * A `uses:` value that starts with `./` is a local composite action path (e.g.
 * `./.github/actions/my-action`): it runs from this repository's own checked-out tree rather
 * than a third party's registry entry, so GitHub's own workflow grammar gives it no `@ref` slot
 * to pin in the first place. This check's whole claim is "the ref cannot be repointed by
 * someone else with no diff here", and a `./` path already satisfies that claim by
 * construction, so it counts as pinned rather than as a specifier missing its ref. Anything
 * else that carries no full commit SHA still fails this check, `docker://image:tag` included: a
 * Docker-reference `uses:` value is read by the same rule as every other specifier, and a bare
 * tag or an unpinned digest form is exactly the mutable-pointer risk this check exists to catch.
 *
 * Extraction is anchored to the start of the (trimmed) line: only `uses:` or `- uses:` as the
 * first token counts, the dash separated from the key by any run of whitespace rather than by
 * exactly one space (a separator this once got wrong, which made the anchor MISS
 * `-   uses: owner/action@v7` entirely: a false negative, and a gate that misses an unpinned
 * ref fails in the direction that costs something). So a `run: |` block scalar mentioning "uses:" mid-sentence, or a
 * full-line YAML comment containing the same substring, is not mistaken for a real step. One
 * case is left unfixed on purpose: a line inside a `run: |` scalar that is itself indented to
 * read literally as `uses: foo@v1` still matches, because telling that apart from a real
 * `uses:` key needs to know it sits inside a scalar block, which needs a YAML parser this file
 * deliberately does not carry (see below).
 *
 * This check fails closed when `.github/workflows/` is missing or empty (no `.yml`/`.yaml`
 * file in it): the alternative, printing "0 `uses:` line(s) across 0 workflow file(s) checked,
 * 0 pinned to a tag", would read as a clean run indistinguishable from one that genuinely had
 * nothing to flag, which is exactly the failure this repository has already ruled against
 * twice (`check-content-link-corpus.mjs`'s `assertNonEmptyMarkdownCorpus`,
 * `check-no-orphaned-chunks.mjs`'s zero-packed-files guard). A directory that does not exist is
 * caught the same way rather than left to surface as a raw `ENOENT`: both cases are reported
 * through the same `GitHub Actions SHA pin gate:` prefix and a non-zero exit, never a bare
 * stack trace.
 *
 * This script decides no product or process question and never will: it is an instrument, in
 * the shape every sibling `scripts/check-*.mjs` already uses. Its only job is to make a
 * tag-pinned action reference trip instead of shipping a supply-chain gap unreviewed.
 *
 * Unlike its sibling `check-pr-merge-ancestry.mjs`, this check is entirely offline
 * against the working tree — no network, no `gh` CLI — so it IS wired into `scripts:check`.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows')

/**
A full, lower- or upper-case, 40-character commit SHA and nothing else.
 */
const FULL_SHA = /^[0-9a-f]{40}$/i

/**
 * Every `uses:` line in `content`, as `{ line, specifier }` (1-indexed line numbers). Anchored
 * to the start of the trimmed line, `uses:` or `- uses:` and nothing before it, so a `run: |`
 * block scalar mentioning "uses:" mid-sentence and a full-line YAML comment containing the same
 * substring are both ignored (see the header comment for the one residual this does not catch).
 * The specifier is everything after `uses:` up to the first run of whitespace or a `#` comment,
 * so a trailing `# v7` annotation is never part of it.
 */
export function extractUsesSpecifiers(content) {
  const results = []
  const lines = content.split(/\r?\n/)
  const usesLine = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/
  lines.forEach((line, index) => {
    const match = line.match(usesLine)
    if (match) {
      results.push({ line: index + 1, specifier: match[1] })
    }
  })
  return results
}

/**
 * True if `specifier` is pinned the way this check requires: either a `./`-prefixed local
 * composite action path (exempt, see the header comment: GitHub's own grammar gives it no
 * `@ref` slot, so there is nothing for a third party to repoint), or a value whose ref
 * (everything after its LAST `@`, so a scoped path like `owner/repo/sub@ref` still resolves to
 * `ref`) is a full 40-hex-character commit SHA. False for a mutable tag or branch (`@v7`,
 * `@main`), false for any other value with no `@` segment (a Docker reference such as
 * `docker://alpine:3.19` included), and false for a Docker reference pinned to a digest rather
 * than a commit SHA (`docker://alpine@sha256:<64 hex>` is 64 hex characters, not 40, and fails
 * the same `FULL_SHA` test as any other wrong-length ref).
 */
export function isPinnedToSha(specifier) {
  if (specifier.startsWith('./')) return true
  const at = specifier.lastIndexOf('@')
  if (at === -1) return false
  return FULL_SHA.test(specifier.slice(at + 1))
}

/**
Every `uses:` reference in `content` that is NOT pinned to a full commit SHA.
 */
export function findTagPinnedUses(content) {
  return extractUsesSpecifiers(content).filter(({ specifier }) => !isPinnedToSha(specifier))
}

/**
 * Workflow file names under `.github/workflows/`, sorted for stable output. Throws when the
 * directory is missing/unreadable, or contains no `.yml`/`.yaml` file: `main()` catches this
 * and reports it as a clean, non-zero failure rather than a silent "0 checked" or a raw ENOENT
 * stack trace (see the header comment's fail-closed paragraph).
 */
function listWorkflowFiles() {
  let entries
  try {
    entries = readdirSync(WORKFLOWS_DIR)
  } catch (error) {
    throw new Error(
      `.github/workflows/ does not exist or could not be read (${error.code ?? error.message}). ` +
        'This is not "0 workflow file(s) checked": the workflow corpus itself is missing or ' +
        'unreachable, which means a path moved or the directory was deleted. Failing closed ' +
        'rather than reporting a clean run.',
    )
  }
  const files = entries.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
  if (files.length === 0) {
    throw new Error(
      '.github/workflows/ contains no `.yml` or `.yaml` file. This is not "0 workflow file(s) ' +
        'checked": the workflow corpus itself is empty, which means a path moved or every ' +
        'workflow was removed. Failing closed rather than reporting a clean run.',
    )
  }
  return files
}

/**
Walk every workflow file, returning the violations plus the census the printed line reports.
 */
function survey() {
  const violations = []
  let totalUsesLines = 0
  const files = listWorkflowFiles()

  for (const file of files) {
    const content = readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')
    const specifiers = extractUsesSpecifiers(content)
    totalUsesLines += specifiers.length
    for (const { line, specifier } of specifiers) {
      if (!isPinnedToSha(specifier)) {
        violations.push({ file, line, specifier })
      }
    }
  }

  return { fileCount: files.length, totalUsesLines, violations }
}

/**
 * Runs the SHA-pin survey and reports every unpinned `uses:` reference by file and line,
 * exiting non-zero if the survey itself fails or any violation is found.
 */
function main() {
  let fileCount
  let totalUsesLines
  let violations
  try {
    ;({ fileCount, totalUsesLines, violations } = survey())
  } catch (error) {
    console.error(`GitHub Actions SHA pin gate: ${error.message}`)
    process.exitCode = 1
    return
  }

  if (violations.length > 0) {
    console.error(
      'GitHub Actions SHA pin gate: a `uses:` reference is not pinned to a full commit SHA:\n',
    )
    for (const { file, line, specifier } of violations) {
      console.error(`  - .github/workflows/${file}:${line}: uses: ${specifier}`)
    }
    console.error(
      '\nPin `uses:` to the full 40-character commit SHA it should resolve to, keeping the ' +
        'version as a trailing comment for a human reading it (e.g. `@<sha> # v7`).',
    )
    process.exitCode = 1
    return
  }

  console.log(
    `GitHub Actions SHA pin gate: ${totalUsesLines} \`uses:\` line(s) across ${fileCount} ` +
      `workflow file(s) checked, 0 pinned to a tag rather than a commit SHA.`,
  )
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
