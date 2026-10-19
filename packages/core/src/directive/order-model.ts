/**
 * The facts the order check works on. A rule's output is a sequence of top-level nodes, each
 * either something the author wrote or part of what a directive expanded to; a conditional block
 * of an atom is broken into units (one selector under one condition), and everything after it
 * that can set a property on the same element is broken into candidates. A finding is a unit and
 * a candidate that the cascade lets the candidate win by order alone.
 */
import type { ConditionRule } from './condition-overlap.ts'
import type { NodeRef } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

/**
 * A declaration with its `!important` split off the value.
 */
export interface OrderDeclaration {
  readonly important: boolean
  readonly prop: string
  readonly value: string
}

/**
 * One atom a directive named: its place in the prelude and its position in the directive.
 */
export interface AtomFacts {
  readonly atomIndex: number
  readonly name: string
  readonly offset: number
  readonly endOffset: number
}

/**
 * The directive an atom came from, as far as a message needs it.
 */
export interface DirectiveFacts {
  readonly atoms: readonly AtomFacts[]
  readonly ref: NodeRef
  readonly prelude: string
}

/**
 * One selector under one condition inside an atom's conditional block.
 */
export interface Unit {
  readonly atom: AtomFacts
  readonly conditions: readonly ConditionRule[]
  readonly declarations: readonly OrderDeclaration[]
  readonly directive: DirectiveFacts
  readonly selector: string
  readonly specificities: readonly Specificity[]
}

/**
 * Who a later declaration belongs to.
 */
export type Overrider = AtomOverrider | OwnOverrider

/**
 * A declaration of a later atom: bare, or inside one of its blocks.
 */
interface AtomOverrider {
  readonly atom: AtomFacts
  readonly directive: DirectiveFacts
  readonly isBlock: boolean
  readonly kind: 'atom'
}

/**
 * A declaration the rule itself holds after the directive, directly or inside a nested node.
 * `topRef` is the child of the rule that holds it, and `top` says what that child is.
 */
interface OwnOverrider {
  readonly kind: 'own'
  readonly top: OwnTop
  readonly topRef: NodeRef
}

type OwnTop =
  | { readonly kind: 'declaration' }
  | { readonly kind: 'group'; readonly name: string; readonly prelude: string }
  | { readonly kind: 'rule'; readonly selector: string }

/**
 * A later declaration that sets a property on the element: its selector's possible
 * specificities, the conditions around it, and who it belongs to.
 */
export interface Candidate {
  readonly conditions: readonly ConditionRule[]
  readonly declaration: OrderDeclaration
  /**
  The selector of the nested rule that holds the declaration directly, `&` when it is on the rule itself.
   */
  readonly holderSelector: string
  readonly overrider: Overrider
  /**
  The declarations of the block the declaration is written in, itself included.
   */
  readonly siblings: readonly OrderDeclaration[]
  readonly specificities: readonly Specificity[]
}

/**
 * The declarations of a unit and a candidate that relate and differ.
 */
export interface RelatedPair {
  readonly block: OrderDeclaration
  readonly later: OrderDeclaration
}

/**
 * A unit and a candidate the cascade lets the candidate win by order alone.
 */
export interface Finding {
  readonly candidate: Candidate
  /**
  Set for a directive written inside a nested rule and paired with what the enclosing rule holds after it: the block of that rule that holds the directive, as a warning names it.
   */
  readonly outward?: { readonly above: string }
  readonly pairs: readonly RelatedPair[]
  readonly unit: Unit
}
