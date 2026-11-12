/**
 * What a module takes from another by CommonJS: a `require()` call, a call of a name bound to
 * `createRequire()`'s result or of such a call itself, and TypeScript's `import x = require()`, each
 * with a string. The build reads none of these as a take of names, so each counts as taking the
 * module whole, beside whatever the same file imports from it. The forms a dependency writes at the
 * top of a module to pass another module's exports on are read instead, as forwards:
 * `module.exports = require(...)`, which gives out every export of the module required;
 * `exports.b = require(...).a` (or `module.exports.b`), which gives out the export `a` under the
 * name `b`; and the two TypeScript emits for an ES module compiled to CommonJS, a getter
 * `Object.defineProperty(exports, 'b', { get: function () { return x.a } })` over `var x = require(...)`
 * when every use of `x` is such a getter, and `__exportStar(require(...), exports)`, its own helper
 * or `tslib`'s, which gives out every export but `default`. A CommonJS module's default import is
 * its exports object, so a forward also gives out `default`, unless the module marks itself
 * `__esModule`, whose default import is its `default` export instead. Other emits (esbuild's
 * `__export` and `__reExport`, Babel's `Object.keys(...).forEach` for `export *`) are not read: the
 * require counts as taking the module whole.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxNames } from './vite-cx-take-keys.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { childrenOf, nodeAt, nodesAt, pushAll, staticStringOf } from './vite-ast.ts'
import { boundForwardsOf, starForwardOf } from './vite-commonjs-emits.ts'
import {
  definePropertyOf,
  exportsMemberOf,
  type Forward,
  type ForwardInput,
  isExportsObject,
  isModuleExports,
  isName,
  memberOf,
} from './vite-commonjs-exports.ts'
import { isCxName } from './vite-cx-take-keys.ts'
import { analyze } from './vite-scope.ts'

/**
 * A take the build cannot read: the module whole.
 */
const WHOLE: Taken = { shape: 'unreadable', names: [] }

/**
 * Whether `node` is a `createRequire()` call, by its own name or as a member (`module.createRequire()`).
 */
function isCreateRequireCall(node: AstNode | undefined): boolean {
  if (node?.type !== 'CallExpression') return false
  const callee = nodeAt(node, 'callee')
  if (isName(callee, 'createRequire')) return true
  return callee?.type === 'MemberExpression' && isName(nodeAt(callee, 'property'), 'createRequire')
}

/**
 * Every node of `program`.
 */
function nodesIn(program: AstNode): AstNode[] {
  const found: AstNode[] = []
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    found.push(node)
    pushAll(stack, childrenOf(node))
  }
  return found
}

/**
 * The names of a `require` function: `require`, and those bound to the result of a `createRequire()`
 * call.
 */
function requireNamesIn(nodes: readonly AstNode[]): Set<string> {
  const names = new Set<string>(['require'])
  for (const node of nodes) {
    const id = nodeAt(node, 'id')
    if (node.type !== 'VariableDeclarator' || id?.type !== 'Identifier') continue
    if (isCreateRequireCall(nodeAt(node, 'init'))) names.add(id.name as string)
  }
  return names
}

/**
 * The specifier TypeScript's `import x = require()` writes; none for `import type x = require()`,
 * which emits nothing.
 */
function equalsSpecifierOf(node: AstNode): string | undefined {
  const reference = nodeAt(node, 'moduleReference')
  if (node.importKind === 'type' || reference?.type !== 'TSExternalModuleReference') {
    return undefined
  }
  return staticStringOf(nodeAt(reference, 'expression'))
}

/**
 * Whether a callee is a `require` function: a name in `requireNames`, or a `createRequire()` call.
 */
function isRequireCallee(callee: AstNode | undefined, requireNames: ReadonlySet<string>): boolean {
  if (callee?.type === 'Identifier') return requireNames.has(callee.name as string)
  return isCreateRequireCall(callee)
}

/**
 * The specifier a CommonJS require writes, when `node` is one with a string.
 */
function requiredBy(node: AstNode, requireNames: ReadonlySet<string>): string | undefined {
  if (node.type === 'TSImportEqualsDeclaration') return equalsSpecifierOf(node)
  if (node.type !== 'CallExpression') return undefined
  const args = nodesAt(node, 'arguments')
  const isRequire = isRequireCallee(nodeAt(node, 'callee'), requireNames)
  return isRequire && args.length === 1 ? staticStringOf(args[0]) : undefined
}

/**
 * Every CommonJS require of `program` that writes a string, with that string.
 */
function requireCallsOf(program: AstNode): { node: AstNode; specifier: string }[] {
  const nodes = nodesIn(program)
  const requireNames = requireNamesIn(nodes)
  return nodes.flatMap((node) => {
    const specifier = requiredBy(node, requireNames)
    return specifier === undefined ? [] : [{ node, specifier }]
  })
}

