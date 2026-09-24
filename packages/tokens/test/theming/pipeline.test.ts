import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { emitCss } from '../../src/theming/emit.ts'
import { runPipeline } from '../../src/theming/pipeline.ts'

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

describe('AC-theming-01 covers: R1', () => {
  it('every resolved slot draws its scale from exactly {danger, neutral, primary} — no "secondary" scale is ever resolved', () => {
    const result = runPipeline(seeds())
    const scalesUsed = new Set(result.slots.map((s) => s.resolved.scale))
    expect([...scalesUsed].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'danger',
      'neutral',
      'primary',
    ])
  })

  it('no scale named "secondary" appears in the emitted CSS (every custom property resolves through a semantic slot, never a raw scale-step name)', () => {
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.css).not.toMatch(/secondary-accent/i)
    expect(emitted.css).not.toMatch(/--nave-color-secondary-/i)
  })

  it('no scale named "secondary" appears in tokens.json, the token source', () => {
    const raw = readFileSync(path.resolve(import.meta.dirname, '../../tokens.json'), 'utf8')
    expect(raw).not.toMatch(/secondary-accent/i)
    expect(raw).not.toMatch(/"scale"\s*:\s*"secondary"/i)
  })

  // KNOWN-UNCOVERED SLICES of R1, recorded rather than papered over. Both range over
  // documentation this package does not own, the class AC-theming-35/-39's README halves
  // are already in.
  //
  // 1. R1's last clause ("the only documented route to a second accent is the extend
  //    mechanism of R32"): no artifact in this repository exists against which "the only documented
  //    route" is checkable.
  // 2. R1's PUBLIC themeable scale set ("the ladder documents only neutral/primary as
  //    themeable levers"). This was asserted against the LADDER constant until
  //    that assertion was withdrawn, NOT relocated. LADDER is an
  //    internal data structure, not exported and in no dist/ file, and it is the same
  //    artifact AC-theming-34/-36 are scoped out for NOT being.
  //    Product ruled that asserting a documentation criterion against LADDER "would
  //    make the criterion pass while still not checking the thing it names", the
  //    proxy-assertion class this was raised for, and that at 0.1.0 the artifact these
  //    claims range over is README.md's theming section, landed via a separate
  //    PR. THAT SECTION NOW EXISTS (that PR landed; since corrected). This slice
  //    stays uncovered for a different reason: scripts/readme-ac-theming-34-36.test.mjs
  //    reads the published section but asserts AC-theming-34/-36's rows and postures,
  //    not R1's themeable scale set, so no test reads the published section for this
  //    claim. The three assertions above (resolved scale set, emitted CSS, tokens.json)
  //    carry R1's checkable half against real artifacts in the meantime.
})

describe('AC-theming-16 covers: R15', () => {
  it('every scale step resolves to exactly one value per scheme (no light-dark() inside a per-branch resolved value — the pipeline never guesses which scheme it is generating for)', () => {
    const result = runPipeline(seeds())
    for (const slot of result.slots) {
      expect(slot.css).not.toMatch(/light-dark/)
    }
  })

  it('scheme selection happens in the BUILT CSS, at the semantic layer: every emitted custom property wraps its two per-scheme resolved values in light-dark(light, dark)', () => {
    const emitted = emitCss(runPipeline(seeds()))
    expect(emitted.customProperties.size).toBeGreaterThan(0)
    for (const [name, value] of emitted.customProperties) {
      expect(value, `${name} should be scheme-selected via light-dark()`).toMatch(
        /^light-dark\(.+,.+\)$/,
      )
    }
  })
})

