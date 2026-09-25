/**
 * R9, R11, R13, R26: renders a pipeline result to CSS. Every custom property is
 * prefixed `--nave-` (R26); the semantic layer is `--nave-color-*`; the tint input is
 * `--nave-color-tint`. Ramp steps are never emitted (R11) — only the semantic slots plus
 * the one tint input reach the browser. `--nave-color-tint` is the only registered colour
 * (R13): every semantic slot is unregistered, so a broken override fails visibly at the
 * use site rather than being absorbed by a registration's `initial-value`.
 */

import type { PipelineResult } from './pipeline.ts'

import { formatOklch } from './color-math.ts'
// This file -> copy-lint.ts -> guard-message-probes.ts -> back to this file
// (TINT_SEED_COMMENT_STEM) is a genuine three-node cycle, kept deliberately. The comment on
// copy-lint.ts's import of guard-message-probes.ts states why it is safe and how that was
// verified.
// eslint-disable-next-line import-x/no-cycle -- safe, see copy-lint.ts
import { FEEDBACK_SHARED_IDENTITY_NOTICE, RETHEMING_NOTICE } from './copy-lint.ts'
import {
  ACTION_SECONDARY_BORDER,
  ACTION_SECONDARY_FOREGROUND,
  SEMANTIC_SLOTS,
} from './semantics.ts'

const PREFIX = '--nave-color-'
export const TINT_PROPERTY = '--nave-color-tint'

/**
 * The two STEMS this module prefixes onto a cleared notice to build the comment line a
 * consumer actually reads in `dist/tokens.css`. Named exports rather than literals inlined at
 * their use site below, because a stem is half of what `assertNoticeIsEmitted` lints,
 * and a test asserting the SHIPPED stem stays clean must read the shipped
 * bytes rather than retype them. Two of that round's own negative controls retyped them, so
 * dirtying either stem here left both green while their names said "the real shipped one" —
 * the defect this export closes.
 *
 * BOTH STEMS ARE CLEARED COPY, cleared as EXACT BYTES. The project's accessibility and
 * licensing reviewer cleared these words (applied path) as the prefix that gives each notice an
 * antecedent in the emitted CSS, on the stated condition that they stay exact: changing either
 * stem, including shortening it, is a change to cleared text and returns to that reviewer.
 * Re-wrapping the same bytes, or moving them between an inline literal and a named constant as
 * this edit does, is not a change and needs no turn.
 *
 * The composed-line lint is not that fence and must not be credited as one. It refuses
 * conformance framing on the line carrying a notice, so it catches a stem that starts claiming
 * conformance; it says nothing about whether the stem still reads as the words that were
 * cleared, and a reworded stem passes it green. The emitted-line equality in
 * `remaining-ac.test.ts` and the tracked CSS snapshot do pin the stem's bytes, but as
 * backstops: both are retyped expectations a fixer can update in the same commit.
 */
export const TINT_SEED_COMMENT_STEM = '/* Tint seed: '
export const FEEDBACK_TOKENS_COMMENT_STEM = '/* Feedback tokens: '

/**
 *
 */
function slotCssName(slot: string): string {
  // "action.primary.hover" -> "--nave-color-action-primary-hover"
  return PREFIX + slot.replaceAll('.', '-')
}

/**
 * The exact custom-property names this module emits UNCONDITIONALLY —
 * one per `SEMANTIC_SLOTS` entry, plus `TINT_PROPERTY` — regardless of seed or overrides.
 * `validate.ts` reads this to distinguish, in a contract name the consumer's source does not
 * declare, whether the consumer must supply it or whether `build`'s theming half already
 * does; it never simulates this against a namespace prefix, only against the real set.
 */
export function shippedThemingPropertyNames(): ReadonlySet<string> {
  return new Set([TINT_PROPERTY, ...SEMANTIC_SLOTS.map((slot) => slotCssName(slot))])
}

/**
Renders `light-dark(light, dark)` for a resolved slot, per R23/R15.
 */
