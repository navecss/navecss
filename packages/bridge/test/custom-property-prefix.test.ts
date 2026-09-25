/**
 * `AC-theming-31` covers: R26 (relocated out of
 * `packages/tokens/test/theming/remaining-ac.test.ts`).
 *
 * `AC-theming-31`'s Given quantifies over "every custom property Nave emits, in every
 * package and every entry point", but the tests that criterion originally shipped with
 * read only `packages/tokens/dist/`. `@navecss/bridge` ships `src/*.css` directly (no
 * build step, no `dist/`), so its shipped artifact IS its source: this reads the same
 * files `stylelint` lints, per `packages/bridge/package.json`'s `lint` script.
 *
 * Bridge files map to a third party's OWN variable-name contract (`--base-ui-*` per the
 * banner comment in `src/base-ui.css`), not to a name Nave chooses, so this checks only
 * what Nave AUTHORS: a `--nave-*` declaration landing here (there are none shipped at
 * 0.1.0 — these files only `var(--nave-*)` reference tokens' output) rather than the
 * third-party contract names these bridges are written to satisfy.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

const SRC_CSS_FILES = ['base-ui.css', 'radix.css']

/**
 * The custom-property names DECLARED in a stylesheet (never a `var(...)` reference,
 * and never a third-party name like `--base-ui-*` mentioned only in a doc comment).
 * Comments are stripped first and the match anchored to line-start-plus-indent, matching
 * `remaining-ac.test.ts`'s `declaredCustomProperties`.
 */
function declaredCustomProperties(css: string): string[] {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/^[ \t]*(--[\w-]+)\s*:/gm)
    .map((m) => m[1]!)
    .toArray()
}

describe('AC-theming-31 covers: R26 (packages/bridge shipped artifact)', () => {
  it('every --nave-* declared custom property in the shipped src/*.css files begins with --nave-', () => {
    // Deliberately NOT "every declared custom property begins with --nave-": a bridge
    // legitimately declares a third-party name (--base-ui-*) to satisfy that library's
    // own contract, which R26 does not reach (Nave did not choose that name). Only names
    // that DO start with the Nave prefix pattern's namespace segment are asserted
    // well-formed; anything else declared here is a different surface, not this one.
    const offenders = SRC_CSS_FILES.flatMap((file) =>
      declaredCustomProperties(readFileSync(path.join(SRC, file), 'utf8'))
        .filter((name) => name.startsWith('--nave') && !name.startsWith('--nave-'))
        .map((name) => `${file}: ${name}`),
    )
    expect(offenders).toEqual([])
  })

  // No file among SRC_CSS_FILES declares a --nave-* custom property at 0.1.0 (the
  // tokens.defaults layer is a placeholder; these files only var(--nave-*) reference
  // tokens' output), so the assertion above cannot fail on today's artifact — this is a
  // tripwire for a future declaration, not a live violation. Proven non-vacuous against
  // a constructed violation instead, matching dist-custom-property-prefix.test.ts in
  // packages/core.
  it('the check itself catches a malformed --nave declaration (constructed violation)', () => {
    const offenders = declaredCustomProperties(
      ':root {\n  --naveColorPrimary: red;\n  --base-ui-accent: var(--naveColorPrimary);\n}\n',
    ).filter((name) => name.startsWith('--nave') && !name.startsWith('--nave-'))
    expect(offenders).toEqual(['--naveColorPrimary'])
  })
})
