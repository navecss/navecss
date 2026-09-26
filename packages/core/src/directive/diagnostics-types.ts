/**
 * R6: the closed set of diagnostic codes the core can produce, and the
 * plain-data shape every one of them shares. Positioning (`offset`/
 * `endOffset`) is always relative to whatever text the caller handed in —
 * `plan()`'s prelude, or `expandText()`'s whole stylesheet — never to a
 * file the core does not know about; a host maps that into its own
 * line/column space (R6 "whose line and column").
 */

export type DiagnosticCode =
  | 'unknown-atom'
  | 'no-atom'
  | 'bad-token'
  | 'bad-parent'
  | 'in-keyframes'
  | 'has-block'
  | 'missing-declarations'
  | 'bare-import'

export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly offset: number
  readonly endOffset: number
  readonly name?: string
  readonly hint?: string
  /**
  The offending token as written (`bad-token`'s own text, quoted verbatim in its message).
   */
  readonly text?: string
  /**
  `bad-parent` only: whether the refused parent sits inside another rule (names the `& { }` workaround) or at the true top level.
   */
  readonly detail?: 'nested-group'
}
