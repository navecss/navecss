#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
/**
 * Tripwire against a stale build chunk surviving into the published tarball.
 *
 * `packages/core`'s tsup build sets `splitting: true` with content-hashed chunk names and
 * `clean: false` (`build-css.ts` writes `dist/*.css` before `tsup` runs; `clean: true` would
 * delete them first). So the instant a chunk's content changes, its hash changes, the new
 * chunk is written, and the OLD one is never deleted. `packages/core`'s `files` field is
 * `["dist"]`, so `npm pack` takes every file under `dist/` whether referenced or not, and the
 * release path (`turbo run build`, then the staging step) has no clean step between them. The
 * measured instance: a stale chunk shipped a pre-fix `srOnly` docblock side by side with its
 * own already-fixed replacement.
 *
 * This is invisible to every other gate: `check-publishable-set.mjs` asserts manifest
 * `private` fields, `check:pack`'s `publint`/`attw` check export shape, `knip` reads `src/`,
 * and a scan for leaked internal references needs an identifier to look for, which an orphaned
 * chunk of ordinary compiled source carries none of. A check is worth more than a clean step if
 * only one is bought: a clean step protects the tree it runs in, a check fails loudly on any
 * tree, including one built by hand.
 *
 * The property asserted: every chunk file a `splitting: true` build produces must be
 * reachable, directly or transitively, from at least one file the package's own manifest
 * DECLARES as an entry point. This is a structural property of the packed output, not a
 * pattern match on chunk NAMES, so it needs no update the next time a chunk hash changes.
 *
 * THE PACKED SET COMES FROM `npm pack --dry-run --json`, NEVER FROM A `dist/` WALK. This
 * repository already ruled on that question, for this exact `clean: false` + `files: ["dist"]`
 * shape, on a report-only sibling gate that has since been retired: a stale chunk can survive
 * a rebuild, so a raw directory listing is not a
 * trustworthy stand-in for "what actually gets packed". This gate follows that convention
 * rather than rediscovering it. Two things it buys concretely: a `files` field that NEGATES an
 * entry (`packages/tokens` reads `["dist","!dist/contact-sheet.html","tokens.json"]`) is
 * honoured for free rather than over-claimed, and this becomes the only `scripts:check` gate
 * whose subject is the tarball rather than a directory that happens to be on disk. It costs
 * one `npm pack --dry-run` per workspace package: measured 4.44 / 4.49 / 4.44 seconds for this
 * check alone over all four packages, and 6.39 seconds for the whole `scripts:check` chain
 * together, against a `dist/` walk's near-zero. Those are stopwatch readings taken when this
 * gate landed, and the chain was TEN gates at that moment (twelve today). They are a frozen
 * record of that run, not a standing claim about the current chain: re-point the count at
 * today's chain only by re-measuring, never by editing the number to match.
 *
 * WHY THE ROOTS ARE DECLARED ENTRIES AND NOT "every non-chunk `.js` on disk". The same
 * `clean: false` mechanism that leaves a superseded CHUNK also leaves a superseded ENTRY, and
 * an entry treated as an unconditional root then certifies the superseded chunk it still
 * imports as reachable, silently. Rooting the walk in `exports` (through every condition and
 * every nested subpath), `bin`, `main`, `module`, `browser` and `imports` is what makes the
 * property "reachable from a real entry point" rather than the tautology "reachable from
 * something in the directory". The exact grammar, and the one place this deliberately disagrees
 * with its sibling gate, are on `collectDeclaredEntries` below.
 *
 * RESIDUAL, DECLARED RATHER THAN NARROWED AWAY: this gate reports orphaned CHUNKS only, and
 * not the other half of that same mechanism -- a superseded non-chunk `.js` that is neither a
 * declared entry nor reachable from one. Measured on the real built workspace before this was
 * written: NINE `packages/tokens` files are legitimately in exactly that position and would red
 * today, in two lawful sub-classes.
 *
 *   1. Reached only from a PACKAGE-ROOT SCRIPT THAT NEVER PACKS (six files):
 *      `dist/lib/theming/build-step.js`, imported by the package-root `build.ts`, plus the five
 *      modules only IT reaches -- `contact-sheet.js`, `core-source.js`, `ladder.js`,
 *      `on-star.js` and `dtcg-descriptions.js`.
 *   2. Reached only by an IMPORTER THAT IS NOT IN THE PACKED SET (three files):
 *      `feedback-signal.js`, `seed-input.js` and `third-party-provenance.js`. Each src module is
 *      itself compiled into `dist/` and packs; what is missing is the EDGE into it. Two distinct
 *      reasons produce that, and the class is their UNION, not either one:
 *
 *      - `feedback-signal.js` and `third-party-provenance.js` -- their only importers are TEST
 *        files, which are neither compiled into `dist/` nor packed, so the importer is absent
 *        from the packed set entirely. All three of those imports are VALUE imports
 *        (`test/theming/remaining-ac.test.ts:10`; `test/no-inlined-dependency.test.ts:37` and
 *        `test/theming/third-party-provenance.test.ts:26`).
 *      - `seed-input.js` -- NO test imports it at all. Its four importers are `src` modules that
 *        do pack (`consumer-build.ts:60`, `seed-ingest.ts:32`, `build-record.ts:18`,
 *        `seed-form-parsers-css-color-4.ts:12`), and every one of them uses `import type`, so the
 *        edge is erased from the JS emit. Here the importer is present and the edge is not.
 *
 * Sub-class 2 is spelled out at this length because TWO successive drafts of it were wrong, in
 * OPPOSITE directions, each by promoting ONE of those two reasons into the whole class. The first
 * attributed all three files to type-only imports, which is false of `feedback-signal.ts` and
 * `third-party-provenance.ts` (value importers, cited above). Its correction then filed all three
 * under "reached only from TEST FILES" and called `seed-input.ts` merely ALSO type-only -- false
 * the other way, since `seed-input.ts` has ZERO test importers, so "also" presupposed an edge
 * that does not exist. The count and the membership were right through both drafts; only the
 * stated REASON kept collapsing to whichever half its author had just looked at.
 *
 * That is the thing to carry forward, because this paragraph is the recorded ground for leaving
 * the ENTRY half of the mechanism open: anyone costing that closure from it must read the real
 * class ("importer not in the packed set") and not whichever single reason is in front of them,
 * since each narrower reading ("importer erased by the type system", "importer is a test") prices
 * a strictly smaller problem than the one actually left open.
 *
 * Nothing structural distinguishes either sub-class from a genuinely stale entry, so reporting
 * them would be a permanent false RED on a lawful build. The chunk half is what this gate was
 * asked for and it is closed; the entry half stays open with its own measurement rather than
 * being papered over by a weaker rule.
 *
 * ONE CANDIDATE PREDICATE FOR CLOSING IT WAS MEASURED AND DECLINED, RECORDED SO IT IS NOT
 * RE-DERIVED. The predicate: a packed non-chunk `.js` whose ORIGINATING
 * SOURCE FILE no longer exists is stale. It is the right SHAPE -- it is this tripwire's own
 * stated trigger for this half ("a deleted or renamed source file leaves its dist output behind
 * permanently") and it is a rule rather than a census, which was ruled against. What it
 * needs is a `dist` -> `src` mapping, and this workspace does not carry one it can be given:
 *
 *   - The obvious uniform rule (`dist/<rel>` <- `src/<rel>`) reports EVERY packed `.js` file
 *     `packages/tokens` ships as stale, on a lawful build: 49 of 49, and 47 of 47 on this branch
 *     alone (both measured 2026-09-10 on a clean `pnpm -r run clean` + `pnpm run build`; the first
 *     on `main` at `acfd08d`, which IS the merge's `packages/` tree because this branch changes no
 *     file under `packages/`, and the gap between the two readings is two `src/theming` modules
 *     `main` adds). It is total for two separate reasons. 47 of the 49 sit under `dist/lib/`,
 *     because the package emits through `tsc -p tsconfig.build.json` with `rootDir: "src"` and
 *     `outDir: "dist/lib"`, so the rule looks for each of them at `src/lib/<rel>` while the real
 *     source is at `src/<rel>`. The other two, `dist/tokens.js` and `dist/breakpoints.js`, have no
 *     `src/` twin to look for at all (neither `src/tokens.ts` nor `src/breakpoints.ts` exists; both
 *     are generated by the package-root `build.ts`, which is also the last bullet below). It misses
 *     none of `cli`'s 1 and none of `core`'s 3 non-chunk packed `.js`, so it looks correct on every
 *     package except the only one that has a residual at all.
 *
 *     THE RATIO IS THE DURABLE PART HERE, NOT THE TOTAL, and stating a total without its tree is
 *     how this bullet went wrong: it read "47 of 47" with no tree named, which is the branch-alone
 *     total read as a standing fact, and which is ALSO the count under `dist/lib/` on the merge --
 *     two different quantities that happen to share a digit, so the wrong number could not even be
 *     caught by inspection. Both totals move with every module the package gains. What does not
 *     move is that the numerator equals the denominator, because that rests on the `outDir` and on
 *     two generated files rather than on any count.
 *   - Reading the real mapping per package needs three different mechanisms, and only ONE of them
 *     is data. `tokens` states it in `tsconfig.build.json` (readable, though tsconfig is JSONC, and
 *     this repository's own `tsconfig.base.json` already carries comments that make `JSON.parse`
 *     throw). `core` states it in the `entry` map inside `tsup.config.ts`, which is TypeScript
 *     SOURCE and cannot be read without executing or parsing it. `cli` states it in the argument
 *     list of its `build` npm script (`tsup src/index.ts --format esm --dts --clean`), which is a
 *     shell command line. A gate that imports a package's build config to decide a verdict is a
 *     larger change than this one, in a direction nothing here has ruled on.
 *   - Falling back to the uniform rule for the two packages that have no readable mapping passes
 *     TODAY, and passes by coincidence: it is unverified against `core`'s actual entry map, and
 *     it fails the moment an entry KEY stops equalling its source path
 *     (`{ atoms: 'src/lib/atoms.ts' }` is a lawful tsup config). Its failure direction is a false
 *     RED on a lawful build whose printed remedy cannot clear it -- exactly the defect row 1
 *     above was fixed for, reintroduced by the fix for this one.
 *   - Two `tokens` files are unmappable under the derived rule regardless (`dist/tokens.js` and
 *     `dist/breakpoints.js` are generated by the package-root `build.ts` from `tokens.json` and sit
 *     outside `dist/lib/` entirely). They escape only because both are DECLARED entries and so are
 *     never examined; a generated module that was neither declared nor reachable would have no
 *     honest answer at all.
 *
 * Verified for completeness rather than assumed: under the mapping derived from
 * `tsconfig.build.json`, all NINE files above do stay green and a deleted source does red. The
 * predicate works; the mapping it rests on is guessed for three of the four packages. The other
 * candidate, a clean-build DIFFERENTIAL (build into an empty directory, report anything in `dist/`
 * a clean build did not produce), is exactly correct and needs no mapping, but it costs a second
 * full build, which prices it out of `ci:check` and leaves the `release` path as its only plausible
 * home -- wiring this gate differently there is a change to the root manifest, outside the scope
 * this was fixed under. So the entry half stays open, and this is why.
 *
 * AND THE DISPOSITION IS A RULING, NOT THIS FILE'S ENGINEERING CALL. Everything above is
 * measurement, which is what the decision RESTS ON rather than what made it: the maintainer,
 * reviewing the change that produced this gate, ruled that the entry half stays open. A reader
 * who finds the reasoning above unpersuasive is therefore not looking at an argument still in
 * progress and should not reopen it here.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// tsup's default content-hash chunk naming: `chunk-` followed by a run of upper-case
// base32-ish characters (8 of them in every chunk this repository has produced, but the
// pattern deliberately does not pin the LENGTH, since the hash width is tsup's to change).
// Tested against the BASENAME, so a chunk emitted into a subdirectory is still recognized.
const CHUNK_NAME = /^chunk-[A-Z0-9]+\.js$/

// A relative `./x.js` or `../x.js` specifier reached via a static `import`/`export ... from`
// or a dynamic `import(...)` call. Deliberately narrow (this package's own tsup ESM output
// shape) rather than a full parser.
//
// THE TWO FAILURE DIRECTIONS, BOTH OF THEM. This comment has been wrong here twice, in opposite
// ways: first it claimed the only risk was a silently under-reported orphan (backwards), then the
// correction claimed this pattern has ONLY the noisy direction and that `CHUNK_NAME` is the sole
// holder of the quiet one (also false). It has both.
//
//   MISSING a specifier removes an EDGE, and removing an edge can only make chunks LESS
//   reachable. That is a false RED: noisy, fail-closed, impossible to overlook.
//
//   OVER-MATCHING one ADDS a false edge, and a false edge certifies a real orphan as reachable:
//   exit 0 over a tarball that still carries the stale byte. Quiet, fail-OPEN, and the direction
//   a real defect hides in. It is reachable today -- a `./chunk-*.js` substring sitting inside an
//   ordinary STRING LITERAL after the word `from` or `import` matches this pattern:
//     index.js:  export const msg = "cannot import from './chunk-DEAD0002.js'"
//     required exit 1, given exit 0.
//
// The over-match direction is LEFT UNHARDENED, deliberately. Telling a specifier from a string
// literal needs a real parser, not a longer regex, and that is a far larger change than this gate
// warrants. The exposure was measured rather than assumed: the four workspace packages pack 128
// files between them, `readPackedJsFiles` hands this pattern the 54 of those that end in `.js`
// (it skips every other extension, so nothing else is ever scanned), and all 104 matches across
// them sit at a statement-leading `import`/`export`, so there are ZERO live instances. That
// NUMBER is what the next reader should weigh, not a reassurance.
//
// ALL THREE COUNTS ARE A POINT-IN-TIME MEASUREMENT OF THE PACKED CORPUS, NOT A STANDING FACT.
// They move with every build output the four manifests select, so a reader who cannot reproduce
// them should RE-MEASURE and read the drift as the corpus having moved, not as a defect here.
// Measured 2026-09-08 on a clean `pnpm -r run clean` + `pnpm run build` of this branch MERGED
// WITH `main`; the same measurement on this branch alone reads 124 / 52 / 99, the entire gap
// being two `src/theming` modules that `main` adds. The CONCLUSION does not expire with the
// counts: the zero rests on every match being statement-leading, which is a property of tsup's
// emit shape rather than of any total.
// The companion suite carries a row asserting the over-match as CURRENT BEHAVIOUR, so the day it
// stops being true, someone is told rather than the change passing unremarked.
//
// `CHUNK_NAME` above has the quiet direction too, by a different road: a chunk whose name it
// fails to match is never in the chunk set, so it is never checked and never reported.
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+\.js)['"]/g

/**
 * The printed header for a real violation. One constant, pinned byte-for-byte by the
 * companion test, so a later tidy cannot silently reintroduce the over-claim it used to carry
 * ("that package's files field names the whole directory", which is false of
 * `packages/tokens`'s negation).
 */
