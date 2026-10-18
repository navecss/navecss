import type { Segment } from './order-check.ts'
/**
 * What `planRule()` keeps while it walks a rule: the plan so far, whether a nested node is already
 * in the output, and the facts the warnings about wrapped runs need (which node a run follows and
 * what a rewrite that avoids the wrap would move).
 */
import type { AtomFacts, DirectiveFacts } from './order-model.ts'
import type { NodeRef, PlanItem, RuleInput } from './rule-model.ts'

import { isPseudoElementOnlyList } from './selector-specificity.ts'

export interface PendingRun {
  /**
  Declarations and the comments between them.
   */
  refs: NodeRef[]
  /**
  Comments after the last declaration, which belong to no run.
   */
  trailing: NodeRef[]
}

/**
 * The nested node nearest before a point of the output, as a warning names it.
 */
export interface NestedFact {
  /**
  The block of an atom of a directive, when the node is one.
   */
  readonly block?: { readonly atom: AtomFacts; readonly directive: DirectiveFacts }
  readonly text: string
}

/**
 * A wrapped run of the rule's own declarations.
 */
export interface OwnRunFact {
  readonly above: string
  readonly anchorRef: NodeRef
  readonly kind: 'own'
  readonly nested: string
}

/**
 * A wrapped run of the declarations a directive emits.
 */
export interface DirectiveRunFact {
  readonly above: string
  /**
  The atoms whose declarations form the run.
   */
  readonly atoms: readonly AtomFacts[]
  /**
  Whether the rewrite that puts the atoms of the run before the atom whose block they follow is offered.
   */
  readonly canReorder: boolean
  /**
  Whether the directive can be moved above `above`: no declaration of the rule's own sits between.
   */
  readonly canMoveDirective: boolean
  readonly directive: DirectiveFacts
  /**
  The atom of the directive whose block the run follows, with where that block holds.
   */
  readonly follows: { readonly atom: AtomFacts; readonly where: string } | undefined
  /**
  Whether the previous release already wrapped the run (a nested node of the rule's own precedes the directive).
   */
  readonly isWrappedBefore: boolean
  readonly kind: 'directive'
  readonly nested: NestedFact
}

export type RunFact = DirectiveRunFact | OwnRunFact

/**
 * The blocks a directive leaves out of a rule whose every selector is a pseudo-element.
 */
export interface DroppedFact {
  readonly atoms: readonly {
    readonly atom: AtomFacts
    readonly declarations: readonly { readonly prop: string; readonly value: string }[]
    readonly wheres: readonly string[]
  }[]
  readonly directive: DirectiveFacts
}

export interface PlanState {
  /**
  Where the first nested node of the output is, as a warning names it, once there is one.
   */
  above: string | undefined
  readonly directives: DirectiveFacts[]
  readonly dropped: DroppedFact[]
  /**
  How many directives the rule holds.
   */
  readonly directiveTotal: number
  /**
  Whether a nested node of the rule's own (not one a directive emitted) is in the output.
   */
  hasOwnNested: boolean
  readonly input: RuleInput
  /**
  Whether a nested node (a rule, an at-rule, an emitted block) is already in the output.
   */
  isNested: boolean
  readonly isPseudoElementRule: boolean
  lastDirective: NodeRef | undefined
  lastNested: NestedFact | undefined
  /**
  Whether a declaration of the rule's own was written since `above` was set.
   */
  ownDeclarationSinceAbove: boolean
  readonly items: PlanItem[]
  readonly run: PendingRun
  readonly runs: RunFact[]
  readonly segments: Segment[]
}

/**
 * The state at the start of a rule.
 */
export function createState(input: RuleInput): PlanState {
  return {
    above: undefined,
    directives: [],
    dropped: [],
    directiveTotal: input.nodes.filter((node) => node.kind === 'directive').length,
    hasOwnNested: false,
    input,
    isNested: false,
    isPseudoElementRule: isPseudoElementOnlyList(input.selector),
    items: [],
    lastDirective: undefined,
    lastNested: undefined,
    ownDeclarationSinceAbove: false,
    run: { refs: [], trailing: [] },
    runs: [],
    segments: [],
  }
}
