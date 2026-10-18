/**
 * The host-free shape of one style rule that holds `@nave` directives: what a host reads out of
 * its own tree (a PostCSS rule, a run of tokens) into plain data, and what `planRule()` hands back
 * for the host to apply. A host stamps each node with a `ref` of its own choosing (an index into
 * its own table of nodes) and gets the same `ref` back, so the core never touches a host node.
 */
import type { Diagnostic } from './diagnostics-types.ts'
import type { AnchoredBlock, Declaration } from './plan.ts'
import type { ExtendMap } from './resolve.ts'

export type NodeRef = number

export interface DeclNode {
  readonly kind: 'decl'
  readonly ref: NodeRef
  readonly prop: string
  readonly value: string
  readonly important: boolean
}

export interface CommentNode {
  readonly kind: 'comment'
  readonly ref: NodeRef
}

export interface StyleRuleNode {
  readonly kind: 'rule'
  readonly ref: NodeRef
  readonly selector: string
  readonly nodes: readonly ModelNode[]
}

/**
 * A conditional group at-rule (`@media`, `@container`, `@supports`) whose content is read.
 */
export interface GroupNode {
  readonly kind: 'group'
  readonly ref: NodeRef
  readonly name: string
  readonly prelude: string
  readonly nodes: readonly ModelNode[]
}

/**
 * Any other at-rule: it is a nested node, and its content is not read.
 */
export interface OpaqueNode {
  readonly kind: 'opaque'
  /**
  The at-rule's name and prelude as written, `''` when the node is not an at-rule.
   */
  readonly name: string
  readonly prelude: string
  readonly ref: NodeRef
}

export interface DirectiveNode {
  readonly kind: 'directive'
  readonly ref: NodeRef
  readonly prelude: string
}

export type ModelNode =
  CommentNode | DeclNode | DirectiveNode | GroupNode | OpaqueNode | StyleRuleNode

export interface RuleInput {
  /**
  The rule's own selector list, as authored.
   */
  readonly selector: string
  readonly nodes: readonly ModelNode[]
  readonly isInsideKeyframes: boolean
  readonly extend?: ExtendMap | undefined
  /**
  Whether a marker that covers nothing is reported (the default). A host that cannot tell whether an earlier stage moved a rule's content turns it off.
   */
  readonly reportStaleMarkers?: boolean | undefined
}

/**
 * Declarations one directive emits, bare or inside one `& { }`.
 */
export interface DeclarationsEmission {
  readonly kind: 'declarations'
  readonly declarations: readonly Declaration[]
  readonly isWrapped: boolean
}

export interface BlockEmission {
  readonly kind: 'block'
  readonly block: AnchoredBlock
}

export type Emission = BlockEmission | DeclarationsEmission

/**
 * A node of the rule that stays where it is.
 */
export interface KeepItem {
  readonly kind: 'keep'
  readonly ref: NodeRef
}

/**
 * A run of the rule's own declarations (and the comments between them) to wrap in one `& { }`.
 * `after` is the directive the wrapper is written for, whose source it takes.
 */
export interface WrapItem {
  readonly kind: 'wrap'
  readonly refs: readonly NodeRef[]
  readonly after: NodeRef
}

/**
 * A directive, replaced by `emissions` in the order they are listed.
 */
export interface ExpandItem {
  readonly kind: 'expand'
  readonly ref: NodeRef
  readonly emissions: readonly Emission[]
  readonly diagnostics: readonly Diagnostic[]
}

export type PlanItem = ExpandItem | KeepItem | WrapItem

/**
 * Where a warning is reported: a node of the rule, and, for a name inside a directive's prelude,
 * where in the prelude the name starts.
 */
export interface WarningAnchor {
  readonly offset: number | undefined
  readonly ref: NodeRef
}

/**
 * A warning about the rule: its text without the host's frame, and where it sits. A warning
 * reports and never fails a build.
 */
export interface PlanWarning {
  readonly anchor: WarningAnchor
  readonly text: string
}

export interface RulePlan {
  /**
  Every child of the rule exactly once, in authored order.
   */
  readonly items: readonly PlanItem[]
  readonly warnings: readonly PlanWarning[]
}
