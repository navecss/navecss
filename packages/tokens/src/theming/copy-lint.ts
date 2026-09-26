/**
 * R34, R35, R36: the shared conformance-framing lint. Neither a `$description`
 * string (R35), the re-theming notice (R34), nor the R21 harness's own name/output (R36)
 * may carry a WCAG ratio, a success-criterion identifier, or a conformance word. One
 * regex, reused by all three surfaces, so the forbidden-word list has one home.
 *
 * Relocating `assertNoticeIsEmitted`, either notice constant, or either refusal string out of
 * this file re-opens the accessibility steward's file-level clearance with no byte changed:
 * the one-home condition and the instruction that any re-wording is a fresh clearance are
 * stated in the docblocks below, and a split can leave the condition's prose in one file and
 * the bytes it governs in another with nothing noticing. Move any of them only through a
 * fresh clearance.
 */

import { linesThatBeginInsideAnUnclosedComment } from './comment-open-tracker.ts'
import { assertContrastFloors, runContrastHarness } from './contrast.ts'
// Two import cycles close through the next line, and both are kept on purpose:
//   copy-lint.ts -> guard-message-probes.ts -> copy-lint.ts
//   emit.ts -> copy-lint.ts -> guard-message-probes.ts -> emit.ts
// They are safe because no module in either cycle reads an imported value while it is still
// initialising. The values that cross them (RETHEMING_NOTICE, FEEDBACK_SHARED_IDENTITY_NOTICE,
// TINT_SEED_COMMENT_STEM, ACCESSIBILITY_GUARD_MESSAGE_PROBES, and the assertNoticeIsEmitted
// function) are read only inside a function body or a probe's `capture` thunk, which runs
// after all three modules have finished loading.
// Verified against the built output by importing each of the three modules first, in a fresh
// Node process each, and reading through to the other two: no throw and no `undefined` in any
// order. A top-level read of any of the four constants would break that, so they stay inside
// functions. assertNoticeIsEmitted is grouped with them because it, too, is never read outside
// a thunk here, not because it shares their hazard: a function declaration is hoisted whole
// before any module body runs, so a top-level read of it would not break the same way.
// eslint-disable-next-line import-x/no-cycle -- safe, see the comment above
import { ACCESSIBILITY_GUARD_MESSAGE_PROBES } from './guard-message-probes.ts'

// Not linear in the worst case: `RATIO_PATTERN` is unanchored and begins with `\d+`, so a long
// run of digits with no `:` after it is retried from every digit (measured: 20,000 digits
// ~1.7 s, 40,000 ~7 s). Accepted because all three patterns run only at build time, over copy
// this package writes itself (emitted comments, guard messages, function names), never over a
// consumer's text.
const FORBIDDEN_WORDS = /\b(WCAG|AA|AAA|accessible|compliant|meets|conformant)\b/i
const RATIO_PATTERN = /\d+(?:\.\d+)?\s*:\s*1/
const SUCCESS_CRITERION_PATTERN = /\bSC\s*\d+\.\d+\.\d+\b/i

export interface LintViolation {
  text: string
  reason: string
}

/**
 * Returns a violation reason, or `undefined` if the text is clean.
 */
export function findConformanceFraming(text: string): string | undefined {
  const wordMatch = FORBIDDEN_WORDS.exec(text)
  if (wordMatch) return `contains the word "${wordMatch[0]}"`
  const ratioMatch = RATIO_PATTERN.exec(text)
  if (ratioMatch) return `contains a contrast ratio ("${ratioMatch[0]}")`
  const scMatch = SUCCESS_CRITERION_PATTERN.exec(text)
  if (scMatch) return `contains a WCAG success-criterion identifier ("${scMatch[0]}")`
  return undefined
}

/**
 * R35: lints one map of description strings. The map is the caller's to supply, so this says
 * nothing about which surfaces are covered; `assertDescriptionsAreClean` below is where the
 * build's actual surface is named (this docblock used to claim "every
 * `$description` string in the DTCG source" while the only caller passed the narrower
 * semantic-slot map, and a control whose stated surface is wider than its wired surface
 * retires the attention that was the real control).
 */
