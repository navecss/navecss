/**
 * The helpers the compilers wrap the result of a require in, and the unwrapping that looks through
 * them (and through an `await`) to the result itself.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt } from './vite-ast.ts'
import { isTslibMember } from './vite-commonjs-emits.ts'
import { memberOf } from './vite-commonjs-exports.ts'

/**
 * The helpers the compilers wrap the result of a require in when the importing module takes a
 * default or a namespace.
 */
const INTEROP_HELPERS: ReadonlySet<string> = new Set([
  '__importDefault',
  '__importStar',
  '__toESM',
  '_interop_require_default',
  '_interop_require_wildcard',
  '_interopRequireDefault',
  '_interopRequireWildcard',
])

/**
 * Whether `callee` is one of those helpers: a name the module declares itself, or a member of the
 * `tslib` it requires.
 */
function isInteropCallee(analysis: ScopeAnalysis, callee: AstNode | undefined): boolean {
  if (callee?.type === 'Identifier') {
    const binding = analysis.referenceOf(callee)?.binding
    const isDeclared =
      binding !== undefined && binding.kind !== 'import' && binding.kind !== 'param'
    return INTEROP_HELPERS.has(callee.name as string) && isDeclared
  }
  const member = memberOf(callee)
  return member !== undefined && INTEROP_HELPERS.has(member.name) && isTslibMember(callee, analysis)
}

/**
 * `node`, or the call of an interop helper that wraps it, or the `await` of it, however deeply.
 */
export function unwrappedFromInterop(analysis: ScopeAnalysis, node: AstNode): AstNode {
  let current = node
  for (;;) {
    const parent = analysis.parentOf.get(current)
    if (parent?.type === 'AwaitExpression') {
      current = parent
      continue
    }
    const args = parent ? nodesAt(parent, 'arguments') : []
    const isFirstArgument = parent?.type === 'CallExpression' && args[0] === current
    if (!parent || !isFirstArgument || !isInteropCallee(analysis, nodeAt(parent, 'callee'))) {
      return current
    }
    current = parent
  }
}