export const ORPHANED_CHUNK_HEADER =
  'Orphaned build chunk(s): a content-hashed chunk with no importer left behind in its own ' +
  "package, which npm packs into the published tarball anyway because that package's own " +
  'file list still selects it:\n'

/**
 * The printed header for the fail-closed case: a package whose packed file set could not be
 * determined at all. A package this check skips is a package it did not check, so it says so
 * and exits non-zero rather than counting silence as a pass. Pinned byte-for-byte by the
 * companion test exactly as `ORPHANED_CHUNK_HEADER` is: it carries a claim of its own, and an
 * `out.includes(UNREADABLE_PACKAGE_HEADER)` assertion with the expected value imported from here
 * only ever compares this constant to itself.
 */
export const UNREADABLE_PACKAGE_HEADER =
  'Could not determine the packed file set for the following package(s), so this check could ' +
  'not certify them:\n'

/**
 * The remedy paragraph printed beneath `ORPHANED_CHUNK_HEADER`. A constant, pinned byte-for-byte
 * by the companion test exactly as the header above it is, for a reason the headers do not carry
 * on their own: BOTH headers were pinned and NEITHER remedy was, so the half a person actually
 * acts on was the replaceable half. Its claim is load-bearing -- it is
 * what tells the reader to rebuild rather than to go hunting for a source bug that is not there.
 */
