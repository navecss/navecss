import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { collectDescriptions } from '../../src/dtcg-descriptions.ts'
import { assertNoOrphanedSemanticSlot } from '../../src/theming/adjacency.ts'
import {
  assertContrastFloors,
  assertFloorProvenance,
  checkSameStepLint,
  runContrastHarness,
} from '../../src/theming/contrast.ts'
import {
  assertDescriptionsAreClean,
  assertHarnessFramingIsClean,
  assertNoticeIsClean,
  assertNoticeIsEmitted,
  FEEDBACK_SHARED_IDENTITY_NOTICE,
  findConformanceFraming,
  lintDescriptions,
  RETHEMING_NOTICE,
} from '../../src/theming/copy-lint.ts'
import { SLOT_DESCRIPTIONS } from '../../src/theming/descriptions.ts'
import { FEEDBACK_TOKENS_COMMENT_STEM, TINT_SEED_COMMENT_STEM } from '../../src/theming/emit.ts'
import { assertNeutralChromaCeilingWithinMargin } from '../../src/theming/neutral.ts'
import { TRANSCRIPTION_VARIANT } from './cleared-copy.ts'

/**
 * Runs `assertNoticeIsEmitted` over `css` for the
 * given `notice`/`noticeLabel` pair and returns the thrown message, failing loudly if the
 * fixture stops reproducing its own failing direction rather than silently reporting an empty
 * comparison.
 *
 * Parameterized over `notice`/`noticeLabel` (the quality reviewer, round 3 terminal read,
 * finding 3): the original bound this to `RETHEMING_NOTICE`/`'Retheming notice'` while
 * living at module scope, which reads as reusable but silently checks any `css` it is given
 * against the Retheming notice regardless — a future Feedback-notice caller reaching for it the
 * way its name and position invite would get the wrong thrown message
 * ("the notice is not present, verbatim") rather than the intended violation. The Feedback
 * analogue of Row 3 below is the row that pinned that failure red before this parameterization.
 */
