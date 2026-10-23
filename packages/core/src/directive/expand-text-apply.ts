/**
 * Applies a rule's plan (`planRule()`) to the text of its block: each directive's span is replaced
 * by what it emits, and each run of the rule's own declarations that must be wrapped gets `& { `
 * written before it and ` }` after it. Nothing else in the block is touched, so every authored
 * byte keeps its line and its place.
 */
import type { Item } from './block-reader.ts'
import type { Diagnostic } from './diagnostics-types.ts'
import type { BlockModel } from './expand-text-model.ts'
import type { AppendPart } from './expand-text-output.ts'
import type { Walker } from './expand-text-walk.ts'
import type { ExpandItem, PlanItem, PlanWarning, RulePlan, WrapItem } from './rule-model.ts'
import type { Token } from './tokenizer.ts'

import { renderEmissions } from './expand-text-render.ts'
import { DirectiveFailure, planRule } from './rule-plan.ts'

export interface RuleFrameFacts {
  readonly items: readonly Item[]
  readonly model: BlockModel
  readonly selector: string
  readonly isInsideKeyframes: boolean
  /**
  Whether the block has its closing brace; an unclosed one runs to the end of input.
   */
  readonly isClosed: boolean
  /**
  Where text for the end of an unclosed block goes: the end of input.
   */
  readonly endParts: AppendPart[]
}

/**
 * The end of `item` without the whitespace after it: where a span written around it ends.
 */
function significantEnd(w: Walker, item: Item): number {
  let last = item.end - 1
  while (last > item.start && w.tokens[last]!.type === 'whitespace-token') last--
  return w.tokens[last]!.endIndex
}

/**
 * The end of a declaration item without what trails it: whitespace, and comments unless a `;`
 * ends the declaration (a comment after the last declaration of a block is a node of its own, a
 * comment before the `;` is part of the declaration).
 */
function declarationEnd(w: Walker, item: Item): number {
  let last = item.end - 1
  if (w.tokens[last]!.type === 'semicolon-token') return w.tokens[last]!.endIndex
  while (last > item.start && isInertToken(w.tokens[last]!)) last--
  return w.tokens[last]!.endIndex
}

/**
 * Whether a token is whitespace or a comment.
 */
function isInertToken(token: Token): boolean {
  return token.type === 'whitespace-token' || token.type === 'comment'
}

/**
 * The diagnostics of a directive, moved from prelude-relative offsets to the stylesheet's own.
 */
export function repositionDiagnostics(
  diagnostics: readonly Diagnostic[],
  item: Item,
  span: { end: number; start: number },
): Diagnostic[] {
  const preludeOffset = item.preludeOffset ?? 0
  return diagnostics.map((d) => {
    if (d.code === 'unknown-atom' || d.code === 'bad-token') {
      return { ...d, offset: preludeOffset + d.offset, endOffset: preludeOffset + d.endOffset }
    }
    return { ...d, offset: span.start, endOffset: span.end }
  })
}

/**
 * Replaces a directive by what it emits, and records its problems.
 */
function applyExpand(w: Walker, plan: ExpandItem, itemOf: readonly Item[]): void {
  const item = itemOf[plan.ref]!
  const span = { start: w.tokens[item.start]!.startIndex, end: significantEnd(w, item) }
  const diagnostics = repositionDiagnostics(plan.diagnostics, item, span)
  if (item.blockStart !== undefined) {
    diagnostics.push({ code: 'has-block', offset: span.start, endOffset: span.end })
  }
  w.diagnostics.push(...diagnostics)
  const text = renderEmissions(plan.emissions)
  const source = w.positionAt(span.start)
  w.edits.push({
    start: span.start,
    end: span.end,
    parts: text === '' ? [] : [{ text, source }],
  })
}

/**
 * Wraps a run of the rule's own declarations in `& { }`, in front of its first declaration and
 * after its last. When the run ends an unclosed block, the closing text goes with the end of input,
 * where whatever the input left open (a string, a bracket, a declaration) is closed first.
 */
function applyWrap(w: Walker, plan: WrapItem, facts: RuleFrameFacts): void {
  const first = facts.model.itemOf[plan.refs[0]!]!
  const last = facts.model.itemOf[plan.refs.at(-1)!]!
  const directive = facts.model.itemOf[plan.after]!
  const source = w.positionAt(w.tokens[directive.start]!.startIndex)
  const open = w.tokens[first.start]!.startIndex
  w.edits.push({ start: open, end: open, parts: [{ text: '& { ', source }] })
  if (!facts.isClosed && last === facts.items.at(-1)) {
    facts.endParts.push({ text: ' }', source })
    return
  }
  const close = declarationEnd(w, last)
  w.edits.push({ start: close, end: close, parts: [{ text: ' }', source }] })
}

/**
 * Applies one plan item.
 */
function applyItem(w: Walker, plan: PlanItem, facts: RuleFrameFacts): void {
  if (plan.kind === 'expand') applyExpand(w, plan, facts.model.itemOf)
  else if (plan.kind === 'wrap') applyWrap(w, plan, facts)
}

/**
 * Records the warnings of a plan at the offsets they sit at in the stylesheet.
 */
function recordWarnings(
  w: Walker,
  warnings: readonly PlanWarning[],
  itemOf: readonly Item[],
): void {
  for (const { anchor, text } of warnings) {
    const item = itemOf[anchor.ref]!
    const start =
      anchor.offset === undefined
        ? w.tokens[item.start]!.startIndex
        : (item.preludeOffset ?? 0) + anchor.offset
    w.warnings.push({ offset: start, text })
  }
}

/**
 * Plans the rule whose block holds `facts.items`, and applies the plan to the text.
 */
export function applyRuleFrame(w: Walker, facts: RuleFrameFacts): void {
  let plan: RulePlan
  try {
    plan = planRule({
      selector: facts.selector,
      nodes: facts.model.nodes,
      isInsideKeyframes: facts.isInsideKeyframes,
      extend: w.options.extend,
      reportStaleMarkers: w.options.reportStaleMarkers,
      emittedCache: w.emittedCache,
      outward: { identityOf: (ref) => facts.model.itemOf[ref]!.start, known: w.outwardKnown },
    })
  } catch (error) {
    throw error instanceof DirectiveFailure ? error.cause : error
  }
  for (const finding of plan.outwardFindings) {
    const key = facts.model.itemOf[finding.unit.directive.ref]!.start
    w.outwardKnown.set(key, [...(w.outwardKnown.get(key) ?? []), finding])
  }
  recordWarnings(w, plan.warnings, facts.model.itemOf)
  for (const item of plan.items) applyItem(w, item, facts)
}