export function lintDescriptions(descriptions: ReadonlyMap<string, string>): LintViolation[] {
  const violations: LintViolation[] = []
  for (const [token, text] of descriptions) {
    const reason = findConformanceFraming(text)
    if (reason) violations.push({ text: token, reason })
  }
  return violations
}

/**
 * R35: the build's description guard over every surface it is given, reporting all
 * violations in one throw rather than the first. The build passes both surfaces that carry
 * description strings: the resolved semantic-slot map and the DTCG source's own.
 */
export function assertDescriptionsAreClean(
  ...descriptionMaps: readonly ReadonlyMap<string, string>[]
): void {
  const violations = descriptionMaps.flatMap((descriptions) => lintDescriptions(descriptions))
  if (violations.length === 0) return

  const lines = violations.map((violation) => `${violation.text}: ${violation.reason}`)
  throw new Error(
    `${violations.length} token description(s) state or imply an accessibility conformance ` +
      `claim, which Nave's shipped copy does not make:\n${lines.join('\n')}\nDescribe what the ` +
      'token is for and leave the claim out. If you think the description needs it, open an ' +
      'issue rather than changing this check.',
  )
}

/**
 * R34: the CANONICAL re-theming responsibility notice. One-directional (states what
 * changes hands, not what was in hand), no ratio, no SC id, none of the forbidden words,
 * not phrased as a warranty disclaimer. Cleared verbatim by the project's accessibility steward,
 * applied path.
 *
 * This package's own landing point (the comment emitted immediately above the seed
 * declaration in the generated CSS, `emit.ts`) ALWAYS uses this constant: one text, one
 * home, and `emit.ts` imports it rather than carrying a second literal.
 *
 * Round 12 records a second, separately cleared TRANSCRIPTION VARIANT for the "Neutral
 * actions" worked example at README ladder rung 2, where it ships. This package carries no
 * production constant for it and never emits it; its test-purposes declaration lives at
 * `packages/tokens/test/theming/cleared-copy.ts`, which corrects an earlier claim that the
 * variant lived in one place only. The authoritative homes are the theming specification's
 * R34 and the accessibility steward's own clearance record, neither of them in this
 * repository. Rung 2 carries the canonical notice too, and every landing point this package
 * does not own (README rungs `1a`, `1b`, 2, 3, 4, 5) is PRESUMED canonical: nothing in this
 * package reads them.
 */
export const RETHEMING_NOTICE =
  'Changing this changes everything Nave derives from it. The contrast of the resulting palette follows from what you set, and checking it is yours.'

/**
 * R20/R34: refuses conformance framing or warranty wording in a notice constant, before it is emitted.
 */
export function assertNoticeIsClean(
  notice: string = RETHEMING_NOTICE,
  noticeLabel = 'Re-theming notice',
): void {
  const reason = findConformanceFraming(notice)
  if (reason) throw new Error(`${noticeLabel}: ${reason}.`)
  if (/\bwarrant(y|ies)\b/i.test(notice)) {
    throw new Error(
      `${noticeLabel}: it uses warranty wording. This notice states a fact and the act it ` +
        'leaves to the reader; wording it as a disclaimer changes what it claims. Reword it, ' +
        'or open an issue if the notice itself should change.',
    )
  }
}

/**
 * R20: the feedback family's shared-identity notice — `warning`, `success` and `info`, and
 * their `-foreground` variants, resolve to one shared value in the shipped default; only
 * `danger` differs. Cleared verbatim by the project's accessibility steward, applied path.
 * The `-foreground` hyphen is load-bearing: all four
 * `on-feedback-*` declarations (including `on-feedback-danger`) are byte-identical, so a
 * paraphrase reading "foreground roles" as covering `on-feedback-*` would make "only danger
 * differs" false. Do not reword.
 *
 * Emitted as a comment in the generated CSS immediately above
 * `--nave-color-feedback-warning` (`emit.ts`) — `emit.ts` writes the feedback block in
 * `SEMANTIC_SLOTS` order and `feedback-danger` comes first, so this placement is the
 * tightest reading; the sentence names its own three subjects and states that `danger`
 * differs, so it is self-locating and would also be correct placed above `danger`.
 *
 * One home only, per the accessibility steward's own condition 1: if `descriptions.ts`, the
 * README or any docs surface ever wants these words, it imports or quotes this constant
 * rather than holding a second copy. Any re-wording, including shortening, returns to the
 * accessibility steward for re-clearance — wrapping the SAME words across lines is not a
 * re-wording and needs no further clearance.
 */
