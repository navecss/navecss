#!/usr/bin/env node
/**
 * Tripwire for README export coverage.
 *
 * `packages/core/README.md`'s own `## Exports` table is a hand transcription of the
 * machine-readable `exports` map in that package's own `package.json`, and it went stale
 * within one pull request of being correct: `@navecss/core/no-tokens` was added to the
 * export map and the table did not carry it until a review round added the row. The `exports`
 * map is the source of truth and can simply be read, so this script does: for every
 * `packages/*` package with a manifest, every consumer-facing subpath its own `exports` map
 * declares must appear as a whole name in that package's own `README.md`.
 *
 * Two things this checks NEVER does. It never checks that the surrounding description is
 * accurate or useful — it asserts PRESENCE of the name, as a whole name (`mentionsSpecifier`
 * and `SPECIFIER_CONTINUATION` below; not a bare substring), nothing about what is said
 * around it, and a green run here is not "the README documents this export", only "the README
 * mentions this export's name". And it never checks a private package: `private: true` never
 * produces a published tarball, so a README obligation that exists for consumers of a
 * published package does not apply to one nobody can install (`isNonPrivate`, imported from
 * `check-license-parity.mjs` rather than redefined, since it is the same predicate for the
 * same reason on a third question).
 *
 * WHAT IS IN SCOPE, written as a RULE and not as a list, so a new subpath joins this check
 * the day it is added and nobody has to remember to extend anything. A key is in scope when
 * it is a real, literal, REACHABLE subpath, which is four conditions, and each one closes a
 * legal `exports` shape that is not one:
 *
 *   1. it starts with `./`. An `exports` value may be a top-level CONDITIONS object
 *      (`{"types": ..., "import": ...}`, legal, and sugar for `"."`) whose keys are condition
 *      names rather than subpaths. Read as subpaths they yield demands like `@navecss/x` +
 *      `ypes`, a string no README can honestly contain and that this script's own printed
 *      remedy cannot fix. Both `core` and `tokens` already author this grammar one level down.
 *   2. it contains no `*`. A subpath PATTERN (`"./styles/*"`) names a family, not one
 *      specifier, so there is no single string a README could carry: requiring the literal
 *      `*` would make a README that correctly documents every real file go red.
 *   3. its target is not `null`. `"./internal": null` is how Node BLOCKS a subpath, and
 *      demanding that a deliberately unreachable specifier be documented inverts the job.
 *   4. it is not `"."` or `"./package.json"` (`EXCLUDED_EXPORT_KEYS`, unchanged): `"."` is the
 *      package name itself, already the subject of every README, and `"./package.json"` is
 *      resolver machinery (`import.meta.resolve('pkg/package.json')`), never a subpath a
 *      reader looks up.
 *
 * Conditions 1 to 3 arrived in an earlier review round. The predicate originally
 * kept every key of any object `exports` value, while that review granted this check GATING
 * status on the express ground that such a predicate "has no false-positive mode"; the three
 * shapes above each falsify that, so the predicate is narrowed to match the ground.
 *
 * The literal searched for is the full consumer-facing specifier (`@scope/name` + the
 * subpath, e.g. `@navecss/tokens/css`), not the bare `exports` key (`./css`): a reader looks
 * up what they would type in an `import`/`@import`, and that is what every package's own
 * `## Exports` table already writes.
 *
 * This script decides no product or design question and never will: it is an instrument, in
 * the shape `scripts/check-license-parity.mjs` and `scripts/check-bundling-guard-coverage.mjs`
 * already use. Its only job is to make an undocumented export subpath trip instead of going
 * stale silently, exactly as it did once already.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isNonPrivate } from './check-license-parity.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = path.join(ROOT, 'packages')

/**
Keys never a consumer-facing subpath lookup: the package name itself, and resolver-only machinery.
 */
const EXCLUDED_EXPORT_KEYS = new Set(['.', './package.json'])

/**
 * The consumer-facing specifier for `exportKey` under `packageName` — what a reader would
 * actually type in an `import`/`@import`, e.g. `('@navecss/tokens', './css')` ->
 * `'@navecss/tokens/css'`. Only meaningful for a subpath key; callers exclude `"."` first.
 */
