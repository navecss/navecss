/**
 * R15-R25, R31 "resolve semantics" phase (the last pipeline stage): the semantic colour
 * slot -> step mapping (R23's worked mapping, both value columns), the accent coupling
 * (R16/R17), the R18a-d taxonomy additions, and R19's danger/feedback aliasing.
 *
 * A `StepRef` names a scale and a step (`{ scale: 'primary', step: 600 }`) or aliases
 * another slot outright (`{ alias: 'content.primary' }`, R18d/R19's alias precedent).
 *
 * R18e's `on-*` anchor derivation and its shape guard live in `./on-star.ts`, split out on
 * file-budget grounds along the boundary this doc already draws: this module is the VALUE
 * layer, that one is the anchor/shape layer over it. The dependency runs one way (that
 * module imports this one), so nothing here reaches back into it.
 */

type Scale = 'neutral' | 'primary' | 'danger'

export type StepRef = { scale: Scale; step: number } | { alias: string }

export interface SlotMapping {
  light: StepRef
  dark: StepRef
}

/**
 * R3(a)'s achromatic branch re-points exactly these six slots at `neutral` (write-back 6).
 * Every other slot is the same in both columns.
 */
export const ACHROMATIC_BRANCH_SLOTS = [
  'action.primary',
  'action.primary.hover',
  'action.primary.active',
  'on-action.primary',
  'content.link',
  'border.focus',
] as const

const ref = (scale: Scale, step: number): StepRef => ({ scale, step })
const aliasRef = (slot: string): StepRef => ({ alias: slot })

/**
 * R23's worked mapping, the CHROMATIC column: what ships for every seed with chroma
 * (the shipped default among them). Values transcribed verbatim from the accepted
 * theming specification, R23 (write-backs 1-5); floors and margins are the project's
 * accessibility and licensing reviewer's and are not restated here
 * (one canonical home per fact) — this module carries only the step assignments.
 */
export const CHROMATIC_MAPPING: Record<string, SlotMapping> = {
  'surface.base': { light: ref('neutral', 0), dark: ref('neutral', 900) },
  'surface.raised': { light: ref('neutral', 0), dark: ref('neutral', 850) },
  'surface.overlay': { light: ref('neutral', 0), dark: ref('neutral', 800) },
  'surface.sunken': { light: ref('neutral', 50), dark: ref('neutral', 950) },
  'surface.inverse': { light: ref('neutral', 900), dark: ref('neutral', 100) },

  'content.primary': { light: ref('neutral', 900), dark: ref('neutral', 100) },
  'content.secondary': { light: ref('neutral', 700), dark: ref('neutral', 300) },
  'content.tertiary': { light: ref('neutral', 600), dark: ref('neutral', 400) },
  'content.disabled': { light: ref('neutral', 300), dark: ref('neutral', 700) },
  // R18d
  'content.inverse': { light: ref('neutral', 100), dark: ref('neutral', 900) },
  'content.link': { light: ref('primary', 600), dark: ref('primary', 300) },

  // R18a
  'border.default': { light: ref('neutral', 200), dark: ref('neutral', 700) },
  'border.strong': { light: ref('neutral', 400), dark: ref('neutral', 600) },
  // Round 19 (write-back 8): dark moves 400 -> 500 and the slot becomes
  // scheme-invariant. Row 8's quantifier ("every surface.* a control sits on") reaches
  // surface.inverse, which sits inside the OTHER scheme's lightness cluster, so the slot's
  // scope crosses schemes and its value does too; the project's accessibility and licensing
  // reviewer's window has exactly one member per scheme and light already sat on it. No contrast
  // conclusion is drawn here (one canonical home per fact); this module transcribes the settled value.
  'border.control': { light: ref('neutral', 500), dark: ref('neutral', 500) },
  'border.disabled': { light: ref('neutral', 150), dark: ref('neutral', 800) },
  // Round 15 (write-back 7): border.focus diverges from R16's coupled step
  // to a scheme-invariant primary-500 — the project's accessibility and licensing reviewer's
  // window, and the design lead's pick. The prior value, primary-600/primary-300,
  // failed row 9 against surface.inverse in both schemes; primary-500 is the unique
  // step clearing all five shipped surfaces in both schemes. No contrast conclusion is
  // drawn here (one canonical home per fact); this module transcribes the settled value.
  'border.focus': { light: ref('primary', 500), dark: ref('primary', 500) },

  'action.primary': { light: ref('primary', 600), dark: ref('primary', 300) },
  'action.primary.hover': { light: ref('primary', 700), dark: ref('primary', 200) },
  'action.primary.active': { light: ref('primary', 800), dark: ref('primary', 150) },
  'on-action.primary': { light: ref('neutral', 0), dark: ref('neutral', 900) },

  // action.secondary: fill only; its declared foreground and companion border are
  // recorded separately (ACTION_SECONDARY_FOREGROUND / ACTION_SECONDARY_BORDER below),
  // per R23/R18a round 9, a settled ruling's write-back.
  'action.secondary': { light: ref('neutral', 100), dark: ref('neutral', 800) },

  // R18c: split foreground/solid-background roles, danger family (seed-derived).
  'feedback.danger': { light: ref('danger', 600), dark: ref('danger', 300) },
  'feedback.danger.foreground': { light: ref('danger', 600), dark: ref('danger', 300) },
  'on-feedback.danger': { light: ref('neutral', 0), dark: ref('neutral', 900) },

  // R18c generalised (round 6), R19: warning/success/info ship as DTCG ALIASES of one
  // shared tinted-neutral token family — `feedback.warning` is the canonical definition,
  // `success`/`info` alias it (both roles), so "these are literally the same colour" is
  // visible in the source rather than a coincidence a consumer has to measure.
  'feedback.warning': { light: ref('neutral', 600), dark: ref('neutral', 300) },
  'feedback.warning.foreground': { light: ref('neutral', 600), dark: ref('neutral', 300) },
  'on-feedback.warning': { light: ref('neutral', 0), dark: ref('neutral', 900) },
  'feedback.success': { light: aliasRef('feedback.warning'), dark: aliasRef('feedback.warning') },
  'feedback.success.foreground': {
    light: aliasRef('feedback.warning.foreground'),
    dark: aliasRef('feedback.warning.foreground'),
  },
  'on-feedback.success': { light: ref('neutral', 0), dark: ref('neutral', 900) },
  'feedback.info': { light: aliasRef('feedback.warning'), dark: aliasRef('feedback.warning') },
  'feedback.info.foreground': {
    light: aliasRef('feedback.warning.foreground'),
    dark: aliasRef('feedback.warning.foreground'),
  },
  'on-feedback.info': { light: ref('neutral', 0), dark: ref('neutral', 900) },
}

