/**
 * The two forwards TypeScript emits when it compiles an ES module to CommonJS: a getter
 * `Object.defineProperty(exports, 'b', { get: function () { return x.a } })` over
 * `var x = require(...)`, for `export { a as b } from`, and `__exportStar(require(...), exports)`,
 * its own helper or `tslib`'s, for `export * from`. Babel writes the getter the same way. Each is
 * read only where the names resolve to what TypeScript writes: the getter's object to a binding of
 * the require, and `__exportStar` to the helper TypeScript writes at the top of the module or to a
 * name bound to `require('tslib')`.
 */
import type { AstNode } from './vite-ast.ts'
import type { Forward, ForwardInput } from './vite-commonjs-exports.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, propertyNameOf, staticStringOf } from './vite-ast.ts'
import {
  definePropertyOf,
  isExportsObject,
  isName,
  memberOf,
  statementCallOf,
} from './vite-commonjs-exports.ts'
import { type CxNames, isCxName } from './vite-cx-take-keys.ts'

/**
 * The value a name is bound to, when it is bound once, to a plain initialiser, and never written.
 */
function initOf(analysis: ScopeAnalysis, name: AstNode): AstNode | undefined {
  const binding = analysis.referenceOf(name)?.binding
  return binding?.writes === 0 ? binding.init : undefined
}

/**
 * Whether `node` is `this.__exportStar`.
 */
function isOwnHelperRead(node: AstNode | undefined): boolean {
  const member = memberOf(node)
  return member?.name === '__exportStar' && member.object.type === 'ThisExpression'
}

/**
 * Whether `node` is `this && this.__exportStar`.
 */
function isThisGuard(node: AstNode | undefined): boolean {
  if (node?.type !== 'LogicalExpression' || node.operator !== '&&') return false
  return nodeAt(node, 'left')?.type === 'ThisExpression' && isOwnHelperRead(nodeAt(node, 'right'))
}

/**
 * Whether `node` is the helper TypeScript writes at the top of the module:
 * `(this && this.__exportStar) || function (m, exports) { ... }`.
 */
function isOwnHelper(node: AstNode | undefined): boolean {
  if (node?.type !== 'LogicalExpression' || node.operator !== '||') return false
  return isThisGuard(nodeAt(node, 'left')) && nodeAt(node, 'right')?.type === 'FunctionExpression'
}

/**
 * Whether `node` is `require('tslib')`.
 */
function isTslibRequire(node: AstNode | undefined): boolean {
  if (node?.type !== 'CallExpression' || !isName(nodeAt(node, 'callee'), 'require')) return false
  const args = nodesAt(node, 'arguments')
  return args.length === 1 && staticStringOf(args[0]) === 'tslib'
}

/**
 * Whether a callee is TypeScript's `__exportStar` helper: its own, a name bound to the helper it
 * writes, or `tslib`'s, read off a name bound to `require('tslib')`.
 */
function isExportStarCallee(callee: AstNode | undefined, analysis: ScopeAnalysis): boolean {
  if (isName(callee, '__exportStar')) return isOwnHelper(initOf(analysis, callee!))
  const member = memberOf(callee)
  if (member?.name !== '__exportStar' || member.object.type !== 'Identifier') return false
  return isTslibRequire(initOf(analysis, member.object))
}

/**
 * The require a top-level `__exportStar(require(...), exports)` statement passes the helper, when
 * the require is one of `requires` and the callee is TypeScript's helper.
 */
function exportStarOf(statement: AstNode, input: ForwardInput): AstNode | undefined {
  const call = statementCallOf(statement)
  if (!call) return undefined
  const [required, target] = nodesAt(call, 'arguments')
  if (required === undefined || !input.requires.has(required) || !isExportsObject(target)) {
    return undefined
  }
  const analysis = input.analysis()
  const isHelper = !analysis.hasDirectEval && isExportStarCallee(nodeAt(call, 'callee'), analysis)
  return isHelper ? required : undefined
}

/**
 * The forward `__exportStar(require(...), exports)` writes: every export of the module required
 * but `default`, which the helper skips.
 */
