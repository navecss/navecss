/**
 * `AC-theming-31` covers: R26 (extends the `packages/tokens` coverage in
 * `packages/tokens/test/theming/remaining-ac.test.ts` to this package).
 *
 * `@navecss/bridge` ships `src/*.css` directly (no build step, no `dist/`), so its shipped
 * artifact IS its source. R26 reaches every custom-property name Nave chooses, and a
 * bridge chooses none: it maps a UI library's OWN variable names (Base UI's, Radix's)
 * onto Nave's tokens, reading each value through `var(--nave-*)`, and per
 * `docs/04-adr/0003-layer-cascade-contract.md` it "never writes a `--nave-*` name
 * itself". `@navecss/tokens` writes those names in the same `tokens.defaults` layer, and
 * the two writers never setting the same property is what lets the order between them
 * decide nothing. So this checks the bridge's side of that contract: no custom property
 * declared in a shipped bridge file is a `--nave-*` name. It is also why
 * `.stylelintrc.json` exempts these files from `custom-property-pattern`, which would
 * demand the opposite.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

/** Every `.css` file under `dir`, at any depth, as sorted paths relative to `dir`. */
function cssFilesUnder(dir: string): string[] {
  return readdirSync(dir, { encoding: 'utf8', recursive: true })
    .filter((file) => file.endsWith('.css'))
    .sort((a, b) => a.localeCompare(b))
}

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
  it('reads every .css file the package ships, so an empty glob fails loudly', () => {
    expect(cssFilesUnder(SRC)).toEqual(expect.arrayContaining(['base-ui.css', 'radix.css']))
  })

  it('no custom property declared in the shipped src/**/*.css files is a --nave-* name', () => {
    const offenders = cssFilesUnder(SRC).flatMap((file) =>
      declaredCustomProperties(readFileSync(path.join(SRC, file), 'utf8'))
        .filter((name) => name.startsWith('--nave'))
        .map((name) => `${file}: ${name}`),
    )
    expect(offenders).toEqual([])
  })

  // No file in the shipped src/**/*.css files declares a --nave-* custom property at
  // 0.1.0 (the tokens.defaults layer is a placeholder; these files only
  // var(--nave-*) reference tokens' output), so the assertion above cannot fail on
  // today's artifact — this is a tripwire for a future declaration, not a live
  // violation. Proven non-vacuous against a constructed violation instead, matching
  // dist-custom-property-prefix.test.ts in packages/core.
  it('the check itself catches a bridge declaring a Nave name (constructed violation)', () => {
    const offenders = declaredCustomProperties(
      ':root {\n  --nave-color-primary: red;\n  --accent-9: var(--nave-color-primary);\n}\n',
    ).filter((name) => name.startsWith('--nave'))
    expect(offenders).toEqual(['--nave-color-primary'])
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
