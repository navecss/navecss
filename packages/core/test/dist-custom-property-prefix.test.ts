/**
 * `AC-theming-31` covers: R26 (relocated out of
 * `packages/tokens/test/theming/remaining-ac.test.ts`).
 *
 * `AC-theming-31`'s Given quantifies over "every custom property Nave emits, in every
 * package and every entry point", but the tests that criterion originally shipped with
 * read only `packages/tokens/dist/`. Nothing ranged over `@navecss/core`'s own shipped
 * CSS, so a custom property declared here with no `--nave-` prefix (a built-in Nave atom
 * declaring one, via `packages/core/src/postcss.ts`'s `navePlugin`, is the concrete
 * surface this guards) would ship silently.
 *
 * WHY THIS LIVES IN `@navecss/core` AND NOT IN `@navecss/tokens`, same rationale as
 * `reset-color-scheme.test.ts` beside it: `@navecss/tokens#test` hashes its own package
 * alone, so a property declared here would not invalidate that package's cache on the
 * exact edit this check exists to catch. `@navecss/core#test` hashes this package's own
 * `dist/` by default.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const DIST_CSS_FILES = ['atomic.css', 'index.css', 'layers.css', 'no-tokens.css', 'reset.css']

/**
 * The custom-property names DECLARED in a stylesheet (never a `var(...)` reference).
 * Comments are stripped first and the match anchored to line-start-plus-indent, matching
 * `remaining-ac.test.ts`'s `declaredCustomProperties`: an unanchored pattern would also
 * match a name mentioned inside a doc comment, several of which name `--nave-*`
 * properties in prose (see this package's own `dist/atomic.css` banner).
 */
function declaredCustomProperties(css: string): string[] {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/^[ \t]*(--[\w-]+)\s*:/gm)
    .map((m) => m[1]!)
    .toArray()
}

describe('AC-theming-31 covers: R26 (packages/core shipped artifact)', () => {
  it('every custom property declared across the shipped dist/*.css files begins with --nave-', () => {
    const offenders = DIST_CSS_FILES.flatMap((file) =>
      declaredCustomProperties(readFileSync(path.join(DIST, file), 'utf8'))
        .filter((name) => !name.startsWith('--nave-'))
        .map((name) => `${file}: ${name}`),
    )
    expect(offenders).toEqual([])
  })

  // No file among DIST_CSS_FILES declares a custom property at 0.1.0 (they only
  // reference tokens' --nave-* names via var()), so the assertion above cannot fail on
  // today's artifact — this is a tripwire for a future declaration, not a live
  // violation. Proven non-vacuous against a constructed violation instead, the same
  // technique `AC-theming-54`'s guard tests use in remaining-ac.test.ts for the same
  // reason (no live violation to exercise the failing direction against).
  it('the check itself catches an unprefixed declaration (constructed violation)', () => {
    const offenders = declaredCustomProperties(
      '.probe {\n  --foo-bar: red;\n  --nave-color-primary: var(--foo-bar);\n}\n',
    ).filter((name) => !name.startsWith('--nave-'))
    expect(offenders).toEqual(['--foo-bar'])
  })
})
