#!/usr/bin/env node
/**
 * Refusal on the release path while any changeset fragment is still pending.
 *
 * The release stages (and, once approved, publishes) each workspace manifest's `version`
 * exactly as written and never reads `.changeset/` at all -- that directory is `changeset
 * version`'s input, not the release's. So a fragment sitting there at publish time is not consumed, not rendered, and
 * not deleted: it survives into the working tree and is folded into whatever version is cut
 * NEXT, under that next version's heading, describing work the release just published already
 * shipped. Nothing about that is visible at the moment it happens. The release prints success.
 *
 * THE PROPERTY ASSERTED: at the moment `pnpm run release` runs, `.changeset/` holds no fragment
 * for a later `changeset version` to pick up. It is enumerable rather than a judgement about
 * any fragment's contents -- everything in the tree at the publish commit IS the version being
 * published, so any fragment present at that commit necessarily describes work already inside
 * it.
 *
 * WHY A CHECK AND NOT A CHECKLIST LINE. This is the first release's own worst case and the
 * reason the refusal is owed before that release rather than after it: with every manifest
 * already at its intended first version, the pending fragments would be consumed one version
 * later, so the project's first machine-generated release note would describe the contents of a
 * release its own readers already have. A published version number is not reversible -- a burnt
 * one is fixed by publishing again, never by unpublishing -- and until this file existed the
 * whole of that predicate was carried by prose in a document and by somebody remembering it on
 * the day.
 *
 * THE FENCE, AND IT WAS REQUIRED OF THIS GATE RATHER THAN CHOSEN BY IT: this REFUSES, and deletes
 * nothing. Which fragments go, and whether any narrative in them is kept somewhere else, is a
 * release decision and not a script's call to make. The two lawful ways out both end at the same
 * state and are both named in the printed remedy: delete the fragments, or run `changeset version`
 * first and publish a deliberately chosen next number. Neither needs an exemption, an override or
 * an environment variable, because the predicate is exactly what both of them produce -- which is
 * why this gate has no escape hatch at all.
 *
 * IT IS NOT A LAUNCH-ONLY GATE, and the property does not expire with the first publish. The
 * ordinary post-launch flow is `changeset version` (which consumes every fragment and empties
 * the directory), commit, then `pnpm run release`, so this stays green on the normal path
 * forever. It goes red on exactly one shape: publishing without having versioned first.
 *
 * PLACEMENT: the root `release` script ONLY, and FIRST in it. Two halves, and both are load
 * bearing.
 *
 *   NOT in `scripts:check` / `ci:check`. A pending fragment is CORRECT during ordinary
 *   development -- filing one is what a user-facing change is supposed to do -- so a gate on
 *   that chain would red every branch that behaved properly. A check that is red for a reason
 *   nobody can clear is a known trap: it stays red after the correct action was
 *   taken, and it teaches its readers to skip it.
 *
 *   FIRST in `release`, ahead of `turbo run build`, rather than beside the orphaned-chunk gate
 *   between the build and the publish. That gate reads the packed output and so cannot run
 *   before the build; this one reads a directory listing and costs milliseconds, so running it
 *   first means the refusal lands before a full workspace build is spent on a release that was
 *   never going to be correct. It is still ahead of the staging step, which is what this
 *   gate was asked for, and the companion suite pins that ordering rather than the position.
 *
 * WHAT COUNTS AS A PENDING FRAGMENT: the rule `@changesets/read`'s own `readChangesets` applies
 * before it parses anything, so a name this file calls pending is a name `changeset version`
 * would really consume. Read from the installed `@changesets/read@1.0.0` rather than invented:
 * every entry of `.changeset/`, plus every entry of `.changeset/pre/` under a `pre/` prefix,
 * kept when its BASENAME does not start with `.`, ends with `.md`, and is none of `README.md`
 * (case-insensitively), `AGENTS.md`, `CLAUDE.md` or `GEMINI.md`.
 *
 * EXCEPT A `pre/` ENTRY WHILE PRE-RELEASE MODE IS ACTIVE. `@changesets/apply-release-plan@8.0.0`
 * does `const isPreChangesets = releasePlan.preState?.mode === "pre"` and, when that is true,
 * RENAMES each consumed fragment to `.changeset/pre/<id>.md` instead of deleting it --
 * `@changesets/pre@3.0.0`'s own `readPreState` is what reads `.changeset/pre.json` and produces
 * that `mode` token (`"pre"` or `"exit"`). So a `pre/`-prefixed name under an active pre-release
 * is not the thing this predicate is about: it does not OUTLIVE a release and get folded into the
 * next one describing already-shipped work, it is the tool's own parked record for the eventual
 * exit version. This check exempts it on exactly that condition -- `.changeset/pre.json` exists,
 * parses, and reads `mode: "pre"` -- and in every other case (no `pre.json`, an unparseable one,
 * or any `mode` other than `"pre"`) a `pre/` entry stays pending exactly as before. A TOP-LEVEL
 * fragment is never exempt, pre mode or not: it is not what `apply-release-plan` renames. A
 * malformed or absent `pre.json` does not open this exemption -- "not in pre mode" is the CLOSED
 * direction, so the default on any doubt is that `pre/` stays pending.
 *
 * THAT LIST IS A TRANSCRIPTION AND THE RESIDUAL IS DECLARED RATHER THAN NARROWED AWAY.
 * `@changesets/read` is not resolvable from this repository's root -- only `@changesets/cli` is
 * a dependency of it -- so nothing here can compare the two automatically, and adding a
 * dependency purely to import a four-element array is a larger change than this one in a
 * direction nothing has ruled on. Both drift directions, since they are not symmetric. If
 * upstream GROWS its ignore list, this gate reports a file that command ignores: a false RED,
 * noisy, and clearable by moving one file. If upstream SHRINKS it, this gate is fail-OPEN on
 * exactly that name, which is the quiet direction, and the companion suite pins the four
 * members so a narrowing on THIS side at least fails a named row.
 *
 * FAILS CLOSED on a `.changeset/` it cannot read. "Nothing to list" must never be reported as
 * "nothing pending": a root where the directory is missing or unreadable is a root this check
 * did not check, and reporting success there is how a relocated or misconfigured release path
 * would publish with a green gate above it. Same convention, and the same printed distinction,
 * as `check-no-orphaned-chunks.mjs`'s unreadable-package branch.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The markdown filenames `@changesets/read@1.0.0` ignores when it collects changesets,
 * transcribed from that package's own `ignoredMdFiles`, mixed shapes included: `README.md` is
 * matched case-INSENSITIVELY there and the three agent-instruction files are matched as exact
 * strings. Flattening both halves into one comparison would disagree with the real reader on a
 * lower-case `readme.md` in one direction or on a lower-case `agents.md` in the other, so the
 * shapes are kept as upstream writes them. See the header for the drift residual this carries.
 */
