/**
 * Binding patterns and assignment targets: the identifiers a `let`, a parameter or an assignment
 * introduces or writes, with the expressions inside the pattern (computed keys, default values)
 * walked in the scope they are evaluated in.
 */
import type { AstNode } from './vite-ast.ts'
import type { Binding, BindingKind, Scope, Walker } from './vite-scope-types.ts'

import { nodeAt, nodesAt, stringAt } from './vite-ast.ts'
import { declare, functionScopeOf, reference } from './vite-scope-types.ts'

export interface BindingSpec {
  readonly kind: BindingKind
  readonly init?: AstNode
  /**
   * Whether the declaration assigns what it declares, with no initialiser of the plain form: a
   * destructuring declarator, or the head of a loop, which assigns on every pass.
   */
  readonly isAssigned?: boolean
  /**
   * For a parameter: the function that declares it.
   */
  readonly owner?: AstNode
}

type PatternReader<Result> = (
  pattern: AstNode,
  result: Result,
  scope: Scope,
  walker: Walker,
) => void

/**
 * The property or element nodes a pattern holds, whichever kind it is.
 */
function partsOf(pattern: AstNode): AstNode[] {
  return nodesAt(pattern, pattern.type === 'ArrayPattern' ? 'elements' : 'properties')
}

/**
 * The pattern a property of an object pattern binds (its value, or the rest element itself).
 */
function targetOf(part: AstNode): AstNode | undefined {
  return part.type === 'Property' ? nodeAt(part, 'value') : part
}

/**
 * Where a binding of this kind lives: `var` hoists to the function, the rest stay in `scope`.
 */
function functionScopeOrHere(spec: BindingSpec, scope: Scope): Scope {
  return spec.kind === 'var' ? functionScopeOf(scope) : scope
}

/**
 * Declares the identifiers of the pattern `pattern` and walks the expressions inside it.
 */
export function declarePattern(
  pattern: AstNode | undefined,
  spec: BindingSpec,
  scope: Scope,
  walker: Walker,
): void {
  if (!pattern) return
  const name = stringAt(pattern, 'name')
  if (name !== undefined && pattern.type === 'Identifier') {
    const into = functionScopeOrHere(spec, scope)
    const isAssigning = spec.kind !== 'var' || spec.init !== undefined || spec.isAssigned === true
    const binding: Binding = { name, kind: spec.kind, writes: 0 }
    if (spec.owner) binding.owner = spec.owner
    const declared = declare(into, binding, isAssigning)
    if (spec.init) declared.init = spec.init
    return
  }
  DECLARE[pattern.type]?.(pattern, spec, scope, walker)
}

const DECLARE: Readonly<Record<string, PatternReader<BindingSpec>>> = {
  AssignmentPattern: (pattern, spec, scope, walker) => {
    declarePattern(nodeAt(pattern, 'left'), spec, scope, walker)
    walker.visit(nodeAt(pattern, 'right'), scope)
  },
  RestElement: (pattern, spec, scope, walker) => {
    declarePattern(nodeAt(pattern, 'argument'), spec, scope, walker)
  },
  ArrayPattern: (pattern, spec, scope, walker) => {
    for (const part of partsOf(pattern)) declarePattern(part, spec, scope, walker)
  },
  ObjectPattern: (pattern, spec, scope, walker) => {
    for (const part of partsOf(pattern)) {
      if (part.computed === true) walker.visit(nodeAt(part, 'key'), scope)
      declarePattern(targetOf(part), spec, scope, walker)
    }
  },
}

/**
 * Marks every identifier an assignment target writes, walking member targets as expressions.
 */
export function writeTargets(target: AstNode | undefined, scope: Scope, walker: Walker): void {
  if (!target) return
  if (target.type === 'Identifier') {
    reference(walker, target, scope, true)
    return
  }
  const write = WRITE[target.type]
  if (write) write(target, undefined, scope, walker)
  else walker.visit(target, scope)
}

const WRITE: Readonly<Record<string, PatternReader<undefined>>> = {
  ArrayPattern: (target, _result, scope, walker) => {
    for (const part of partsOf(target)) writeTargets(part, scope, walker)
  },
  ObjectPattern: (target, _result, scope, walker) => {
    for (const part of partsOf(target)) {
      if (part.computed === true) walker.visit(nodeAt(part, 'key'), scope)
      writeTargets(targetOf(part), scope, walker)
    }
  },
  AssignmentPattern: (target, _result, scope, walker) => {
    writeTargets(nodeAt(target, 'left'), scope, walker)
    walker.visit(nodeAt(target, 'right'), scope)
  },
  RestElement: (target, _result, scope, walker) => {
    writeTargets(nodeAt(target, 'argument'), scope, walker)
  },
}
