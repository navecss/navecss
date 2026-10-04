/**
 * The walk itself: every node type that opens a scope, declares something, or holds an
 * identifier that is not a reference (a property name, a label) is handled here; every other node
 * is walked through its children.
 */
import type { AstNode } from './vite-ast.ts'
import type { Scope, Walker } from './vite-scope-types.ts'

import { childrenOf, isNode, nodeAt, nodesAt, stringAt } from './vite-ast.ts'
import { declarePattern, writeTargets } from './vite-scope-pattern.ts'
import { declare, newScope, reference } from './vite-scope-types.ts'

type Handler = (node: AstNode, scope: Scope, walker: Walker) => void

/**
 * Walks `node` as an expression or statement in `scope`.
 */
export function visit(node: AstNode | undefined, scope: Scope, walker: Walker): void {
  if (!node) return
  const handler = HANDLERS[node.type]
  if (handler) handler(node, scope, walker)
  else visitChildren(node, scope, walker)
}

/**
 * Walks every child of `node` in `scope`, registering its parent.
 */
function visitChildren(node: AstNode, scope: Scope, walker: Walker): void {
  for (const child of childrenOf(node)) {
    walker.parentOf.set(child, node)
    visit(child, scope, walker)
  }
}

/**
 * Walks the children of `node` named by `keys` in `scope`.
 */
function visitKeys(node: AstNode, keys: readonly string[], scope: Scope, walker: Walker): void {
  const children = keys.flatMap((key) => {
    const value = node[key]
    return (Array.isArray(value) ? value : [value]).filter((child) => isNode(child))
  })
  for (const child of children) {
    walker.parentOf.set(child, node)
    visit(child, scope, walker)
  }
}

/**
 * The keys of a member, property or method that hold expressions: the key only when computed.
 */
function expressionKeys(node: AstNode, others: readonly string[]): string[] {
  return node.computed === true ? ['key', ...others] : [...others]
}

/**
 * A `for (x in y)` / `for (x of y)` loop: the head binds in a scope of its own, and the iterable
 * is read in the scope around the loop, before the loop's binding exists.
 */
function visitLoop(node: AstNode, scope: Scope, walker: Walker): void {
  const inner = newScope(scope, false)
  const left = nodeAt(node, 'left')
  if (left?.type === 'VariableDeclaration') {
    const kind = left.kind === 'var' ? 'var' : 'loop'
    for (const declarator of nodesAt(left, 'declarations')) {
      declarePattern(nodeAt(declarator, 'id'), { kind, isAssigned: true }, inner, walker)
    }
  } else {
    writeTargets(left, inner, walker)
  }
  visitKeys(node, ['right'], scope, walker)
  visitKeys(node, ['body'], inner, walker)
}

/**
 * A function: the parameters (and their default values) live in one scope, entered after the
 * function's own name (for an expression) is bound in a scope around it, and a block body in a
 * scope of its own inside it, since a default value cannot see what the body declares.
 */
function visitFunction(node: AstNode, scope: Scope, walker: Walker): void {
  let outer = scope
  const id = nodeAt(node, 'id')
  if (id && node.type === 'FunctionExpression') {
    outer = newScope(scope, false)
    declare(outer, { name: stringAt(id, 'name') ?? '', kind: 'function', writes: 0 })
  }
  const parameters = newScope(outer, true)
  for (const param of nodesAt(node, 'params')) {
    declarePattern(param, { kind: 'param', owner: node }, parameters, walker)
  }
  const body = nodeAt(node, 'body')
  if (body?.type === 'BlockStatement') {
    walker.parentOf.set(body, node)
    visitChildren(body, newScope(parameters, true), walker)
  } else {
    visitKeys(node, ['body'], parameters, walker)
  }
}

/**
 * A class: the inner name binds in a scope around the heritage and the body.
 */
function visitClass(node: AstNode, scope: Scope, walker: Walker): void {
  const inner = newScope(scope, false)
  const name = stringAt(nodeAt(node, 'id') ?? node, 'name')
  if (name !== undefined) declare(inner, { name, kind: 'class', writes: 0 })
  visitKeys(node, ['superClass', 'body'], inner, walker)
}

/**
 * The imported name an import specifier takes.
 */
function importedName(specifier: AstNode): string {
  if (specifier.type === 'ImportNamespaceSpecifier') return '*'
  if (specifier.type !== 'ImportSpecifier') return 'default'
  const imported = nodeAt(specifier, 'imported')
  return stringAt(imported ?? specifier, 'name') ?? String(imported?.value)
}

/**
 * Declares what an import declaration binds.
 */
function declareImport(node: AstNode, scope: Scope): void {
  const source = String(nodeAt(node, 'source')?.value)
  for (const specifier of nodesAt(node, 'specifiers')) {
    const local = stringAt(nodeAt(specifier, 'local') ?? specifier, 'name')
    if (local === undefined) continue
    const imported = importedName(specifier)
    scope.bindings.set(local, { name: local, kind: 'import', writes: 0, source, imported })
  }
}

/**
 * `var`, `let` and `const` declarations: each declarator binds its pattern, and a plain
 * `name = init` records its initialiser.
 */
