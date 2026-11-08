/**
 * The two forwards TypeScript emits when it compiles an ES module to CommonJS: a getter
 * `Object.defineProperty(exports, 'b', { get: function () { return x.a } })` over
 * `var x = require(...)`, for `export { a as b } from`, and `__exportStar(require(...), exports)`,
 * its own helper or `tslib`'s, for `export * from`. Babel writes the getter the same way.
 */
import type { AstNode } from './vite-ast.ts'
import type { Forward, ForwardInput } from './vite-commonjs-exports.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, propertyNameOf } from './vite-ast.ts'
import {
  definePropertyOf,
  isExportsObject,
  isName,
  memberOf,
  statementCallOf,
} from './vite-commonjs-exports.ts'
import { type CxNames, isCxName } from './vite-cx-take-keys.ts'
import { analyze } from './vite-scope.ts'

/**
 * Whether a callee is TypeScript's `__exportStar` helper: its own (`__exportStar`) or `tslib`'s
 * (`tslib_1.__exportStar`).
 */
function isExportStarCallee(callee: AstNode | undefined): boolean {
  return isName(callee, '__exportStar') || memberOf(callee)?.name === '__exportStar'
}

/**
 * The forward `__exportStar(require(...), exports)` writes: every export of the module required
 * but `default`, which the helper skips.
 */
export function starForwardOf(statement: AstNode, input: ForwardInput): Forward | undefined {
  const call = statementCallOf(statement)
  if (!call || !isExportStarCallee(nodeAt(call, 'callee'))) return undefined
  const [required, target] = nodesAt(call, 'arguments')
  if (required === undefined || !input.requires.has(required) || !isExportsObject(target)) {
    return undefined
  }
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
  const analysis = analyze(program)
  if (analysis.hasDirectEval) return []
  const context = { analysis, names: input.names }
  return [...input.requires].flatMap((require) => {
    const forward = boundForwardOf(require, reads, context)
    return forward ? [forward] : []
  })
}