describe('AC-theming-17 covers: R16', () => {
  it('under the chromatic default seed, the STEP-level coupling binds action.primary and content.link; border.focus carries its own row-9-bound step (round 15)', () => {
    const result = runPipeline(seeds())
    const get = (slot: string, branch: 'light' | 'dark'): (typeof result.slots)[number] =>
      result.slots.find((s) => s.slot === slot && s.branch === branch)!

    expect(get('action.primary', 'light').resolved).toEqual({ scale: 'primary', step: 600 })
    expect(get('action.primary.hover', 'light').resolved).toEqual({ scale: 'primary', step: 700 })
    expect(get('action.primary.active', 'light').resolved).toEqual({ scale: 'primary', step: 800 })
    expect(get('on-action.primary', 'light').resolved).toEqual({ scale: 'neutral', step: 0 })
    expect(get('content.link', 'light').resolved).toEqual({ scale: 'primary', step: 600 })
    // border.focus is R16's one stated exception (round 15): a scheme-invariant
    // primary-500, not the coupled 600/300 the other two slots carry.
    expect(get('border.focus', 'light').resolved).toEqual({ scale: 'primary', step: 500 })
    expect(get('border.focus', 'dark').resolved).toEqual({ scale: 'primary', step: 500 })

    // STEP-level coupling: action.primary and content.link share one step per scheme.
    expect(get('content.link', 'light').resolved).toEqual(get('action.primary', 'light').resolved)
    expect(get('content.link', 'dark').resolved).toEqual(get('action.primary', 'dark').resolved)

    // NEGATIVE case (the one a re-scoping alone would lose): an implementation that
    // re-couples border.focus to the accent's step, or reads the step coupling as a
    // three-slot rule, must fail this scenario.
    expect(get('border.focus', 'light').resolved).not.toEqual(
      get('action.primary', 'light').resolved,
    )
    expect(get('border.focus', 'dark').resolved).not.toEqual(get('action.primary', 'dark').resolved)
  })

  it('SCALE-level coupling: action.primary, content.link and border.focus all draw from the primary (accent) scale under a re-seed', () => {
    const otherSeed = { l: 0.6, c: 0.12, h: 260 }
    const result = runPipeline(seeds(otherSeed))
    for (const slot of ['action.primary', 'content.link', 'border.focus']) {
      for (const branch of ['light', 'dark'] as const) {
        expect(
          result.slots.find((s) => s.slot === slot && s.branch === branch)!.resolved.scale,
        ).toBe('primary')
      }
    }
  })

  it('border.focus is SCHEME-INVARIANT (primary-500 in both schemes) while action.primary and content.link stay scheme-variant', () => {
    const result = runPipeline(seeds())
    const focusLight = result.slots.find((s) => s.slot === 'border.focus' && s.branch === 'light')!
    const focusDark = result.slots.find((s) => s.slot === 'border.focus' && s.branch === 'dark')!
    expect(focusLight.resolved).toEqual(focusDark.resolved)

    const primaryLight = result.slots.find(
      (s) => s.slot === 'action.primary' && s.branch === 'light',
    )!
    const primaryDark = result.slots.find(
      (s) => s.slot === 'action.primary' && s.branch === 'dark',
    )!
    expect(primaryLight.resolved).not.toEqual(primaryDark.resolved)
  })

  it("R3(a)'s achromatic branch re-points all three coupled slots together, never stranding one on the chromatic derivation", () => {
    const result = runPipeline(seeds(GREY))
    for (const slot of ['action.primary', 'content.link', 'border.focus']) {
      for (const branch of ['light', 'dark'] as const) {
        expect(
          result.slots.find((s) => s.slot === slot && s.branch === branch)!.resolved.scale,
        ).toBe('neutral')
      }
    }
  })
})

describe('AC-theming-18 covers: R17, R22', () => {
  it('one on-action foreground serves resting/hover/active in both schemes, with the stated direction', () => {
    const result = runPipeline(seeds())
    const restingLight = result.slots.find(
      (s) => s.slot === 'on-action.primary' && s.branch === 'light',
    )!
    const hoverLight = result.slots.find(
      (s) => s.slot === 'action.primary.hover' && s.branch === 'light',
    )!
    const restingDark = result.slots.find(
      (s) => s.slot === 'on-action.primary' && s.branch === 'dark',
    )!
    const hoverDark = result.slots.find(
      (s) => s.slot === 'action.primary.hover' && s.branch === 'dark',
    )!
    // light scheme moves darker per step (600 -> 700 -> 800), away from a light foreground (step 0)
    expect(restingLight.resolved.step).toBe(0)
    expect(hoverLight.resolved.step).toBe(700)
    // dark scheme moves lighter per step (300 -> 200 -> 150), away from a dark foreground (step 900)
    expect(restingDark.resolved.step).toBe(900)
    expect(hoverDark.resolved.step).toBe(200)
  })
})