export const ORPHANED_CHUNK_REMEDY =
  "\nThis is a stale build artifact, not a source change: delete the package's dist/ (or " +
  'run its clean script) and rebuild from a clean tree before packing or publishing.'

/**
 * The remedy paragraph printed beneath `UNREADABLE_PACKAGE_HEADER`, pinned for the same reason.
 * Its claim is the whole argument for that branch exiting non-zero rather than skipping.
 */
export const UNREADABLE_PACKAGE_REMEDY =
  '\nA package this check cannot read is a package it did not check, so this is a failure ' +
  'rather than a skip.'

/**
 * Every relative `./x.js` or `../x.js` specifier statically or dynamically imported by
 * `content`.
 */
export function findImportedSpecifiers(content) {
  return [...content.matchAll(IMPORT_SPECIFIER)].map((match) => match[1])
}

/**
 * Every string leaf of an `exports`-shaped value (a bare string, a conditions object, an
 * array of fallbacks, or any nesting of those).
 */
function collectStringLeaves(value, into) {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) for (const item of value) collectStringLeaves(item, into)
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStringLeaves(item, into)
  }
}

/**
 * Splits one `exports`/`imports` field's string leaves into the two buckets that behave
 * differently: targets of a subpath-PATTERN key, where Node substitutes `*`, and everything else,
 * where a `*` is an ordinary filename character.
 *
 * THE KEY DECIDES, NOT THE TARGET, and reading it off the target instead is fail-OPEN. Measured on
 * Node v24.17.0 with real files on disk: `"exports": {"./a": "./d/x-*.js"}` resolves `sp/a` to a
 * file literally NAMED `d/x-*.js`, not to its sibling `d/x-q.js`; the `imports` form
 * (`{"#a": "./d/x-*.js"}`) does the same. Expanding such a target against the packed set invents
 * roots the resolver never produces, and a root certifies whatever it names as reachable, so a real
 * orphan exits 0.
 *
 * Only the TOP-LEVEL keys of these two fields are subpaths; everything nested beneath one is a
 * condition name or an array fallback, and inherits its key's verdict. The three non-object shapes
 * carry no subpath key at all and are therefore never patterns: `"exports": "./dist/index.js"`
 * sugar, an array of fallbacks, and an absent field.
 */