export const IGNORED_CHANGESET_MD_FILES = [/^README\.md$/i, 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md']

/**
 * The printed header for a real refusal. A constant, pinned byte-for-byte by the companion
 * suite, because it carries the claim that explains the failure: that `publish` never reads
 * this directory, so the fragments below are not being consumed by the release they are listed
 * against.
 */
export const PENDING_CHANGESET_HEADER =
  'Pending changeset fragment(s) on the release path: the release stages (and, once approved, ' +
  "publishes) each package manifest's version exactly as written and never reads .changeset/, " +
  'so every fragment below survives this release unconsumed and is then folded into whatever ' +
  'version comes next, describing work the release below it already shipped:\n'

/**
 * The remedy paragraph printed beneath `PENDING_CHANGESET_HEADER`, pinned byte-for-byte for the
 * reason the headers alone do not cover: the remedy is the half a person acts on, and pinning
 * only the header leaves the actionable half replaceable at a fully green suite.
 * It carries the fence as well as the route, so a reader is not
 * told to throw away release copy that may still be wanted.
 */
export const PENDING_CHANGESET_REMEDY =
  '\nThis refuses and deletes nothing: which fragments go, and whether their narrative is ' +
  "kept anywhere, is a release decision and not a script's. Two ways to clear it, and both " +
  'end with .changeset/ holding no fragment at all: delete the fragments whose content the ' +
  'version about to be published already contains, or run `changeset version` first to ' +
  'consume them into a deliberately chosen next version.'

/**
 * The printed header for the fail-closed case: a `.changeset/` whose listing could not be read
 * at all. Pinned exactly as its sibling above is, and it carries a claim of its own -- that this
 * is a failure rather than a skip.
 */
export const UNREADABLE_CHANGESET_DIR_HEADER =
  'Could not read the changeset directory, so this check could not certify that this ' +
  'release leaves no fragment behind:\n'

/**
 * The remedy paragraph printed beneath `UNREADABLE_CHANGESET_DIR_HEADER`, pinned for the same
 * reason. Its claim is the whole argument for that branch exiting non-zero rather than
 * reporting success over a directory it never read.
 */
export const UNREADABLE_CHANGESET_DIR_REMEDY =
  '\nA directory this check cannot read is a directory it did not check, so this is a ' +
  'failure rather than a skip.'

/**
 * The pending fragments among `names`, sorted for stable output. `names` are entries of
 * `.changeset/` as a directory listing hands them back, with entries of `.changeset/pre/`
 * carrying a `pre/` prefix exactly as `@changesets/read` prefixes them.
 *
 * The filter reads the BASENAME, which is what makes a `pre/` entry pending rather than silently
 * skipped for containing a separator. Pure and disk-free, so every name shape can be exercised
 * against a literal rather than only against a real tree.
 */
export function findPendingChangesets(names) {
  return names
    .filter((name) => {
      const base = path.posix.basename(name)
      if (base.startsWith('.') || !base.endsWith('.md')) return false
      return IGNORED_CHANGESET_MD_FILES.every((ignored) =>
        typeof ignored === 'string' ? ignored !== base : !ignored.test(base),
      )
    })
    .sort()
}

/**
 * Every entry of `<changesetDir>` plus every entry of `<changesetDir>/pre` under a `pre/`
 * prefix, which is the set `@changesets/read` itself assembles before filtering.
 *
 * Throws when the changeset directory itself cannot be listed, which `main` turns into the
 * fail-closed branch. A missing `pre/` is not a failure and never has been: it is absent on
 * every workspace not in pre-release mode, which is the ordinary case.
 */
function listChangesetDirEntries(changesetDir) {
  const names = [...readdirSync(changesetDir)]
  try {
    names.push(...readdirSync(path.join(changesetDir, 'pre')).map((name) => `pre/${name}`))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return names
}

/**
 * Whether `<changesetDir>/pre.json` currently declares pre-release mode ACTIVE, transcribed from
 * `@changesets/pre@3.0.0`'s own `readPreState`: the token that means "active" is the string
 * literal `"pre"` (its only other value is `"exit"`). A missing file, an unreadable one, an
 * unparsable one, or any `mode` other than `"pre"` all return `false` -- the CLOSED direction --
 * so nothing about this function can widen `findPendingChangesets`' result, only narrow it below.
 */
function isPreReleaseModeActive(changesetDir) {
  let raw
  try {
    raw = readFileSync(path.join(changesetDir, 'pre.json'), 'utf8')
  } catch {
    return false
  }
  let state
  try {
    state = JSON.parse(raw)
  } catch {
    return false
  }
  return Boolean(state) && typeof state === 'object' && state.mode === 'pre'
}

/**
 * Runs the property asserted in the header comment above against `rootDir` and exits non-zero on
 * any pending fragment, or on a changeset directory it could not read. `rootDir` defaults to this
 * repository's own root but is a parameter so a test can drive it over a scratch tree without
 * touching this repository's own `.changeset/`.
 */
export function main(rootDir = ROOT) {
  const changesetDir = path.join(rootDir, '.changeset')
  let names
  try {
    names = listChangesetDirEntries(changesetDir)
  } catch (error) {
    console.error(UNREADABLE_CHANGESET_DIR_HEADER)
    console.error(`  - ${changesetDir}: ${error.message.split('\n', 1)[0]}`)
    console.error(UNREADABLE_CHANGESET_DIR_REMEDY)
    process.exitCode = 1
    return
  }

  let pending = findPendingChangesets(names)
  if (isPreReleaseModeActive(changesetDir)) {
    // A `pre/` entry under an active pre-release is `apply-release-plan`'s own parked record for
    // the eventual exit version, not a fragment this release path is leaving behind. A top-level
    // name is untouched by this filter -- it is never what that tool renames.
    pending = pending.filter((name) => !name.startsWith('pre/'))
  }
  if (pending.length > 0) {
    console.error(PENDING_CHANGESET_HEADER)
    for (const name of pending) console.error(`  - .changeset/${name}`)
    console.error(PENDING_CHANGESET_REMEDY)
    process.exitCode = 1
    return
  }

  console.log(
    'No pending changeset fragments: .changeset/ holds nothing for this publish to leave ' +
      'behind.',
  )
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`.
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node; `process.argv[1]` is
// neither, so an invocation through a symlinked absolute path (macOS's `/tmp` -> `/private/tmp`,
// for one) makes the two sides disagree even under the fixed `pathToFileURL` form -- `main()`
// silently never fires and the script exits 0 having printed nothing. `realpathSync` on both
// sides closes that gap too. The `process.argv[1] &&` limb is still load-bearing: `argv[1]` is
// undefined whenever this module is imported rather than run as an entry point.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