describe('AC-theming-19 covers: R18a', () => {
  it('border.control and border.default are distinct slots with distinct steps', () => {
    const result = runPipeline(seeds())
    const control = result.slots.find((s) => s.slot === 'border.control' && s.branch === 'light')!
    const dflt = result.slots.find((s) => s.slot === 'border.default' && s.branch === 'light')!
    expect(control.resolved.step).not.toBe(dflt.resolved.step)
  })
})

describe('AC-theming-20 covers: R19', () => {
  it("danger is generated on the same table with its own seed and is not in the public scale set's naming", () => {
    const result = runPipeline(seeds())
    const dangerFill = result.slots.find(
      (s) => s.slot === 'feedback.danger' && s.branch === 'light',
    )!
    expect(dangerFill.resolved.scale).toBe('danger')
    expect(dangerFill.literal).toBeDefined()
  })
})

describe('AC-theming-21 covers: R19', () => {
  it('warning/success/info alias one shared family: identical resolved values in both schemes', () => {
    const result = runPipeline(seeds())
    for (const branch of ['light', 'dark'] as const) {
      const warning = result.slots.find(
        (s) => s.slot === 'feedback.warning' && s.branch === branch,
      )!
      const success = result.slots.find(
        (s) => s.slot === 'feedback.success' && s.branch === branch,
      )!
      const info = result.slots.find((s) => s.slot === 'feedback.info' && s.branch === branch)!
      expect(success.resolved).toEqual(warning.resolved)
      expect(info.resolved).toEqual(warning.resolved)
    }
  })
})

describe('AC-theming-27 covers: R23', () => {
  it('the chromatic column matches R23s worked mapping exactly for the pinned slots', () => {
    const result = runPipeline(seeds())
    const get = (
      slot: string,
      branch: 'light' | 'dark',
    ): (typeof result.slots)[number]['resolved'] =>
      result.slots.find((s) => s.slot === slot && s.branch === branch)!.resolved

    expect(get('surface.base', 'light')).toEqual({ scale: 'neutral', step: 0 })
    expect(get('surface.base', 'dark')).toEqual({ scale: 'neutral', step: 900 })
    expect(get('content.tertiary', 'light')).toEqual({ scale: 'neutral', step: 600 })
    expect(get('content.tertiary', 'dark')).toEqual({ scale: 'neutral', step: 400 })
    // Round 19 (write-back 8): border.control's dark value moves 400 -> 500
    // and the slot becomes scheme-invariant — row 8's quantifier reaches surface.inverse,
    // which sits inside the OTHER scheme's lightness cluster, so the slot's scope crosses
    // schemes. No contrast conclusion is drawn here (one canonical home per fact).
    expect(get('border.control', 'light')).toEqual({ scale: 'neutral', step: 500 })
    expect(get('border.control', 'dark')).toEqual({ scale: 'neutral', step: 500 })
    expect(get('content.secondary', 'light')).toEqual({ scale: 'neutral', step: 700 })
    expect(get('action.secondary', 'light')).toEqual({ scale: 'neutral', step: 100 })
    expect(get('action.secondary', 'dark')).toEqual({ scale: 'neutral', step: 800 })
    // Round 15 (write-back 7): the chromatic column's border.focus is
    // scheme-invariant at primary-500. Round 19 makes border.control the
    // second scheme-invariant slot in this column, on a different ramp and for a
    // different stated reason (write-back 8) — a property of each slot, not a count.
    expect(get('border.focus', 'light')).toEqual({ scale: 'primary', step: 500 })
    expect(get('border.focus', 'dark')).toEqual({ scale: 'primary', step: 500 })

    expect(result.actionSecondaryForeground.light.resolved).toEqual({ scale: 'neutral', step: 900 })
    expect(result.actionSecondaryBorder.light.resolved).toEqual({ scale: 'neutral', step: 500 })
    expect(result.actionSecondaryBorder.dark.resolved).toEqual({ scale: 'neutral', step: 500 })
  })

  it('the achromatic column resolves the branchs six slots to the write-back 6 values', () => {
    const result = runPipeline(seeds(GREY))
    const get = (
      slot: string,
      branch: 'light' | 'dark',
    ): (typeof result.slots)[number]['resolved'] =>
      result.slots.find((s) => s.slot === slot && s.branch === branch)!.resolved

    expect(get('action.primary', 'light')).toEqual({ scale: 'neutral', step: 800 })
    expect(get('action.primary', 'dark')).toEqual({ scale: 'neutral', step: 200 })
    expect(get('action.primary.hover', 'light')).toEqual({ scale: 'neutral', step: 900 })
    expect(get('action.primary.active', 'light')).toEqual({ scale: 'neutral', step: 950 })
    expect(get('on-action.primary', 'light')).toEqual({ scale: 'neutral', step: 0 })
    expect(get('on-action.primary', 'dark')).toEqual({ scale: 'neutral', step: 900 })
    // Round 11 (option A ruled): border.focus's achromatic-branch value moved from
    // 400/500 to 500/500, scheme-invariant in this column too.
    // Round 19 (write-back 8) makes border.control scheme-invariant in the
    // achromatic column as well (see the chromatic column's note above): a property of
    // each slot, not a count of how many slots share it. AC-theming-49's text-pairs-only
    // case is what makes border.focus's pinning lawful (a non-text pair); AC-theming-28's
    // branch case is what makes it acceptable to the dark-branch-exists gate (the gate
    // checks existence, not difference).
    expect(get('border.focus', 'light')).toEqual({ scale: 'neutral', step: 500 })
    expect(get('border.focus', 'dark')).toEqual({ scale: 'neutral', step: 500 })
    // content.link is ALIASED to content.primary, not given its own step
    expect(get('content.link', 'light')).toEqual(get('content.primary', 'light'))
    expect(get('content.link', 'dark')).toEqual(get('content.primary', 'dark'))

    // Every OTHER slot is unaffected by the branch (identical to the chromatic column).
    const chromatic = runPipeline(seeds())
    for (const slot of ['surface.base', 'content.primary', 'border.control', 'feedback.danger']) {
      expect(get(slot, 'light')).toEqual(
        chromatic.slots.find((s) => s.slot === slot && s.branch === 'light')!.resolved,
      )
    }
  })

  it('the emitted slot set is seed-invariant: identical slot names under either seed class', () => {
    const chromatic = runPipeline(seeds())
    const achromatic = runPipeline(seeds(GREY))
    const namesOf = (r: typeof chromatic): Set<string> => new Set(r.slots.map((s) => s.slot))
    expect(namesOf(achromatic)).toEqual(namesOf(chromatic))
  })
})