export function starForwardOf(statement: AstNode, input: ForwardInput): Forward | undefined {
  const required = exportStarOf(statement, input)
  if (required === undefined) return undefined
  const named = input.names
    ?.values()
    .filter((name) => name !== 'default')
    .toArray()
  const takes: Taken[] = named?.length === 0 ? [] : [{ shape: 'star', names: [], isForward: true }]
  return { given: named ?? [], require: required, takes }
}

/**
 * The expression a block does nothing but return: `{ return e }`.
 */
function returnOf(block: AstNode): AstNode | undefined {
  const statements = nodesAt(block, 'body')
  const only = statements.length === 1 ? statements[0] : undefined
  return only?.type === 'ReturnStatement' ? nodeAt(only, 'argument') : undefined
}

/**
 * The expression a getter does nothing but return: `function () { return e }`, `() => e`, and the
 * method `get() { return e }`.
 */
function returnedBy(getter: AstNode | undefined): AstNode | undefined {
  const isArrow = getter?.type === 'ArrowFunctionExpression'
  if (!getter || (!isArrow && getter.type !== 'FunctionExpression')) return undefined
  const body = nodeAt(getter, 'body')
  if (body?.type === 'BlockStatement') return returnOf(body)
  return isArrow ? body : undefined
}

/**
 * The `get` of a property descriptor written as an object literal.
 */
function getterOf(descriptor: AstNode | undefined): AstNode | undefined {
  if (descriptor?.type !== 'ObjectExpression') return undefined
  const property = nodesAt(descriptor, 'properties').find((node) => {
    const isGet = propertyNameOf(nodeAt(node, 'key'), node.computed === true) === 'get'
    return node.type === 'Property' && isGet
  })
  return property && nodeAt(property, 'value')
}

/**
 * A getter export that reads one name off another: `b` defined on the exports object to return
 * `x.a`, with the node of `x`.
 */
interface GetterRead {
  readonly as: string
  readonly name: string
  readonly object: AstNode
}

/**
 * The getter export a top-level statement defines, when it returns a name read off a name.
 */
function getterReadOf(statement: AstNode): GetterRead | undefined {
  const define = definePropertyOf(statement)
  if (define?.as === undefined || !isExportsObject(define.target)) return undefined
  const member = memberOf(returnedBy(getterOf(define.descriptor)))
  if (member?.object.type !== 'Identifier') return undefined
  return { as: define.as, name: member.name, object: member.object }
}

/**
 * The forward the getters over `var x = require(...)` write, when every use of `x` is one: each
 * `cx` export a getter reads, under the name it defines.
 */
function boundForwardOf(
  require: AstNode,
  reads: ReadonlyMap<AstNode, GetterRead>,
  context: { readonly analysis: ScopeAnalysis; readonly names: CxNames },
): Forward | undefined {
  const uses = context.analysis.references.filter(({ binding }) => binding?.init === require)
  const binding = uses[0]?.binding
  if (!binding || binding.writes > 0) return undefined
  const read = uses.map(({ node }) => reads.get(node))
  if (read.includes(undefined)) return undefined
  const cx = read.filter((getter) => getter !== undefined && isCxName(context.names, getter.name))
  const names = [...new Set(cx.map((getter) => getter!.name))]
  const takes: Taken[] =
    names.length === 0 ? [] : [{ shape: 'names', names, isPassedOn: true, isForward: true }]
  return { given: cx.map((getter) => getter!.as), require, takes }
}

/**
 * The forwards TypeScript's getter exports write over the requires `input` names.
 */
export function boundForwardsOf(program: AstNode, input: ForwardInput): Forward[] {
  const reads = new Map<AstNode, GetterRead>()
  for (const statement of nodesAt(program, 'body')) {
    const read = getterReadOf(statement)
    if (read) reads.set(read.object, read)
  }
  if (reads.size === 0) return []
  const analysis = input.analysis()
  if (analysis.hasDirectEval) return []
  const context = { analysis, names: input.names }
  return [...input.requires].flatMap((require) => {
    const forward = boundForwardOf(require, reads, context)
    return forward ? [forward] : []
  })
}
