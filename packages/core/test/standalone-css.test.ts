/**
 * AC-directive-core-45: the self-contained stylesheet. The Chromium clause (a page linking only
 * this file renders `nave-flex` as `display: flex` and a focused `nave-focus-ring` button with a
 * solid outline) is `test/browser/no-bundler-page.browser.test.ts`'s.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { tokenize } from '../src/directive/tokenizer.ts'
import { packCoreTarball } from './helpers/pack-core.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(CORE_ROOT, 'dist')
const requireFromCore = createRequire(path.join(CORE_ROOT, 'package.json'))

function dist(name: string): string {
  return readFileSync(path.join(DIST, name), 'utf8')
}

/**
 * The file a CSS `@import url('<specifier>')` of `index.css` names, resolved the way a CSS tool
 * that reads `exports` maps would, and written here on its own: a relative specifier against
 * `dist/`, a package specifier through the package's own export map. It is deliberately not the
 * build step's code, so the derivation below can disagree with it.
 */
function resolveImport(specifier: string): string {
  return specifier.startsWith('.') ? path.join(DIST, specifier) : requireFromCore.resolve(specifier)
}

const IMPORT_LINE = /@import url\('([^']+)'\);/g

/**
 * `dist/layers.css`, then `dist/index.css` with each `@import` replaced by the text of the file
 * it names (its trailing whitespace trimmed, so the line break after the `;` stays).
 */
function derive(): { imports: string[]; text: string } {
  const imports: string[] = []
  const index = dist('index.css').replaceAll(IMPORT_LINE, (_match, specifier: string) => {
    imports.push(specifier)
    return readFileSync(resolveImport(specifier), 'utf8').trimEnd()
  })
  return { imports, text: `${dist('layers.css')}\n${index}` }
}

/**
 * The first statement of `css` after its comments, as written: from its first token that is
 * neither a comment nor whitespace through the first `;`, inner whitespace kept.
 */
function firstStatement(css: string): string {
  const tokens = tokenize(css)
  const start = tokens.findIndex(
    (token) => token.type !== 'comment' && token.type !== 'whitespace-token',
  )
  const end = tokens.findIndex((token) => token.type === 'semicolon-token')
  return tokens
    .slice(start, end + 1)
    .map((token) => token.raw)
    .join('')
}

function layerStatementOf(css: string): string {
  return /^@layer [^;]+;$/m.exec(css)![0]
}

describe('AC-directive-core-45 — the self-contained stylesheet', () => {
  it('the ./standalone subpath resolves to dist/standalone.css, which is in the tarball', () => {
    const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>
    }

    expect(manifest.exports['./standalone']).toBe('./dist/standalone.css')
    expect(requireFromCore.resolve('@navecss/core/standalone')).toBe(
      path.join(DIST, 'standalone.css'),
    )
    expect(packCoreTarball().files).toContain('package/dist/standalone.css')
  }, 60_000)

  it('its token stream has no @import at-rule and no url token', () => {
    const tokens = tokenize(dist('standalone.css'))

    expect(tokens.length).toBeGreaterThan(1000)
    const imports = tokens.filter(
      (token) =>
        token.type === 'at-keyword-token' &&
        (token.structured as { value: string }).value.toLowerCase() === 'import',
    )
    const urls = tokens.filter(
      (token) =>
        token.type === 'url-token' ||
        token.type === 'bad-url-token' ||
        (token.type === 'function-token' &&
          (token.structured as { value: string }).value.toLowerCase() === 'url'),
    )
    expect(imports).toEqual([])
    expect(urls).toEqual([])
  })

  it('its first statement after the comments is byte-identical to the order statement of dist/layers.css', () => {
    expect(firstStatement(dist('standalone.css'))).toBe(layerStatementOf(dist('layers.css')))
    expect(firstStatement(dist('standalone.css'))).toBe(firstStatement(dist('layers.css')))
  })

  it('then holds the token layer, the reset and the atoms, each self-layered', () => {
    const text = dist('standalone.css')
    const positions = ['@layer tokens.defaults {', '@layer reset {', '@layer atomic {'].map(
      (layer) => text.indexOf(layer),
    )

    expect(positions.every((position) => position > 0)).toBe(true)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
  })

  it('is exactly dist/layers.css plus dist/index.css with each @import replaced by the imported file', () => {
    const derived = derive()

    expect(derived.imports).toEqual(['@navecss/tokens/css', './reset.css', './atomic.css'])
    expect(dist('standalone.css')).toBe(derived.text)
  })

  it('control: a one-byte edit to the built file reds the derivation', () => {
    const edited = dist('standalone.css').replace('display: flex', 'display: flax')

    expect(edited).not.toBe(dist('standalone.css'))
    expect(edited).not.toBe(derive().text)
  })

  it('control: the derivation reds when an imported file changes', () => {
    const derived = derive().text.replace('@layer reset {', '@layer resat {')

    expect(derived).not.toBe(dist('standalone.css'))
  })
})