function visitDeclaration(node: AstNode, scope: Scope, walker: Walker): void {
  const kind = node.kind as 'const' | 'let' | 'var'
  for (const declarator of nodesAt(node, 'declarations')) {
    walker.parentOf.set(declarator, node)
    const id = nodeAt(declarator, 'id')
    const init = nodeAt(declarator, 'init')
    const hasPlainInit = id?.type === 'Identifier' && init !== undefined
    const spec = hasPlainInit ? { kind, init } : { kind, isAssigned: init !== undefined }
    declarePattern(id, spec, scope, walker)
    if (id) walker.parentOf.set(id, declarator)
    visit(init, scope, walker)
    if (init) walker.parentOf.set(init, declarator)
  }
}

/**
 * `export { a as b }` of local names: each local name is a reference.
 */
function visitExport(node: AstNode, scope: Scope, walker: Walker): void {
  if (node.source) return
  visitKeys(node, ['declaration'], scope, walker)
  for (const specifier of nodesAt(node, 'specifiers')) {
    const local = nodeAt(specifier, 'local')
    if (!local) continue
    walker.parentOf.set(specifier, node)
    walker.parentOf.set(local, specifier)
    reference(walker, local, scope)
  }
}

/**
 * A node whose identifiers are not references: nothing to walk.
 */
function leaf(): void {
  // A label, a meta property, or a re-export from another module names no binding here.
}

/**
 * Whether `node` calls `eval` by name, which runs its text in the calling scope. A parenthesised
 * `eval` is still direct; `(0, eval)` and a member are not.
 */
function isDirectEval(node: AstNode): boolean {
  let callee = nodeAt(node, 'callee')
  while (callee?.type === 'ParenthesizedExpression') callee = nodeAt(callee, 'expression')
  return callee?.type === 'Identifier' && stringAt(callee, 'name') === 'eval'
}

/**
 * A chain of binary or logical operators written left to right (`a + b + c`) is as deep as it is
 * long, so it is walked along its left spine instead of by recursion, in source order.
 */
function visitChain(node: AstNode, scope: Scope, walker: Walker): void {
  const spine: AstNode[] = []
  let current: AstNode | undefined = node
  while (current?.type === 'BinaryExpression' || current?.type === 'LogicalExpression') {
    spine.push(current)
    current = nodeAt(current, 'left')
  }
  const links = [...spine, ...(current ? [current] : [])]
  for (let index = 1; index < links.length; index += 1) {
    walker.parentOf.set(links[index]!, links[index - 1]!)
  }
  visit(current, scope, walker)
  for (const link of spine.toReversed()) visitKeys(link, ['right'], scope, walker)
}

const MEMBER_LIKE: Handler = (node, scope, walker) => {
  visitKeys(node, expressionKeys(node, ['value']), scope, walker)
}

const HANDLERS: Readonly<Record<string, Handler>> = {
  Identifier: (node, scope, walker) => {
    reference(walker, node, scope)
  },
  MemberExpression: (node, scope, walker) => {
    visitKeys(node, node.computed === true ? ['object', 'property'] : ['object'], scope, walker)
  },
  Property: MEMBER_LIKE,
  MethodDefinition: MEMBER_LIKE,
  PropertyDefinition: MEMBER_LIKE,
  LabeledStatement: (node, scope, walker) => {
    visitKeys(node, ['body'], scope, walker)
  },
  BreakStatement: leaf,
  ContinueStatement: leaf,
  MetaProperty: leaf,
  ExportAllDeclaration: leaf,
  CallExpression: (node, scope, walker) => {
    if (isDirectEval(node)) walker.evalScopes.push(scope)
    visitChildren(node, scope, walker)
  },
  BinaryExpression: visitChain,
  LogicalExpression: visitChain,
  AssignmentExpression: (node, scope, walker) => {
    writeTargets(nodeAt(node, 'left'), scope, walker)
    visitKeys(node, ['right'], scope, walker)
  },
  UpdateExpression: (node, scope, walker) => {
    writeTargets(nodeAt(node, 'argument'), scope, walker)
  },
  ImportDeclaration: (node, scope) => {
    declareImport(node, scope)
  },
  ExportNamedDeclaration: visitExport,
  VariableDeclaration: visitDeclaration,
  FunctionDeclaration: (node, scope, walker) => {
    const name = stringAt(nodeAt(node, 'id') ?? node, 'name')
    if (name !== undefined) declare(scope, { name, kind: 'function', writes: 0 })
    visitFunction(node, scope, walker)
  },
  FunctionExpression: visitFunction,
  ArrowFunctionExpression: visitFunction,
  ClassDeclaration: (node, scope, walker) => {
    const name = stringAt(nodeAt(node, 'id') ?? node, 'name')
    if (name !== undefined) declare(scope, { name, kind: 'class', writes: 0 })
    visitClass(node, scope, walker)
  },
  ClassExpression: visitClass,
  StaticBlock: (node, scope, walker) => {
    visitChildren(node, newScope(scope, true), walker)
  },
  BlockStatement: (node, scope, walker) => {
    visitChildren(node, newScope(scope, false), walker)
  },
  SwitchStatement: (node, scope, walker) => {
    visitKeys(node, ['discriminant'], scope, walker)
    visitKeys(node, ['cases'], newScope(scope, false), walker)
  },
  CatchClause: (node, scope, walker) => {
    const inner = newScope(scope, false)
    declarePattern(nodeAt(node, 'param'), { kind: 'catch' }, inner, walker)
    visitKeys(node, ['body'], inner, walker)
  },
  ForStatement: (node, scope, walker) => {
    visitChildren(node, newScope(scope, false), walker)
  },
  ForInStatement: visitLoop,
  ForOfStatement: visitLoop,
}
