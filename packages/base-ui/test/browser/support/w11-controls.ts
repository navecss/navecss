/**
 * The stylesheet rules the Scroll Area and value bar controls take away or swap, as the spec prints
 * them (Appendix C.1 for the shipped bytes, C.5 for the variants priced), each with the byte
 * count and sha256 prefix the spec gives it. A control built from text that is not the rule it names
 * proves nothing, so `measureControlRule` reads the text back, to be held against those figures.
 *
 * Whitespace is the in-document whitespace: a rule's bytes run from its two leading spaces to its
 * final newline, which is how the built stylesheet holds it, so a rule is taken out of the sheet or
 * replaced in it by its exact text.
 */

const lines = (...rows: string[]): string => `${rows.join('\n')}\n`

export interface ControlRule {
  /**
  The byte count the spec gives the rule.
   */
  readonly bytes: number
  /**
  The first sixteen hex digits of the rule's sha256.
   */
  readonly hash: string
  readonly text: string
}

/**
The sha256 of a text, as its first sixteen hex digits.
 */
const hashPrefix = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

/**
The rule's size and hash as read from its text.
 */
export const measureControlRule = async (
  rule: ControlRule,
): Promise<{ readonly bytes: number; readonly hash: string }> => ({
  bytes: new TextEncoder().encode(rule.text).length,
  hash: await hashPrefix(rule.text),
})

/**
The sheet with one rule's text replaced by another's, which is the text of a different rule or empty. A
sheet that does not hold the rule exactly once is not the sheet the spec's bytes describe, and the control
built from it would be a different one, so that is an error and not a no-op.
 */
export const replaceRule = (sheet: string, target: ControlRule, replacement = ''): string => {
  const parts = sheet.split(target.text)
  if (parts.length !== 2) {
    throw new Error(
      `the stylesheet holds ${String(parts.length - 1)} copies of the ${String(target.bytes)} B rule ${target.hash}, not one`,
    )
  }
  return parts.join(replacement)
}

/**
 * `-scroll-area-scrollbar` as shipped: a 24px strip (C.1, C.2).
 */
export const SCROLLBAR: ControlRule = {
  bytes: 450,
  hash: '7145173da3a49712',
  text: lines(
    '  .nave-base-ui-scroll-area-scrollbar { box-sizing: border-box; background-color: var(--nave-color-surface-base); &[data-orientation="vertical"]{ inline-size: var(--nave-size-control-xs); padding-inline: calc((var(--nave-size-control-xs) - var(--nave-border-width-lg)) / 2);',
    '    } &[data-orientation="horizontal"]{ block-size: var(--nave-size-control-xs); padding-block: calc((var(--nave-size-control-xs) - var(--nave-border-width-lg)) / 2);',
    '    } }',
  ),
}

/**
 * `-scroll-area-thumb` as shipped (C.1, C.2).
 */
export const THUMB: ControlRule = {
  bytes: 383,
  hash: '72a50c03b5579278',
  text: lines(
    '  .nave-base-ui-scroll-area-thumb { box-sizing: border-box; border-radius: var(--nave-radius-full); &[data-orientation="vertical"]{ border-inline: calc(var(--nave-border-width-lg) / 2) solid var(--nave-color-border-control);',
    '    } &[data-orientation="horizontal"]{ block-size: 100%; border-block: calc(var(--nave-border-width-lg) / 2) solid var(--nave-color-border-control);',
    '    } }',
  ),
}

/**
 * `-scroll-area-viewport` as shipped: a 28px gutter (C.1, C.2).
 */
export const VIEWPORT: ControlRule = {
  bytes: 606,
  hash: '2e28a4f8b3567d68',
  text: lines(
    '  .nave-base-ui-scroll-area-viewport { box-sizing: border-box; flex: 1; min-block-size: 0; padding: var(--nave-spacing-control-xs); scroll-padding: var(--nave-spacing-control-xs); &[data-has-overflow-y]{ padding-inline-end: calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs)); scroll-padding-inline-end: calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs));',
    '    } &[data-has-overflow-x]{ padding-block-end: calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs)); scroll-padding-block-end: calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs));',
    '    } }',
  ),
}

/**
 * `-scroll-area-scrollbar` as an earlier form: a 12px strip (C.5).
 */