function collectSubstitutionTargets(field, patterns, literals) {
  if (field === null || typeof field !== 'object' || Array.isArray(field)) {
    collectStringLeaves(field, literals)
    return
  }
  for (const [key, value] of Object.entries(field)) {
    collectStringLeaves(value, key.includes('*') ? patterns : literals)
  }
}

/**
 * Every packed path a subpath-PATTERN target matches.
 *
 * ONE MATCH VALUE IS BOUND TO EVERY `*` IN THE TARGET, not just the first, and that was VERIFIED
 * against the resolver rather than assumed -- the first draft of this function split on the first
 * `*` and matched the rest literally, on a wrong reading of Node's algorithm. Measured on Node
 * v24.17.0 with a real package on disk whose only subpath is `"./a/*"` targeting
 * `"./d/x-*-y-*.js"`, `import.meta.resolve('starpkg/a/one')` returns `.../d/x-one-y-one.js`: both
 * stars took the same match. Under a first-star-only expansion such a target contributes no root
 * at all where Node
 * resolves a real file, which is the same false-RED direction an earlier fix exists to
 * remove.
 *
 * So the match value's LENGTH is solved for rather than searched: with `k` stars and `L` characters
 * of literal, a packed path of length `n` can only have come from a match of length `(n - L) / k`,
 * which must be a POSITIVE integer. That fixes exactly one candidate substring, and the
 * reconstruction (`segments.join(match)`) either equals the packed path or does not.
 *
 * WHAT A `*` MAY MATCH: BOTH HALVES MEASURED, BECAUSE THIS PARAGRAPH SHIPPED ONE OF THEM WRONG. It
 * read "`*` may match the empty string and may span `/`, both as the resolver allows, so zero
 * length is legal".
 *
 *   SPANNING A `/` IS TRUE, and it is why no path separator is special-cased below. Measured on
 *   Node v24.17.0 with a real package on disk whose sole subpath is `"./a*"` targeting
 *   `"./d/x-*.js"`: `import.meta.resolve('sp/anested/b')` returns `d/x-nested/b.js`, so that one
 *   match value was `nested/b`, separator included.
 *
 *   MATCHING THE EMPTY STRING IS FALSE, and it was the stated ground for accepting zero length. A
 *   pattern match requires the requested subpath to be strictly LONGER than the key's pattern base,
 *   so the bound value is never empty. Measured the same way, with `"./a*"` -> `"./d/x*.js"` and
 *   `d/x.js` PRESENT on disk: `sp/a` throws ERR_PACKAGE_PATH_NOT_EXPORTED while the control `sp/aq`
 *   resolves to `d/xq.js`. A bare `"./*"` behaves identically, and so does the `imports` form
 *   (`#i` -> ERR_PACKAGE_IMPORT_NOT_DEFINED, control `#iq` -> `d/xq.js`).
 *
 * Zero length was therefore not a permissive reading, it was fail-OPEN: a target such as
 * `"./dist/chunk-DEAD0002*.js"` "matches" `dist/chunk-DEAD0002.js` at length 0, roots the chunk on
 * a subpath that resolves to nothing, and the gate exits 0 over a tarball still carrying the stale
 * byte. The companion suite holds that shape as a row, since the suite stayed green either way.
 */
