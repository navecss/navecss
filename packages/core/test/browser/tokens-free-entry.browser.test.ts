/**
 * R11a (`AC-token-build-11`), plus R11 (`AC-token-build-10`)'s own
 * real-engine clause and R10 (`AC-token-build-09`)'s previously-named gap ("the real-engine
 * composed-with-core clauses are not exercised" — the same composition this file builds
 * anyway to satisfy `AC-token-build-11`'s third `Given`, so it is exercised here rather than
 * left a second time).
 *
 * The consumer-invocable build's own façade (R1) does not exist yet, so
 * "the consumer-invocable build's emitted artifact" is reproduced at the THEMING-HALF
 * granularity this requirement's assertions actually turn on: `runPipeline` + `emitCss(...,
 * 'tokens.presets')` is exactly what `consumer-build.ts`'s `composeConsumerBuild` calls to
 * build its own `.css` field (verified by reading that file — its manifest-validation and
 * same-step-lint calls do not affect the CSS string), so this is a faithful reproduction of
 * that half, not a stand-in for it. The DTCG-reader half (plain spacing/typography/etc.
 * custom properties) is orthogonal to every assertion below, all of which turn on
 * `--nave-color-tint` and its derived slots.
 *
 * The real generation runs Node-side, ahead of this file, in
 * `scripts/generate-consumer-theming-fixtures.ts` (`package.json`'s `test:browser` runs it
 * first): `emitCss`'s import chain transitively pulls in `node:fs`
 * (`emit.ts` -> `copy-lint.ts` -> `contrast.ts` -> `adjacency.ts` -> `adjacency-source.ts` ->
 * `tokens-source.ts`), which Vite externalizes and refuses to bundle for the browser, so the
 * real pipeline cannot run inside this file directly. This file consumes only the resulting
 * CSS TEXT (`?raw`), the same way it already consumes the two static built entry points.
 *
 * Differential assertions throughout, deliberately never a hand-computed expected rgb()
 * literal: a browser's OKLCH-to-sRGB rounding is an implementation detail this file has no
 * reason to pin. What each assertion actually needs — "the consumer's declared seed governs
 * what renders, not some other value" — is checkable by comparing two renders against each
 * other (a different seed changes the pixel; an invalid override does not).
 */
import { describe, expect, it } from 'vitest'

// Browser-mode test files execute inside the real browser, so built CSS is inlined at
// bundle time (Vite's `?raw` import), exactly as the existing `nave-nested-output` fixture
// already does for tokens.css.
import DEFAULT_ENTRY_CSS from '../../dist/index.css?raw'
import NO_TOKENS_ENTRY_CSS from '../../dist/no-tokens.css?raw'
import RESET_CSS from '../../dist/reset.css?raw'
import ATOMIC_CSS from '../../dist/atomic.css?raw'
import CONSUMER_A_CSS from './fixtures/consumer-a.css?raw'
import CONSUMER_B_CSS from './fixtures/consumer-b.css?raw'
import CONSUMER_BUILD_CSS from './fixtures/consumer-build.css?raw'
import NAVE_TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'

/** Every `--name: value;` declaration inside a `tokens.presets`/`tokens.defaults` `:root`
 * block, name -> value. A plain regex scan (not a CSS parser) is enough: the fixtures are
 * generated, one declaration per line, so this needs only what `emit.ts`'s own
 * `EmittedCss.customProperties` Map already carried before it was serialized to text. */
function parseDeclaredCustomProperties(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/^\s{4}(--nave-color-[\w-]+):\s*(.+);\s*$/gm)) {
    found.set(match[1]!, match[2]!)
  }
  return found
}