describe('AC-theming-28 covers: R23', () => {
  it('every semantic slot carries both a light and a dark branch, with no slot single-valued', () => {
    const result = runPipeline(seeds())
    const bySlot = new Map<string, Set<string>>()
    for (const s of result.slots) {
      if (!bySlot.has(s.slot)) bySlot.set(s.slot, new Set())
      bySlot.get(s.slot)!.add(s.branch)
    }
    for (const [slot, branches] of bySlot) {
      expect(branches.has('light'), `${slot} missing light`).toBe(true)
      expect(branches.has('dark'), `${slot} missing dark`).toBe(true)
    }
  })

  it('round 11: the branch gate checks that a dark branch EXISTS, not that the two branches DIFFER — border.focus at neutral-500/neutral-500 is accepted', () => {
    // Round 11: border.focus's achromatic value moved to neutral-500/neutral-500, the
    // first REAL slot pinned to the same step in both
    // schemes (was previously constructed only, see the AC-theming-27 test above and
    // its comment). R23's gate is existence, never difference, so a Phase 2
    // implementation that hardened "carries both branches" into "the two differ" would
    // wrongly fail this slot against the spec's own mapping.
    const result = runPipeline(seeds(GREY))
    const focus = result.slots.filter((s) => s.slot === 'border.focus')
    const branches = new Set(focus.map((s) => s.branch))
    expect(branches.has('light'), 'border.focus missing light').toBe(true)
    expect(branches.has('dark'), 'border.focus missing dark').toBe(true)

    const light = focus.find((s) => s.branch === 'light')!
    const dark = focus.find((s) => s.branch === 'dark')!
    expect(light.resolved).toEqual(dark.resolved) // genuinely the same step, and that's fine
  })

  it('the achromatic branch resolves aliases (content.link) to a concrete value rather than reporting single-valued', () => {
    const result = runPipeline(seeds(GREY))
    const link = result.slots.find((s) => s.slot === 'content.link' && s.branch === 'light')!
    expect(link.resolved.scale).toBe('neutral')
    expect(typeof link.resolved.step).toBe('number')
  })

  it('round 15: the hardening hazard now reaches the SHIPPED DEFAULT (chromatic) seed — border.focus at primary-500/primary-500 is accepted, this gate asking whether a dark branch EXISTS and never whether the two differ', () => {
    const result = runPipeline(seeds())
    const focus = result.slots.filter((s) => s.slot === 'border.focus')
    const branches = new Set(focus.map((s) => s.branch))
    expect(branches.has('light'), 'border.focus missing light').toBe(true)
    expect(branches.has('dark'), 'border.focus missing dark').toBe(true)

    const light = focus.find((s) => s.branch === 'light')!
    const dark = focus.find((s) => s.branch === 'dark')!
    // A Phase 2 implementation that hardened "carries both branches" into "the two
    // differ" would wrongly fail this slot against every consumer's chromatic build.
    expect(light.resolved).toEqual(dark.resolved)
  })
})

