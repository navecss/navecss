/**
 * AC-theming-36's first clause, in a real engine: a consumer with no build step writes
 * declarations in `@layer overrides`, and they take effect with no rebuild.
 *
 * Starting from the shipped `tokens.css` and running nothing in between:
 *
 * 1. re-pointing `--nave-color-tint` (rung 1a) to a second valid colour changes, in each colour
 *    scheme, the computed colour of every slot whose value in that scheme follows the tint;
 * 2. then overriding any one colour slot (rung 2) changes that slot, and every other slot's
 *    computed colour stays as it was after step 1. This is checked for EVERY slot but the tint,
 *    each overridden on its own, because a consumer may pick any of them.
 *
 * WHERE THE EXPECTED SETS COME FROM, and why not from the bytes under test. Step 1's set is read
 * from the build's own `palette-record.json`, which records every semantic slot per scheme
 * (`color.surface.base.light`, `color.surface.base.dark`): a (slot, scheme) is expected to move
 * when its recorded value is a relative colour of the tint with a chroma other than 0. Reading
 * it from `tokens.css` instead let a `tokens.css` that baked a slot, or spelled its `var()` in a
 * way the reader did not expect, drop that slot from the set it was then checked against. An
 * achromatic value (chroma 0, such as the white `1 0 h`) carries no hue, so it follows any tint
 * trivially and is asserted neither way: whether Chromium's serialisation of it still changes
 * with the hue is an engine detail. Step 2's set is every `--nave-color-*` property the mounted
 * `tokens.css` declares, read through the CSSOM, so a declaration nested in an at-rule block or
 * inside a style rule (CSS nesting), or wrapped onto a second line, is in it. The record and that
 * set must name the same slots, the tint aside, in both directions.
 *
 * Each step has controls that red on a mutant of the imported `tokens.css`, made by a string
 * edit in the test (the file on disk is never touched): slots baked to literals, in one scheme or
 * whole; a hue fixed behind a `var()` fallback or spaced `var()`; a slot that aliases another,
 * declared flat, nested or wrapped; and an override that also moves a second slot.
 *
 * Differential, like its neighbours: a browser's OKLCH rounding is an implementation detail, so
 * nothing here pins an rgb() literal. A slot is compared with itself before and after, in BOTH
 * colour schemes, because most slots are `light-dark()` pairs.
 */
import { describe, expect, it } from 'vitest'

import PALETTE_RECORD from '../../../tokens/dist/palette-record.json' with { type: 'json' }
import NAVE_TOKENS_CSS from '../../../tokens/dist/tokens.css?raw'

type Scheme = 'light' | 'dark'
type PaletteRecord = Readonly<Record<string, unknown>>

const byName = (a: string, b: string): number => a.localeCompare(b)

const TINT = '--nave-color-tint'
const SCHEMES: readonly Scheme[] = ['light', 'dark']
const FROM_TINT = `oklch(from var(${TINT}) `
const OVERRIDE_COLOUR = 'oklch(0.45 0.2 30)'

const REPOINT = `@layer overrides {\n  :root {\n    ${TINT}: oklch(0.7 0.15 300);\n  }\n}\n`
const inOverrides = (declarations: string): string =>
  `@layer overrides {\n  :root {\n${declarations}\n  }\n}\n`

const keyOf = (name: string, scheme: Scheme): string => `${name}|${scheme}`
const slotOfKey = (key: string): string => key.split('|', 1)[0]!

interface RecordedSlot {
  readonly name: string
  readonly scheme: Scheme
  readonly value: string
}

/**
 * Every slot of a palette record, with the custom property the build names it by:
 * `color.on-action.primary.dark` is `--nave-color-on-action-primary` in the dark scheme.
 */
