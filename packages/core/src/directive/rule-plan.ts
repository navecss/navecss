/**
 * Where everything in a rule that holds `@nave` directives goes. Each directive expands at its own
 * position, atom by atom, as `@apply --a; @apply --b;` will: an atom's declarations, then its
 * blocks, then the next atom's. What the rule says outside a directive keeps its authored order.
 * A run of declarations that follows a nested node is written inside one `& { }`, since a bare
 * declaration after a nested rule reads as part of that rule in an engine without nested
 * declarations (the Baseline 2024 floor). The rule's own declarations before its first directive
 * are not touched.
 */
import type { DirectiveFacts, Finding } from './order-model.ts'
import type { DirectiveNode, ModelNode, NodeRef, RuleInput, RulePlan } from './rule-model.ts'
import type { PlanState } from './rule-state.ts'

import { checkOrder } from './order-check.ts'
import { plannedDirective } from './order-emitted.ts'
import { nestedText } from './order-outward-names.ts'
import { findingWarnings, markerWarnings } from './order-warnings.ts'
import { plan, type PlanResult } from './plan.ts'
import { directiveFacts, emitAtoms, recordSegments } from './rule-emit.ts'
import { createState } from './rule-state.ts'
import { ampersandSpecificity } from './selector-specificity.ts'
import { shapeWarnings } from './shape-warnings.ts'

/**
 * A directive that could not be planned at all (an atom registered without a declarations
 * object), with the directive it happened on, for a host to position the error.
 */
export class DirectiveFailure extends Error {
  override readonly cause: unknown
  readonly ref: NodeRef

  constructor(ref: NodeRef, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.ref = ref
    this.cause = cause
  }
}

/**
 * Whether an own run is written inside `& { }`: only after the first directive, only after a
 * nested node, and never in a rule whose every selector is a pseudo-element, where `&` matches
 * nothing.
 */
function isRunWrapped(state: PlanState): boolean {
  return state.lastDirective !== undefined && state.isNested && !state.isPseudoElementRule
}

/**
 * Closes the pending run: wrapped as one, or each node kept, then the comments after it kept.
 */
function flushRun(state: PlanState): void {
  const { run, items } = state
  if (run.refs.length > 0) {
    if (isRunWrapped(state)) {
      items.push({ kind: 'wrap', refs: run.refs, after: state.lastDirective! })
      state.runs.push({
        kind: 'own',
        anchorRef: run.refs[0]!,
        above: state.above ?? '',
        nested: state.lastNested?.text ?? '',
      })
    } else {
      for (const ref of run.refs) items.push({ kind: 'keep', ref })
    }
  }
  for (const ref of run.trailing) items.push({ kind: 'keep', ref })
  run.refs = []
  run.trailing = []
}

/**
 * Takes a declaration or comment into the pending run.
 */
function takeIntoRun(state: PlanState, node: ModelNode): void {
  const { run } = state
  if (node.kind === 'decl') {
    run.refs.push(...run.trailing, node.ref)
    run.trailing = []
    if (state.above !== undefined) state.ownDeclarationSinceAbove = true
  } else if (run.refs.length === 0) {
    state.items.push({ kind: 'keep', ref: node.ref })
  } else {
    run.trailing.push(node.ref)
  }
}

/**
 * What `plan()` makes of one directive, a throw of its own reported with the directive it is on.
 */
function planDirective(state: PlanState, node: DirectiveNode): PlanResult {
  try {
    return plan(
      node.prelude,
      { isStyleRuleParent: true, isInsideKeyframes: state.input.isInsideKeyframes },
      { extend: state.input.extend },
    )
  } catch (error) {
    throw new DirectiveFailure(node.ref, error)
  }
}

/**
 * Expands one directive at its position.
 */
function expandDirective(state: PlanState, node: DirectiveNode): void {
  flushRun(state)
  const result = planDirective(state, node)
  const directive = directiveFacts(node, result)
  state.directives.push(directive)
  recordSegments(state, directive, result.atoms)
  state.items.push({
    kind: 'expand',
    ref: node.ref,
    emissions: emitAtoms(state, directive, result.atoms),
    diagnostics: result.diagnostics,
  })
  state.lastDirective = node.ref
}

/**
 * Keeps a nested node of the rule's own where it is.
 */
function keepNested(state: PlanState, node: ModelNode): void {
  flushRun(state)
  state.items.push({ kind: 'keep', ref: node.ref })
  state.isNested = true
  state.hasOwnNested = true
  state.lastNested = { text: nestedText(node) }
  state.above ??= nestedText(node)
}

/**
 * The warnings about the rule: where later content overrides an atom's block, what is wrong with
 * a marker, and what the shape of the output costs a selector list; and the findings that concern
 * a directive written in a nested rule, for the plan of that rule to know.
 */
function warningsOf(state: PlanState): Pick<RulePlan, 'outwardFindings' | 'warnings'> {
  const amp = ampersandSpecificity(state.input.selector)
  const { emittedCache, extend, isInsideKeyframes, outward } = state.input
  const findings = checkOrder(
    state.segments,
    amp,
    (directive) => plannedDirective(directive, { extend, isInsideKeyframes }, emittedCache),
    state.isPseudoElementRule,
  )
  const knownFor = (directive: DirectiveFacts): readonly Finding[] =>
    outward?.known.get(outward.identityOf(directive.ref)) ?? []
  const warnings = [
    ...findingWarnings(findings),
    ...markerWarnings(
      state.directives,
      findings,
      state.input.reportStaleMarkers !== false,
      knownFor,
    ),
    ...shapeWarnings(state),
  ]
  return {
    outwardFindings: findings.filter((finding) => finding.outward !== undefined),
    warnings: warnings.toSorted(
      (a, b) => a.anchor.ref - b.anchor.ref || (a.anchor.offset ?? -1) - (b.anchor.offset ?? -1),
    ),
  }
}

/**
 * Plans the rule `input`: every child once, in authored order, each directive replaced by what it
 * emits and each run of the rule's own declarations that needs it marked for wrapping.
 */
export function planRule(input: RuleInput): RulePlan {
  const state = createState(input)
  for (const node of input.nodes) {
    if (node.kind === 'decl' || node.kind === 'comment') takeIntoRun(state, node)
    else if (node.kind === 'directive') expandDirective(state, node)
    else keepNested(state, node)
    if (node.kind !== 'comment' && node.kind !== 'directive') {
      state.segments.push({ kind: 'own', node })
    }
  }
  flushRun(state)
  return { items: state.items, ...warningsOf(state) }
}