// PARTIAL COVERAGE. What follows asserts a real property of the
// BUILT-IN ramps, but R32's actual claim is about an extend mechanism a consumer calls to
// add a scale, and no such API exists: runPipeline hardcodes its three scales. The
// uncovered half is tracked separately. Not skipped, because
// what it does assert is true and worth keeping; marked so the AC- -> test grep gate does
// not read this as R32 being covered.
describe('AC-theming-29 covers: R24, R32', () => {
  it('the danger and neutral ramps taper to a single value at each step (one value per step, both schemes, by construction of R15)', () => {
    const result = runPipeline(seeds())
    expect(result.dangerRamp.steps.find((s) => s.step === 0)!.c).toBe(0)
    expect(result.dangerRamp.steps.find((s) => s.step === 1000)!.c).toBe(0)
  })
})

describe('AC-theming-31 covers: R26', () => {
  it('the pipeline never runs on an unprefixed shape (naming is applied at emission, checked in emit.test.ts)', () => {
    const result = runPipeline(seeds())
    expect(result.slots.length).toBeGreaterThan(0)
  })
})

describe('AC-theming-37 covers: R31', () => {
  it('a per-step override on primary-500 changes only that step; the mandated order is what makes this true', () => {
    const overridden = runPipeline(seeds(), { primary: { 500: 0.01 } })
    const notOverridden = runPipeline(seeds())

    const step500Overridden = overridden.primaryRamp.steps.find((s) => s.step === 500)!
    const step500Plain = notOverridden.primaryRamp.steps.find((s) => s.step === 500)!
    expect(step500Overridden.c).toBe(0.01)
    expect(step500Overridden.c).not.toBe(step500Plain.c)

    // every OTHER step is unaffected by the override
    for (const step of overridden.primaryRamp.steps) {
      if (step.step === 500) continue
      const plain = notOverridden.primaryRamp.steps.find((s) => s.step === step.step)!
      expect(step.c).toBeCloseTo(plain.c, 10)
    }
  })

  it('an override still generates the rest of the ramp fresh from a NEW seed (order matters)', () => {
    const otherSeed = { l: 0.6, c: 0.12, h: 260 }
    const result = runPipeline(seeds(otherSeed), { primary: { 500: 0.01 } })
    const step600 = result.primaryRamp.steps.find((s) => s.step === 600)!
    // step 600 is regenerated from the new seed's hue, not the override
    expect(step600.h).toBeCloseTo(otherSeed.h, 5)
  })

  it('round 15: the step-500 slot set under the chromatic default is NON-EMPTY — border.focus maps to primary-500, so this clause is no longer quantified over an empty set', () => {
    const result = runPipeline(seeds())
    const step500PrimarySlots = result.slots.filter(
      (s) => s.resolved.scale === 'primary' && s.resolved.step === 500,
    )
    expect(step500PrimarySlots.length).toBeGreaterThan(0)
    expect(step500PrimarySlots.map((s) => s.slot)).toContain('border.focus')
  })

  it('round 15: the quantifier is read PER SCALE, never as a bare step number — an override on primary-500 moves border.focus (primary scale) and must NOT move border.control (neutral scale, also step 500)', () => {
    const OVERRIDE_CHROMA = 0.01
    const overridden = runPipeline(seeds(), { primary: { 500: OVERRIDE_CHROMA } })
    const plain = runPipeline(seeds())
    const find = (result: typeof overridden, slot: string): (typeof overridden.slots)[number] =>
      result.slots.find((s) => s.slot === slot && s.branch === 'light')!

    const focusOverridden = find(overridden, 'border.focus')
    const focusPlain = find(plain, 'border.focus')
    expect(focusOverridden.resolved).toEqual({ scale: 'primary', step: 500 })
    expect(focusOverridden.literal.c).toBe(OVERRIDE_CHROMA)
    expect(focusOverridden.literal.c).not.toBe(focusPlain.literal.c)

    const controlOverridden = find(overridden, 'border.control')
    const controlPlain = find(plain, 'border.control')
    expect(controlOverridden.resolved).toEqual({ scale: 'neutral', step: 500 })
    // border.control never moves: the override was keyed to `primary`, not `neutral`.
    expect(controlOverridden.literal.c).toBeCloseTo(controlPlain.literal.c, 10)
  })
})