function recordedSlots(record: PaletteRecord): RecordedSlot[] {
  const slots: RecordedSlot[] = []
  for (const [key, entry] of Object.entries(record)) {
    const scheme = SCHEMES.find((candidate) => key.endsWith(`.${candidate}`))
    if (scheme === undefined || !key.startsWith('color.')) continue
    const value = (entry as { $value?: unknown }).$value
    if (typeof value !== 'string') throw new Error(`${key} has no string $value in the record`)
    const path = key.slice(0, -(scheme.length + 1))
    slots.push({ name: `--nave-${path.replaceAll('.', '-')}`, scheme, value })
  }
  return slots
}

/**
 * Whether a recorded value follows the tint: a relative colour of it, with a chroma other than 0.
 * The channel keyword `c` keeps the tint's own chroma, so it follows. A value that names the tint
 * in any other form, or a chroma this cannot read, fails loudly rather than leaving the set.
 */
function isTintFollower({ name, scheme, value }: RecordedSlot): boolean {
  if (!value.includes(TINT)) return false
  const chroma = value.startsWith(FROM_TINT) ? value.slice(FROM_TINT.length).split(' ', 2)[1] : ''
  if (chroma === 'c') return true
  if (chroma === undefined || chroma === '' || Number.isNaN(Number(chroma))) {
    throw new Error(`cannot read the chroma of ${keyOf(name, scheme)}: ${value}`)
  }
  return Number(chroma) !== 0
}

/**
 * The (slot, scheme) keys a re-point of the tint must move, per the record.
 */
const tintFollowers = (record: PaletteRecord): string[] =>
  recordedSlots(record)
    .filter((slot) => isTintFollower(slot))
    .map(({ name, scheme }) => keyOf(name, scheme))

function mount(css: string): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
}

function addColourProperties(style: CSSStyleDeclaration, into: Set<string>): void {
  for (const property of style) {
    if (property.startsWith('--nave-color-')) into.add(property)
  }
}

/**
 * Reads the declarations of every rule that carries them (a style rule, and the nested
 * declarations CSS nesting puts inside one) and descends into every rule that holds rules (an
 * at-rule block, and a style rule with nested rules: in Chromium a `CSSStyleRule` is not a
 * `CSSGroupingRule`, so the walk keys on the property rather than the class).
 */
function collectColourSlots(rules: CSSRuleList, into: Set<string>): void {
  for (const rule of rules) {
    if ('style' in rule && rule.style instanceof CSSStyleDeclaration) {
      addColourProperties(rule.style, into)
    }
    if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) {
      collectColourSlots(rule.cssRules, into)
    }
  }
}

/**
 * Every `--nave-color-*` property a stylesheet declares, read through the CSSOM of the mounted
 * sheet, at any depth of nesting.
 */
function colourSlotsOf(css: string): string[] {
  mount(css)
  const names = new Set<string>()
  for (const sheet of document.styleSheets) collectColourSlots(sheet.cssRules, names)
  return [...names]
}

/**
 * One probe per (slot, scheme), all appended at once and left in place, so a snapshot only
 * re-reads computed styles. `color-scheme` on the probe resolves a `light-dark()` pair.
 */
function probesFor(names: readonly string[]): Map<string, HTMLElement> {
  document.body.querySelectorAll('div[data-probe]').forEach((node) => node.remove())
  const probes = new Map<string, HTMLElement>()
  const fragment = document.createDocumentFragment()
  for (const name of names) {
    for (const scheme of SCHEMES) {
      const probe = document.createElement('div')
      probe.dataset.probe = 'true'
      probe.style.cssText = `background-color: var(${name}); color-scheme: ${scheme};`
      probes.set(keyOf(name, scheme), probe)
      fragment.append(probe)
    }
  }
  document.body.append(fragment)
  return probes
}

/**
 * The resolved `background-color` of each probe, keyed `name|scheme`. The browser resolves `var()`
 * and `light-dark()` in it, which a custom property's own serialisation does not, but it does not
 * normalise the colour space: Chromium keeps an achromatic value's hue (`oklch(1 0 300)`), which
 * is why achromatic values are asserted neither way.
 */