export const SCROLLBAR_12PX_STRIP: ControlRule = {
  bytes: 458,
  hash: 'b6d8420edcd5b266',
  text: lines(
    '  .nave-base-ui-scroll-area-scrollbar { box-sizing: border-box; background-color: var(--nave-color-surface-base); &[data-orientation="vertical"]{ inline-size: calc(var(--nave-border-width-lg) + 2 * var(--nave-spacing-control-xs)); padding-inline: var(--nave-spacing-control-xs);',
    '    } &[data-orientation="horizontal"]{ block-size: calc(var(--nave-border-width-lg) + 2 * var(--nave-spacing-control-xs)); padding-block: var(--nave-spacing-control-xs);',
    '    } }',
  ),
}

/**
 * `-scroll-area-viewport` as an earlier form: a 16px gutter (C.5).
 */
export const VIEWPORT_16PX_GUTTER: ControlRule = {
  bytes: 622,
  hash: '384942addb72ea7b',
  text: lines(
    '  .nave-base-ui-scroll-area-viewport { box-sizing: border-box; flex: 1; min-block-size: 0; padding: var(--nave-spacing-control-xs); scroll-padding: var(--nave-spacing-control-xs); &[data-has-overflow-y]{ padding-inline-end: calc(var(--nave-border-width-lg) + 3 * var(--nave-spacing-control-xs)); scroll-padding-inline-end: calc(var(--nave-border-width-lg) + 3 * var(--nave-spacing-control-xs));',
    '    } &[data-has-overflow-x]{ padding-block-end: calc(var(--nave-border-width-lg) + 3 * var(--nave-spacing-control-xs)); scroll-padding-block-end: calc(var(--nave-border-width-lg) + 3 * var(--nave-spacing-control-xs));',
    '    } }',
  ),
}

/**
 * `-value-bar-track` as shipped (C.1, C.2).
 */
export const TRACK: ControlRule = {
  bytes: 351,
  hash: '7db6688a2ec5a619',
  text: lines(
    '  .nave-base-ui-value-bar-track { box-sizing: border-box; flex: 0 0 100%; min-block-size: calc(var(--nave-border-width-lg) + 4 * var(--nave-border-width-sm)); padding: var(--nave-border-width-sm); border: var(--nave-border-width-sm) solid var(--nave-color-border-control); border-radius: var(--nave-radius-full); display: flex; align-items: center; }',
  ),
}

/**
 * `-value-bar-indicator` as shipped: its block size clamped (C.1, C.2).
 */
export const INDICATOR: ControlRule = {
  bytes: 307,
  hash: 'f4713d2f8a618f70',
  text: lines(
    '  .nave-base-ui-value-bar-indicator { box-sizing: border-box; max-block-size: var(--nave-border-width-lg); border-block: calc(var(--nave-border-width-lg) / 2) solid currentColor; border-radius: var(--nave-radius-full); color: var(--nave-color-content-primary); &[data-indeterminate]{ display: none;',
    '    } }',
  ),
}

/**
 * `-value-bar-track` as an earlier form: no flex centring (C.5).
 */
export const TRACK_WITHOUT_CENTRING: ControlRule = {
  bytes: 315,
  hash: 'af592fefde610c29',
  text: lines(
    '  .nave-base-ui-value-bar-track { box-sizing: border-box; flex: 0 0 100%; min-block-size: calc(var(--nave-border-width-lg) + 4 * var(--nave-border-width-sm)); padding: var(--nave-border-width-sm); border: var(--nave-border-width-sm) solid var(--nave-color-border-control); border-radius: var(--nave-radius-full); }',
  ),
}

/**
 * `-value-bar-indicator` as an earlier form: no `max-block-size` clamp (C.5).
 */
export const INDICATOR_WITHOUT_CLAMP: ControlRule = {
  bytes: 262,
  hash: '5b11f20810b366c7',
  text: lines(
    '  .nave-base-ui-value-bar-indicator { box-sizing: border-box; border-block: calc(var(--nave-border-width-lg) / 2) solid currentColor; border-radius: var(--nave-radius-full); color: var(--nave-color-content-primary); &[data-indeterminate]{ display: none;',
    '    } }',
  ),
}
