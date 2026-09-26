// @ts-check
import eslint from '@eslint/js'
import vitestPlugin from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import depend from 'eslint-plugin-depend'
import importX from 'eslint-plugin-import-x'
import jsdoc from 'eslint-plugin-jsdoc'
import jsonc from 'eslint-plugin-jsonc'
import n from 'eslint-plugin-n'
import perfectionist from 'eslint-plugin-perfectionist'
import promise from 'eslint-plugin-promise'
import turbo from 'eslint-plugin-turbo'
import unicorn from 'eslint-plugin-unicorn'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  // ── Ignored paths ──────────────────────────────────────────────────────────
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    '**/*.css',
    'coverage/**',
    // Frozen build OUTPUT, checked in on purpose and compared byte-for-byte. A formatter or
    // an autofix touching these would silently move the baseline a test measures against.
    '**/test/fixtures/generated/**',
  ]),

  // ── Base ───────────────────────────────────────────────────────────────────
  eslint.configs.recommended,
  unicorn.configs.recommended,
  promise.configs['flat/recommended'],
  depend.configs['flat/recommended'],
  perfectionist.configs['recommended-natural'],
  importX.flatConfigs.recommended,

  // ── Base rules — all files ─────────────────────────────────────────────────
  {
    languageOptions: {
      ecmaVersion: 2024,
      globals: { ...globals.node },
    },
    rules: {
      // Quality
      complexity: ['error', 10],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'max-depth': ['error', 3],
      'max-lines': ['error', 300],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'no-console': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',

      // No default exports — named exports only.
      // Exceptions are carved out per file pattern below.
      // Rationale: named exports are refactor-safe, IDE-friendly, unambiguous.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are not allowed. Use named exports. Exception: config files.',
        },
      ],

      // Unicorn overrides
      'unicorn/name-replacements': 'off', // 'prop', 'val', 'decl' are CSS/PostCSS terms (renamed from prevent-abbreviations in unicorn v73)
      'unicorn/no-array-reduce': 'off', // reduce is fine in token transforms
      'unicorn/filename-case': [
        'error',
        {
          cases: { kebabCase: true, camelCase: true },
          ignore: [
            String.raw`^README\.md$`,
            String.raw`^CHANGELOG\.md$`,
            String.raw`^ARCHITECTURE\.md$`,
            String.raw`^CONTRIBUTING\.md$`,
            String.raw`^CONSUMER-ATOMS\.md$`,
          ],
        },
      ],

      // Import — order handled by perfectionist
      'import-x/order': 'off',
      'import-x/no-unresolved': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',

      // Perfectionist
      //
      // Alphabetical order is kept where the order carries no meaning (imports,
      // named imports) and dropped where it does. An atom definition, a token
      // config, a plugin's helper chain and a union like 'warn' | 'error' are
      // all ordered deliberately: grouping, call order, and default-first read
      // better than A-to-Z, and re-sorting them loses information.
      'perfectionist/sort-objects': 'off', // atom definitions are intentionally grouped
      'perfectionist/sort-modules': 'off', // helpers are ordered by call chain, not by name
      'perfectionist/sort-interfaces': 'off', // declarations → pseudos → media → container
      'perfectionist/sort-union-types': 'off', // default-first, e.g. 'warn' | 'error'

      // Node
      'n/no-process-exit': 'error',
      'n/prefer-node-protocol': 'error',

      // Turborepo
      'turbo/no-undeclared-env-vars': 'error',
    },
    plugins: { n, turbo },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['packages/*/tsconfig.json', 'tsconfig.base.json'],
        },
      },
    },
  },

  // ── TypeScript ─────────────────────────────────────────────────────────────
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2024,
        projectService: { allowDefaultProject: [] },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
    },
    settings: {
      // eslint-plugin-import-x's own file-extension allowlist
      // (`import-x/extensions`) defaults to `['.js', '.mjs', '.cjs']` when unset — it does NOT
      // read `import-x/resolver`'s configured extensions, and this repository is TypeScript
      // throughout. Every rule built on the plugin's ExportMap (no-cycle among them) silently
      // no-ops on every `.ts` import target: `ExportMap.for`'s `hasValidExtension` gate
      // rejects the file before any parsing is attempted, which is indistinguishable from "no
      // cycle found" in the rule's own output. Root-caused by patching a scratch copy of
      // `eslint-plugin-import-x`'s own `no-cycle.js`/`export-map.js`/`ignore.js` with
      // temporary debug logging and reverting it, never the tracked node_modules; not a
      // config guess. `import-x/no-unresolved` and `no-unresolved`-adjacent rules are
      // unaffected because they resolve PATHS only and never consult this allowlist.
      //
      // Scoped to `.ts` files on purpose. Set globally, it also admits `.ts` and `.d.ts`
      // targets reached from `.js`/`.mjs` files (the TypeScript resolver hands back
      // declaration files for plain packages), and those files are linted with the default
      // JavaScript parser, which cannot parse TypeScript: every such import then reports a
      // parse error instead of a result.
      'import-x/extensions': ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx'],
    },
  },

  // ── JSDoc ──────────────────────────────────────────────────────────────────
  // Public API (atoms, cx, navePlugin) must be documented.
  jsdoc.configs['flat/recommended-typescript'],
  {
    rules: {
      // The convention here is a prose description, not tag ceremony. The
      // types are already in the signature, so an autofixed `@param token`
      // with no description restates nothing. require-jsdoc still enforces
      // that the description exists.
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      // `@nave`, `@media` and `@container` in prose are CSS at-rules and this
      // library's own directive, not inline JSDoc tags.
      'jsdoc/escape-inline-tags': 'off',
    },
  },

  // ── JSONC ──────────────────────────────────────────────────────────────────
  ...jsonc.configs['recommended-with-jsonc'],
  {
    files: ['packages/tokens/tokens.json'],
    rules: {
      'jsonc/sort-keys': 'off', // token key order is intentional
    },
  },

  // ── Config files — allow default exports ──────────────────────────────────
  {
    files: [
      'eslint.config.js',
      'prettier.config.js',
      'commitlint.config.js',
      '**/vitest.config.ts',
      '**/tsup.config.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // ── postcss.ts — navePlugin.postcss = true is a PostCSS convention ────────
  {
    files: ['**/src/postcss.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // ── atoms.ts — single source of truth, necessarily long ───────────────────
  {
    files: ['**/src/atoms.ts'],
    rules: {
      'max-lines': ['error', 500],
    },
  },

  // ── src/theming/ — measured on code, not on its own rationale ─────────────
  // These files are majority prose by design: they carry relocated licensing and policy
  // REASONS in place of pointers, which is what makes them long. `max-lines` in its shorthand
  // form counts comments and blanks, so it charges each file for its own rationale and puts
  // standing downward pressure on exactly the prose that must not be trimmed — re-wording any
  // of it is a fresh clearance, not an edit. Measured on code alone all three sit far inside
  // the base budget (roughly 181, 183 and 120 lines), so three hand-maintained per-file
  // overrides bought nothing but a number to keep correct, and two of the three had already
  // drifted false. Same treatment, and the same reason, as the repo-root scripts/ block below.
  {
    files: ['**/src/theming/*.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipComments: true, skipBlankLines: true }],
    },
  },

  // ── eslint.config.js — the file that DEFINES the rules is in scope too ────
  // An earlier change brought the repo-root scripts/ directory into
  // eslint's scope on the ground that the code enforcing every other gate was itself
  // unenforced. This config file is the last file left in that same blind spot: `turbo run
  // lint` is a per-package task and every workspace package lives under `packages/`, and the
  // `eslint scripts` invocation added by that earlier change named only the scripts directory,
  // never this file. A config file that DEFINES the rules is not a special case that earns
  // exemption by being a config file; the argument that put scripts/ in scope reaches this file
  // exactly the same way.
  //
  // Why an override here instead of splitting the file: most of its length is rationale prose
  // deliberately kept next to the rule it justifies, written so a later maintainer cannot widen
  // a budget without arguing for it in the same place the rule lives. Splitting the file would
  // scatter those rationales away from the rules they explain, which costs exactly the thing
  // they exist for. That earlier change itself added 211 lines of that prose to this same file;
  // that is the pattern working as intended, not bloat to be trimmed.
  //
  // Measured on code alone, not on that prose. `max-lines` in its shorthand form counts
  // comments and blanks, which charges this file for the rationale that is the point of it;
  // the budget below therefore skips comments and blanks, the same treatment and the same
  // reason as the src/theming/ block above and the repo-root scripts/ block below. A pinned
  // raw line count was the older device here, and it was self-invalidating: true only until
  // the next edit to the file it described, checked by nothing, and already drifted false
  // twice elsewhere in this config before it was retired.
  {
    files: ['eslint.config.js'],
    rules: {
      'max-lines': ['error', { max: 400, skipComments: true, skipBlankLines: true }],
    },
  },

  // ── Build scripts — higher limits justified ────────────────────────────────
  {
    files: ['**/scripts/build-css.ts', '**/src/formats.ts'],
    rules: {
      'max-lines': ['error', 500],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },

  // ── CLI ────────────────────────────────────────────────────────────────────
  // stdout IS the CLI's output channel. no-console stays on everywhere else.
  {
    files: ['packages/cli/src/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ── navecss-tokens bin ──────────────────────────────────────────────────────
  // R1/R17/R18/R35: bin.ts's stdout/stderr IS the exit-code-bearing entry point's whole
  // output channel — same shape as CLI's own override above, scoped to the one file whose
  // job is printing.
  {
    files: ['packages/tokens/src/bin.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ── navecss-core bin (R10, navecss-core check) ──────────────────────────────
  // Same shape as navecss-tokens' own bin.ts override above: stdout/stderr IS this
  // entry point's whole output channel.
  {
    files: ['packages/core/src/bin.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ── Build scripts — the progress line is the point ─────────────────────────
  {
    files: [
      '**/scripts/build-css.ts',
      // Same shape, a one-line "regenerated N fixture(s)" progress
      // line for a script package.json's test:browser runs before every browser test suite.
      '**/scripts/generate-consumer-theming-fixtures.ts',
      // Same shape again: a one-line "Wrote <path>" progress line for the doc/data generators
      // (ATOMS.md, TOKENS.md, nave.css-data.json) run by hand or from a maintainer's own
      // terminal, never imported for their output.
      '**/scripts/generate-atoms-doc.ts',
      '**/scripts/generate-css-data.ts',
      'packages/tokens/generate-tokens-doc.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // ── Repo-root scripts/ — the gates that enforce every other gate ───────────
  // `turbo run lint` is a per-package task and every workspace package lives under
  // `packages/`, so this directory was structurally unreachable by it.
  // It is reached now by a root-level `eslint scripts` in the `lint` script, not by a new
  // `ci:check` step — the chain's length is itself gated by check-ci-check-order.mjs.
  //
  // Every rule below is relaxed because it is miscalibrated for a corpus of CLI gate scripts,
  // NOT because the corpus violates it. Each site behind each entry was read before the entry
  // was written, and no gate's logic was edited to make a rule fall silent — that swap (quiet
  // linter, changed enforcement code) is the one outcome this directory cannot afford. The
  // groups are ordered by how load-bearing the reason is, and group 5 is the soft one.
  //
  // THE COUNTS BELOW ARE A DATED BASELINE, not live figures. Every `N of 693` and `N sites` was
  // measured by re-enabling that ONE rule over `scripts/**/*.mjs` and counting ESLint messages.
  // The per-rule counts hold at `e473230` (this PR's first commit) and at its base `22f3187`
  // alike, because the sweep never touched those sites — which is the whole reason those rules
  // are off rather than fixed. The DENOMINATOR is the base tree's figure: 693 is the directory's
  // problem count at `22f3187`, BEFORE this PR's 189 autofixes, with no `scripts/` block in the
  // config. The same method at `e473230` yields 479, the autofixes having landed by then; read
  // `N of 693` as "N of the 693 this PR started from", never as a ratio you can re-derive at
  // head. They are stated with their commit rather than re-chased, because they record the
  // measurement a judgment was made on and a judgment does not move when the corpus does.
  // A later change landed mid-review and shifted several by a handful (it deleted a 350-line
  // gate and rewrote another), which is precisely how a live-sounding number becomes a wrong
  // claim that nobody re-measures. Group 5's count is the one exception and says so on its own
  // line: it was re-measured after round 2 narrowed that group.
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      // ── 1. A gate's output IS its deliverable ──────────────────────────────
      // stdout is the whole product of a check — same shape as the CLI and bin.ts overrides
      // above, and the single largest bucket here (155 of 693).
      'no-console': 'off',

      // Every gate is a hashbang CLI that ALSO exports its pure classification logic so its
      // `.test.mjs` sibling can unit-test it without spawning a process. That dual shape is
      // the directory's architecture and the only reason the logic is testable at all; the
      // rule assumes a script is never also a module (108 of 693).
      'unicorn/no-exports-in-scripts': 'off',

      // ── 2. Values and orderings that carry meaning ─────────────────────────
      // `null` is this corpus's explicit "parsed, found nothing" sentinel (`adrId()`,
      // `extractStatus()`, `readTextFile()`), distinct from an undefined that means "never
      // looked" — and it is what the platform hands these scripts back in the first place,
      // from `RegExp#exec` and `JSON.parse`. Rewriting 76 sites would change gate behaviour
      // to silence a style rule.
      'unicorn/no-null': 'off',

      // `!= null` is a deliberate both-null-and-undefined guard, which is the one comparison
      // `eqeqeq` should not be asked about. Scoped down rather than off: every other loose
      // comparison in this directory is still an error.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Set literals here are lifecycle-ordered, not alphabetical (`ADR_STATUS` is accepted →
      // superseded → deprecated). Same reason `sort-objects`, `sort-modules` and
      // `sort-union-types` are already off in the base block: re-sorting loses information.
      'perfectionist/sort-sets': 'off',

      // The corpus names booleans as propositions (`rule2Ran`, `declaresNaveInput`,
      // `anAnchorIsOpen`) and the enforced prefixes make them worse, not better: the autofix
      // for these three produces `isRule2Ran` and `isDeclaresNaveInput`.
      'unicorn/consistent-boolean-name': 'off',

      // ── 3. Deterministic output ────────────────────────────────────────────
      // Every `.sort()` here is on a string array being put in a stable order for printing.
      // Default sort is UTF-16 code-unit order: deterministic and locale-independent, which
      // is exactly the property a gate's output needs. The comparator the rule asks for would
      // in practice be `localeCompare`, whose result moves with the host's ICU version — a
      // strictly worse gate. 20 of 693, and the reason is correctness, not effort.
      'unicorn/require-array-sort-compare': 'off',

      // Same call sites: each sorts a freshly-built local array (a `readdirSync(...).filter()`
      // result, a `[...set]` spread) that nothing else holds a reference to, so there is no
      // observable mutation for `toSorted()` to prevent.
      'unicorn/no-array-sort': 'off',

      // ── 4. Idioms of CLI gates and of `node:test` fixtures ─────────────────
      // Nearly all of these are the one temp-root idiom this directory's tests are built on:
      // `mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-<gate>-'))`. It is three calls
      // deep because that is what creating a symlink-resolved temp root takes.
      'unicorn/max-nested-calls': 'off',

      // The console-capture idiom these tests use to assert on a gate's printed output:
      // `console.log = (line) => captured.push(line)`. The returned length is incidental to
      // a concise arrow body, not a value anyone reads.
      'unicorn/no-return-array-push': 'off',

      // Fixture factories (`findEntity`, `fakeExecFile`) are defined inside the single test
      // that uses them. That is colocation, which this repo lists as a founding principle;
      // hoisting them would scatter each test's fixtures away from its assertions.
      'unicorn/consistent-function-scoping': 'off',

      // These tests pass an explicit `undefined` to pin the behaviour AT that call shape
      // (`assert.deepEqual(parseListValue(undefined), [])`). Dropping the argument changes
      // what the assertion covers, which is a test weakened to satisfy a formatting rule.
      'unicorn/no-useless-undefined': 'off',

      // `check-content-link-corpus.mjs` scans a stylesheet character by character; its
      // if/else chain is ordered by which character is most common. The autofix reorders the
      // branches into a `switch` and emits worse code for a hand-tuned hot loop.
      'unicorn/prefer-switch': 'off',

      // Both are `for`-loops inside `for`-loops in the ADR reciprocity and orphaned-chunk
      // gates, where the inner `continue`/`break` is the check's actual control flow. The
      // rule's remedy — extract the inner loop into a function — is a structural refactor of
      // enforcement code, which is off the table here.
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',

      // `.map(unquote)` and `.every(isPermissive)`. The hazard this rule guards against is a
      // callback with optional extra parameters silently receiving `index`/`array` (the
      // `.map(parseInt)` trap). Both callbacks here were checked and take exactly one
      // parameter, so both call sites are correct.
      'unicorn/no-array-callback-reference': 'off',

      // `listWorkflowFiles()` deliberately does NOT attach the caught error as `cause`: its
      // own docblock says it reports "a clean, non-zero failure rather than a raw ENOENT
      // stack trace", and it lifts `error.code` into the message by hand. Attaching the cause
      // would reinstate the stack trace the fail-closed design exists to suppress.
      'preserve-caught-error': 'off',

      // ── 5. Preferences, not defects — the soft group ───────────────────────
      // Unlike groups 1-4, the corpus has no positive reason for its form here; the rule's
      // form is simply an alternative. They are off because adopting them means hand-editing
      // ~14 sites across seven files, 13 of them in six gate scripts — re-measured at this
      // commit, after round 2 moved four rules out of this group into the test-file block
      // below — and a linter's first commit is the wrong place to spend that risk. This group
      // is the burn-down list: re-enable one, do the work, delete the line. Every one was read
      // and none marks a defect.
      'unicorn/prefer-iterator-to-array': 'off', // `[...x.matchAll()]` vs `.toArray()`
      'unicorn/prefer-set-methods': 'off', // filter-by-`has` vs `Set#difference` (changes the result type)
      'unicorn/no-for-each': 'off', // `.forEach()` vs `for…of`
      'unicorn/no-useless-template-literals': 'off', // `` `${qty(...)}` `` around a string-returning call
      'unicorn/prefer-unicode-code-point-escapes': 'off', // `\uXXXX` inside a detector's own patterns
      'unicorn/prefer-number-is-safe-integer': 'off', // `isInteger` vs `isSafeInteger` — not equivalent above 2^53

      // `parsePackedFiles()` throws three sibling errors for three shapes of malformed
      // `npm pack --dry-run --json` output. The rule would flip only the middle one to
      // `TypeError`, splitting three identical guards across two classes; and the subject is
      // an external tool's output, not a type check on a caller's argument. Left off rather
      // than autofixed, because the fix changes which class a gate throws.
      'unicorn/prefer-type-error': 'off',

      // ── 6. Structural budgets ──────────────────────────────────────────────
      // Not off — re-pinned to what this corpus measures TODAY, so they still fail on
      // anything worse, with the same small headroom. These are ceilings to lower, not a
      // licence to grow.
      //
      // A gate's `main()` is a flat sequence over independent checks: every check added is
      // one more branch and one more printed line, and splitting it up hides the shape of
      // what the gate actually verifies. Current worst: complexity 18 (`checkStatusRules`,
      // and `main` in check-license-parity.mjs), 92 lines (that same `main`), depth 4.
      complexity: ['error', 18],
      'max-lines-per-function': ['error', { max: 95, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],

      // `max-lines` in its shorthand form counts comments and blanks. This directory is where
      // the project's "relocate the REASON into the source" policy bites hardest — these
      // files are majority prose by design, and counting it charges a file for its own
      // rationale. Measured on code alone the whole directory reported 19 findings under the
      // shorthand form and one under this one; that single remaining file has since been
      // deleted, so the ceiling now has headroom over every file it governs here (worst: 269).
      // Left where it is: this is a ceiling to lower deliberately, not one to re-fit to the
      // current worst each time the directory changes.
      'max-lines': ['error', { max: 400, skipComments: true, skipBlankLines: true }],

      // ── 7. Pin the blank-docblock shape shut ───────────────────────────────
      // `jsdoc/require-jsdoc`'s own autofix inserted 18 empty `/**\n *\n */` blocks across this
      // directory and nothing gated on it: the rule is a WARNING,
      // and neither `eslint scripts` nor any package's `lint` passes `--max-warnings`, so an
      // empty block reads as "documented" to every later maintainer while saying nothing. At
      // ERROR level, unlike `require-jsdoc`, this one actually gates.
      'jsdoc/require-description': 'error',
    },
  },

  // ── Repo-root scripts/ tests — `node:test`, not vitest ─────────────────────
  // These import `test`/`describe` from `node:test` and `assert` from `node:assert/strict`
  // explicitly, so they need no injected globals — but they are still test files and get the
  // same size and documentation latitude the `*.test.ts` block below grants. The vitest block
  // deliberately does NOT match them: its rules would be wrong for a `node:test` file.
  {
    files: ['scripts/**/*.test.mjs'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      // Note the asymmetry this creates, because it will be met as a surprise otherwise:
      // `jsdoc/require-jsdoc` is off here, so nothing ever asks a test file for a docblock — but
      // `jsdoc/require-description` in the block above is ERROR and DOES reach these files. A
      // hand-written `/** @param {string} x */` with no prose therefore fails `ci:check` in a
      // file that was never required to carry a block at all. That is intended (a block that
      // exists should say something), and it is written down here because nothing else prompts it.
      'jsdoc/require-jsdoc': 'off',

      // Every reported site for these four rules is inside a `.test.mjs` fixture, never in a
      // gate itself, which is why they are scoped to test files only rather than off
      // directory-wide.
      'unicorn/no-duplicate-loops': 'off', // `.filter()` in a `for…of` header
      'unicorn/no-array-from-fill': 'off', // `new Array(n).fill(x)` in one test fixture

      // Several of these tests exist precisely to pin how a gate treats leading and trailing
      // whitespace, and for those the literal spaces ARE the fixture: `classifyBucketB('   ')`
      // and `/"  MIT  "/` say what is under test far more directly than `' '.repeat(3)` and
      // `/" {2}MIT {2}"/`, which is what these two rules autofix them into.
      'unicorn/prefer-string-repeat': 'off',
      'no-regex-spaces': 'off',
    },
  },

  // ── Test files ─────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    plugins: { vitest: vitestPlugin },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'jsdoc/require-jsdoc': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // ── Prettier must be last ──────────────────────────────────────────────────
  prettier,
])
