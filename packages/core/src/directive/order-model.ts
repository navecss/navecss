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
  /**
  Where the block holds, as a warning says it, when the selector alone does not say it: the selector with the rules around the directive folded in. Specificity is read from `selector`.
   */
  readonly placeSelector?: string
  /**
  The states of `placeSelector` that are already said: those of the block's own selector and of the rules on the path that are one compound.
   */
  readonly placeStates?: readonly string[]
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
  Whether the move this finding's warning would print, made and checked again, no longer finds this pair and finds no new one. Set by the order check, and asked only for a warning that is printed; a move is printed only where it holds.
   */
  readonly canMove?: () => boolean
  /**
  Set for a directive written inside a nested rule and paired with what an enclosing rule holds after it: how the warning names the block of that rule that holds the directive (`above`), the later block that overrides it (`overrider`, when the overrider is a block), the child of the rule that holds the directive (`top`) and, when the pair is read inside a conditional group, that group and the child of it that holds the directive (`level`).
   */
  readonly outward?: {
    readonly above: string
    readonly level?: { readonly container: NodeRef; readonly group: NodeRef }
    readonly overrider: string | undefined
    readonly top: NodeRef
  }
  readonly pairs: readonly RelatedPair[]
  readonly unit: Unit
}
