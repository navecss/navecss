# Contributing to Nave

Thank you for your interest in contributing to Nave!

## Development setup

```bash
# Clone the repo
git clone https://github.com/navecss/navecss.git
cd navecss

# Install dependencies (pnpm required)
pnpm install

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck
```

## Making changes

- All packages live under `packages/`
- Tokens are defined in `packages/tokens/tokens.json` (DTCG 2025.10 format, a Final Community Group Report published 28 October 2025; a community specification, not a standards-track one)
- CSS changes belong in `packages/core/src/`
- CLI commands will be implemented in `packages/cli/src/`
- Adding a dependency: its licence has to pass the repository's licence check,
  which `pnpm ci:check` runs. The allow-list is not a file you edit to make your
  pull request pass; if a dependency you need fails it,
  [open an issue](https://github.com/navecss/navecss/issues) naming the package,
  its version and its licence, and leave it out of the pull request until that
  issue is answered.
- Adding or updating a GitHub Actions step: pin `uses:` to the action's full
  40-character commit SHA, with the version as a trailing comment and nothing
  after it (`uses: owner/action@<sha> # v4`). A version tag can be moved to
  different code without this repository changing, so what CI runs can be
  repointed by someone else with no diff here; a commit SHA cannot be.
  Dependabot bumps the SHA and that comment together when a new version ships,
  but only while the version sits at the end of the comment and is already
  correct, so keep it that way. A `uses:` path starting `./` runs an action
  from this repository's own checked-out tree, takes no SHA, and needs none.
  `ci:check` fails on a `uses:` line pinned to a tag.

## Submitting a changeset

Every pull request that changes a published package must include a changeset:

```bash
pnpm changeset
```

Follow the prompts to describe your change and select the affected packages.

## Code style

Rules for the code in this repository (not statements about how consumers use Nave):

- TypeScript with `erasableSyntaxOnly`: no enums, no decorators.
- Named exports only (no default exports in source files).
- CSS: `@layer` for cascade control. Nave's own source ships no CSS Modules and
  no CSS-in-JS, and depends on no other CSS framework.

Nave itself ships a PostCSS plugin: `@navecss/core/postcss` implements the
`@nave` directive, which is the primary recommended way to compose atoms, and
`postcss` is an optional peer dependency of core. How consumers style their own
components (tokens only, `cx()`, or `@nave` directives, with CSS Modules in the
worked examples) is documented in `packages/core/README.md` and
`packages/core/CONSUMER-ATOMS.md`.

### Text the build prints or ships, or a contributor reads

Anything this build can print (a thrown error, a comment inside emitted CSS or
JSON, a build record, command-line output) and anything inside a published
package is read by people who do not have this repository checked out. Write
those strings for that reader.

Two things follow. State the constraint in words rather than pointing at a short
code, because a code that only resolves inside this project tells a stranger
nothing and cannot be looked up: no bare requirement or rule numbers, no internal
reference tags, whether they are the whole of the pointer or only a label on it.
And where the problem is not one the reader can fix in their own file, name what
they can do instead, such as opening an issue; where the message already names an
act on their own input, that act is the next step and nothing further is needed.

Comments, docblocks and test names are read by contributors, and a contributor
has no more access to this project's planning and review process than someone
reading an error message does. So whether or not that text ever leaves this
repository, explain the reasoning itself in words, and do not name the internal
role, round or repository that decided it. One thing is looser here than for
printed and published text, which carries no such code at all: a short label
for the requirement or criterion being described may sit beside words that
already say it, in the same comment or in the name of the test it sits on,
because a reader who cannot look the label up loses nothing. A label may never
be the whole of the pointer; if the text means nothing without it, write out
what it means. Where an existing comment or test name does not do this, do not
follow its example.

Comments and test names are treated alike because they have the same reader: a
test name is read by whoever sees that test fail. A variable, function or
constant name is not read as an explanation and is unaffected, unless it ends
up in a published package, where a stranger does read it. A comment that ends
up in a published package is published text, so the allowance for a label
does not reach it. Some of this repository's source files are copied or
compiled into what gets published, comments and all, and which ones is not
something you can tell by reading the file, so if you are unsure, write the
comment or the name for the reader who does not have the repository.

No gate checks any of this. `ci:check` will pass on a string that breaks every
sentence above, so these are read in review instead: write them for the reader
described here rather than expecting the build to catch them.

## Commits

Nave uses [Conventional Commits](https://www.conventionalcommits.org/).
The commit message format is enforced by commitlint on every commit.

Format: `type(scope): description`

Types: feat, fix, chore, docs, test, refactor, perf, ci, build, style, revert

Scopes: tokens, core, bridge, cli, repo, deps, release

Examples:
feat(core): add container atom
fix(tokens): correct em conversion for wide breakpoint
chore(repo): update stylelint config
docs(core): add consumer atoms example for data tables

If you need to commit work-in-progress without passing commitlint:
git commit --no-verify -m "wip: your message"

Clean up the commit message before opening a pull request.

## Quality check

`code-quality.yml` runs on every pull request: a matrix job over `typecheck` / `lint` /
`test` / `build` (so one failure never masks the rest), plus a `full-gate` job
running the same `pnpm ci:check` described below end to end (packaging
validation included). The toolchain is mise-pinned (`mise.toml`, node and
pnpm both exact-versioned there for CI); `package.json`'s `packageManager`
field pins the same pnpm version for a local machine via corepack, so CI and
a local machine run the identical toolchain from the same two numbers.

Run the same gate locally before opening a pull request:

```bash
pnpm ci:check
```

To auto-fix what can be auto-fixed, then verify:

```bash
pnpm ci:check:fix
```

`ci:check` runs, in order:

1. **`typecheck`** — `tsc --noEmit` per package (core additionally
   type-checks `test/browser/` against its own DOM-aware `tsconfig.json`).
2. **`lint`** — ESLint (flat config, every rule `error`), Stylelint
   (`order`, `declaration-strict-value`, `declaration-block-no-ignored-properties`,
   `high-performance-animation`), then a repo-wide Prettier check.
3. **`test`** — Vitest unit tests (Node environment) per package.
4. **`test:coverage`** — Vitest with `@vitest/coverage-v8`, text/html/lcov
   reports. Measured and reported only: no coverage threshold gates the
   build, and none should be added — a library that is mostly CSS and
   generated output would have coverage percentages measuring the wrong
   thing, and a threshold that has to be gamed to stay green teaches the
   opposite habit.
5. **`test:browser`** — Vitest browser mode with the Playwright provider,
   over a small fixture in `packages/core/test/browser/`, in a real
   headless Chromium: `@layer` order resolving as documented and the
   `@nave` directive's nested-output transform cascading correctly are
   cascade behaviour, not text, so this is the one layer of the suite a
   Node-side string or AST assertion cannot cover.
6. **`build`** — Turbo build graph (`@navecss/tokens` via the
   first-party token build, `@navecss/core` via a CSS build step
   plus `tsup`, `@navecss/cli` via `tsup`).
7. **`check:pack`** — `publint` and `@arethetypeswrong/cli --pack` against
   the packed tarball of every package (including the still-private
   `@navecss/cli`, so nothing has to be remembered when it goes public).
   Also wired into each publishable package's `prepublishOnly`, so a
   broken export map cannot be published even by a hand-run release.
8. **`knip`** — dead code, unused exports and unused dependencies,
   repo-wide.
9. **`deps:lint`** — `syncpack lint`: consistent dependency versions
   across the workspace (respecting the Changesets `fixed` group for
   tokens + core).
10. **`scripts:test`** — `node --test` over the repo-root `scripts/`
    gates' own unit coverage (`scripts/*.test.mjs`).
11. **`scripts:check`** — the repo-root gates in `scripts/`, run in the
    order `package.json` chains them: the licence and provenance gates,
    the packaging and publishable-set gates, the scans over the
    repository's own docs, manifests and generated output, and the
    supply-chain checks over what CI runs. That chain is the list, and a
    failing gate names the file it is unhappy with, so you do not need
    the list to read a failure.

`turbo.json` gives `test`, `test:coverage`, `test:browser` and `check:pack`
a `dependsOn: ["build"]` at the package level, so turbo builds the package
ahead of each of those tasks regardless of where the standalone `build`
step sits in the chain — so that step's position in the chain does not
affect those four tasks.

### Measuring the repository from the shell

Counts about this tree (how many files carry a shape, how many sites a sweep
has left, whether a class is really at zero) get quoted as evidence in pull
requests and reviews, so a measurement has to be as trustworthy as the change
it supports. One platform trap has already produced a wrong number here, and
it fails silently rather than loudly:

**`git grep -E` returns zero for a pattern containing a Perl escape, with no
error and no warning.** The macOS ERE engine has no `\b`, `\d`, `\s` or `\w`,
so `git grep -E '\bR[0-9]+'` prints nothing and exits exactly as it would for
a pattern that genuinely has no matches, while `git grep -P '\bR\d+'` returns
the real hits. A count taken that way is well formed, confident and wrong.

Two rules follow, and the second matters more than the first:

- Use `git grep -P` for any pattern containing `\b`, `\d`, `\s` or `\w`.
- **Before believing a zero, run the same instrument against a line you
  already know is present.** A pattern that has not been shown to fire has not
  been shown to work, whatever it printed.

## Licensing your contribution

Nave is MIT licensed, and contributions come in on the same terms. By submitting a
contribution you license it under the project's MIT license (see
[LICENSE](../LICENSE)), and you keep the copyright in what you wrote. There is
nothing to sign and nothing to assign.

By submitting a contribution you also certify the Developer Certificate of Origin
below. There is no `Signed-off-by` trailer to add and no bot checking for one:
opening the pull request is the certification. The pull request template states
this in one sentence; the text below is the full document that sentence refers to.

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

### Content you did not write yourself

The certificate above is about your right to submit a contribution. This is about
something else: what the project has to do once that content is in the tree.

If any part of your contribution was copied or adapted from a source outside this
repository (a specification, a standard, a vendor's documentation, another project,
or generated output you did not write by hand), say so in the pull request and name
the source. However small, and whatever it is: a table of constants, a comment, a
code block, a sentence of prose.

Declaring it decides nothing and does not suggest anything is wrong. Some copied
material carries a condition that travels with it, such as an attribution notice or
a licence header, and some carries none; which it is gets settled in review, not by
you. The one thing that cannot be settled is a question nobody knew to ask, so the
declaration is the whole of what is asked for here.