function snapshot(probes: Map<string, HTMLElement>): Map<string, string> {
  return new Map(
    probes.entries().map(([key, probe]) => [key, getComputedStyle(probe).backgroundColor]),
  )
}

/**
 * The (slot, scheme) pairs the record says follow the tint that a re-point leaves where they
 * were, for a given `tokens.css` and record.
 */
function unmovedByRepoint(tokensCss: string, record: PaletteRecord = PALETTE_RECORD): string[] {
  const followers = tintFollowers(record)
  const probes = probesFor([...new Set(followers.map((key) => slotOfKey(key)))])
  mount(tokensCss)
  const before = snapshot(probes)
  mount(`${tokensCss}\n${REPOINT}`)
  const after = snapshot(probes)
  return followers.filter((key) => before.get(key) === after.get(key)).toSorted(byName)
}

/**
 * Every colour slot (the tint included) an override moves, in either scheme, measured from the
 * state after the re-point so that step 2 is read against step 1, as the criterion orders them.
 */
function movedByOverride(
  tokensCss: string,
  declarations: string,
  slots: readonly string[] = colourSlotsOf(tokensCss),
): string[] {
  const probes = probesFor(slots)
  mount(`${tokensCss}\n${REPOINT}`)
  const before = snapshot(probes)
  mount(`${tokensCss}\n${REPOINT}\n${inOverrides(declarations)}`)
  const after = snapshot(probes)
  const hasMoved = (name: string): boolean =>
    SCHEMES.some((scheme) => before.get(keyOf(name, scheme)) !== after.get(keyOf(name, scheme)))
  return slots.filter((name) => hasMoved(name)).toSorted(byName)
}

interface OverrideProblem {
  readonly overridden: string
  readonly moved: string[]
}

/**
 * Each colour slot but the tint, overridden on its own after the re-point: every override that
 * moves anything other than exactly its own slot.
 */
