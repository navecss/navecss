/**
 * R11 (`AC-token-build-10`): `@navecss/core` exposes a TOKENS-FREE entry
 * point, so the documented rung-1b act (import it instead of the default entry, then run
 * the consumer-invocable token build and commit its output) makes a browser-time double
 * registration of any Nave custom property structurally impossible — not merely absorbed
 * by R10's fixed `tokens.presets` layer (the DEFAULT entry's safety net), because with this
 * entry there is only ever one `:root` in the `tokens.*` family to begin with.
 *
 * Static/packaging-level checks only, mirroring `consumer-path.test.ts`'s own resolution
 * idiom (walk the real export map, read the real built files) for R11's own clauses, plus
 * `AC-token-build-11`'s FIRST `Given` (explicitly "a static, packaging-level check with no
 * browser involved" per its own text). The real-engine clauses (R11's second `And given`,
 * plus `AC-token-build-11`'s second and third `Given`s) live in
 * `test/browser/tokens-free-entry.browser.test.ts`: a static scan cannot prove what a
 * browser actually resolves a cascade to.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { emitCss } from '../../tokens/src/theming/emit.ts'
import { formatCssTokens } from '../../tokens/src/formats.ts'
import { runPipeline, type Seeds } from '../../tokens/src/theming/pipeline.ts'
import { DEFAULT_ENV } from '../../tokens/src/theming/ramp.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(HERE, '..')

interface ExportTarget {
  [condition: string]: ExportTarget | string
}

function pickTarget(entry: ExportTarget | string): string {
  if (typeof entry === 'string') return entry
  for (const condition of ['style', 'import', 'default']) {
    const value = entry[condition]
    if (value !== undefined) return pickTarget(value)
  }
  throw new Error(`no resolvable condition in ${JSON.stringify(entry)}`)
}

function resolveSubpath(subpath: string): string {
  const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, ExportTarget | string>
  }
  const entry = manifest.exports[subpath]
  if (entry === undefined) throw new Error(`${subpath} is not in @navecss/core's export map`)
  return path.join(PACKAGE_ROOT, pickTarget(entry))
}

const LAYER_ORDER_STATEMENT =
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;'

describe('R11 — a tokens-free entry point exists in the export map', () => {
  it('"./no-tokens" resolves to a file that exists', () => {
    const entry = resolveSubpath('./no-tokens')
    expect(existsSync(entry), `${entry} does not exist`).toBe(true)
  })

  it('carries the cascade order statement, byte-identical to every other entry point', () => {
    const css = readFileSync(resolveSubpath('./no-tokens'), 'utf8')
    expect(css).toContain(LAYER_ORDER_STATEMENT)
  })

  it('does NOT import @navecss/tokens/css', () => {
    const css = readFileSync(resolveSubpath('./no-tokens'), 'utf8')
    expect(css).not.toMatch(/@import\s+url\(\s*['"]@navecss\/tokens\/css['"]\s*\)/)
  })

  it('imports reset.css and atomic.css plain, exactly like the default entry', () => {
    const css = readFileSync(resolveSubpath('./no-tokens'), 'utf8')
    expect(css).toMatch(/@import\s+url\(\s*['"]\.\/reset\.css['"]\s*\);/)
    expect(css).toMatch(/@import\s+url\(\s*['"]\.\/atomic\.css['"]\s*\);/)
  })
})

describe('R11 — the DEFAULT entry is untouched and still imports @navecss/tokens/css', () => {
  it('"." still imports the token layer', () => {
    const css = readFileSync(resolveSubpath('.'), 'utf8')
    expect(css).toMatch(/@import\s+url\(\s*['"]@navecss\/tokens\/css['"]\s*\)/)
  })

  it('"." still carries the identical cascade order statement', () => {
    const css = readFileSync(resolveSubpath('.'), 'utf8')
    expect(css).toContain(LAYER_ORDER_STATEMENT)
  })
})

describe('AC-token-build-11 first Given — static, packaging-level, no browser involved', () => {
  // "The consumer-invocable build's emitted artifact" reproduced at the theming-half
  // granularity this check turns on, same reasoning and same reproduction as the browser
  // test's own docblock: emitCss(runPipeline(seeds, {}, env), 'tokens.presets') is exactly
  // what consumer-build.ts's composeConsumerBuild calls for its own `.css` field, plus the
  // DTCG-half shell (formatCssTokens) for its own copy of the cascade order statement — the
  // same composition generate-consumer-theming-fixtures.ts builds for the browser test.
  const seeds: Seeds = {
    primary: { l: 0.55, c: 0.14, h: 275 },
    danger: { l: 0.6, c: 0.2, h: 20 },
    declaredTintHue: 275,
  }
  const dtcgHalf = formatCssTokens([], 'tokens.presets')
  const { css: themingHalf } = emitCss(runPipeline(seeds, {}, DEFAULT_ENV), 'tokens.presets')
  const consumerCss = `${dtcgHalf}\n${themingHalf}`
  const composed = `${readFileSync(resolveSubpath('./no-tokens'), 'utf8')}\n${consumerCss}`

  it('declares the full cascade order statement', () => {
    expect(composed).toContain(LAYER_ORDER_STATEMENT)
  })

  it('opens @layer tokens.presets', () => {
    expect(composed).toMatch(/@layer\s+tokens\.presets\s*\{/)
  })

  it('every @property it registers is declared inside the tokens.presets layer, and nothing is declared before it', () => {
    const registered = [...composed.matchAll(/@property\s+(--[\w-]+)\s*\{/g)].map((m) => m[1]!)
    expect(registered.length).toBeGreaterThan(0)

    const openerIndex = themingHalf.indexOf('@layer tokens.presets {')
    expect(openerIndex).toBeGreaterThan(-1)
    const beforeLayer = themingHalf.slice(0, openerIndex)
    expect(beforeLayer).not.toMatch(/\n\s*--[\w-]+\s*:/)

    // Bounded to the layer's own matching closing brace — not "everything after the
    // opener" — so a declaration in a stray, un-layered block placed AFTER this layer
    // closes does not silently satisfy the check (the exact residual a substring-to-EOF
    // scan left open).
    const braceStart = themingHalf.indexOf('{', openerIndex)
    let depth = 0
    let braceEnd = -1
    for (let i = braceStart; i < themingHalf.length; i++) {
      if (themingHalf[i] === '{') depth++
      else if (themingHalf[i] === '}') {
        depth--
        if (depth === 0) {
          braceEnd = i
          break
        }
      }
    }
    expect(braceEnd, 'tokens.presets layer block never closes').toBeGreaterThan(-1)
    const layerBody = themingHalf.slice(braceStart, braceEnd + 1)

    for (const name of registered) {
      expect(
        layerBody,
        `${name} is @property-registered but not declared inside the tokens.presets layer`,
      ).toMatch(new RegExp(`\\n\\s*${name}\\s*:`))
    }
  })

  it('matches, byte for byte, the fixture the browser test consumes', () => {
    const fixture = readFileSync(path.join(HERE, 'browser/fixtures/consumer-a.css'), 'utf8')
    expect(consumerCss).toBe(fixture)
  })
})
