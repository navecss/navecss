/**
 * Where everything in a rule that holds `@nave` directives goes. Each directive expands at its own
 * position, atom by atom, as `@apply --a; @apply --b;` will: an atom's declarations, then its
 * blocks, then the next atom's. What the rule says outside a directive keeps its authored order.
 * A run of declarations that follows a nested node is written inside one `& { }`, since a bare
 * declaration after a nested rule reads as part of that rule in an engine without nested
 * declarations (the Baseline 2024 floor).
 */
import type { DirectiveFacts } from './order-model.ts'
import type {
  DirectiveNode,
  Emission,
  ModelNode,
  NodeRef,
  PlanItem,
  PlanWarning,
  RuleInput,
  RulePlan,
} from './rule-model.ts'

import { checkOrder, type Segment } from './order-check.ts'
import { findingWarnings, markerWarnings } from './order-warnings.ts'
import { type Declaration, plan, type PlannedAtom, type PlanResult } from './plan.ts'
import { ampersandSpecificity, isPseudoElementOnlyList } from './selector-specificity.ts'

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

interface PendingRun {
  /**
  Declarations and the comments between them.
   */
  refs: NodeRef[]
  /**
  Comments after the last declaration, which belong to no run.
   */
  trailing: NodeRef[]
}

interface PlanState {
  readonly input: RuleInput
  readonly items: PlanItem[]
  readonly run: PendingRun
  readonly isPseudoElementRule: boolean
  /**
  Whether a nested node (a rule, an at-rule, an emitted block) is already in the output.
   */
  isNested: boolean
  /**
  The nearest directive before this point, once there is one.
   */
  lastDirective: NodeRef | undefined
  /**
  The directives so far, and the parts of the output in order, for the order check.
   */
  readonly directives: DirectiveFacts[]
  readonly segments: Segment[]
}

/**
 * Whether an own run is written inside `& { }`: only after a directive, only after a nested node,
 * and never in a rule whose every selector is a pseudo-element, where `&` matches nothing.
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
  } else if (run.refs.length === 0) {
    state.items.push({ kind: 'keep', ref: node.ref })
  } else {
    run.trailing.push(node.ref)
  }
}

/**
 * Flushes `declarations` as one emission, wrapped when a nested node precedes it.
 */
function flushDeclarations(
  declarations: Declaration[],
  isWrapped: boolean,
  emissions: Emission[],
): void {
  if (declarations.length === 0) return
  emissions.push({ kind: 'declarations', declarations: [...declarations], isWrapped })
  declarations.length = 0
}

/**
 * One atom's contribution: its declarations join the run in progress, and its blocks end that run.
 */
function emitAtom(
  state: PlanState,
  atom: PlannedAtom,
  pending: Declaration[],
  out: Emission[],
): void {
  pending.push(...atom.declarations)
  if (atom.blocks.length === 0 || state.isPseudoElementRule) return
  flushDeclarations(pending, state.isNested, out)
  for (const block of atom.blocks) out.push({ kind: 'block', block })
  state.isNested = true
}

/**
 * Adds the parts one directive puts in the output to the order check's view of it, in output order.
 */
function recordSegments(
  state: PlanState,
  directive: DirectiveFacts,
  atoms: readonly PlannedAtom[],
): void {
  for (const [atomIndex, planned] of atoms.entries()) {
    const atom = directive.atoms[atomIndex]!
    if (planned.declarations.length > 0) {
      state.segments.push({
        kind: 'atom-declarations',
        directive,
        atom,
        declarations: planned.declarations,
      })
    }
    if (state.isPseudoElementRule) continue
    for (const block of planned.blocks)
      state.segments.push({ kind: 'atom-block', directive, atom, block })
  }
}

/**
 * The emissions of every atom a directive named, in order.
 */
function emitAtoms(state: PlanState, atoms: readonly PlannedAtom[]): Emission[] {
  const emissions: Emission[] = []
  const pending: Declaration[] = []
  for (const atom of atoms) emitAtom(state, atom, pending, emissions)
  flushDeclarations(pending, state.isNested && !state.isPseudoElementRule, emissions)
  return emissions
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
 * What a warning needs to know about a directive.
 */
function directiveFacts(node: DirectiveNode, result: PlanResult): DirectiveFacts {
  return {
    ref: node.ref,
    prelude: node.prelude,
    atoms: result.atoms.map((atom, atomIndex) => ({
      atomIndex,
      name: atom.name,
      offset: atom.offset,
      endOffset: atom.endOffset,
    })),
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
    emissions: emitAtoms(state, result.atoms),
    diagnostics: result.diagnostics,
  })
  state.lastDirective = node.ref
}

/**
 * The warnings about the rule: where later content overrides an atom's block, and what is wrong
 * with a marker.
 */
function warningsOf(state: PlanState): PlanWarning[] {
  const amp = ampersandSpecificity(state.input.selector)
  const findings = checkOrder(state.segments, amp)
  const warnings = [...findingWarnings(findings), ...markerWarnings(state.directives, findings)]
  return warnings.toSorted(
    (a, b) => a.anchor.ref - b.anchor.ref || (a.anchor.offset ?? -1) - (b.anchor.offset ?? -1),
  )
}

/**
 * Plans the rule `input`: every child once, in authored order, each directive replaced by what it
 * emits and each run of the rule's own declarations that needs it marked for wrapping.
 */
export function planRule(input: RuleInput): RulePlan {
  const state: PlanState = {
    input,
    items: [],
    run: { refs: [], trailing: [] },
    isPseudoElementRule: isPseudoElementOnlyList(input.selector),
    isNested: false,
    lastDirective: undefined,
    directives: [],
    segments: [],
  }
  for (const node of input.nodes) {
    if (node.kind === 'decl' || node.kind === 'comment') {
      takeIntoRun(state, node)
    } else if (node.kind === 'directive') {
      expandDirective(state, node)
    } else {
      flushRun(state)
      state.items.push({ kind: 'keep', ref: node.ref })
      state.isNested = true
    }
    if (node.kind !== 'comment' && node.kind !== 'directive') {
      state.segments.push({ kind: 'own', node })
    }
  }
  flushRun(state)
  return { items: state.items, warnings: warningsOf(state) }
}
