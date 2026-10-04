/**
 * The shapes the scope walk builds, and the three moves it makes on them: a new scope, a
 * declaration, and a reference.
 */
import type { AstNode } from './vite-ast.ts'

export type BindingKind =
  'catch' | 'class' | 'const' | 'function' | 'import' | 'let' | 'loop' | 'param' | 'var'

export interface Binding {
  readonly name: string
  readonly kind: BindingKind
  /**
   * The initialiser of a plain `name = init` declarator; absent for every other way to bind.
   */
  init?: AstNode
  writes: number
  /**
   * For a parameter: the function that declares it.
   */
  owner?: AstNode
  /**
   * For an import: the module it names and the name it takes from it (`*` for a namespace).
   */
  readonly source?: string
  readonly imported?: string
}

export interface Scope {
  readonly parent: Scope | undefined
  readonly isFunction: boolean
  readonly bindings: Map<string, Binding>
}

export interface Reference {
  readonly node: AstNode
  readonly scope: Scope
  readonly isWrite: boolean
  binding: Binding | undefined
}

export interface ScopeAnalysis {
  readonly references: readonly Reference[]
  readonly parentOf: ReadonlyMap<AstNode, AstNode>
  /**
   * The resolved reference an identifier node is, if it is one.
   */
  referenceOf(node: AstNode): Reference | undefined
}

export interface Walker {
  readonly references: Reference[]
  readonly parentOf: Map<AstNode, AstNode>
  /**
   * The scopes a direct `eval` call sits in: it can write any binding they can see.
   */
  readonly evalScopes: Scope[]
  /**
   * Walks `node` as an expression or statement in `scope`.
   */
  visit(node: AstNode | undefined, scope: Scope): void
}

/**
 * A new scope under `parent`.
 */
export function newScope(parent: Scope | undefined, isFunction: boolean): Scope {
  return { parent, isFunction, bindings: new Map() }
}

/**
 * The nearest function-like scope at or above `scope`, where `var` hoists to.
 */
export function functionScopeOf(scope: Scope): Scope {
  let current = scope
  while (!current.isFunction && current.parent) current = current.parent
  return current
}

/**
 * Declares a binding in `scope`. A second declaration of the same name is a write to the first,
 * unless it assigns nothing (`var name` after `var name = 'flex'`).
 */
export function declare(scope: Scope, binding: Binding, isAssigning = true): Binding {
  const existing = scope.bindings.get(binding.name)
  if (existing) {
    if (isAssigning) existing.writes += 1
    return existing
  }
  scope.bindings.set(binding.name, binding)
  return binding
}

/**
 * Records `node` as a reference made from `scope`.
 */
export function reference(walker: Walker, node: AstNode, scope: Scope, isWrite = false): void {
  walker.references.push({ node, scope, isWrite, binding: undefined })
}