/**
 * Every specifier `program` requires by CommonJS, each once.
 */
export function requireSpecifiersIn(program: AstNode): string[] {
  return [...new Set(requireCallsOf(program).map(({ specifier }) => specifier))]
}

/**
 * The two sides of a top-level `left = right` statement.
 */
function assignmentOf(
  statement: AstNode,
): { left: AstNode | undefined; right: AstNode | undefined } | undefined {
  if (statement.type !== 'ExpressionStatement') return undefined
  const expression = nodeAt(statement, 'expression')
  if (expression?.type !== 'AssignmentExpression' || expression.operator !== '=') return undefined
  return { left: nodeAt(expression, 'left'), right: nodeAt(expression, 'right') }
}

/**
 * The forward `module.exports = require(...)` writes: every export of the module required.
 */
function wholeForwardOf(
  left: AstNode | undefined,
  right: AstNode | undefined,
  input: ForwardInput,
): Forward | undefined {
  if (right === undefined || !input.requires.has(right) || !isModuleExports(left)) return undefined
  const given = input.names === undefined ? [] : input.names.values().toArray()
  return { given, require: right, takes: [{ shape: 'star', names: [], isForward: true }] }
}

/**
 * The forward `exports.b = require(...).a` writes: the export `a` under the name `b`.
 */
function memberForwardOf(
  left: AstNode | undefined,
  right: AstNode | undefined,
  input: ForwardInput,
): Forward | undefined {
  const as = exportsMemberOf(left)
  const member = memberOf(right)
  if (as === undefined || !member || !input.requires.has(member.object)) return undefined
  if (!isCxName(input.names, member.name)) return undefined
  const taken: Taken = { shape: 'names', names: [member.name], isPassedOn: true, isForward: true }
  return { given: [as], require: member.object, takes: [taken] }
}

/**
 * The forward a top-level statement writes, when it is one, the require being one of `requires`.
 */
function forwardOf(statement: AstNode, input: ForwardInput): Forward | undefined {
  const assignment = assignmentOf(statement)
  if (!assignment) return starForwardOf(statement, input)
  const { left, right } = assignment
  return wholeForwardOf(left, right, input) ?? memberForwardOf(left, right, input)
}

/**
 * Whether a statement writes the `__esModule` marker on the exports object: `exports.__esModule =`
 * (or `module.exports.__esModule =`), or `Object.defineProperty(exports, '__esModule', ...)`.
 */
function isMarkerWrite(statement: AstNode): boolean {
  const assignment = assignmentOf(statement)
  if (assignment) return exportsMemberOf(assignment.left) === '__esModule'
  const define = definePropertyOf(statement)
  return define !== undefined && isExportsObject(define.target) && define.as === '__esModule'
}

/**
 * Whether the module marks itself an ES module compiled to CommonJS, at its top level, whose
 * default import is its `default` export rather than its exports object.
 */
function isMarkedEsModule(program: AstNode): boolean {
  return nodesAt(program, 'body').some((statement) => isMarkerWrite(statement))
}

/**
 * Every forward `program` writes over the requires `input` names.
 */
function forwardsIn(program: AstNode, input: ForwardInput): Forward[] {
  const written = nodesAt(program, 'body').flatMap((statement) => {
    const forward = forwardOf(statement, input)
    return forward ? [forward] : []
  })
  return [...written, ...boundForwardsOf(program, input)]
}

/**
 * What `program` takes by CommonJS from a module that exports `cx` under `names`, `reaches` being
 * the specifiers it requires that resolve to that module. A require counts as taking the module
 * whole, unless `readsForwards` is set and it is one of the forwards, which `given` then names
 * the exports of.
 */
export function requireTakesIn(
  program: AstNode,
  input: {
    readonly names: CxNames
    readonly reaches: ReadonlySet<string>
    readonly readsForwards: boolean
  },
): { given: string[]; takes: Taken[] } {
  const requires = requireCallsOf(program).filter(({ specifier }) => input.reaches.has(specifier))
  if (requires.length === 0) return { given: [], takes: [] }
  let analysis: ScopeAnalysis | undefined
  const forwardInput = {
    analysis: () => (analysis ??= analyze(program)),
    names: input.names,
    requires: new Set(requires.map(({ node }) => node)),
  }
  const forwards = input.readsForwards ? forwardsIn(program, forwardInput) : []
  const forwarded = new Set(forwards.map((forward) => forward.require))
  const takes = forwards.flatMap((forward) => forward.takes)
  if (requires.some(({ node }) => !forwarded.has(node))) takes.push(WHOLE)
  const given = new Set(forwards.flatMap((forward) => forward.given))
  if (given.size > 0 && !isMarkedEsModule(program)) given.add('default')
  return { given: [...given], takes }
}
