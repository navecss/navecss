/**
 * Review blue row 2: `assertNoticeIsEmitted`'s messages were absent
 * from `ACCESSIBILITY_GUARD_MESSAGE_PROBES`, and the reason SPLIT. Three were merely unadded.
 * The fourth is structurally excluded — it interpolates `findConformanceFraming`'s own reason,
 * which always quotes the forbidden phrase, so probing it reports an R36 violation against the
 * guard that just did its job. Anyone closing this residual gap by sweeping in every reachable
 * message gets a red run and reads it as a defect in shipped copy.
 *
 * These tests hold both halves of that split in place: the three are probed and armed, and the
 * fourth's exemption is re-measured rather than trusted.
 */
import { describe, expect, it } from 'vitest'

import { findConformanceFraming } from '../../src/theming/copy-lint.ts'
import { TINT_SEED_COMMENT_STEM } from '../../src/theming/emit.ts'
import {
  ACCESSIBILITY_GUARD_MESSAGE_PROBES,
  STRUCTURALLY_UNPROBEABLE_GUARD_MESSAGES,
} from '../../src/theming/guard-message-probes.ts'

/**
 * Each new probe paired with the opening words of the DISTINCT refusal it must reach. Pinning
 * the opening words is what stops all three fixtures collapsing onto one branch: the
 * absent-notice refusal fires first inside `assertNoticeIsEmitted`, so a multi-line or
 * wrapped-comment fixture that failed to set its own branch up would still throw, still be
 * clean, and still look like a working probe.
 */
const NOTICE_PROBES: readonly { label: string; opening: string }[] = [
  {
    label: "the emitted-notice guard's absent-notice refusal",
    opening: 'Retheming notice violation: the notice is not present, verbatim',
  },
  {
    label: "the emitted-notice guard's multi-line-notice refusal",
    opening: 'Retheming notice violation: the notice text spans more than one line',
  },
  {
    label: "the emitted-notice guard's not-a-self-contained-comment refusal",
    // Widened through the disjunct the accessibility steward's
    // clearance added ("or sits inside a comment opened on an earlier line") — a bare
    // `the`→`a` article fix here would turn this anchor green while pinning nothing about
    // that clause, since the old anchor stopped at the comma right before it.
    opening:
      'Retheming notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line',
  },
]

describe('AC-theming-42 covers: R36 — assertNoticeIsEmitted in the probe registry', () => {
  it.each(NOTICE_PROBES)(
    'registers $label, and its fixture reaches that exact branch',
    ({ label, opening }) => {
      const probe = ACCESSIBILITY_GUARD_MESSAGE_PROBES.find((p) => p.label === label)
      expect(probe, `${label} is not in ACCESSIBILITY_GUARD_MESSAGE_PROBES`).toBeDefined()
      // capture() throws rather than returning if the fixture stops reproducing its failing
      // direction, so reaching the assertion at all is already half the check.
      expect(probe?.capture()).toContain(opening)
    },
  )

  it.each(NOTICE_PROBES)('$label carries no conformance framing of its own', ({ label }) => {
    const probe = ACCESSIBILITY_GUARD_MESSAGE_PROBES.find((p) => p.label === label)
    expect(findConformanceFraming(probe?.capture() ?? '')).toBeUndefined()
  })
})

describe('AC-theming-42 covers: R36 — the structural exclusion is measured, not asserted', () => {
  it('the composed-comment-line refusal is the only recorded exclusion', () => {
    expect(STRUCTURALLY_UNPROBEABLE_GUARD_MESSAGES.map((m) => m.label)).toEqual([
      "the emitted-notice guard's composed-comment-line refusal",
    ])
  })

  it.each(STRUCTURALLY_UNPROBEABLE_GUARD_MESSAGES)(
    '$label still trips the lint it quotes, so the exemption is still earned',
    (excluded) => {
      // The whole exemption rests on this: the message quotes the phrase it refused, so
      // findConformanceFraming reads that quote back and reports a violation. If this ever
      // returns undefined the message has stopped quoting, the exclusion has stopped being
      // structural, and the entry belongs in ACCESSIBILITY_GUARD_MESSAGE_PROBES instead.
      expect(findConformanceFraming(excluded.capture())).toBeDefined()
    },
  )

  it('no recorded exclusion is also registered as a probe (one list or the other, never both)', () => {
    const probed = new Set(ACCESSIBILITY_GUARD_MESSAGE_PROBES.map((p) => p.label))
    for (const excluded of STRUCTURALLY_UNPROBEABLE_GUARD_MESSAGES) {
      expect(probed.has(excluded.label)).toBe(false)
    }
  })

  it("the carve-out entry's composed comment line pins the exact substring TINT_SEED_COMMENT_STEM.slice(3) produces, not merely something that trips the lint", () => {
    // A prior quality review (round 1 §8): TINT_SEED_COMMENT_STEM.slice(3) was an untested magic
    // number. Changing the stem's shape at its own definition (e.g. losing one character of its
    // opening delimiter) silently corrupts this composed substring, and the two tests above stay
    // green regardless, because findConformanceFraming only needs to find "meets" somewhere on the
    // composed line — it does not care whether the rest of the line is well-formed. Pinned here as
    // a hardcoded literal, independent of the entry's own capture(), so a stem-shape change is
    // caught by THIS assertion rather than only by out-of-diff tests that retype the stem for an
    // unrelated reason.
    expect(TINT_SEED_COMMENT_STEM.slice(3)).toBe('Tint seed: ')
  })
})