export const FEEDBACK_SHARED_IDENTITY_NOTICE =
  'warning, success and info, and their -foreground variants, resolve to one shared value here; only danger differs. Colour alone therefore cannot tell those three states apart, so wherever a feedback token carries meaning, give it a text label naming the state and a distinct icon or shape that differs per state.'

/**
 * R27: the CANONICAL statement of this entry point's contrast-threshold posture. Cleared
 * verbatim by the project's accessibility steward on the applied path (2026-08-22), and
 * re-cleared with a new final sentence on 2026-09-07; sentences one through four are
 * byte-identical across the two.
 *
 * The old final sentence pointed at an internal tracking id, an identifier no reader of the
 * published package can resolve. Qualifying it was not a repair, and that is the part worth
 * keeping: putting the repository name in front of the number clears the rule against BARE
 * references, which fences qualified spellings out by construction and so never sees them, and
 * lands squarely on the separate rule against naming the internal repository at all. The two
 * obligations close on the sentence from opposite sides, leaving no spelling that satisfies
 * both, so deletion was the only compliant act. Both still hold over these bytes: the bare form
 * is asserted at zero across every tracked file of this repository, this one included, and the
 * internal reference is kept out on the authoring side, before a byte reaches this tree.
 *
 * The landing point is `packages/tokens/README.md`, ruled by the project's product lead: the
 * criterion ranges over the surface where THIS entry point's posture is stated to a consumer,
 * and this paragraph's own subject is this entry point's flags. The repository-root README's
 * accessibility section was refused BY NAME in that ruling, because placement can convert an
 * artifact fact into a conformance-adjacent claim: this paragraph is about an absent INPUT,
 * those non-promises about an absent VERDICT, and they do not belong in one list.
 *
 * One home only. A documentation surface has no constant to source from, so byte-identity at
 * the single instance is the anti-drift mechanism; the spec's own markdown emphasis and
 * blockquote marker are how the spec PRESENTS cleared copy and are not part of the cleared
 * bytes (`RETHEMING_NOTICE` above is the settled precedent: bold and quoted in the theming
 * spec's R34, plain in the constant and plain on this same README). Any re-wording, including
 * shortening, returns to the accessibility steward; re-wrapping the same words does not.
 */
export const NO_CONSUMER_CONTRAST_THRESHOLD_INPUT =
  "0.1.0 ships no consumer contrast-threshold input. No flag of this entry point sets one, and the build reads none. This is the absence of an input, not a limit on the consumer: a consumer may hold whatever contrast target they choose and check their palette against it with their own tooling. Where a check Nave ships runs in a consumer's build over the consumer's values, it reports and does not fail. A consumer-settable target is deliberately out of 0.1.0 rather than overlooked."

