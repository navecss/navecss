---
supersedes: '-'
superseded-by: '-'
---

# 0007 — Nave ships ES modules only, with no CommonJS build, and every JavaScript entry point also loads through `require()`

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Cédric (ruling, by accepting this record), following a
  post-launch architecture review.
- **Tracking:** post-0.1.1. Supersedes nothing.

## Context

Both published packages are ES modules and have been since their first release:
`"type": "module"`, one ES build per entry point, no CommonJS copy. The package
check that runs before every release, `attw --pack . --profile esm-only`, reports
two rows for every entry point and marks both as ignored under that profile:

```
node10:              (ignored) Resolution failed
node16 (from CJS):   (ignored) ESM (dynamic import only)
```

Both rows are the direct result of shipping ES modules only. The pre-`exports`
resolution algorithm (TypeScript's `moduleResolution: node10`) cannot resolve
subpath exports, and a CommonJS file reaches an ES module. The profile is
correct to ignore them. But no record said the posture was chosen, why, or what
it costs a consumer, so the only written trace of the decision was the flag that
silences the evidence for it.

A review of the published export maps found a second gap: the two packages
disagreed about `require()`, and nothing recorded a choice either way.

| Package           | JavaScript entry points                 | Export conditions            | `require()` on Node 22.18              |
| ----------------- | --------------------------------------- | ---------------------------- | -------------------------------------- |
| `@navecss/tokens` | `.`, `./js`, `./breakpoints`, `./build` | `types`, `import`, `default` | works                                  |
| `@navecss/core`   | `./cx`, `./atoms`, `./postcss`          | `types`, `import`            | fails: `ERR_PACKAGE_PATH_NOT_EXPORTED` |

Each package's README described its own behaviour accurately, so a consumer was
not misled. They were, however, handed two different rules by two packages from
one project.

Node has been able to `require()` an ES module since 22.12, without a flag and,
on 22.18 and 24.17, without a warning (`process.features.require_module` is
`true` on both, measured). The one thing that stops it is top-level `await`
anywhere in the module graph being required, which makes `require()` throw
`ERR_REQUIRE_ASYNC_MODULE`. The seven JavaScript entry points of the two
packages resolve to six files, because `@navecss/tokens`'s `.` and `./js` share
one. All six were loaded through `require()` by file path on Node 22.18.0, and
all six succeeded. None uses top-level `await`, so the only thing refusing
`require()` in `@navecss/core` is its export map.

## Decision

**1. No CommonJS build.** Each JavaScript entry point ships as one ES module and
nothing else. A second, CommonJS copy would invite the dual-package hazard, where
the same package loads twice under two identities with two copies of its state.
It would double what every release has to build, pack and check, and it serves
no consumer that decision 2 does not already serve.

**2. Every JavaScript entry point also loads through `require()` on the
supported Node version.** Each carries a `default` export condition beside `import`, pointing at
the same file, in the shape `@navecss/tokens` already uses. `@navecss/core` adopts
it for `./cx`, `./atoms` and `./postcss` in its next minor release; 0.1.x ships
`import` only on those three. The change is additive (it removes no path and
changes no file), so it is a minor release under 0.x.

**3. No top-level `await` in a published entry point's module graph.** Decision
2 depends on it, so it is checked by a test that installs each packed package
and `require()`s every JavaScript subpath in its export map, by package name, on
the lowest supported Node version. A sentence in this record is not the check.

This decision was taken before the test was written. It cannot land before
decision 2's change to `@navecss/core`, because until then `require()` of that
package's entries fails at the export map whatever the modules contain. Until
it lands, 0.1.x keeps the rule because no published module uses top-level
`await` (measured above), not because anything checks all of them.

**4. The consequences for consumers are accepted and stated where they will see
them.** Each package's README states: ES modules, no CommonJS build; `import`,
and `require()` on Node 22.18 or later; in TypeScript, `moduleResolution` set to
`bundler`, `node16` or `nodenext`, because `node10` finds no types.
`@navecss/tokens`'s README says this today. `@navecss/core`'s says `import`
only, which is accurate for 0.1.x, and changes in the same release as its export
map.

**5. `attw --profile esm-only` stays.** It now applies this record, rather than
standing in for a decision nobody wrote down.

## Consequences

- A CommonJS consumer on the supported Node version can use every JavaScript
  entry point with a plain `require()`. Only `@navecss/core`'s three entries
  change behaviour; `@navecss/tokens` already worked this way.
- A consumer whose TypeScript uses `moduleResolution: node10`, or whose bundler
  predates `exports` maps, still cannot resolve subpaths. That was true before
  this record and stays true.
- Adding top-level `await` to any published module becomes a breaking change.
  Once the test in decision 3 exists, it turns such a change red rather than
  letting it ship. Until then, only the module graph of `@navecss/tokens`'s
  main entry is checked, by an existing test that loads it through `require()`.
- Stylesheet entry points are unaffected. They are not JavaScript and are
  resolved by CSS tooling, not by `require()`.
- The Node floor stays 22.18 (the `engines` field). Decision 2 needs 22.12 or
  later, so it adds nothing to the floor.

## Reopening

Either of these is a new decision recorded in a new ADR, not an exception to
this one:

- a consumer toolchain that needs a real CommonJS file and cannot use
  `require()` of an ES module;
- a published entry point that genuinely needs top-level `await`.

## Alternatives considered

- **Record the posture and leave the two packages as they are.** Rejected. It
  documents an accident as a decision. A consumer using both packages would meet
  a working `require()` from one and an error that reads as "this path does not
  exist" from the other.
- **Import only, everywhere: remove `default` from `@navecss/tokens`.** Rejected.
  It takes a working `require()` away from a published package, which is a
  breaking change, to buy consistency that decision 2 gets without breaking
  anyone.
- **Ship a CommonJS build alongside.** Rejected for the reasons in decision 1.
  Since Node 22.12 a CommonJS consumer's only remaining need is a way to load the
  module, and `require()` of an ES module meets it.