function step2Problems(tokensCss: string): OverrideProblem[] {
  const slots = colourSlotsOf(tokensCss)
  const problems: OverrideProblem[] = []
  for (const slot of slots) {
    if (slot === TINT) continue
    const moved = movedByOverride(tokensCss, `    ${slot}: ${OVERRIDE_COLOUR};`, slots)
    if (moved.length !== 1 || moved[0] !== slot) problems.push({ overridden: slot, moved })
  }
  return problems
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

/**
 * The imported `tokens.css` with one exact edit. A needle that is absent, appears twice or whose
 * replacement changes nothing fails, so a mutant can never silently be the unmutated file.
 */
function edited(needle: string, replacement: string): string {
  expect(NAVE_TOKENS_CSS.split(needle)).toHaveLength(2)
  const result = NAVE_TOKENS_CSS.replace(needle, () => replacement)
  expect(result).not.toBe(NAVE_TOKENS_CSS)
  return result
}

/**
 * Where a stylesheet's colour slots, the tint aside, and a record's slots disagree, in either
 * direction.
 */
function coverageProblems(slots: readonly string[], record: PaletteRecord): string[] {
  const recorded = new Set(recordedSlots(record).map(({ name }) => name))
  const declared = slots.filter((name) => name !== TINT)
  return [
    ...[...recorded]
      .filter((name) => !declared.includes(name))
      .map((name) => `${name} is in the record but not declared`),
    ...declared
      .filter((name) => !recorded.has(name))
      .map((name) => `${name} is declared but not in the record`),
  ]
}

const ALL_COLOUR_SLOTS = colourSlotsOf(NAVE_TOKENS_CSS)
const FOLLOWERS = tintFollowers(PALETTE_RECORD)
const FOLLOWING_SLOTS = [...new Set(FOLLOWERS.map((key) => slotOfKey(key)))]

describe('AC-theming-36 — rungs 1a and 2 take effect in a real engine with no rebuild', () => {
  it('reads the tint-following set from the emitted record, which names the slots tokens.css declares', () => {
    expect(FOLLOWERS.length).toBeGreaterThan(0)
    expect(FOLLOWING_SLOTS).not.toContain(TINT)
    expect(coverageProblems(ALL_COLOUR_SLOTS, PALETTE_RECORD)).toEqual([])
    // Every probe resolves to a colour: an unresolved `var()` computes to transparent black, which
    // would make "this slot did not move" true of a slot that was never read.
    const probes = probesFor(ALL_COLOUR_SLOTS)
    mount(NAVE_TOKENS_CSS)
    expect(snapshot(probes).values().toArray()).not.toContain('rgba(0, 0, 0, 0)')
  })

  it('re-pointing the tint in @layer overrides moves every slot that follows it, in each scheme', () => {
    expect(unmovedByRepoint(NAVE_TOKENS_CSS)).toEqual([])
  })

  it('then overriding any one slot in @layer overrides moves that slot and no other', () => {
    expect(step2Problems(NAVE_TOKENS_CSS)).toEqual([])
  })
})

describe('AC-theming-36: each step reds on a tokens.css that breaks it', () => {
  const SUNKEN = '--nave-color-surface-sunken'
  const SUNKEN_LINE = `    ${SUNKEN}: light-dark(oklch(from var(${TINT}) 0.985 0.0067 h / 1), oklch(from var(${TINT}) 0.12 0.0067 h / 1));`
  const sunkenAs = (light: string, dark: string): string =>
    edited(SUNKEN_LINE, `    ${SUNKEN}: light-dark(${light}, ${dark});`)
  const BAKED_DARK = 'oklch(0.12 0.0067 186.17 / 1)'
  const SUNKEN_BOTH = [keyOf(SUNKEN, 'dark'), keyOf(SUNKEN, 'light')]

  it('step 1: every tinted slot baked to a literal leaves every follower where it was', () => {
    expect(unmovedByRepoint(withLiteralTintedSlots(NAVE_TOKENS_CSS))).toEqual(
      FOLLOWERS.toSorted(byName),
    )
  })

  it('step 1: one scheme of one slot baked is caught in that scheme', () => {
    const css = sunkenAs(`oklch(from var(${TINT}) 0.985 0.0067 h / 1)`, BAKED_DARK)
    expect(unmovedByRepoint(css)).toEqual([keyOf(SUNKEN, 'dark')])
  })

  it('step 1: a baked half is caught beside an achromatic half that still reads the tint', () => {
    const css = sunkenAs(`oklch(from var(${TINT}) 0.985 0 h / 1)`, BAKED_DARK)
    expect(unmovedByRepoint(css)).toContain(keyOf(SUNKEN, 'dark'))
  })

  it('step 1: one slot baked whole, every other slot unchanged, is caught in both schemes', () => {
    const css = sunkenAs('oklch(0.985 0.0067 186.17 / 1)', BAKED_DARK)
    expect(unmovedByRepoint(css)).toEqual(SUNKEN_BOTH)
  })

  for (const [spelling, tint] of [
    ['a var() fallback', `var(${TINT}, white)`],
    ['spaces inside var()', `var( ${TINT} )`],
  ] as const) {
    it(`step 1: a hue fixed behind ${spelling} is caught in both schemes`, () => {
      const css = sunkenAs(
        `oklch(from ${tint} 0.985 0.0067 186.17 / 1)`,
        `oklch(from ${tint} 0.12 0.0067 186.17 / 1)`,
      )
      expect(unmovedByRepoint(css)).toEqual(SUNKEN_BOTH)
    })
  }

  it('step 1 pin: a slot achromatic in both schemes, in the record and in tokens.css, is not asserted', () => {
    const darkKey = 'color.surface.base.dark'
    const chromatic = `oklch(from var(${TINT}) 0.18 0.0067 h / 1)`
    const achromatic = `oklch(from var(${TINT}) 0 0 h / 1)`
    expect(PALETTE_RECORD[darkKey].$value).toBe(chromatic)
    const record = { ...PALETTE_RECORD, [darkKey]: { $type: 'color', $value: achromatic } }
    const base = `    --nave-color-surface-base: light-dark(oklch(from var(${TINT}) 1 0 h / 1), ${chromatic});`
    const css = edited(
      base,
      base.replace(chromatic, () => achromatic),
    )
    expect(
      tintFollowers(record).filter((key) => key.startsWith('--nave-color-surface-base|')),
    ).toEqual([])
    expect(unmovedByRepoint(css, record)).toEqual([])
  })

  it('step 2: an override that also moves a second slot is reported as moving both', () => {
    const first = FOLLOWING_SLOTS[0]!
    const second = FOLLOWING_SLOTS[1]!
    const both = `    ${first}: ${OVERRIDE_COLOUR};\n    ${second}: oklch(0.45 0.2 120);`
    expect(movedByOverride(NAVE_TOKENS_CSS, both)).toEqual([first, second].toSorted(byName))
  })

  it('step 2: a slot aliasing one that is not first in the file is caught on that slot', () => {
    const line = `    --nave-color-border-default: light-dark(oklch(from var(${TINT}) 0.905 0.0067 h / 1), oklch(from var(${TINT}) 0.37 0.0067 h / 1));`
    const css = edited(
      line,
      '    --nave-color-border-default: var(--nave-color-content-secondary);',
    )
    expect(step2Problems(css)).toEqual([
      {
        overridden: '--nave-color-content-secondary',
        moved: ['--nave-color-border-default', '--nave-color-content-secondary'],
      },
    ])
  })

  const ALIAS = '--nave-color-surface-hover: var(--nave-color-surface-base);'
  const ALIASED = [
    {
      overridden: '--nave-color-surface-base',
      moved: ['--nave-color-surface-base', '--nave-color-surface-hover'],
    },
  ]

  it('step 2: an alias declared one block deeper is caught', () => {
    const css = `${NAVE_TOKENS_CSS}\n@layer tokens.defaults {\n  @media all {\n    :root {\n      ${ALIAS}\n    }\n  }\n}\n`
    expect(step2Problems(css)).toEqual(ALIASED)
  })

  it('step 2: an alias wrapped onto a second line is caught', () => {
    const end = '    --nave-color-backdrop-modal:'
    const css = edited(end, `    ${ALIAS.replace(' var(', '\n      var(')}\n${end}`)
    expect(step2Problems(css)).toEqual(ALIASED)
  })

  it('step 2: an alias nested inside a style rule is caught', () => {
    const css = `${NAVE_TOKENS_CSS}\n@layer tokens.defaults {\n  :root {\n    @media all {\n      ${ALIAS}\n    }\n  }\n}\n`
    expect(step2Problems(css)).toEqual(ALIASED)
  })

  it('a slot declared in tokens.css but absent from the record is caught', () => {
    const end = '    --nave-color-backdrop-modal:'
    const extra = `    --nave-color-surface-hover: light-dark(oklch(from var(${TINT}) 0.95 0.0067 h / 1), oklch(0.2 0.0067 186.17 / 1));`
    const css = edited(end, `${extra}\n${end}`)
    expect(coverageProblems(colourSlotsOf(css), PALETTE_RECORD)).toEqual([
      '--nave-color-surface-hover is declared but not in the record',
    ])
  })

  it('a chroma written as the channel keyword c is read as following the tint', () => {
    const key = 'color.surface.sunken.light'
    const record = {
      ...PALETTE_RECORD,
      [key]: { $type: 'color', $value: `oklch(from var(${TINT}) 0.985 c h / 1)` },
    }
    expect(tintFollowers(record)).toContain(keyOf(SUNKEN, 'light'))
  })

  it('a chroma it cannot read still fails loudly', () => {
    const key = 'color.surface.sunken.light'
    const record = {
      ...PALETTE_RECORD,
      [key]: { $type: 'color', $value: `oklch(from var(${TINT}) 0.985 calc(c / 2) h / 1)` },
    }
    expect(() => tintFollowers(record)).toThrow(
      /cannot read the chroma of --nave-color-surface-sunken\|light/,
    )
  })
})