const TOKENS_IMPORT_RE = /@import\s+url\(\s*['"]@navecss\/tokens\/css['"]\s*\);?/
const RESET_IMPORT_RE = /@import\s+url\(\s*['"]\.\/reset\.css['"]\s*\);?/
const ATOMIC_IMPORT_RE = /@import\s+url\(\s*['"]\.\/atomic\.css['"]\s*\);?/

/**
 * A <style> element's relative @imports resolve against the DOCUMENT, not against the
 * package directory, so under mount() they 404 and contribute nothing (measured).
 * Inlining the real built files is what puts reset's and atomic's rules into the string
 * under test; it is not a claim about what this suite covers.
 *
 * A function replacer, deliberately: `String.replace`'s STRING form interprets `$&`/`$1`/…
 * inside the replacement, and `NAVE_TOKENS_CSS` is a large generated file this test does not
 * control the contents of. */
function inlineImports(css: string): string {
  return css
    .replace(TOKENS_IMPORT_RE, () => NAVE_TOKENS_CSS)
    .replace(RESET_IMPORT_RE, () => RESET_CSS)
    .replace(ATOMIC_IMPORT_RE, () => ATOMIC_CSS)
}

function mount(css: string): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
}

/** Renders one probe element with the given inline declaration and returns its resolved
 * `background-color`, which the browser always normalizes to `rgb()`/`rgba()`, unlike a
 * custom property's own serialized value (spec-ambiguous, engine-dependent). */
function probeBackground(declaration: string): string {
  const el = document.createElement('div')
  el.style.cssText = declaration
  document.body.append(el)
  const value = getComputedStyle(el).backgroundColor
  el.remove()
  return value
}

describe('R11 (AC-token-build-10) — the tokens-free entry composed with a consumer build', () => {
  it('no custom property in the composed document is registered more than once, and no second token layer exists', () => {
    const composed = `${inlineImports(NO_TOKENS_ENTRY_CSS)}\n${CONSUMER_A_CSS}`

    // Every @property registration in the composed document, by name — derived, not
    // inferred from prose, so this does not silently stop testing anything if a future
    // step-table change registers more than one colour.
    const registeredNames = [...composed.matchAll(/@property\s+(--[\w-]+)\s*\{/g)].map((m) => m[1]!)
    expect(registeredNames.length).toBeGreaterThan(0)
    expect(new Set(registeredNames).size).toBe(registeredNames.length)

    // No second tokens.defaults block exists at all in this composition — the entry point
    // this file's own name promises never imports @navecss/tokens/css.
    const defaultsBlocks = composed.match(/@layer\s+tokens\.defaults\s*\{/g) ?? []
    expect(defaultsBlocks).toHaveLength(0)
  })

  it('the tint and a tint-derived slot resolve to the consumer’s declared seed, not to any other value', () => {
    mount(`${inlineImports(NO_TOKENS_ENTRY_CSS)}\n${CONSUMER_A_CSS}`)

    const tintRgb = probeBackground('background-color: var(--nave-color-tint);')

    // Any slot whose declared value is genuinely tint-derived (relative colour syntax
    // reading --nave-color-tint's hue), rather than a literal — picked from the real
    // emitted set instead of naming one by hand, so this does not silently stop testing
    // anything if a future step-table change moves which slots are neutral-derived.
    const declaredA = parseDeclaredCustomProperties(CONSUMER_A_CSS)
    const tintDerived = [...declaredA].find(([, value]) =>
      value.includes('from var(--nave-color-tint)'),
    )
    expect(tintDerived, 'no tint-derived slot found in the fixture').toBeDefined()
    const [slotName] = tintDerived!
    const slotRgb = probeBackground(`background-color: var(${slotName});`)

    // Re-render with a DIFFERENT consumer seed and confirm both move — the consumer's OWN
    // declared seed is what is driving the render, not a value fixed independently of it.
    mount(`${inlineImports(NO_TOKENS_ENTRY_CSS)}\n${CONSUMER_B_CSS}`)
    const otherTintRgb = probeBackground('background-color: var(--nave-color-tint);')
    const otherSlotRgb = probeBackground(`background-color: var(${slotName});`)

    expect(otherTintRgb).not.toBe(tintRgb)
    expect(otherSlotRgb).not.toBe(slotRgb)
  })

  it('the same holds after an invalid @layer overrides re-point of the tint at rung 1a', () => {
    const baseline = `${inlineImports(NO_TOKENS_ENTRY_CSS)}\n${CONSUMER_A_CSS}`
    mount(baseline)
    const tintRgb = probeBackground('background-color: var(--nave-color-tint);')
    const declaredA = parseDeclaredCustomProperties(CONSUMER_A_CSS)
    const [slotName] = [...declaredA].find(([, value]) =>
      value.includes('from var(--nave-color-tint)'),
    )!
    const slotRgb = probeBackground(`background-color: var(${slotName});`)

    // overrides is the LAST-declared layer (always wins on specificity) and the tint is
    // registered `syntax: '<color>'`, so an unparseable value here is invalid at
    // computed-value time and must not silently change what renders.
    mount(
      `${baseline}\n@layer overrides {\n  :root {\n    --nave-color-tint: not-a-real-color;\n  }\n}\n`,
    )
    const tintRgbAfter = probeBackground('background-color: var(--nave-color-tint);')
    const slotRgbAfter = probeBackground(`background-color: var(${slotName});`)

    expect(tintRgbAfter).toBe(tintRgb)
    expect(slotRgbAfter).toBe(slotRgb)
  })
})

/**
 * PINNING ROW for `AC-token-build-10` (R11), added during this project's Phase 3 review
 * (a coverage gap found by an off-line measurement is PINNED, not filed).
 * The project's quality reviewer measured this property in round 1 and the measurement lived
 * only in an issue comment; nothing in the repo checked it. This is that measurement, committed.
 *
 * The consumer half here is a REAL `build` artifact (`scripts/generate-consumer-theming-
 * fixtures.ts` runs the façade and copies its `tokens.css`), not the theming-half fixtures the
 * render assertions above use: the COUNT turns on the whole artifact, and it is the DTCG half
 * that carries most of the registrations.
 *
 * **Two things this row does NOT claim, stated so the next reader does not take it for more
 * than it is.**
 *
 * 1. **It does not close `AC-token-build-10`'s residual.** What runs is still a faithful
 *    REPRODUCTION — `@navecss/core`'s built stylesheets inlined into one string and mounted,
 *    with the relative `@import`s substituted by this file — and not a real project composed
 *    exactly as the documentation instructs, loaded by a real resolver. That residual is the
 *    review's recorded position and this row leaves it exactly where it was. What the row adds
 *    is that the measurement behind it is now checked by something rather than by a comment.
 * 2. **It asserts nothing about WHICH registration wins when there are two.** R11a records
 *    that as ENGINE-DIVERGENT — Chromium 151 resolves duplicate `@property` registrations by
 *    cascade layer, the Houdini text by stylesheet order — and Nave deliberately depends on it
 *    nowhere. This row counts registrations. It does not rank them.
 */
describe('AC-token-build-10 — the registration COUNT over the composed document', () => {
  /** Every `@property` REGISTRATION in the document, by name, with how many times it is
   * registered. Derived from the text rather than from a list, so a future token addition is
   * counted without anyone remembering to name it. The `{` is part of the pattern
   * deliberately: `@property` also appears in the generated artifact's own header COMMENT,
   * which is a mention and not a registration. */
  function registrationsByName(css: string): Map<string, number> {
    const counts = new Map<string, number>()
    for (const match of css.matchAll(/@property\s+(--[\w-]+)\s*\{/g)) {
      counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1)
    }
    return counts
  }

  const sum = (counts: Map<string, number>): number =>
    [...counts.values()].reduce((total, n) => total + n, 0)

  it('the documented rung-1b composition registers every Nave custom property EXACTLY ONCE, and the forgotten-act composition registers every one of them TWICE', () => {
    // The documented act: the tokens-free entry, which never imports @navecss/tokens/css,
    // plus the consumer's own committed build artifact.
    const documented = registrationsByName(
      `${inlineImports(NO_TOKENS_ENTRY_CSS)}\n${CONSUMER_BUILD_CSS}`,
    )
    // The FORGOTTEN act: core's DEFAULT entry, which still imports @navecss/tokens/css, plus
    // the same artifact — the composition `G1 R29`'s "one build command, output committed"
    // produces when the reader misses that the entry point has to move too.
    const forgotten = registrationsByName(
      `${inlineImports(DEFAULT_ENTRY_CSS)}\n${CONSUMER_BUILD_CSS}`,
    )

    // A FLOOR, never an equality: adding a token is a lawful edit and an instrument that
    // reds a lawful future edit is itself a latent defect, graded 🟡. Measured at
    // this head: 46 distinct names, 46 registrations documented, 92 forgotten.
    expect(documented.size).toBeGreaterThanOrEqual(40)

    // Exactly once — asserted as a COUNT (the total equals the number of distinct names),
    // and again by name, so a failure says WHICH property is registered twice.
    expect(sum(documented)).toBe(documented.size)
    expect([...documented].filter(([, n]) => n !== 1)).toEqual([])

    // THE POSITIVE CONTROL, and it is what gives the assertion above its meaning: without it,
    // a future change that silently stopped composing anything at all would leave
    // "no name registered twice" trivially true over an empty or half-built document.
    const byName = (a: string, b: string): number => a.localeCompare(b)
    expect([...forgotten.keys()].toSorted(byName)).toEqual([...documented.keys()].toSorted(byName))
    expect([...forgotten].filter(([, n]) => n !== 2)).toEqual([])
    expect(sum(forgotten)).toBe(2 * sum(documented))
  })
})

describe('AC-token-build-11 — the DEFAULT (non-tokens-free) entry composed with the same consumer artifact', () => {
  // Also closes AC-token-build-09 (R10)'s previously-named gap: "the real-engine
  // composed-with-core clauses are not exercised." This is that composition.
  it('every DECLARED value in the consumer’s sheet still wins, in BOTH document orders', () => {
    // A literal, build-time-baked declared value (not tint-derived, so this isolates the
    // cascade-order question from the relative-colour-syntax question the tests above
    // already cover) — action.primary's light branch, present in every emitted set.
    const declaredA = parseDeclaredCustomProperties(CONSUMER_A_CSS)
    const declaredEntry = [...declaredA].find(([name]) => name === '--nave-color-action-primary')
    expect(declaredEntry, '--nave-color-action-primary is not in the fixture').toBeDefined()
    const [declaredName] = declaredEntry!

    // The consumer's own value in isolation (tokens-free composition), the reference point
    // both orders below are compared against.
    mount(`${inlineImports(NO_TOKENS_ENTRY_CSS)}\n${CONSUMER_A_CSS}`)
    const consumerOnlyRgb = probeBackground(`background-color: var(${declaredName});`)

    // Nave's sheet first, consumer's second.
    mount(`${inlineImports(DEFAULT_ENTRY_CSS)}\n${CONSUMER_A_CSS}`)
    const naveFirstRgb = probeBackground(`background-color: var(${declaredName});`)

    // Consumer's sheet first, Nave's second.
    mount(`${CONSUMER_A_CSS}\n${inlineImports(DEFAULT_ENTRY_CSS)}`)
    const consumerFirstRgb = probeBackground(`background-color: var(${declaredName});`)

    // Both orders resolve to the consumer's own value, not to Nave's shipped default (which
    // this same seed differs sharply from — hue 275 vs the shipped teal's ~186).
    expect(naveFirstRgb).toBe(consumerOnlyRgb)
    expect(consumerFirstRgb).toBe(consumerOnlyRgb)

    // And a sanity check that the comparison above is not vacuous: Nave's OWN shipped
    // default, alone, renders a genuinely different colour than the consumer's.
    mount(inlineImports(DEFAULT_ENTRY_CSS))
    const naveOnlyRgb = probeBackground(`background-color: var(${declaredName});`)
    expect(naveFirstRgb).not.toBe(naveOnlyRgb)
  })
})
