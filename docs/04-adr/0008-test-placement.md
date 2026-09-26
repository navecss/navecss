---
supersedes: '-'
superseded-by: '-'
---

# 0008 — A test lives beside the one source file it tests; tests of the package as a whole live in `test/`; no test file ever ships

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Cédric (ruling, by accepting this record), following a
  post-launch architecture review.
- **Tracking:** post-0.1.1. Supersedes nothing.

## Context

Colocation is one of the project's stated principles, yet every package test
lives in a separate `test/` directory. No record chose that layout; it is the
scaffold's default. The repository-root `scripts/` directory already colocates:
each gate script's test sits beside it.

A test cannot simply be moved next to "its" file, because many tests have no
single file to sit beside. Reading every package test at the time of writing
(91 files), their subjects fall into these groups:

| Subject                                                                                                                                                         | Files |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| One source module, imported directly                                                                                                                            | 17    |
| One source module, with a helper or two imported alongside it                                                                                                   | 8     |
| The built or packed package: `dist/`, the export map, the `bin`, a spawned `node`                                                                               | 42    |
| The built stylesheets in a real browser engine                                                                                                                  | 7     |
| Mixed, placed file by file: a source stylesheet read as text (`src/reset.css`), a generator script checked against the file it generates, a package-name import | 17    |

These counts come from a mechanical pass over imports and file reads, and the
last row is exactly the part such a pass cannot sort. The shape they show is
still clear: about half the tests exercise the package as a whole, and those
have no source file to live beside.

Placement also touches packaging, because two packages publish or compile
their whole `src/` directory:

- `@navecss/bridge` publishes `files: ["src"]`, so a test file in `src/` would
  ship.
- `@navecss/tokens` compiles `src/` with `tsc` (`tsconfig.build.json`:
  `rootDir: src`, `include: ["src"]`), so a test file in `src/` would be
  compiled into `dist/lib/` and ship.
- `@navecss/core` and `@navecss/cli` bundle named entry points with `tsup`, so
  nothing is emitted for a file no entry imports.

Nothing today checks that a published tarball contains no test file.
`publint` and `attw` check the shape of the exports, not the absence of files.

## Decision

This decision was taken before any of it was applied. Until the move lands,
every package test stays in `test/`, and neither the configuration changes that
decisions 3 and 5 call for nor the release-check assertion in decision 5 is in
place. Today `@navecss/core`'s Node-environment Vitest configuration excludes
browser tests by their directory, `test/browser/`, not by their suffix.

**1. The subject decides where a test lives.** A test whose subject is one
source file lives beside that file, whatever the file's language:
`src/cx.ts` → `src/cx.test.ts`, `src/reset.css` → `src/reset.test.ts`. When one
source file has several test files, each is named for its aspect:
`src/reset.focus.test.ts`, `src/reset.color-scheme.test.ts`. A test that
imports helpers to set up or check its subject still has one subject. Its name
or its top-level `describe` says which file that is, and that is where it goes.

**2. `test/` is for tests whose subject is the package as a whole**: the built
`dist/`, the packed tarball, the export map, the `bin`, a generated file at the
package root checked against its generator, and behaviour that only exists when
several modules are composed. It is not a catch-all. A test in `test/` that has
one source file as its subject is misplaced.

The alternative for these tests was to place each one beside the script or
module that produces the artifact (`scripts/build-css.ts`, `src/formats.ts`).
It was rejected: the subject of a built-artifact test is the artifact, not the
producer. One artifact often has several producers, and a producer-side home
would scatter the package's contract tests across build scripts that are not
themselves published or covered by the same configuration.

**3. Browser tests keep the `*.browser.test.ts` suffix and live in
`test/browser/`.** They exercise the built stylesheets in a real engine, so
they are package-level by decision 2. The suffix, not the directory, is what
separates them. The Node-environment Vitest configuration excludes
`**/*.browser.test.ts` by that suffix, so a browser test can never run under
Node wherever it sits, and the browser configuration includes the same suffix.

**4. Fixtures never live in `src/`.** A unit test builds its data inline where
it can. Fixture files go under `test/fixtures/` (and browser fixtures under
`test/browser/fixtures/`). Generated fixtures stay under
`test/fixtures/generated/`, ignored by linting as today. This keeps decision 5
simple: in `src/`, only files matching `*.test.*` need excluding.
Vitest's `__snapshots__/` directory sits beside its test, wherever that is.

**5. No test or fixture file ever ships, and that is checked, not assumed.**

- `@navecss/bridge`'s `files` gains `"!src/**/*.test.*"`.
- `@navecss/tokens`'s `tsconfig.build.json` excludes `src/**/*.test.ts`.
- Every package's Vitest configuration includes `src/**/*.test.ts` as well as
  `test/**/*.test.ts`, and its typecheck configuration covers both.
- The release checks assert that no packed tarball contains a `*.test.*` file,
  a `__snapshots__/` entry or a `fixtures/` entry. The assertion belongs in the
  check that already reads each package's `npm pack --dry-run --json` file list
  (`scripts/check-no-orphaned-chunks.mjs`). It is one more property of the same
  packed file set, so it needs no second reader of the same output.

**6. The repository-root `scripts/` directory is unchanged.** It already
follows decision 1: each gate's test sits beside the gate.

## Consequences

- Somewhere between a quarter and a half of the package tests move into
  `src/`, and the rest stay in `test/`. Each file is placed by its subject, not
  by a directory rule, so the exact number is settled file by file during the
  move.
- A reader who opens a source file sees its tests in the same directory, and a
  source file with no test beside it is visibly untested.
- `test/` gets smaller and says what it is: the package's contract as a
  consumer receives it.
- A test file that slips into a tarball fails the release checks instead of
  shipping.
- Placement between `src/` and `test/` is a review judgement. No lint enforces
  decision 1 or 2, because "what is this test's subject" cannot be read off a
  file mechanically without false alarms. The packaging half, which can be
  checked mechanically, is checked (decision 5).

## Alternatives considered

- **Keep everything in `test/`.** Rejected. It leaves the stated colocation
  principle unapplied, with no record of why, for the half of the tests that do
  have one file as their subject.
- **Colocate package-level tests with the code that produces the artifact.**
  Rejected under decision 2.
- **Rename `test/` to mark its narrower role.** Not taken. The rule in decision
  2 carries the meaning, and a rename would touch every package-level test,
  every configuration and every path in the contributor guide for no change in
  behaviour.
- **Lint the placement rule.** Not taken, for the reason under Consequences: a
  heuristic that guesses a test's subject would raise false alarms on correct
  placements.