/**
 * The presence guarantee `assertNoticeIsClean` does not provide (flagged during an
 * accessibility review): that function reads only the SOURCE constant's framing and
 * never the emitted CSS, so a build that imports a notice constant and forgets to emit it,
 * or emits a truncated copy, would pass it cleanly. This reads the actual composed CSS and
 * throws if `notice` is not present byte-for-byte, naming which notice by a plain-prose
 * label and failing for exactly one reason.
 *
 * `noticeLabel` names the notice, never a rule number: every message
 * below leaves the reader's next act unambiguous and must not degrade into one naming no
 * notice, no file and no act.
 *
 * Lints EVERY line of the emitted CSS that carries the notice, not only the first: a notice
 * emitted more than once, with the framing on a
 * line other than the first carrying line, is a violation the earlier `.find()`-based check
 * passed silently. Two further shapes the check's LINE frame can come apart from the
 * COMMENT a consumer actually reads, both ruled refusals from an accessibility review rather
 * than silent passes: a notice spanning more than one line, so no single emitted line carries it
 * whole (checked by an empty carrying-line set — `css.includes(notice)` above already proved the
 * notice is present, so an empty set here means no single line could have carried it, which holds
 * if and only if the notice itself contains a newline); and a carrying line that is not a
 * SELF-CONTAINED comment (trimmed, opens and closes its own comment delimiters with nothing left
 * dangling), so the notice's own comment continues onto a line this check does not read. Both
 * refuse loudly rather than skip, per this domain's own recorded lesson four lines above this
 * function's history (this file's own `lintDescriptions` docblock): a control whose stated surface
 * is wider than its wired surface retires the attention that was the real control. After this round
 * the stated and the wired surface coincide: every carrying line is read, and each case where no
 * single line can be read in full stops the build instead of passing under it.
 *
 * A carrying line holding a SECOND, self-contained comment beside the notice's own passes
 * this predicate DELIBERATELY, and it is not a hole. The requirement the predicate serves is
 * the accessibility steward's own, applied path: "the text this check lints must
 * never be a SUBSET of what a reader sees around the notice, and where it cannot be equal it
 * must refuse", a superset being acceptable because it can only raise a false alarm a human
 * resolves. The framing lint below reads the WHOLE trimmed line, so when one comment closes
 * and another opens before the notice, the sibling comment is linted too. That is a superset,
 * and a conformance word anywhere on that line still stops the build. Narrowing this to one
 * comment per line would refuse a line the check reads in full, which is the one thing the
 * refusal above tells its reader it is not doing.
 *
 * The MIRROR of that shape is the subset case: a carrying line that opens a comment delimiter
 * of its own while a comment opened on an EARLIER line is still unclosed. It is now refused
 * rather than recorded wherever the comment tracker described below finds it, and that tracker
 * is not a CSS parser (what it models is set out below). Such a line looks self-contained, so
 * both checks above pass it, but
 * CSS comments do not nest, so the reader is inside the earlier comment and the text this
 * check reads is a SUBSET of the comment they see. The live route was real and cheap: drop
 * the closing delimiter from the two-line `color-scheme` note three lines above the notice in
 * `emit.ts`, and this guard stayed silent while `dist/tokens.css` shipped that note and the
 * notice as one comment, conformance claim and all. A scan of the emitted lines now
 * tracks whether each line BEGINS inside an open comment, and a carrying line that does throws
 * the not-self-contained refusal above, byte for byte and unchanged: the reader's act is
 * identical (put the notice and the rest of its comment on one line, in `emit.ts`), so a second
 * near-identical message would double the cleared surface to discriminate on a fact they do not
 * need. What sharing it may NOT do is assert one shape as though it were the other: a line
 * reaching this tracker IS self-contained by the predicate above, so the string names BOTH
 * shapes and lets its elided remainder show which one a reader is in (per the accessibility
 * steward's review). Two bounds on that tracker, both from that same review. It may only ever
 * ADD a refusal and must never change WHICH text is linted, so it runs LAST of the three
 * per-line checks and no message that fires today is replaced by it. Its scan is quote-aware
 * while outside a comment (the accessibility steward's condition S12, applied path), so a
 * declaration VALUE carrying a comment delimiter inside a string that CLOSES on its own line is
 * read as ordinary string content, not as an open comment. A string that does not close on its
 * line has no single reading: where an unescaped line break cuts it off, CSS consumes it as a
 * bad-string token to the end of the line, so a comment opener after it is string content to a
 * parser, while a reader can take the quote as stray and see that opener open a comment. Where
 * the check cannot tell which of those a reader takes, the requirement above says refuse, so
 * the tracker follows three readings of such a line, plus two that also treat an unquoted
 * `url()` token's content as opaque up to its closing parenthesis, even on a later line, one of
 * them also carrying a string continued by an escaped line break onto the next line. What it
 * models is comment delimiters, quoted strings and unquoted `url()` tokens, on lines split at
 * each line feed. All five readings are set out in `comment-open-tracker.ts`, and a line is
 * reported as beginning inside a comment if any of them does. That can only add a refusal to
 * what the tokenizer's reading alone would give, never remove one. It stays
 * quote-blind while inside a comment, because a real CSS comment closes at the first literal
 * closing delimiter regardless of quoting, and tracking quotes there would risk exactly the
 * silent pass this tracker exists to prevent.
 */