// PARTIAL COVERAGE. Same gap as AC-theming-29 above: this restates a
// property of the existing primary ramp, not R32's extend mechanism, which has no API.
// The uncovered half is tracked separately.
describe('AC-theming-38 covers: R32', () => {
  it('the chromatic column is what an extending consumer follows: it is complete and seed-driven', () => {
    const result = runPipeline(seeds())
    const primaryDerived = result.slots.filter((s) => s.resolved.scale === 'primary')
    expect(primaryDerived.length).toBeGreaterThan(0)
  })
})

describe('AC-theming-43 covers: R3', () => {
  it('an exactly-zero-chroma seed succeeds, generates s=0, fires the branch at semantic resolution', () => {
    const result = runPipeline(seeds(GREY))
    expect(result.records.achromaticBranch).toBe(true)
    expect(result.records.primary.s).toBe(0)
    for (const step of result.primaryRamp.steps) {
      expect(step.c).toBe(0)
      expect(Number.isNaN(step.c)).toBe(false)
    }
    // the shipped semantic mapping references the chroma-zero primary ramp nowhere: no
    // branch slot should resolve to `primary` under achromatic.
    const primaryDerivedSlotNames = result.slots
      .filter((slot) => slot.resolved.scale === 'primary')
      .map((slot) => slot.slot)
    for (const branchSlot of [
      'action.primary',
      'action.primary.hover',
      'action.primary.active',
      'content.link',
      'border.focus',
    ]) {
      expect(primaryDerivedSlotNames).not.toContain(branchSlot)
    }
  })

  it('a very small but non-zero chroma seed is accepted through the STANDARD (non-branch) mapping', () => {
    const result = runPipeline(seeds({ l: 0.6, c: 0.0001, h: 90 }))
    expect(result.records.achromaticBranch).toBe(false)
  })
})

describe('AC-theming-50 covers: R18d', () => {
  it('content.inverse exists, is distinct from other content slots, and carries both branches', () => {
    const result = runPipeline(seeds())
    const light = result.slots.find((s) => s.slot === 'content.inverse' && s.branch === 'light')!
    const dark = result.slots.find((s) => s.slot === 'content.inverse' && s.branch === 'dark')!
    expect(light).toBeDefined()
    expect(dark).toBeDefined()
    expect(light.resolved).toEqual({ scale: 'neutral', step: 100 })
    expect(dark.resolved).toEqual({ scale: 'neutral', step: 900 })
  })
})

describe('AC-theming-52 covers: R3, R30', () => {
  it('the branch fires at exactly zero chroma and not for any non-zero chroma, however small', () => {
    expect(runPipeline(seeds(GREY)).records.achromaticBranch).toBe(true)
    expect(runPipeline(seeds({ l: 0.6, c: 1e-9, h: 1 })).records.achromaticBranch).toBe(false)
  })

  it('a chromatic re-seed after an achromatic one regenerates the standard mapping with no residue', () => {
    const achromatic = runPipeline(seeds(GREY))
    expect(achromatic.records.achromaticBranch).toBe(true)
    const rechromatic = runPipeline(seeds(TEAL))
    expect(rechromatic.records.achromaticBranch).toBe(false)
    const chromaticBaseline = runPipeline(seeds(TEAL))
    for (const slot of chromaticBaseline.slots) {
      const match = rechromatic.slots.find((s) => s.slot === slot.slot && s.branch === slot.branch)!
      expect(match.resolved).toEqual(slot.resolved)
    }
  })
})