/**
 * R23 write-back 6, the ACHROMATIC column: what R3(a)'s branch selects for the six slots
 * it re-points. Every slot not listed here is identical to the chromatic column.
 */
export const ACHROMATIC_MAPPING: Record<string, SlotMapping> = {
  'action.primary': { light: ref('neutral', 800), dark: ref('neutral', 200) },
  'action.primary.hover': { light: ref('neutral', 900), dark: ref('neutral', 150) },
  'action.primary.active': { light: ref('neutral', 950), dark: ref('neutral', 50) },
  // UNCHANGED from the chromatic column, restated here so the branch mapping is self-contained.
  'on-action.primary': { light: ref('neutral', 0), dark: ref('neutral', 900) },
  // Aliased, not stepped: using the token becomes identical to not using it (R19's precedent).
  'content.link': { light: aliasRef('content.primary'), dark: aliasRef('content.primary') },
  // Round 11 (ruled option A): pinned at the same step in both schemes — the one branch slot
  // AC-theming-49's text-pairs-only case now covers for real.
  'border.focus': { light: ref('neutral', 500), dark: ref('neutral', 500) },
}

/**
 * `action.secondary`'s declared foreground: `content.primary` in both schemes, no new slot
 * (write-back 5).
 */
export const ACTION_SECONDARY_FOREGROUND = 'content.primary'

/**
 * `action.secondary`'s companion identifying border under Cédric's ruling (round 9):
 * `border.control` (500/500 both schemes as of round 19), never a surface
 * differential (T3).
 */
export const ACTION_SECONDARY_BORDER = 'border.control'

/**
 * Resolves a slot's mapping for a given seed class: the achromatic branch overrides
 * exactly `ACHROMATIC_BRANCH_SLOTS`; every other slot resolves through the chromatic
 * column regardless of branch (R23's bounding constraint: the slot SET is seed-invariant,
 * only six VALUES branch).
 */
export function resolveSlotMapping(slot: string, isAchromaticBranch: boolean): SlotMapping {
  const achromaticOverride = isAchromaticBranch ? ACHROMATIC_MAPPING[slot] : undefined
  if (achromaticOverride) return achromaticOverride
  const mapping = CHROMATIC_MAPPING[slot]
  if (!mapping) throw new Error(`Unknown semantic slot: ${slot}`)
  return mapping
}

/**
 * Every semantic colour slot name this spec pins (R23's worked mapping), the emitted
 * `--nave-color-*` surface. Seed-invariant (R23's bounding constraint on write-back 6).
 */
export const SEMANTIC_SLOTS: readonly string[] = Object.keys(CHROMATIC_MAPPING)