function expandPatternTarget(pattern, packedPaths) {
  const segments = pattern.split('*')
  const starCount = segments.length - 1
  const literalLength = segments.reduce((total, segment) => total + segment.length, 0)
  return packedPaths.filter((packed) => {
    const matchLength = (packed.length - literalLength) / starCount
    if (!Number.isInteger(matchLength) || matchLength < 1) return false
    const match = packed.slice(segments[0].length, segments[0].length + matchLength)
    return segments.join(match) === packed
  })
}

/**
 * The `.js` entry points `manifest` DECLARES, resolved against `packedPaths` (the package's own
 * `npm pack` file list). Read from `exports` (every condition, recursively through nested subpath
 * and conditions objects and array fallbacks), plus `bin` (string or object), plus `main`,
 * `module`, `browser` and `imports` where present. `exports` and `imports` are the only two of
 * those Node ever substitutes a `*` in, and then only under a PATTERN KEY, so they are read through
 * `collectSubstitutionTargets` while the other four are taken literally whatever they contain.
 * Returned as package-relative paths with any
 * leading `./` stripped, deduplicated, so they key the same map the packed file list does.
 * `path.posix.normalize` does that stripping on its own (`./dist/x.js` -> `dist/x.js`); an
 * explicit `startsWith('./')` slice used to sit after it and was dead on every input. Non-`.js`
 * targets (`.css`, `.json`, `.d.ts`, `package.json`) are dropped: they are real entry points but
 * they import nothing, so they contribute no edge. A `null` target contributes nothing either --
 * `"./internal": null` is how Node BLOCKS a subpath, so it names no file (`collectStringLeaves`
 * drops it, being neither a string nor a non-null object). A target that resolves to a path not
 * in `packedPaths` contributes nothing, unchanged: `findOrphanedChunks` drops it because it is
 * not a key of the file map. A target whose BASENAME matches `CHUNK_NAME` is dropped too, even
 * when it resolves to a real packed path: a chunk is generated output, never a hand-declared
 * entry, and a pattern lawfully broad enough to also match one (`"./*": "./dist/*"`) must not be
 * allowed to root it on itself (see "A CHUNK-SHAPED TARGET..." below). `path.posix.normalize`
 * also collapses an unusual-but-lawful literal such as `main: "./dist/x.js/."` down to
 * `dist/x.js`, which is CORRECT rather than merely tolerated: measured directly against Node
 * (`require.resolve` on a real package with that exact `main`), the runtime resolves that shape
 * to the same file, so rooting on it matches real resolution rather than diverging from it.
 *
 * THIS REPOSITORY HAS A SECOND READER OF `exports`, AND THE TWO DISAGREE ON `*` ON PURPOSE.
 * `scripts/check-readme-export-coverage.mjs`'s `inScopeExportKeys` reads the same field by a RULE
 * rather than a list (its header states the rule, and why it is a
 * rule -- "a hardcoded include/exclude list is a census and goes stale the first time a package
 * grows an export"). That discipline is inherited here: nothing below is an include or exclude
 * list of package names, paths or subpaths. What is NOT inherited is its treatment of `*`, and the
 * divergence is written down here so the next reader sees two checks disagreeing deliberately
 * rather than one of them being stale.
 *
 *   `inScopeExportKeys` SKIPS any key containing `*`, and that is correct THERE. Its predicate is
 *   "does this subpath string appear in the README", and a subpath PATTERN (`"./styles/*"`) names
 *   a FAMILY with no single string to look up, so demanding a literal `*` in prose would red a
 *   README that documents every real file correctly.
 *
 *   This gate's predicate is "which packed files are ROOTS of the reachability graph", and a
 *   pattern names REAL roots: every packed file it matches. So the target of a PATTERN KEY is
 *   EXPANDED against the packed set rather than skipped, and rather than kept as a literal.
 *   Reading it
 *   literally is what produced a real false-RED: `"./dist/styles/*.js"` matches no packed
 *   path as a literal, so the root was silently dropped by the "not in the packed set" rule above
 *   and everything reachable only through it reported orphaned -- a permanent false RED whose own
 *   printed remedy ("delete dist/ and rebuild") reproduces it exactly, which is a known
 *   trap. Measured the same way: a top-level `browser` and an `imports` map were both no-roots-at-
 *   all for the same reason, being fields this function never read.
 *
 * A CHUNK-SHAPED TARGET NEVER COUNTS AS A DECLARED ENTRY, EVEN WHEN A PATTERN LAWFULLY MATCHES
 * ONE. A subpath pattern is expanded against every packed path it matches, with no exclusion, so
 * a manifest broad enough to name its own chunks -- `"exports": {"./*": "./dist/*"}` is lawful
 * grammar, matching every packed `dist/*` file including `dist/chunk-DEAD0002.js` -- would root
 * that chunk on itself: `findOrphanedChunks` treats every root as reachable before it ever walks
 * an import graph (see its `for (const root of queue) if (chunkNames.has(root))` line), so a
 * chunk that is its own root is "reachable" regardless of whether anything actually imports it.
 * That is the tautology the property this gate asserts exists to rule out -- "reachable from a
 * REAL entry point", not "reachable from something the pattern also happened to match" -- so the
 * final filter below drops any would-be entry whose basename is itself a chunk name. No package
 * in this workspace writes a manifest broad enough to trigger this (measured: `grep` over every
 * workspace package's manifest finds no `exports`/`imports` target whose expansion could reach a
 * chunk file), so this is a correctness fix for the stated property rather than a measured
 * regression -- the same standing this docblock gives F2's predicate discussion above.
 *
 * Note what each rule DOES with a key, which is where an earlier version of this note was too neat.
 * It said `inScopeExportKeys` filters KEYS while this function expands TARGETS. This function reads
 * keys too, and has to: the key is the only thing that says whether a `*` in the target is a
 * wildcard at all (`collectSubstitutionTargets`). The difference is the verdict a pattern key
 * earns, not which half is looked at -- `inScopeExportKeys` DROPS that entry, this one expands its
 * target. `packedPaths` defaults to `[]` so a caller with no tarball in hand
 * still gets every literal target; a pattern simply expands to nothing, which is the honest answer
 * when there is no packed set to expand against.
 */
