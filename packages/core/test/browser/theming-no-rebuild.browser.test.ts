/**
 * AC-theming-36's first clause, in a real engine: a consumer with no build step writes
 * declarations in `@layer overrides`, and they take effect with no rebuild.
 *
 * Starting from the shipped `tokens.css` and running nothing in between:
 *
 * 1. re-pointing `--nave-color-tint` (rung 1a) to a second valid colour changes the computed
 *    colour of every slot whose emitted value derives from the tint;
 * 2. then overriding one slot (rung 2) changes that slot, and every other slot's computed colour
 *    stays as it was after step 1.
 *
 * The tint-derived set is READ FROM THE EMITTED FILE, never listed here, so a slot added later is
 * in it. Each step has a control that reds on a mutant: a `tokens.css` whose tinted slots hold
 * literals (step 1), and an override that also moves a second slot (step 2).
 *
 * Differential, like its neighbours: a browser's OKLCH rounding is an implementation detail, so
 * nothing here pins an rgb() literal. A slot is compared with itself before and after, in BOTH
 * colour schemes, because most slots are `light-dark()` pairs and a slot such as the white
 * `on-action-primary` is hue-independent in one scheme and not in the other.
 */
import { describe, expect, it } from 'vitest'

import NAVE_TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'

const byName = (a: string, b: string): number => a.localeCompare(b)

const TINT = '--nave-color-tint'
const SCHEMES = ['light', 'dark'] as const

const REPOINT = `@layer overrides {\n  :root {\n    ${TINT}: oklch(0.7 0.15 300);\n  }\n}\n`

/**
 * Every `--nave-color-*: value;` declaration of the emitted file, name -> value.
 */
function declaredColours(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/^\s{4}(--nave-color-[\w-]+):\s*(.+);\s*$/gm)) {
    found.set(match[1]!, match[2]!)
  }
  return found
}

/**
 * The slots whose emitted value derives from the tint: those that read `var(--nave-color-tint)`,
 * and those that read a slot that does, to a fixed point.
 */
function tintDerivedSlots(css: string): string[] {
  const declared = declaredColours(css)
  const derived = new Set<string>()
  let size = -1
  while (derived.size !== size) {
    size = derived.size
    for (const [name, value] of declared) {
      const sources = [TINT, ...derived]
      if (name !== TINT && sources.some((source) => value.includes(`var(${source})`))) {
        derived.add(name)
      }
    }
  }
  return [...derived]
}

function mount(css: string): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
}

/**
 * The resolved `background-color` of each slot in each colour scheme, keyed `name|scheme`. The
 * browser normalises it, unlike a custom property's own serialisation, and `color-scheme` on the
 * probe is what resolves a `light-dark()` pair.
 */
function snapshot(names: readonly string[]): Map<string, string> {
  const colours = new Map<string, string>()
  for (const name of names) {
    for (const scheme of SCHEMES) {
      const probe = document.createElement('div')
      probe.style.cssText = `background-color: var(${name}); color-scheme: ${scheme};`
      document.body.append(probe)
      colours.set(`${name}|${scheme}`, getComputedStyle(probe).backgroundColor)
      probe.remove()
    }
  }
  return colours
}

/**
 * The slots whose colour differs between two snapshots in at least one colour scheme.
 */
function movedSlots(
  names: readonly string[],
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  return names.filter((name) =>
    SCHEMES.some((scheme) => before.get(`${name}|${scheme}`) !== after.get(`${name}|${scheme}`)),
  )
}

const ALL_COLOUR_SLOTS = declaredColours(NAVE_TOKENS_CSS).keys().toArray()
const TINT_DERIVED = tintDerivedSlots(NAVE_TOKENS_CSS)

/**
 * The derived slots a re-point of the tint leaves where they were, for a given `tokens.css`.
 */
function unmovedByRepoint(tokensCss: string): string[] {
  mount(tokensCss)
  const before = snapshot(TINT_DERIVED)
  mount(`${tokensCss}\n${REPOINT}`)
  const moved = movedSlots(TINT_DERIVED, before, snapshot(TINT_DERIVED))
  return TINT_DERIVED.filter((name) => !moved.includes(name))
}

/**
 * Every colour slot (the tint included) an override moves, measured from the state after the
 * re-point so that step 2 is read against step 1, as the criterion orders them.
 */
function movedByOverride(tokensCss: string, declarations: string): string[] {
  mount(`${tokensCss}\n${REPOINT}`)
  const afterRepoint = snapshot(ALL_COLOUR_SLOTS)
  mount(`${tokensCss}\n${REPOINT}\n@layer overrides {\n  :root {\n${declarations}\n  }\n}\n`)
  return movedSlots(ALL_COLOUR_SLOTS, afterRepoint, snapshot(ALL_COLOUR_SLOTS))
}

/**
 * A `tokens.css` whose tinted slots hold the literal colour the default tint derives, rather than
 * deriving it, so a re-point of the tint cannot reach them.
 */
function withLiteralTintedSlots(css: string): string {
  const defaultHue = /^\s{4}--nave-color-tint:\s*oklch\([\d.]+ [\d.]+ ([\d.]+)\)/m.exec(css)![1]!
  return css.replaceAll(
    /oklch\(from var\(--nave-color-tint\) ([\d.]+) ([\d.]+) h(?: \/ ([\d.]+))?\)/g,
    (_, lightness: string, chroma: string, alpha?: string) =>
      `oklch(${lightness} ${chroma} ${defaultHue} / ${alpha ?? 1})`,
  )
}

const OVERRIDDEN_SLOT = TINT_DERIVED[0]!
const OVERRIDE_ONE = `    ${OVERRIDDEN_SLOT}: oklch(0.45 0.2 30);`
const OTHER_SLOT = ALL_COLOUR_SLOTS.find((name) => name !== OVERRIDDEN_SLOT && name !== TINT)!

describe('AC-theming-36 — rungs 1a and 2 take effect in a real engine with no rebuild', () => {
  it('reads a non-empty tint-derived set from the emitted file', () => {
    expect(TINT_DERIVED.length).toBeGreaterThan(0)
    expect(TINT_DERIVED).not.toContain(TINT)
    // Every probe resolves to a colour: an unresolved `var()` computes to transparent black, which
    // would make "this slot did not move" true of a slot that was never read.
    mount(NAVE_TOKENS_CSS)
    expect(snapshot(ALL_COLOUR_SLOTS).values().toArray()).not.toContain('rgba(0, 0, 0, 0)')
  })

  it('re-pointing the tint in @layer overrides changes every slot that derives from it', () => {
    expect(unmovedByRepoint(NAVE_TOKENS_CSS)).toEqual([])
  })

  it('control: a tokens.css whose tinted slots are literals leaves them all where they were', () => {
    expect(unmovedByRepoint(withLiteralTintedSlots(NAVE_TOKENS_CSS)).toSorted(byName)).toEqual(
      TINT_DERIVED.toSorted(byName),
    )
  })

  it('then overriding one slot in @layer overrides moves that slot and no other', () => {
    expect(movedByOverride(NAVE_TOKENS_CSS, OVERRIDE_ONE)).toEqual([OVERRIDDEN_SLOT])
  })

  it('control: an override that also moves a second slot is reported as moving both', () => {
    const alsoSecond = `${OVERRIDE_ONE}\n    ${OTHER_SLOT}: oklch(0.45 0.2 120);`
    expect(movedByOverride(NAVE_TOKENS_CSS, alsoSecond).toSorted(byName)).toEqual(
      [OVERRIDDEN_SLOT, OTHER_SLOT].toSorted(byName),
    )
  })
})