export function consumerFacingSpecifier(packageName, exportKey) {
  return packageName + exportKey.slice(1)
}

/**
 * Every `exports` key of `manifest` in scope for this check, per the four conditions in this
 * file's header: real, literal, reachable subpath keys only.
 *
 * The guard below covers the `exports` values that declare no subpath map, and it is worth
 * being exact about why, because the two halves are not the same. For an ABSENT or `null`
 * field it is load-bearing: `Object.keys` throws on both, so without it this function would
 * not return a wrong answer, it would crash. For a STRING or an ARRAY it is belt-and-braces —
 * both DO carry keys (`Object.keys('./dist/index.js')` and `Object.keys(['./a'])` are numeric
 * index keys), and every one of those fails condition 1 anyway, so the filter alone would
 * already return `[]`. A top-level conditions object likewise carries keys and is excluded by
 * condition 1, not here.
 */
export function inScopeExportKeys(manifest) {
  const exportsField = manifest.exports
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return []
  }
  return Object.keys(exportsField).filter(
    (key) =>
      key.startsWith('./') &&
      !key.includes('*') &&
      exportsField[key] !== null &&
      !EXCLUDED_EXPORT_KEYS.has(key),
  )
}

/**
 * The characters that CONTINUE a specifier. A mention counts only when the character after it
 * falls outside this class, or the file ends there, so a longer sibling name stops satisfying
 * a shorter export: without a boundary, a README mentioning only `@navecss/core/cx-extra`
 * silently satisfies an undocumented `@navecss/core/cx`, which is a false negative in this
 * check's core job on a package that already ships near-sibling names (`./atoms` beside
 * `./atomic`).
 *
 * This class is WHAT THE CORPUS JUSTIFIES, not a claim about every form a README could use.
 * Enumerated over every occurrence of all ten live specifiers in both packages' READMEs when
 * this landed, the following character was a backtick or a straight single quote and nothing
 * else; both fall outside the class, so no live mention stops counting. `/` is inside the
 * class deliberately: a deeper subpath (`@navecss/core/cx/legacy`) is a different specifier,
 * not a mention of this one. A README that ran a specifier straight into a letter or a digit
 * would go red here, and that is the intended direction for this check to fail.
 */
const SPECIFIER_CONTINUATION = /[A-Za-z0-9/_-]/

/**
True if `readmeContent` names `specifier` at a boundary rather than inside a longer name.
 */
function mentionsSpecifier(readmeContent, specifier) {
  let at = readmeContent.indexOf(specifier)
  while (at !== -1) {
    const next = readmeContent[at + specifier.length]
    if (next === undefined || !SPECIFIER_CONTINUATION.test(next)) {
      return true
    }
    at = readmeContent.indexOf(specifier, at + 1)
  }
  return false
}

/**
 * Every subpath specifier `inScopeExportKeys` names for `manifest` that `readmeContent` does
 * not name at a boundary — the check's whole predicate, pure and testable without touching
 * disk.
 */
export function findUndocumentedSubpaths(manifest, readmeContent) {
  return inScopeExportKeys(manifest)
    .map((key) => consumerFacingSpecifier(manifest.name, key))
    .filter((specifier) => !mentionsSpecifier(readmeContent, specifier))
}

/**
Workspace package directory names under `packages/`, sorted for stable output.
 */
function listPackageDirs() {
  return readdirSync(PACKAGES_DIR)
    .filter((entry) => statSync(path.join(PACKAGES_DIR, entry)).isDirectory())
    .sort()
}

/**
Walk `packages/`, returning the violations plus the census the printed line reports.
 */
