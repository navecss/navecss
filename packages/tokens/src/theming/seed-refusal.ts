/**
 * R21, R22: the shared refusal shape for seed-string ingest. `seed-ingest.ts` (top-level
 * dispatch) and the two `seed-form-parsers*.ts` modules (the seven accepted forms' own
 * parsers) all throw through this one error class, so there is exactly one place the four classes' required
 * content (R21) and per-class wording rules (R22) are enforced, never one voice per call site.
 */

export type SeedRefusalAct = 'channel-value' | 'form-acceptance'

export type SeedRefusalClass =
  'context-dependent-form' | 'named-colour' | 'non-opaque-alpha' | 'unrecognised-form'

const ACCEPTED_FORM_POINTER =
  'Accepted seed forms: hex (3, 4, 6 or 8 digit), rgb(), hsl(), oklch(), lab(), lch(), color() (srgb, display-p3).'

const NON_OPAQUE_ALPHA_FIX =
  "write the seed's alpha channel as fully opaque: drop the alpha channel entirely, or set it to 1 / 100% / an opaque hex pair (f / ff)."
export const CONTEXT_DEPENDENT_FIX =
  'replace this seed with a literal colour value the build can resolve on its own, with no reference to a custom property, the current colour, or another declaration.'
export const NAMED_COLOUR_FIX =
  'write the seed in one of the accepted forms below, never a CSS named colour.'
const UNRECOGNISED_FORM_FIX = 'write the seed in one of the accepted forms below.'
const CHANNEL_VALUE_FIX =
  'write every channel of this seed as a literal number or percentage, with no missing channel.'
const UNSUPPORTED_COLOUR_SPACE_FIX =
  'write the colour in the `srgb` or `display-p3` colour space of `color()`, or in another accepted form below.'

/**
 * R21's one error shape for all four refusal classes. `message` composes the class-specific
 * `detail`, the input verbatim (R21a), which act refused it (R21b, also carried structurally
 * in `act`), the fix as an act on the consumer's own file (R21c), and the accepted-form
 * pointer (R21d) — every refusal carries all four, never a subset.
 */
export class SeedIngestRefusal extends Error {
  readonly act: SeedRefusalAct
  readonly input: string
  readonly refusalClass: SeedRefusalClass

  constructor(params: {
    act: SeedRefusalAct
    detail: string
    fix: string
    input: string
    refusalClass: SeedRefusalClass
  }) {
    const actPhrase = params.act === 'channel-value' ? 'channel value' : 'form acceptance'
    super(
      `${params.detail} Input as given: \`${params.input}\`. Refused at: ${actPhrase}. Fix: ${params.fix} ${ACCEPTED_FORM_POINTER}`,
    )
    this.name = 'SeedIngestRefusal'
    this.act = params.act
    this.input = params.input
    this.refusalClass = params.refusalClass
  }
}

const ALPHA_EPSILON = 1e-6

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

const roundTo = (n: number, d: number): number => {
  const f = 10 ** d
  return Math.round(n * f) / f
}

/**
 * An empty or whitespace-only input is a member of R21's fourth class
 * (nothing typed is not an accepted seed form either), but the generic `` `${input}` is not
 * an accepted seed form`` sentence composes to two empty backtick pairs for it and never says
 * the seed was blank — a stranger cannot tell whether their value was empty, whitespace, or
 * whether the message itself is broken. Named separately so the sentence stays true of this
 * member specifically, without adding a fifth refusal class (R21's own four are unchanged).
 */
function unrecognisedFormDetail(input: string): string {
  if (input === '') return 'The seed is empty: nothing was written where a seed is required.'
  if (input.trim() === '') {
    return 'The seed is whitespace only: nothing but spaces or blank characters was written where a seed is required.'
  }
  return `\`${input}\` is not an accepted seed form.`
}

/**
R21's fourth class: a form-shaped or bare input not on R5's accepted list at all.
 */
export function unrecognisedForm(input: string): SeedIngestRefusal {
  return new SeedIngestRefusal({
    act: 'form-acceptance',
    detail: unrecognisedFormDetail(input),
    fix: UNRECOGNISED_FORM_FIX,
    input,
    refusalClass: 'unrecognised-form',
  })
}

/**
 * R21's fourth class reached by the CHANNEL-VALUE act: the form is on R5's accepted list and
 * the values inside it could not be read. Kept distinct from `unrecognisedForm` because
 * refusing `rgb(1 2)` at `form-acceptance` states something false about `rgb()`.
 */
export function badChannelValue(input: string, form: string, detail: string): SeedIngestRefusal {
  return new SeedIngestRefusal({
    act: 'channel-value',
    detail: `\`${form}\` is an accepted seed form, but ${detail}`,
    fix: CHANNEL_VALUE_FIX,
    input,
    refusalClass: 'unrecognised-form',
  })
}

/**
 * R21's fourth class reached by the CHANNEL-VALUE act, for `color()` specifically: the form is
 * on R5's accepted list, and the colour space named inside it is not one this build converts.
 * `srgb` and `display-p3` are the two the criterion names; every other predefined space
 * (`rec2020`, `a98-rgb`, `prophoto-rgb`, `srgb-linear`, `xyz` and its variants) is refused here
 * BY NAME rather than misread as one of the two, and never as an unrecognised FORM, which would
 * state something false about `color()`.
 *
 * This is now a THIRD call site (with `badChannelValue`) sharing the tracked
 * `refusalClass: 'unrecognised-form'` mislabel for a channel-value refusal; the discriminant
 * fix rides on remaining follow-up work (R21, flagged in a round-3 quality-review note),
 * not reopened here.
 */
export function unsupportedColourSpace(input: string, space: string): SeedIngestRefusal {
  return new SeedIngestRefusal({
    act: 'channel-value',
    detail: `\`color()\` is an accepted seed form, but its colour space \`${space}\` is not one this build converts; only \`srgb\` and \`display-p3\` are.`,
    fix: UNSUPPORTED_COLOUR_SPACE_FIX,
    input,
    refusalClass: 'unrecognised-form',
  })
}

/**
 * R21/R22's non-opaque-alpha class: the CHANNEL'S value is refused, never the form. Names the
 * resolved numeric alpha (R22), never the hex width, and never offers compositing as a fix.
 */
export function checkOpaqueAlpha(input: string, alpha: number | undefined, form: string): void {
  if (alpha === undefined) return
  if (!Number.isFinite(alpha)) {
    throw badChannelValue(input, form, 'its alpha channel could not be read as a number.')
  }
  if (Math.abs(alpha - 1) > ALPHA_EPSILON) {
    throw new SeedIngestRefusal({
      act: 'channel-value',
      detail: `the alpha channel resolves to ${roundTo(alpha, 4)}, which is not fully opaque.`,
      fix: NON_OPAQUE_ALPHA_FIX,
      input,
      refusalClass: 'non-opaque-alpha',
    })
  }
}
