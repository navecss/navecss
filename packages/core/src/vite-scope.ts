/**
 * A first-party scope walk over the ESTree `this.parse` returns (the host hands no scope
 * information, and the plugin takes no dependency). It resolves every identifier reference to the
 * binding that declares it, with `var` and function hoisting, block scoping for `let`, `const`,
 * `class` and block-level functions (a module is strict), and each binding's write count, which is
 * all the collector needs to decide whether a `cx` import is shadowed and whether a name bound to
 * a string is the only value it ever holds.
 */
import type { AstNode } from './vite-ast.ts'
import type { Binding, Reference, Scope, ScopeAnalysis, Walker } from './vite-scope-types.ts'

import { nodesAt, stringAt } from './vite-ast.ts'
import { newScope } from './vite-scope-types.ts'
import { visit } from './vite-scope-walk.ts'

export type { Binding, Reference, ScopeAnalysis } from './vite-scope-types.ts'

/**
 * The binding `name` resolves to from `scope`, searching outward.
 */
function lookup(scope: Scope, name: string): Binding | undefined {
  for (let current: Scope | undefined = scope; current; current = current.parent) {
    const found = current.bindings.get(name)
    if (found) return found
  }
  return undefined
}

/**
 * Resolves `reference` to its binding, counting a write.
 */
function resolve(reference: Reference): void {
  const name = stringAt(reference.node, 'name')
  reference.binding = name === undefined ? undefined : lookup(reference.scope, name)
  if (reference.binding && reference.isWrite) reference.binding.writes += 1
}

/**
 * The kinds of binding an assignment can change: a `const` and an import are read-only, so an
 * `eval` that assigns one only throws.
 */
const ASSIGNABLE: ReadonlySet<string> = new Set([
  'catch',
  'class',
  'function',
  'let',
  'loop',
  'param',
  'var',
])

/**
 * The bindings of `scope` that an assignment can change.
 */
function assignable(scope: Scope): Binding[] {
  return scope.bindings
    .values()
    .filter((binding) => ASSIGNABLE.has(binding.kind))
    .toArray()
}

/**
 * Counts a write to every binding a direct `eval` can see and assign: its text may assign any of
 * them.
 */
function markEvalWrites(scopes: readonly Scope[]): void {
  const marked = new Set<Scope>()
  for (const start of scopes) {
    // Every scope above a marked one is marked already.
    for (let scope: Scope | undefined = start; scope && !marked.has(scope); scope = scope.parent) {
      marked.add(scope)
      for (const binding of assignable(scope)) binding.writes += 1
    }
  }
}

/**
 * Resolves every reference in `program` to its binding.
 */
export function analyze(program: AstNode): ScopeAnalysis {
  const walker: Walker = {
    references: [],
    parentOf: new Map(),
    evalScopes: [],
    visit: (node, scope) => {
      visit(node, scope, walker)
    },
  }
  const module = newScope(undefined, true)
  for (const statement of nodesAt(program, 'body')) {
    walker.parentOf.set(statement, program)
    visit(statement, module, walker)
  }
  const byNode = new Map<AstNode, Reference>()
  for (const reference of walker.references) {
    resolve(reference)
    byNode.set(reference.node, reference)
  }
  // A local named `eval` is no direct eval.
  markEvalWrites(walker.evalScopes.filter((scope) => !lookup(scope, 'eval')))
  return {
    references: walker.references,
    parentOf: walker.parentOf,
    referenceOf: (node) => byNode.get(node),
  }
}