function survey() {
  const violations = []
  const counts = { checkedPackages: 0, checkedSubpaths: 0, skippedPackages: 0, skippedSubpaths: 0 }

  for (const dir of listPackageDirs()) {
    const manifestPath = path.join(PACKAGES_DIR, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const keys = inScopeExportKeys(manifest)

    if (!isNonPrivate(manifest)) {
      counts.skippedPackages += 1
      counts.skippedSubpaths += keys.length
      continue
    }
    if (keys.length === 0) continue
    counts.checkedPackages += 1
    counts.checkedSubpaths += keys.length

    const readmePath = path.join(PACKAGES_DIR, dir, 'README.md')
    const readmeContent = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : ''
    for (const specifier of findUndocumentedSubpaths(manifest, readmeContent)) {
      violations.push({ dir, specifier })
    }
  }

  return { counts, violations }
}

/**
 * Surveys every NON-PRIVATE package's consumer-facing export subpaths and reports any not
 * mentioned in its own README, exiting non-zero if one is found. Private packages are skipped
 * by construction (`survey()` counts them out), because a private package publishes no tarball;
 * the printed line reports that skipped count on both branches rather than hiding it.
 */
function main() {
  const { counts, violations } = survey()

  if (violations.length > 0) {
    // No tracker reference in the printed line. Command-line output is read by people with
    // no checkout of this repository, and `.github/CONTRIBUTING.md` ("Text the build prints
    // or ships") rules out an internal reference tag there whether it is the whole pointer
    // or only a label on one. Nothing replaces it: the same rule says that where the message
    // already names an act on the reader's own input, that act is the next step and nothing
    // further is needed, and the remedy below names one.
    console.error('README export coverage: a consumer-facing export subpath is undocumented:\n')
    // The repository-relative PATH, not the package name: the reader's next act is opening a
    // file, and `dir` was already collected. It also avoids the `@navecss/tokens's` possessive.
    for (const { dir, specifier } of violations) {
      console.error(`  - ${specifier} (packages/${dir}/README.md)`)
    }
    // Say that the match is bounded, and say it HERE. This is the branch a maintainer reads
    // while looking at a README that already contains the specifier inside a longer name, so
    // a message describing the check as plain presence sends them to grep, find the string,
    // and conclude the gate is broken rather than that the mention does not count.
    console.error(
      "\nAdd a row naming the subpath to the package's own README.md. The name must appear as " +
        'a whole name and not only inside a longer one, so a mention of a near-sibling subpath ' +
        'does not count. This check asserts presence of the name only; write an accurate ' +
        'description around it.',
    )
    process.exitCode = 1
    return
  }

  // The green line states its own scope, per an earlier review's item: what was examined,
  // what was skipped and why, and the presence-only caveat. A pass is the only moment anyone
  // stops looking, so the caveat belongs on THIS branch and not only on the failure text.
  //
  // Two lines, not one sentence carrying all four clauses. As one line it ran 332 characters
  // against a median of 118 — measured when this gate landed, over the EIGHT sibling gates in
  // `scripts:check` at that moment (eleven today). That median is a frozen computation over
  // those eight, not a standing claim about today's siblings: re-point it only by recomputing,
  // never by editing the count to match. Worse than the length, the one-line form put the
  // caveat in the middle and closed on the skip census, so the sentence ended on its least
  // load-bearing clause. Splitting costs no clause: the census is line 1, the verdict is
  // line 2, and the caveat now ENDS the output, which is the position a reader keeps.
  const skipped =
    `${counts.skippedPackages} private package(s) carrying ` +
    `${counts.skippedSubpaths} in-scope subpath(s)`

  if (counts.checkedSubpaths === 0) {
    // A run that compared nothing must not read as a run that compared and passed (the rider
    // published `licensing` overview §4/§5 carries). The exit stays 0
    // because nothing in scope is a legitimate state for this check, and the closing clause
    // says exactly that. It must NOT diagnose WHY the set is empty: this branch keys on
    // `counts.checkedSubpaths === 0`, which an all-private tree reaches and so does a tree
    // with no private package at all whose packages simply declare no in-scope subpath, so
    // any reason phrased as a fact about privateness is false on the second tree while the
    // census beside it reads `0 private package(s)`.
    console.log(
      'README export coverage: 0 in-scope subpath(s) examined, so this run compared NOTHING ' +
        `and must not be read as a run that compared and passed; ${skipped} were skipped, ` +
        'because a private package publishes no tarball. Exiting 0 because having nothing in ' +
        'scope to examine is a legitimate state, not because anything was checked.',
    )
    return
  }

  console.log(
    `README export coverage: ${counts.checkedSubpaths} subpath(s) across ` +
      `${counts.checkedPackages} non-private package(s) examined; ${skipped} not examined, ` +
      'because a private package publishes no tarball.\n' +
      "Every specifier is present as a whole name in its own package's README.md — presence " +
      'of the name only, never that the README describes it.',
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