function captureNoticeViolation(css: string, notice: string, noticeLabel: string): string {
  try {
    assertNoticeIsEmitted(css, notice, noticeLabel)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('fixture did not throw — test setup is broken, not the guard')
}

/**
 * The `${rest}` clause is the only place two `notSelfContainedMessage` renderings are ALLOWED
 * to differ: strips the quoted content between "that line reads " and ", and it is built"
 * from `message`, so a comparison built on top of this is blind to the one clause that is
 * supposed to vary between two carrying lines.
 */
function sanitizeRestClause(message: string): string {
  return message.replace(
    /that line reads ".*?", and it is built/,
    'that line reads "<REST>", and it is built',
  )
}

describe('AC-theming-40 covers: R34', () => {
  it('the shipped notice text carries no ratio, no WCAG/SC identifier, and none of the forbidden words', () => {
    expect(() => assertNoticeIsClean()).not.toThrow()
    expect(findConformanceFraming(RETHEMING_NOTICE)).toBeUndefined()
  })

  it('a candidate wording that characterises the defaults fails the lint, naming the offending phrase', () => {
    const badCandidate = 'Our defaults meet WCAG AA contrast at 4.5:1.'
    expect(() => assertNoticeIsClean(badCandidate)).toThrow(/^Re-theming notice:/)
  })

  it('rejects a warranty-disclaimer phrasing even if otherwise clean', () => {
    expect(() => assertNoticeIsClean('This palette carries no warranty of any kind.')).toThrow(
      /warranty/,
    )
  })

  it('assertNoticeIsEmitted passes when the notice is present verbatim in the CSS', () => {
    const css = `:root {\n  /* Retheming notice: ${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).not.toThrow()
  })

  it('assertNoticeIsEmitted throws when the notice is entirely absent (a build that forgot to emit it)', () => {
    const css = ':root {\n  --nave-color-tint: oklch(0.7859 0.1316 186.17);\n}'
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /Retheming notice violation.*not present, verbatim/,
    )
  })

  it('assertNoticeIsEmitted throws on a truncated copy, not only a total absence', () => {
    const truncated = RETHEMING_NOTICE.slice(0, -20)
    const css = `:root {\n  /* Retheming notice: ${truncated} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /Retheming notice violation/,
    )
  })

  it('assertNoticeIsEmitted also lints the COMPOSED line, so a STEM carrying conformance framing is caught even though the notice constant itself is untouched and clean', () => {
    // The notice text passed here is RETHEMING_NOTICE itself, byte-identical and clean —
    // only the STEM prefixing it in the composed CSS carries the violation. Before this fix
    // landed, this passed (assertNoticeIsClean only ever reads the notice constant, never the
    // emitted line), which is exactly the gap the accessibility steward named: "the
    // prefix is an unlinted byte adjacent to a linted constant... my clearance is currently
    // the whole fence."
    const css = `:root {\n  /* WCAG AA Tint seed: ${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /Retheming notice violation.*a comment line carrying the notice.*contains the word "WCAG"/,
    )
  })

  it('the REAL shipped stem, read from emit.ts rather than retyped, does not trip the composed-line check', () => {
    // The stem is imported, never retyped (blue row 1): this test
    // and its Feedback sibling below used to inline `/* Tint seed: ` as a test-local literal
    // while their names claimed to be checking the shipped one, so dirtying the stem in
    // emit.ts left both green. Composing from the export makes the negative control assert
    // about the bytes that ship.
    const css = `:root {\n  ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).not.toThrow()
  })

  it('round 12: the lint runs over BOTH cleared notice texts wherever either appears, not the canonical one alone', () => {
    // R34's input set doubled in round 12 (applied path): the
    // separately-cleared transcription variant (README rung 2's "Neutral actions" worked
    // example) is a second wherever-it-appears instance this lint constrains exactly as it
    // constrains the canonical text. This package carries no constant for that text (it
    // lives in the internal companion repository's docs, never here — see copy-lint.ts's
    // RETHEMING_NOTICE comment), so it is inlined here purely to prove the SHARED, generic lint
    // function accepts it clean; this scenario asserts no ratio, verdict or conformance claim about
    // either text.
    expect(() => assertNoticeIsClean(TRANSCRIPTION_VARIANT)).not.toThrow()
    expect(findConformanceFraming(TRANSCRIPTION_VARIANT)).toBeUndefined()
  })

  it('round 2 (accessibility-steward ask 1): a notice containing a newline refuses loudly — no single emitted line carries it whole, so this passed silently before the refusal existed', () => {
    const brokenNotice = `${RETHEMING_NOTICE.slice(0, 10)}\n${RETHEMING_NOTICE.slice(10)}`
    const css = `:root {\n  /* Tint seed: ${brokenNotice} */\n}`
    expect(() => assertNoticeIsEmitted(css, brokenNotice, 'Retheming notice')).toThrow(
      /^Retheming notice violation: the notice text spans more than one line, so no single line of the emitted CSS carries it whole\./,
    )
  })

  it('round 2 (accessibility-steward ask 2): every carrying line is linted, not only the first — emitted twice, first clean, second dirty, still throws (the earlier `.find()`-based check passed this silently)', () => {
    const css = `:root {\n  /* Tint seed: ${RETHEMING_NOTICE} */\n  /* WCAG AA Tint seed: ${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /^Retheming notice violation: a comment line carrying the notice contains the word "WCAG"\. The notice text itself is present byte for byte/,
    )
  })

  it('round 2 (accessibility-steward ask 3, disposition b): a wrapped comment with the framing word on line 1 and the notice on line 2 refuses — the carrying line alone reads clean but is not a self-contained comment', () => {
    const css = `:root {\n  /* WCAG AA, so\n   * Tint seed: ${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /^Retheming notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )
  })

  it('a comment that OPENS on the carrying line but does not close on it (the `*/` lands on a following line) refuses — isolates the endsWith half of the self-contained-comment check from the startsWith half', () => {
    const css = `:root {\n  /* Tint seed: ${RETHEMING_NOTICE}\n  */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /^Retheming notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )
  })

  it('a comment that CLOSES on the carrying line but does not open on it (the `/*` is on a preceding line, with no framing word anywhere) refuses — isolates the startsWith half cleanly, with no composed-line-lint side effect', () => {
    const css = `:root {\n  /*\n   Tint seed: ${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /^Retheming notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )
  })

  it("a carrying line holding a SECOND, self-contained comment beside the notice's own is ACCEPTED, and the composed-line lint reads that sibling comment too", () => {
    // The accessibility steward's applied-path requirement: "the text this check lints must never
    // be a SUBSET of what a reader sees around the notice, and where it cannot be equal it
    // must refuse" — a superset is acceptable, because it can only raise a false alarm a
    // human resolves. This line is that superset: the predicate accepts it AND
    // findConformanceFraming reads the whole trimmed line, so the sibling comment is linted.
    // The second assertion is the load-bearing one — without it this test would document the
    // accepted case while proving nothing about the read that makes accepting it safe.
    const clean = `:root {\n  /* unrelated preamble */ ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(clean, RETHEMING_NOTICE, 'Retheming notice')).not.toThrow()

    const dirtySibling = `:root {\n  /* WCAG AA preamble */ ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(dirtySibling, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /^Retheming notice violation: a comment line carrying the notice contains the word "WCAG"\./,
    )
  })

  it('a carrying line that BEGINS inside a comment opened further up refuses, even though it opens and closes a comment of its own — the subset case, and the live route to it is a dropped delimiter in emit.ts', () => {
    // The shape the accessibility steward's requirement forbids outright: CSS comments do not nest,
    // so a reader reaching this line is inside the comment that opened above it, while the check
    // reads the carrying line alone. Before the comment-state scan this passed silently. The live
    // route is not hypothetical: emit.ts builds a two-line color-scheme note three lines above the
    // notice, and dropping its closing delimiter shipped that note and the notice to
    // dist/tokens.css as ONE comment with the build still at exit 0.
    //
    // The two fixtures differ by the closing delimiter AND by the conformance claim, on
    // purpose: no test in this file asserts that a document carrying a conformance claim is
    // ACCEPTED, whatever this guard's frame. The confound is removed by asserting WHICH
    // refusal fires — the composed-line lint never reads the preamble line, so a refusal
    // triggered by the words rather than by the delimiter would carry the other message and
    // redden this assertion.
    const openedAbove = `:root {\n  /* color-scheme lives here, so\n   * light-dark() resolves. This palette meets WCAG AA.\n  color-scheme: light dark;\n  ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() => assertNoticeIsEmitted(openedAbove, RETHEMING_NOTICE, 'Retheming notice')).toThrow(
      /^Retheming notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )

    // Closed above, so the reader is not inside it: the real shipped shape, and the second
    // load-bearing assertion. A scan that never clears its state, or one that refuses on any
    // opening delimiter anywhere above the notice, passes the first assertion and fails here.
    const closedAbove = `:root {\n  /* color-scheme lives here, so\n   * light-dark() resolves. */\n  color-scheme: light dark;\n  ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(closedAbove, RETHEMING_NOTICE, 'Retheming notice'),
    ).not.toThrow()
  })

  it("the not-self-contained-comment refusal (site 1) and the begins-inside-an-earlier-comment refusal (site 2) throw the SAME shared string, once each one's own `${rest}` clause is sanitized out", () => {
    // Row 1/Row 2 above widen each anchor through the accessibility steward's new disjunct, but a
    // widened anchor alone tolerates two separately-worded consts that happen to share that clause
    // — it says nothing about whether site 1 and site 2 throw the SAME string. The accessibility
    // steward ruled they must ("one shared const stands"). `${rest}` is the one clause the two
    // sites are SUPPOSED to differ on (it names the offending line's own content, which differs by
    // fixture); sanitizing it out and comparing what remains is what actually pins "one shared
    // const" rather than "two consts worded alike".
    const site1Css = `:root {\n  /* Tint seed: ${RETHEMING_NOTICE}\n  */\n}` // not self-contained
    const site2Css = `:root {\n  /* color-scheme lives here, so\n   * light-dark() resolves. This palette meets WCAG AA.\n  color-scheme: light dark;\n  ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}` // begins inside an earlier, still-unclosed comment

    const site1Message = sanitizeRestClause(
      captureNoticeViolation(site1Css, RETHEMING_NOTICE, 'Retheming notice'),
    )
    const site2Message = sanitizeRestClause(
      captureNoticeViolation(site2Css, RETHEMING_NOTICE, 'Retheming notice'),
    )
    expect(site1Message).toContain('<REST>')
    expect(site2Message).toContain('<REST>')
    expect(site1Message).toBe(site2Message)
  })

  it('round with the accessibility steward, item S12: the comment-state scan is now quote-aware, so a declaration VALUE carrying an opening comment delimiter inside a string no longer over-refuses — closing the one false alarm the accessibility steward recorded and left open', () => {
    // The accessibility steward (round 3, item S12): the over-refusal was the safe side of
    // the requirement and was explicitly left open as "a legitimate later improvement, not a
    // defect being deferred" — on the condition that fixing it cannot touch the subset case
    // this guard exists to catch (the test above) or refuse less than S1-S11 require. The
    // scan now tracks whether it is inside a quoted string while outside a comment and skips
    // quoted content entirely: a `/*` or `*/` inside a string is ordinary text there, matching
    // real CSS tokenization (a string is consumed as one token before the tokenizer ever looks
    // for a comment start again).
    //
    // If you touch the scan again and this first assertion starts throwing, you have
    // reintroduced the false alarm rather than fixed something: keep this assertion AND the
    // second one below AND the subset case in the test above, all three, together.
    const openerInAValue = `:root {\n  content: "/*";\n  ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(openerInAValue, RETHEMING_NOTICE, 'Retheming notice'),
    ).not.toThrow()

    const closerInAValue = `:root {\n  content: "*/";\n  ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(closerInAValue, RETHEMING_NOTICE, 'Retheming notice'),
    ).not.toThrow()
  })
})

describe('the two comment stems are cleared bytes with no anchor of their own', () => {
  it('TINT_SEED_COMMENT_STEM and FEEDBACK_TOKENS_COMMENT_STEM match their cleared, hardcoded literals exactly', () => {
    // The accessibility steward's applied-path ruling: both stems are cleared as EXACT
    // bytes. "Changing either stem is a change to cleared text and returns here." The quality
    // reviewer measured (round 1 §1/§2) that neither constant had a byte anchor anywhere in this
    // diff: mutating either one's VALUE at its definition left every test THIS package's own
    // theming suite runs green, caught only by test/theming/remaining-ac.test.ts (AC-theming-39)
    // and test/theming/emit-r20-notice.test.ts, both out of this diff's own footprint and both
    // anchored on their own deliberately RETYPED literal rather than on this export.
    //
    // Deliberately hardcoded rather than composed from any constant — a comparison built from
    // the same export on both sides is the tautology this test exists to close. Do NOT
    // refactor remaining-ac.test.ts or emit-r20-notice.test.ts to import
    // TINT_SEED_COMMENT_STEM/FEEDBACK_TOKENS_COMMENT_STEM in place of their retyped literals:
    // doing so would make both sides of their comparison move together and silently retire
    // the only call-site coverage either stem has.
    expect(TINT_SEED_COMMENT_STEM).toBe('/* Tint seed: ')
    expect(FEEDBACK_TOKENS_COMMENT_STEM).toBe('/* Feedback tokens: ')
  })
})

describe('AC-theming-22 covers: R20 obligation 1: the feedback shared-identity notice', () => {
  it('the cleared text carries no ratio, no WCAG/SC identifier, and none of the forbidden words', () => {
    expect(() => assertNoticeIsClean(FEEDBACK_SHARED_IDENTITY_NOTICE)).not.toThrow()
    expect(findConformanceFraming(FEEDBACK_SHARED_IDENTITY_NOTICE)).toBeUndefined()
  })

  it('a conformance-framing feedback-notice candidate is labelled "Feedback notice", not the re-theming default', () => {
    const badCandidate = 'Our defaults meet WCAG AA contrast at 4.5:1.'
    expect(() => assertNoticeIsClean(badCandidate, 'Feedback notice')).toThrow(/^Feedback notice:/)
    expect(() => assertNoticeIsClean(badCandidate, 'Feedback notice')).not.toThrow(
      /^Re-theming notice:/,
    )
  })

  it('a warranty-worded feedback-notice candidate is labelled "Feedback notice", not the re-theming default', () => {
    const badCandidate = 'This palette carries no warranty of any kind.'
    expect(() => assertNoticeIsClean(badCandidate, 'Feedback notice')).toThrow(/^Feedback notice:/)
    expect(() => assertNoticeIsClean(badCandidate, 'Feedback notice')).not.toThrow(
      /^Re-theming notice:/,
    )
  })

  it('says "-foreground", not "foreground roles" — the hyphen is load-bearing (per the accessibility steward)', () => {
    // on-feedback-danger is byte-identical to on-feedback-warning/success/info, so a
    // paraphrase reading "foreground roles" as covering on-feedback-* would make "only
    // danger differs" false. Pinning the exact substring guards against that paraphrase.
    expect(FEEDBACK_SHARED_IDENTITY_NOTICE).toContain('-foreground variants')
    expect(FEEDBACK_SHARED_IDENTITY_NOTICE).not.toContain('foreground roles')
  })

  it('assertNoticeIsEmitted passes when the notice is present verbatim in the CSS', () => {
    const css = `:root {\n  /* Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).not.toThrow()
  })

  it('assertNoticeIsEmitted throws when the notice is entirely absent (a build that forgot to emit it)', () => {
    const css = ':root {\n  --nave-color-feedback-warning: oklch(0.5 0 0);\n}'
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(/Feedback notice violation.*not present, verbatim/)
  })

  it('assertNoticeIsEmitted throws on a truncated copy, not only a total absence', () => {
    const truncated = FEEDBACK_SHARED_IDENTITY_NOTICE.slice(0, -20)
    const css = `:root {\n  /* Feedback tokens: ${truncated} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(/Feedback notice violation/)
  })

  it("assertNoticeIsEmitted also lints this notice's composed line, not only the notice constant", () => {
    const css = `:root {\n  /* meets AA Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(
      /Feedback notice violation.*a comment line carrying the notice.*contains the word "meets"/,
    )
  })

  it('the REAL shipped stem, read from emit.ts rather than retyped, does not trip the composed-line check', () => {
    // Imported, never retyped — see the Retheming sibling above (blue row 1).
    const css = `:root {\n  ${FEEDBACK_TOKENS_COMMENT_STEM}${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).not.toThrow()
  })

  it('round 2 (accessibility-steward ask 1): a notice containing a newline refuses loudly — no single emitted line carries it whole', () => {
    const brokenNotice = `${FEEDBACK_SHARED_IDENTITY_NOTICE.slice(0, 10)}\n${FEEDBACK_SHARED_IDENTITY_NOTICE.slice(10)}`
    const css = `:root {\n  /* Feedback tokens: ${brokenNotice} */\n}`
    expect(() => assertNoticeIsEmitted(css, brokenNotice, 'Feedback notice')).toThrow(
      /^Feedback notice violation: the notice text spans more than one line, so no single line of the emitted CSS carries it whole\./,
    )
  })

  it('round 2 (accessibility-steward ask 2): every carrying line is linted, not only the first — emitted twice, first clean, second dirty, still throws', () => {
    const css = `:root {\n  /* Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n  /* meets AA Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(
      /^Feedback notice violation: a comment line carrying the notice contains the word "meets"\. The notice text itself is present byte for byte/,
    )
  })

  it('round 2 (accessibility-steward ask 3, disposition b): a wrapped comment with the framing word on line 1 and the notice on line 2 refuses — the carrying line alone reads clean but is not a self-contained comment', () => {
    const css = `:root {\n  /* meets AA, so\n   * Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(
      /^Feedback notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )
  })

  it('a comment that OPENS on the carrying line but does not close on it (the `*/` lands on a following line) refuses — isolates the endsWith half of the self-contained-comment check from the startsWith half', () => {
    const css = `:root {\n  /* Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE}\n  */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(
      /^Feedback notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )
  })

  it('a comment that CLOSES on the carrying line but does not open on it (the `/*` is on a preceding line, with no framing word anywhere) refuses — isolates the startsWith half cleanly, with no composed-line-lint side effect', () => {
    const css = `:root {\n  /*\n   Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}`
    expect(() =>
      assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    ).toThrow(
      /^Feedback notice violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line,/,
    )
  })

  it("the quality reviewer's finding 3: the Feedback-notice analogue of the Retheming shared-const identity pin — captureNoticeViolation reached for the way a future caller naturally would, now parameterized over the notice constant and its label", () => {
    // The quality reviewer (round 3, finding 3): captureNoticeViolation was hoisted to module scope
    // but its body was hardcoded to RETHEMING_NOTICE/'Retheming notice', despite its name and
    // position reading as general-purpose. Red-first evidence for this row: before
    // parameterization, calling the helper over Feedback fixtures the way a future caller naturally
    // would silently checked them against RETHEMING_NOTICE, which neither contains, so both
    // fixtures threw the unrelated "notice is not present, verbatim" message instead of the
    // not-self-contained-comment refusal this test means to compare, failing at
    // `.toContain('<REST>')`. Now that the helper takes `notice`/`noticeLabel` explicitly, this is
    // the same "one shared const" property Row 3 pins for Retheming, pinned here for Feedback: site
    // 1 opens a comment but does not close it on the carrying line; site 2's carrying line begins
    // inside a comment still open from an earlier line.
    const site1Css = `:root {\n  /* Feedback tokens: ${FEEDBACK_SHARED_IDENTITY_NOTICE}\n  */\n}` // not self-contained
    const site2Css = `:root {\n  /* preamble opens here, so\n   * it stays open across this line.\n  color-scheme: light dark;\n  ${FEEDBACK_TOKENS_COMMENT_STEM}${FEEDBACK_SHARED_IDENTITY_NOTICE} */\n}` // begins inside an earlier, still-unclosed comment

    const site1Message = sanitizeRestClause(
      captureNoticeViolation(site1Css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    )
    const site2Message = sanitizeRestClause(
      captureNoticeViolation(site2Css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice'),
    )
    expect(site1Message).toContain('<REST>')
    expect(site2Message).toContain('<REST>')
    expect(site1Message).toBe(site2Message)
  })
})

describe('AC-theming-41 covers: R35', () => {
  it('a description containing a ratio, an SC id, or a forbidden word fails, naming the token and the substring', () => {
    const violations = lintDescriptions(
      new Map([
        ['color.border.focus', 'Focus ring color — meets 3:1 contrast against surfaces'],
        ['color.content.primary', 'Default text colour'],
      ]),
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]!.text).toBe('color.border.focus')
  })

  it('the retracted border.focus description does not reappear in a clean description set', () => {
    const violations = lintDescriptions(
      new Map([['color.border.focus', 'Focus indicator colour for interactive controls']]),
    )
    expect(violations).toEqual([])
  })
})

describe('AC-theming-42 covers: R36', () => {
  it("the harness's own name and output text carry no conformance framing, checked against the REAL producing functions rather than an invented literal (the prior version validated two strings with no producer anywhere in the package)", () => {
    expect(() => assertHarnessFramingIsClean()).not.toThrow()
  })

  it('the real R21 harness fail-closed message is what gets checked (a conformance word injected into it fails the run)', () => {
    // capturedFailureMessage's own invariant: assertContrastFloors is real, but if
    // runContrastHarness stopped throwing on an empty adjacency set the check itself
    // should fail loudly rather than silently pass nothing.
    expect(() => runContrastHarness({} as never, [])).toThrow(
      /Contrast check: the pair-declaration source is empty/,
    )
  })

  it('the real R38 threshold-failure message is what gets checked (constructed from one failing ContrastResult, not a template string)', () => {
    expect(() =>
      assertContrastFloors([
        {
          pair: { subject: 'content.primary', against: 'surface.base', class: 'text' },
          scheme: 'light',
          ratio: 1,
          floor: 4.5,
          threshold: 4.545,
          pass: false,
        },
      ]),
    ).toThrow(/fall below the floor this build applies/)
  })

  // Flagged by the accessibility steward: four more build-thrown messages state an accessibility
  // position and were unread by this check — three of the four landed in one week with
  // nothing checking them. The four `it`s below prove each real message is what the widened
  // check now reads (mirroring the R21/R38 pattern above), and the mutation test after them
  // proves the widening is actually WIRED, not merely six probes that all happen to be clean.

  it('the real R39 same-step-lint fail-closed message is what gets checked (empty adjacency source)', () => {
    // Matched on the stem, not on the "R39" identifier or on either
    // side's exact wording of the empty-source clause ("absent" before the fail-closed
    // rewording landed, "empty" after), so this stays true across the merge order of that
    // change and the neutral-ceiling one rather than being coupled to whichever lands second.
    expect(() => checkSameStepLint({} as never, 'nave', [])).toThrow(
      /the pair-declaration source is (absent|empty)/,
    )
  })

  it('the real floor-provenance mismatch message is what gets checked (a floor triple that disagrees with the frozen citation)', () => {
    // This steward-cleared change rewrites this
    // message's prefix from "R38 violation:" to "Contrast floors:" as a tier-1 identifier
    // removal (the frozen record's finding/ledger ids relocate into FLOOR_PROVENANCE's own
    // docblock and stop being interpolated into the printed message).
    expect(() => assertFloorProvenance({ textFloor: 0, nonTextFloor: 0, margin: 0 })).toThrow(
      /^Contrast floors:/,
    )
  })

  it('the real neutral chroma-ceiling margin message is what gets checked (a ceiling far past the fixed margin)', () => {
    // This steward-cleared change (site 2) rewrites this message's prefix from
    // "R9/T7 violation:" to "Neutral chroma ceiling:" as a tier-1 identifier removal, on a
    // branch that (like this one) is based on origin/main and unmerged. Matched on the stem
    // both wordings share instead, so this stays true across the merge order of a concurrent
    // steward-cleared string sweep and the neutral-ceiling change rather than being coupled
    // to whichever one lands second (the same shape a prior finding named).
    expect(() => assertNeutralChromaCeilingWithinMargin(1)).toThrow(
      /produces a worst-case hue-band spread of/,
    )
  })

  it('the real orphaned-semantic-slot message is what gets checked (a slot in none of the three records)', () => {
    expect(() => assertNoOrphanedSemanticSlot(['content.brandNew'])).toThrow(/Adjacency coverage/)
  })

  describe('the widened check is actually wired to the four new probes, not vacuously green', () => {
    afterEach(() => {
      vi.resetModules()
      vi.doUnmock('../../src/theming/contrast.ts')
      vi.doUnmock('../../src/theming/neutral.ts')
      vi.doUnmock('../../src/theming/adjacency.ts')
    })

    it('a conformance word injected into the neutral chroma-ceiling message fails assertHarnessFramingIsClean', async () => {
      vi.resetModules()
      vi.doMock('../../src/theming/neutral.ts', async () => {
        const actual: Record<string, unknown> = await vi.importActual(
          '../../src/theming/neutral.ts',
        )
        return {
          ...actual,
          assertNeutralChromaCeilingWithinMargin: () => {
            throw new Error('This ceiling is WCAG AA compliant at 4.5:1.')
          },
        }
      })
      const copyLint = await import('../../src/theming/copy-lint.ts')
      expect(() => copyLint.assertHarnessFramingIsClean()).toThrow(
        /Copy-check violation: the neutral chroma-ceiling margin output/,
      )
    })

    it('a conformance word injected into the orphaned-semantic-slot message fails assertHarnessFramingIsClean', async () => {
      vi.resetModules()
      vi.doMock('../../src/theming/adjacency.ts', async () => {
        const actual: Record<string, unknown> = await vi.importActual(
          '../../src/theming/adjacency.ts',
        )
        return {
          ...actual,
          assertNoOrphanedSemanticSlot: () => {
            throw new Error('This slot meets WCAG AA at 4.5:1.')
          },
        }
      })
      const copyLint = await import('../../src/theming/copy-lint.ts')
      expect(() => copyLint.assertHarnessFramingIsClean()).toThrow(
        /Copy-check violation: the orphaned-semantic-slot output/,
      )
    })

    it('a conformance word injected into the same-step-lint fail-closed message fails assertHarnessFramingIsClean', async () => {
      vi.resetModules()
      vi.doMock('../../src/theming/contrast.ts', async () => {
        const actual: Record<string, unknown> = await vi.importActual(
          '../../src/theming/contrast.ts',
        )
        return {
          ...actual,
          checkSameStepLint: () => {
            throw new Error('This lint is WCAG AA compliant at 4.5:1.')
          },
        }
      })
      const copyLint = await import('../../src/theming/copy-lint.ts')
      expect(() => copyLint.assertHarnessFramingIsClean()).toThrow(
        /Copy-check violation: the same-step lint fail-closed output/,
      )
    })

    it('a conformance word injected into the floor-provenance message fails assertHarnessFramingIsClean', async () => {
      vi.resetModules()
      vi.doMock('../../src/theming/contrast.ts', async () => {
        const actual: Record<string, unknown> = await vi.importActual(
          '../../src/theming/contrast.ts',
        )
        return {
          ...actual,
          assertFloorProvenance: () => {
            throw new Error('These floors are WCAG AA compliant at 4.5:1.')
          },
        }
      })
      const copyLint = await import('../../src/theming/copy-lint.ts')
      expect(() => copyLint.assertHarnessFramingIsClean()).toThrow(
        /Copy-check violation: the floor-provenance mismatch output/,
      )
    })

    // Proves the SEVENTH probe (the same-step lint's REAL 'fail'
    // violation output, distinct from the widening's fail-closed probe above) is actually
    // wired, not vacuously green — the exact shape the quality reviewer found missing for the
    // first four widened probes in that change's own review.
    it("a conformance word injected into assertNoSameStepViolations's message fails assertHarnessFramingIsClean", async () => {
      vi.resetModules()
      vi.doMock('../../src/theming/contrast.ts', async () => {
        const actual: Record<string, unknown> = await vi.importActual(
          '../../src/theming/contrast.ts',
        )
        return {
          ...actual,
          assertNoSameStepViolations: () => {
            throw new Error('These slots are WCAG AA compliant at 4.5:1.')
          },
        }
      })
      const copyLint = await import('../../src/theming/copy-lint.ts')
      expect(() => copyLint.assertHarnessFramingIsClean()).toThrow(
        /Copy-check violation: the same-step lint's real violation output/,
      )
    })
  })
})

describe('assertDescriptionsAreClean (a quality-review finding, F4): aggregation across every map it is given', () => {
  // Its own docblock claims "all violations in one throw rather than the first"; before this
  // block, no test called it directly, and every existing caller keeps one map clean and
  // dirties only the other, so a short-circuit-at-the-first-map bug would have shipped clean.
  it('violations from BOTH maps land in one throw — not the first map only, not double-counted', () => {
    const mapA = new Map([['color.a', 'Meets WCAG AA contrast.']])
    const mapB = new Map([['color.b', 'Compliant with SC 1.4.3.']])
    expect(() => assertDescriptionsAreClean(mapA, mapB)).toThrow(
      /2 token description\(s\) state or imply an accessibility conformance claim/,
    )
    let message = ''
    expect(() => {
      try {
        assertDescriptionsAreClean(mapA, mapB)
      } catch (error) {
        message = (error as Error).message
        throw error
      }
    }).toThrow()
    expect(message).toContain('color.a')
    expect(message).toContain('color.b')
  })

  it('a clean map beside a dirty one reports only the dirty entry, unaffected by map order', () => {
    const clean = new Map([['color.c', 'Example swatch.']])
    const dirty = new Map([['color.d', 'AAA conformant.']])
    expect(() => assertDescriptionsAreClean(clean, dirty)).toThrow(
      /1 token description\(s\) state or imply an accessibility conformance claim/,
    )
    expect(() => assertDescriptionsAreClean(dirty, clean)).toThrow(
      /1 token description\(s\) state or imply an accessibility conformance claim/,
    )
  })
})

describe('R35 enforcement against the real corpus', () => {
  // R35 says "a lint enforces this"; the two prior describe blocks above only ever ran
  // lintDescriptions() against hand-typed fixtures, never the shipped tokens.json or the
  // generated-token equivalent (SLOT_DESCRIPTIONS) — so a real violation in either could
  // ship undetected. These two cases are the actual enforcement R35 claims.
  //
  // build-step.ts's runSourceGuards() now ALSO
  // lints tokens.json's own descriptions at build time (build-step.test.ts's own wiring
  // test proves that live, the same shape as every other guard in "every guard whose binding
  // surface exists at build time is WIRED"). These two cases stay: they pin the real corpus
  // independent of any build running, and are the STATIC half of the same guarantee.
  it('every $description string in the shipped tokens.json passes the lint', () => {
    const raw = readFileSync(path.resolve(import.meta.dirname, '../../tokens.json'), 'utf8')
    const descriptions = collectDescriptions(JSON.parse(raw))
    expect(descriptions.size).toBeGreaterThan(0)
    expect(lintDescriptions(descriptions)).toEqual([])
  })

  it('every SLOT_DESCRIPTIONS entry passes the lint', () => {
    expect(SLOT_DESCRIPTIONS.size).toBeGreaterThan(0)
    expect(lintDescriptions(SLOT_DESCRIPTIONS)).toEqual([])
  })
})
