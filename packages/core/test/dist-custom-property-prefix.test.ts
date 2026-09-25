/**
 * `AC-theming-31` covers: R26 (extends the `packages/tokens` coverage in
 * `packages/tokens/test/theming/remaining-ac.test.ts` to this package).
 *
 * `AC-theming-31`'s Given quantifies over "every custom property Nave emits, in every
 * package and every entry point", but the tests that criterion originally shipped with
 * read only `packages/tokens/dist/`. Nothing ranged over `@navecss/core`'s own shipped
 * CSS, so a custom property declared here with no `--nave-` prefix (a built-in Nave atom
 * declaring one, via `packages/core/src/postcss.ts`'s `navePlugin`, is the concrete
 * surface this guards) would ship silently.
 *
 * WHY THIS LIVES IN `@navecss/core`: it reads this package's own build output, and a
 * `@navecss/tokens` test reading `@navecss/core`'s `dist/` would point the dependency the
 * wrong way (`core` depends on `tokens`, never the reverse). It stays fresh under the
 * cache because `@navecss/core#test` depends on `@navecss/core#build` in `turbo.json`:
 * `dist/` is gitignored and never among this task's hashed inputs, but any source edit
 * that changes it changes the build's hash, and so this task's.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

/** Every `.css` file under `dir`, at any depth, as sorted paths relative to `dir`. */
function cssFilesUnder(dir: string): string[] {
  return readdirSync(dir, { encoding: 'utf8', recursive: true })
    .filter((file) => file.endsWith('.css'))
    .sort((a, b) => a.localeCompare(b))
}

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
  it('every custom property declared across the shipped dist/**/*.css files begins with --nave-', () => {
    const offenders = cssFilesUnder(DIST).flatMap((file) =>
      declaredCustomProperties(readFileSync(path.join(DIST, file), 'utf8'))
        .filter((name) => !name.startsWith('--nave-'))
        .map((name) => `${file}: ${name}`),
    )
    expect(offenders).toEqual([])
  })

  // No file in the shipped dist/**/*.css files declares a custom property at 0.1.0
  // (they only reference tokens' --nave-* names via var()), so the assertion above
  // cannot fail on today's artifact — this is a tripwire for a future declaration, not
  // a live violation. Proven non-vacuous against a constructed violation instead, the
  // same technique `AC-theming-54`'s guard tests use in remaining-ac.test.ts for the
  // same reason (no live violation to exercise the failing direction against).
  it('the check itself catches an unprefixed declaration (constructed violation)', () => {
    const offenders = declaredCustomProperties(
      '.probe {\n  --foo-bar: red;\n  --nave-color-primary: var(--foo-bar);\n}\n',
    ).filter((name) => !name.startsWith('--nave-'))
    expect(offenders).toEqual(['--foo-bar'])
  })

  it('reads every .css file the build ships, so a missing build fails loudly', () => {
    expect(cssFilesUnder(DIST)).toEqual(
      expect.arrayContaining(['atomic.css', 'index.css', 'layers.css', 'no-tokens.css', 'reset.css']),
    )
  })

  it('the enumeration reaches a new entry point at any depth (constructed tree)', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'nave-css-enum-'))
    try {
      writeFileSync(path.join(tmp, 'top.css'), '')
      mkdirSync(path.join(tmp, 'nested'))
      writeFileSync(path.join(tmp, 'nested', 'new.css'), '')
      writeFileSync(path.join(tmp, 'ignored.js'), '')
      expect(cssFilesUnder(tmp)).toEqual([path.join('nested', 'new.css'), 'top.css'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