function lightDarkDeclaration(
  result: PipelineResult,
  slot: string,
): { name: string; value: string } {
  const light = result.slots.find((s) => s.slot === slot && s.branch === 'light')
  const dark = result.slots.find((s) => s.slot === slot && s.branch === 'dark')
  if (!light || !dark)
    throw new Error(
      `Missing branch for slot ${slot}: no slot is allowed to lack a dark value. Open an issue.`,
    )
  return { name: slotCssName(slot), value: `light-dark(${light.css}, ${dark.css})` }
}

export interface EmittedCss {
  /**
  Every `--nave-color-*` custom property this build emits, name -> declaration value.
   */
  customProperties: ReadonlyMap<string, string>
  css: string
}

/**
 * `layer`: R10 — Nave's own build emits into `tokens.defaults`; the consumer-invocable
 * build emits into `tokens.presets`, fixed per invoking entry point rather than a public flag.
 */
export function emitCss(result: PipelineResult, layer = 'tokens.defaults'): EmittedCss {
  const props = new Map<string, string>()

  for (const slot of SEMANTIC_SLOTS) {
    const { name, value } = lightDarkDeclaration(result, slot)
    props.set(name, value)
  }

  // action.secondary's declared foreground and companion border are resolved values a
  // component author reaches for by the names of the slots they alias (R23 write-back 5,
  // R18a round 9): they are NOT new custom properties, `content.primary` and
  // `border.control` already emit them under their own names above.
  void ACTION_SECONDARY_FOREGROUND
  void ACTION_SECONDARY_BORDER

  const tintDefault = formatOklch(
    result.records.achromaticBranch
      ? { l: 0.7, c: 0.05, h: result.records.tintHue }
      : {
          l: result.records.primary.usedSeed.l,
          c: result.records.primary.usedSeed.c,
          h: result.records.primary.usedSeed.h,
        },
  )

  // The two comment lines below carry CLEARED COPY end to end: the stems are cleared as exact
  // bytes (see TINT_SEED_COMMENT_STEM above) and the notices they prefix are cleared verbatim
  // (see the constants in copy-lint.ts). Do not strip, shorten or re-word any part of either
  // line as part of an unrelated tidy-up here; open an issue instead.
  const lines: string[] = [
    // This line ships inside dist/tokens.css, which every consumer of this package installs,
    // so it may only point at a document that consumer can open. It names this package's own
    // README instead of an internal path.
    '/* Nave theming — generated, do not edit. See this package\'s README ("Theming"). */',
    '',
    `@property ${TINT_PROPERTY} {`,
    `  syntax: '<color>';`,
    `  inherits: true;`,
    `  initial-value: ${tintDefault};`,
    `}`,
    '',
    `@layer ${layer} {`,
    '  :root {',
    `    /* color-scheme lives here, not in @navecss/core's reset, so`,
    `     * light-dark() resolves even for a tokens-only consumer. */`,
    `    color-scheme: light dark;`,
    `    ${TINT_SEED_COMMENT_STEM}${RETHEMING_NOTICE} */`,
    `    ${TINT_PROPERTY}: ${tintDefault};`,
  ]
  const feedbackWarningName = slotCssName('feedback.warning')
  for (const [name, value] of props) {
    // R20: obligation 1 — the shared-identity notice lands immediately above
    // --nave-color-feedback-warning (the tightest reading per the project's accessibility and
    // licensing reviewer; the sentence is
    // self-locating and would also be correct above feedback-danger, which SEMANTIC_SLOTS
    // order emits first).
    if (name === feedbackWarningName) {
      lines.push(`    ${FEEDBACK_TOKENS_COMMENT_STEM}${FEEDBACK_SHARED_IDENTITY_NOTICE} */`)
    }
    lines.push(`    ${name}: ${value};`)
  }
  lines.push('  }', '}', '')

  return { customProperties: props, css: lines.join('\n') }
}
