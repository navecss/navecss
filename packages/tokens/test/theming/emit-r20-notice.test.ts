import { describe, expect, it } from 'vitest'

// Imported for the structural placement assertion only — the independent transcription
// elsewhere in this file must not be collapsed onto this constant.
import { FEEDBACK_SHARED_IDENTITY_NOTICE } from '../../src/theming/copy-lint.ts'
import { emitCss } from '../../src/theming/emit.ts'
import { runPipeline } from '../../src/theming/pipeline.ts'

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }

function seeds(): { danger: typeof DANGER; declaredTintHue: number; primary: typeof TEAL } {
  return { primary: TEAL, danger: DANGER, declaredTintHue: 186.17 }
}

describe('AC-theming-22 covers: R20 obligation 1: the feedback shared-identity notice ships as an emitted comment', () => {
  it('the exact cleared notice text appears in the emitted CSS', () => {
    const emitted = emitCss(runPipeline(seeds()))
    // This literal is a DELIBERATE independent transcription of the accessibility
    // steward-cleared FEEDBACK_SHARED_IDENTITY_NOTICE, typed here by hand rather
    // than imported. Do not replace it with `import { FEEDBACK_SHARED_IDENTITY_NOTICE }` —
    // that would make this assertion compare the constant to itself, a content tautology
    // that deletes the only guard against an unreviewed reword: `assertNoticeIsEmitted`
    // and `emit.ts` both read the same binding, so a reworded constant passes them
    // together. A red here means the constant was reworded; the fix is to return the
    // reworded constant to that steward per its clearance condition 2 — never to update this
    // literal to match.
    expect(emitted.css).toContain(
      'warning, success and info, and their -foreground variants, resolve to one shared ' +
        'value here; only danger differs. Colour alone therefore cannot tell those three ' +
        'states apart, so wherever a feedback token carries meaning, give it a text label ' +
        'naming the state and a distinct icon or shape that differs per state.',
    )
  })

  it('the notice lands immediately above --nave-color-feedback-warning, as a complete CSS comment', () => {
    const emitted = emitCss(runPipeline(seeds()))
    const lines = emitted.css.split('\n')
    const warningIndex = lines.findIndex((line) => line.includes('--nave-color-feedback-warning:'))
    expect(warningIndex).toBeGreaterThan(0)
    expect(lines[warningIndex - 1]).toBe(
      `    /* Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */`,
    )
  })
})
