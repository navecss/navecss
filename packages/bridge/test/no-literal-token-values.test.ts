/**
 * Bridge's check instrument, chosen before content lands.
 *
 * `@navecss/bridge` ships CSS as source (`files: ["src"]`, `exports` point
 * straight at `src/*.css`): for a source-shipped package the source IS the
 * shipped artifact, so a source-level test plays the role a built-output
 * test plays for `core` and `tokens`. Which shape a package's check
 * instrument takes is settled before content lands, not after, so the
 * instrument is never chosen to fit what was already written.
 *
 * This closes a gap `scale-unlimited/declaration-strict-value` cannot
 * reach even once its bridge override is dropped (`.stylelintrc.json`).
 * Empirically probed rather than assumed: that
 * rule only inspects declarations whose PROPERTY matches its configured
 * list of ordinary CSS properties (`color`, `background-color`, ...); a
 * custom-property declaration such as `--base-ui-color-accent: <value>`
 * is never checked by it, override present or not, because custom
 * properties are outside the rule's matched-property surface entirely.
 * Every documented bridge declaration IS a custom property
 * (`--[base-ui|radix]-[token]: var(--[nave-token])`, per the pattern
 * comment in src/base-ui.css and src/radix.css), so the one rule whose
 * job is "use a token, not a literal" cannot see bridge's actual content
 * shape at all, however it is configured. This test is the guard for
 * that shape; the stylelint rule remains the guard for any ordinary CSS
 * property bridge might also set.
 *
 * Zero declarations today (both files are comment-only placeholders
 * inside an empty `@layer tokens.defaults { :root {} }`) is the expected,
 * correct state, not a vacuous check: this is the instrument chosen BEFORE
 * content lands, so it starts asserting real coverage the moment the
 * first token mapping is written, rather than being bolted on after.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

const srcCssFiles = readdirSync(SRC).filter((file) => file.endsWith('.css'))

/** A value built entirely from one or more bare `var(--token)` references,
 * space-separated, no fallback and no literal — the documented bridge
 * mapping pattern. */
const IS_VAR_ONLY_VALUE = /^(\s*var\(\s*--[a-zA-Z][a-zA-Z0-9-]*\s*\)\s*)+$/

describe('every bridge custom property is a bare reference to a Nave token', () => {
  it.each(srcCssFiles)('src/%s has no custom property with a non-var() value', (file) => {
    const css = readFileSync(path.join(SRC, file), 'utf8')
    const root = postcss.parse(css)
    const offenders: string[] = []

    root.walkDecls((decl) => {
      if (!decl.prop.startsWith('--')) return
      if (!IS_VAR_ONLY_VALUE.test(decl.value)) offenders.push(`${decl.prop}: ${decl.value}`)
    })

    expect(
      offenders,
      `bridge custom properties with a non-var()-only value in src/${file}: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