export function assertNoticeIsEmitted(css: string, notice: string, noticeLabel: string): void {
  if (!css.includes(notice)) {
    throw new Error(
      `${noticeLabel} violation: the notice is not present, verbatim, in the emitted CSS. Restore it exactly as authored.`,
    )
  }

  const allLines = css.split('\n')
  const carryingLines = allLines
    .map((line, index) => ({ index, line }))
    .filter((candidate) => candidate.line.includes(notice))
  if (carryingLines.length === 0) {
    throw new Error(
      `${noticeLabel} violation: the notice text spans more than one line, so no single line of the emitted CSS carries it whole. This check reads that CSS one line at a time and refuses a notice it cannot read in full rather than skipping it. The notice text is defined in packages/tokens/src/theming/copy-lint.ts. Put it back on a single line, or open an issue if it genuinely needs more than one.`,
    )
  }

  const linesThatBeginOpen = linesThatBeginInsideAnUnclosedComment(allLines)

  for (const { index, line } of carryingLines) {
    const trimmed = line.trim()
    // The carrying line with the notice text itself elided, so a violation message can name
    // the offending line by its own content instead of presupposing there is only one.
    const rest = trimmed.replace(notice, '')
    const isSelfContainedComment = trimmed.startsWith('/*') && trimmed.endsWith('*/')
    const notSelfContainedMessage = `${noticeLabel} violation: a line of emitted CSS carrying the notice is not a self-contained comment, or sits inside a comment opened on an earlier line, so a reader sees more around the notice than this check can read, and it refuses rather than checking part of what they see. With the notice text itself elided, that line reads "${rest}", and it is built in packages/tokens/src/theming/emit.ts. Put the notice and the rest of its comment on one line, or open an issue if that comment genuinely needs to wrap.`

    if (!isSelfContainedComment) {
      throw new Error(notSelfContainedMessage)
    }

    const reason = findConformanceFraming(line)
    if (reason) {
      throw new Error(
        `${noticeLabel} violation: a comment line carrying the notice ${reason}. The notice text itself is present byte for byte, so what needs changing is the rest of that line, which reads "${rest}" with the notice text itself elided and is built in packages/tokens/src/theming/emit.ts. Take the phrase out there, or open an issue if that line should genuinely carry it.`,
      )
    }

    if (linesThatBeginOpen.has(index)) {
      throw new Error(notSelfContainedMessage)
    }
  }
}

/**
 * R36: each of the build-thrown messages enumerated below must carry no
 * conformance framing. Checked against the REAL surfaces this package ships (the exported
 * function names Nave's own build actually calls, and the literal message text those
 * functions actually throw on a hand-built failing direction) — never an invented CLI name
 * or output template with no producer. Widened from two probes (R21's harness, R38's
 * threshold) to six to seven (a different branch of an already-probed guard family, not a
 * new export).
 *
 * MODULE-MOCK-SENSITIVE: each probe imports and calls a real export, so this reads whatever
 * that binding throws at call time — a test mocking a probed export is checked against the
 * MOCK's text, fail-closed if it never throws, silently GREEN if it throws different text,
 * while this function still reports the real message as checked. `copy-lint.test.ts`'s
 * wiring tests and `build-step.test.ts`'s R39 mocks rely on this deliberately (argument
 * discrimination keeps an unrelated mock from disabling this guard); a green run of this
 * function inside any suite that mocks a probed export is evidence about the mock, never
 * about shipped text.
 */
export function assertHarnessFramingIsClean(): void {
  for (const name of [runContrastHarness.name, assertContrastFloors.name]) {
    const reason = findConformanceFraming(name)
    if (reason)
      throw new Error(
        `Copy-check violation: the harness function name "${name}" ${reason}. Take those words out of the name.`,
      )
  }

  for (const probe of ACCESSIBILITY_GUARD_MESSAGE_PROBES) {
    let message: string
    try {
      message = probe.capture()
    } catch (error) {
      throw new Error(
        `Copy-check probe "${probe.label}" no longer reproduces its own failing direction: ${(error as Error).message}`,
        { cause: error },
      )
    }
    const reason = findConformanceFraming(message)
    if (reason)
      throw new Error(
        `Copy-check violation: ${probe.label} ${reason}. Take those words out of the message that produced it.`,
      )
  }
}
