import { describe, expect, it } from 'vitest'

import { emitCss, TINT_PROPERTY } from '../../src/theming/emit.ts'
import { runPipeline } from '../../src/theming/pipeline.ts'
import { SEMANTIC_SLOTS } from '../../src/theming/semantics.ts'

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }
const GREY = { l: 0.6, c: 0, h: 0 }

function seeds(primary = TEAL): {
  danger: typeof DANGER
  declaredTintHue: number
  primary: typeof TEAL
} {
  return { primary, danger: DANGER, declaredTintHue: 186.17 }
}

describe('AC-theming-11 covers: R9, R37', () => {
  it('every primary/danger-derived slot carries a build-time oklch() literal', () => {
    const emitted = emitCss(runPipeline(seeds()))
    const result = runPipeline(seeds())
    const nonNeutralSlots = SEMANTIC_SLOTS.filter(
      (slot) =>
        result.slots.find((s) => s.slot === slot && s.branch === 'light')!.resolved.scale !==
        'neutral',
    )
    for (const slot of nonNeutralSlots) {
      const name = `--nave-color-${slot.replaceAll('.', '-')}`
      const value = emitted.customProperties.get(name)!
      expect(value).toMatch(/light-dark\(oklch\(/)
    }
  })

  it('every neutral-derived slot carries an RCS formula', () => {
    const emitted = emitCss(runPipeline(seeds()))
    const result = runPipeline(seeds())
    const neutralSlots = SEMANTIC_SLOTS.filter(
      (slot) =>
        result.slots.find((s) => s.slot === slot && s.branch === 'light')!.resolved.scale ===
        'neutral',
    )
    for (const slot of neutralSlots) {
      const name = `--nave-color-${slot.replaceAll('.', '-')}`
      const value = emitted.customProperties.get(name)!
      expect(value).toMatch(/oklch\(from var\(--nave-color-tint\)/)
    }
  })
})

describe('AC-theming-13 covers: R11, R12', () => {
  it('the only custom properties emitted are the semantic colour slots plus one input, the tint', () => {
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.css).toContain(TINT_PROPERTY)
    // No step-shaped property name (e.g. --nave-color-neutral-600) ever appears.
    expect(emitted.css).not.toMatch(/--nave-color-neutral-\d/)
    expect(emitted.css).not.toMatch(/--nave-color-primary-\d/)
    expect(emitted.css).not.toMatch(/--nave-color-danger-\d/)
  })
})

describe('AC-theming-14 covers: R13, R14', () => {
  it('--nave-color-tint is registered <color> with an initial-value derived from the shipped seed', () => {
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.css).toMatch(/@property --nave-color-tint \{/)
    expect(emitted.css).toMatch(/syntax: '<color>'/)
    expect(emitted.css).toMatch(/initial-value: oklch\(0\.7859 0\.1316 186\.17\)/)
  })

  it('under an achromatic seed the tint takes a DECLARED hue rather than an undefined one (never inert)', () => {
    const emitted = emitCss(runPipeline(seeds(GREY)))
    const match = /initial-value: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(emitted.css)
    expect(match).not.toBeNull()
    expect(Number(match![2])).toBeGreaterThan(0) // a real hue-bearing colour, not chroma-zero
  })

  it('no colour OUTPUT (a semantic slot) is ever registered — only the tint input is', () => {
    const emitted = emitCss(runPipeline(seeds()))
    const propertyBlocks = emitted.css.match(/@property [^\s{]+/g) ?? []
    expect(propertyBlocks).toEqual([`@property ${TINT_PROPERTY}`])
  })
})

describe('AC-theming-19 covers: R18a (emitted names)', () => {
  it('border.control and border.default both emit under their own --nave-color- names', () => {
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.customProperties.has('--nave-color-border-control')).toBe(true)
    expect(emitted.customProperties.has('--nave-color-border-default')).toBe(true)
  })
})

describe('AC-theming-31 covers: R26', () => {
  it('every emitted custom property begins with --nave-', () => {
    const emitted = emitCss(runPipeline(seeds()))
    for (const name of emitted.customProperties.keys()) {
      expect(name.startsWith('--nave-')).toBe(true)
    }
    expect(TINT_PROPERTY.startsWith('--nave-')).toBe(true)
    expect(emitted.css).toContain('--nave-color-tint')
  })

  it('the semantic colour layer is exactly --nave-color-*', () => {
    const emitted = emitCss(runPipeline(seeds()))
    for (const name of emitted.customProperties.keys()) {
      expect(name.startsWith('--nave-color-')).toBe(true)
    }
  })
})

describe('the semantic colour layer prefix invariant', () => {
  it('the --nave- prefix is applied by the EMITTER (a fixed string constant), never derived from the DTCG source shape, so a hypothetical "nave"-grouped source cannot double-prefix', () => {
    // The semantic colour layer's names come from SEMANTIC_SLOTS (a fixed literal list of
    // dotted paths, e.g. 'surface.base'), never from tokens.json's own group nesting — the
    // colour pipeline does not read tokens.json's group structure at all. A DTCG source
    // wrapping its nodes under a top-level "nave" group therefore cannot influence the
    // emitted name in any way: this is not a case the emitter special-cases, it is
    // structurally unreachable, which is the invariant this test pins.
    //
    // Deliberately NOT tagged with an AC- id: R32's real subject is the GENERAL DTCG path,
    // where a source's own group nesting does reach the computed name, and this test cannot
    // reach that path. Carrying R32's own criterion id here (spelled out nowhere in this
    // file, deliberately, since the AC-to-test spine is answered by grepping for that exact
    // string) reported R32 as covered off a test structurally unable to fail for it. R32 is
    // NOT covered by this file; its assertion belongs to the entry-point work.
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.customProperties.has('--nave-color-surface-base')).toBe(true)
    for (const name of emitted.customProperties.keys()) {
      expect(name).not.toMatch(/^--nave-nave-/)
      expect(name.startsWith('--nave-color-')).toBe(true)
    }
  })
})
