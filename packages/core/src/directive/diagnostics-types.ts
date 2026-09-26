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
}