export function collectDeclaredEntries(manifest, packedPaths = []) {
  const patterns = []
  const literals = []
  collectSubstitutionTargets(manifest?.exports, patterns, literals)
  collectSubstitutionTargets(manifest?.imports, patterns, literals)
  collectStringLeaves(manifest?.bin, literals)
  collectStringLeaves(manifest?.main, literals)
  collectStringLeaves(manifest?.module, literals)
  collectStringLeaves(manifest?.browser, literals)
  const entries = literals.map((target) => path.posix.normalize(target))
  for (const target of patterns) {
    const normalized = path.posix.normalize(target)
    if (normalized.includes('*')) entries.push(...expandPatternTarget(normalized, packedPaths))
    else entries.push(normalized)
  }
  return [
    ...new Set(
      entries.filter(
        (entry) => entry.endsWith('.js') && !CHUNK_NAME.test(path.posix.basename(entry)),
      ),
    ),
  ]
}

/**
 * Given every packed `.js` file's content in one package (`package-relative path -> content`)
 * and that package's DECLARED entry points, the chunk files unreachable from any of those
 * entries, walked transitively through every `.js` file rather than only through other chunks.
 * Every specifier is resolved RELATIVE TO THE IMPORTING FILE'S directory, so `./x.js`,
 * `../x.js` and a nested entry all resolve the way the runtime resolves them. Pure and
 * disk-free so it is testable against a hand-built fixture, not only a real build.
 */
