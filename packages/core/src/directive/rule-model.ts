/**
 * The host-free shape of one style rule that holds `@nave` directives: what a host reads out of
 * its own tree (a PostCSS rule, a run of tokens) into plain data, and what `planRule()` hands back
 * for the host to apply. A host stamps each node with a `ref` of its own choosing (an index into
 * its own table of nodes) and gets the same `ref` back, so the core never touches a host node.
 */
import type { Diagnostic } from './diagnostics-types.ts'
import type { Finding } from './order-model.ts'
import type { AnchoredBlock, Declaration, PlannedAtom } from './plan.ts'
import type { ExtendMap } from './resolve.ts'

export type NodeRef = number

interface DeclNode {
  readonly kind: 'decl'
  readonly ref: NodeRef
  readonly prop: string
  readonly value: string
  readonly important: boolean
}

interface CommentNode {
  readonly kind: 'comment'
  readonly ref: NodeRef
}

interface StyleRuleNode {
  readonly kind: 'rule'
  readonly ref: NodeRef
  readonly selector: string
  readonly nodes: readonly ModelNode[]
}

/**
 * A conditional group at-rule (`@media`, `@container`, `@supports`) whose content is read.
 */
interface GroupNode {
  readonly kind: 'group'
  readonly ref: NodeRef
  readonly name: string
  readonly prelude: string
  readonly nodes: readonly ModelNode[]
}

/**
 * Any other at-rule: it is a nested node, and its content is not read.
 */
interface OpaqueNode {
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
  /**
  What a directive written inside a nested rule emits, kept by the host while it plans one tree of rules (the text expander keeps it for the whole stylesheet) so a directive written the same way is planned once however many rules around it read it. Keyed by the directive's prelude and whether it sits inside `@keyframes`.
   */
  readonly emittedCache?: Map<string, PlannedDirective> | undefined
  /**
  What the rules around this one already found: the host's identity for a node (the same value for the same directive in every plan of one stylesheet), and, by that identity, the warnings an enclosing rule found for a directive written in this one (R4's outward pairs), so a marker on that directive is not called stale for covering them.
   */
  readonly outward?: OutwardContext | undefined
}

export interface OutwardContext {
  readonly identityOf: (ref: NodeRef) => unknown
  readonly known: ReadonlyMap<unknown, readonly Finding[]>
}

/**
 * A directive planned for the order check: its atoms, and the nodes it emits in a style rule.
 */
export interface PlannedDirective {
  readonly atoms: readonly PlannedAtom[]
  readonly nodes: readonly ModelNode[]
}

/**
 * Declarations one directive emits, bare or inside one `& { }`.
 */
interface DeclarationsEmission {
  readonly kind: 'declarations'
  readonly declarations: readonly Declaration[]
  readonly isWrapped: boolean
}

interface BlockEmission {
  readonly kind: 'block'
  readonly block: AnchoredBlock
}

export type Emission = BlockEmission | DeclarationsEmission

/**
 * A node of the rule that stays where it is.
 */
interface KeepItem {
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
interface WarningAnchor {
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
  The findings of this rule's pairs for a directive written inside a nested rule (R4's outward pairs), for the host to hand on to the plan of the rule that holds that directive.
   */
  readonly outwardFindings: readonly Finding[]
  /**
  Every child of the rule exactly once, in authored order.
   */
  readonly items: readonly PlanItem[]
  readonly warnings: readonly PlanWarning[]
}