export function findOrphanedChunks(files, roots) {
  const chunkNames = new Set(
    Object.keys(files).filter((name) => CHUNK_NAME.test(path.posix.basename(name))),
  )
  const reachable = new Set()
  const queue = roots.filter((root) => files[root] !== undefined)
  const seen = new Set(queue)
  for (const root of queue) if (chunkNames.has(root)) reachable.add(root)
  while (queue.length > 0) {
    const name = queue.pop()
    const fromDir = path.posix.dirname(name)
    for (const specifier of findImportedSpecifiers(files[name] ?? '')) {
      const target = path.posix.normalize(path.posix.join(fromDir, specifier))
      if (files[target] === undefined || seen.has(target)) continue
      seen.add(target)
      if (chunkNames.has(target)) reachable.add(target)
      queue.push(target)
    }
  }
  return [...chunkNames]
    .filter((name) => !reachable.has(name))
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * Workspace package directory names under `packagesDir`, sorted for stable output. Fails
 * cleanly, symmetrically with the per-package read below: a missing `packages/` is nothing to
 * check rather than an ENOENT stack trace, and an entry that cannot be `stat`ed (a broken
 * symlink, which `statSync` follows) is skipped rather than throwing before any package has
 * been looked at.
 */
function listPackageDirs(packagesDir) {
  let entries
  try {
    entries = readdirSync(packagesDir)
  } catch {
    return []
  }
  return entries
    .filter((entry) => {
      try {
        return statSync(path.join(packagesDir, entry)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
}

/**
 * The packed `files[].path` list out of one `npm pack --dry-run --json` reply. Split out from the
 * subprocess call below so every reply SHAPE can be exercised directly, which is the only way to
 * cover them without stubbing `npm` onto `PATH`.
 *
 * THROWS ON EVERY SHAPE IT CANNOT MAKE SENSE OF, INCLUDING THE TWO EMPTY ONES, and `main`'s catch
 * turns each into a named `unreadable` package. That is the difference between this gate and the
 * report-only sibling it takes its sourcing convention from. That sibling's own
 * `listPackedFiles` read `(entry?.files ?? []).map(...)`, and this function was first written by
 * copying that line -- but the sibling paired it with a COMPENSATING TRIPWIRE that was not copied:
 * its summary printed `INCOMPLETE` rather than a bare count when the scanned file count
 * was 0, precisely so an empty scan could not read as a clean one. Without that half, the `?? []`
 * idiom in a GATE means a reply with no `files` key becomes an empty packed set, an empty packed
 * set contains no chunks, and the check prints its confident success line over a tarball it never
 * read -- fail-OPEN, on the exact reply shape (`[{"name":"x"}]`) the sibling would have called
 * INCOMPLETE. Latent (no real `npm` produces it) and closed here anyway, because the cost is one
 * `throw` and the failure it prevents is silent.
 */
export function parsePackedFiles(raw) {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('npm pack --dry-run --json returned no tarball entry')
  }
  const packed = parsed[0].files
  if (!Array.isArray(packed)) {
    throw new Error('npm pack --dry-run --json returned a tarball entry with no files list')
  }
  if (packed.length === 0) {
    throw new Error('npm pack --dry-run --json reported zero packed files for this package')
  }
  return packed.map((file) => file.path)
}

/**
 * Runs `npm pack --dry-run --json` inside `packageDir` and returns the packed `files[].path`
 * list -- the published set's source of truth for one workspace package, never a `dist/` walk
 * (see the header comment).
 * Throws on anything it cannot make sense of; the caller turns that into a loud violation.
 */
function listPackedFiles(packageDir) {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return parsePackedFiles(raw)
}

/**
 * The packed `.js` files of one package as `package-relative path -> content`.
 *
 * THE `.js` FILTER IS A READ-COST GUARD, NOT A CORRECTNESS ONE, and saying which it is matters
 * because the carve-out that asked for it to be pinned filed it as
 * fail-OPEN, on the reasoning that a non-`.js` packed file scanned for specifiers could contribute
 * a FALSE EDGE and so certify a real orphan as reachable. Measured, it cannot: a file in this map
 * is only ever scanned once it has been REACHED, a file is reached only by being a declared entry
 * or by being the target of a captured specifier, `collectDeclaredEntries` keeps only `.js`
 * targets and `IMPORT_SPECIFIER` captures only specifiers ending in `.js`. Both roads are closed,
 * so no non-`.js` key is reachable and dropping this line changes no verdict on any input.
 *
 * What it does change is what gets READ: without it every packed `.css`, `.json`, `.d.ts`, `.html`
 * and `README.md` in every workspace package is slurped into memory as UTF-8 on every run, for map
 * keys nothing can consult -- the whole packed corpus rather than its `.js` part, which is the
 * first pair of counts in the `IMPORT_SPECIFIER` comment above (and, like those, point-in-time).
 * The companion suite pins this as a contract on this function rather than as a verdict on a tree,
 * because a verdict row would be asserting a consequence that does not exist.
 */
export function readPackedJsFiles(packageDir, packedPaths) {
  const files = {}
  for (const relPath of packedPaths) {
    if (!relPath.endsWith('.js')) continue
    files[relPath] = readFileSync(path.join(packageDir, relPath), 'utf8')
  }
  return files
}

/**
 * Runs the property asserted in the header comment above across every package under
 * `rootDir` and exits non-zero on any orphaned chunk or unreadable package. `rootDir` defaults
 * to this repository's own root but is a parameter so a test can drive it over a scratch tree.
 */
export function main(rootDir = ROOT) {
  const packagesDir = path.join(rootDir, 'packages')
  const violations = []
  const unreadable = []
  for (const dir of listPackageDirs(packagesDir)) {
    const packageDir = path.join(packagesDir, dir)
    if (!existsSync(path.join(packageDir, 'package.json'))) continue
    try {
      const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
      const packedPaths = listPackedFiles(packageDir)
      const files = readPackedJsFiles(packageDir, packedPaths)
      const roots = collectDeclaredEntries(manifest, packedPaths)
      for (const chunk of findOrphanedChunks(files, roots)) violations.push({ chunk, dir })
    } catch (error) {
      unreadable.push({ dir, reason: error.message.split('\n', 1)[0] })
    }
  }

  if (unreadable.length > 0) {
    console.error(UNREADABLE_PACKAGE_HEADER)
    for (const { dir, reason } of unreadable) console.error(`  - packages/${dir}: ${reason}`)
    console.error(UNREADABLE_PACKAGE_REMEDY)
    process.exitCode = 1
  }

  if (violations.length > 0) {
    console.error(ORPHANED_CHUNK_HEADER)
    for (const { dir, chunk } of violations) {
      console.error(`  - packages/${dir}/${chunk}`)
    }
    console.error(ORPHANED_CHUNK_REMEDY)
    process.exitCode = 1
  }

  if (violations.length === 0 && unreadable.length === 0) {
    console.log(
      'No orphaned build chunks: every packed chunk-*.js is reachable from a declared entry ' +
        'point.',
    )
  }
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`.
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node; `process.argv[1]`
// is neither, so an invocation through a symlinked absolute path (macOS's `/tmp` ->
// `/private/tmp`, for one) makes the two sides disagree even under the fixed `pathToFileURL`
// form — `main()` silently never fires and the script exits 0 having printed nothing.
// `realpathSync` on both sides closes that gap too. The
// `process.argv[1] &&` limb is still load-bearing: `argv[1]` is undefined whenever this
// module is imported rather than run as an entry point.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
