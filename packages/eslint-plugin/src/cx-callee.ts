/**
 * Resolves whether a callee in a linted file is Nave's `cx`, `cx.raw` or `cx.dynamic`, by the
 * variable an identifier resolves to through scope analysis (see `cx-binding.ts` for the imports
 * that make a variable Nave's), never by its name.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

import type { CxBindings } from './cx-binding.ts'

import { isValueVariable } from './value-variable.ts'

/**
 * Finds the value `name` resolves to from `scope`, walking scopes outward, or `undefined`. A
 * TypeScript declaration of types (a type alias, an interface, a type parameter, a namespace
 * holding only types) sits in the same scope set but names no value, so the walk goes on past it.
 */
function findVariable(name: string, scope: Scope.Scope): Scope.Variable | undefined {
  let current: Scope.Scope | null = scope
  while (current) {
    const variable = current.set.get(name)
    if (variable && isValueVariable(variable)) return variable
    current = current.upper
  }
  return undefined
}

/**
The static name a member access reads: `.x`, `['x']` or `` [`x`] ``; `undefined` when computed.
 */
function staticPropertyName(node: TSESTree.MemberExpression): string | undefined {
  const { property } = node
  if (!node.computed) return property.type === 'Identifier' ? property.name : undefined
  if (property.type === 'Literal' && typeof property.value === 'string') return property.value
  if (property.type === 'TemplateLiteral' && property.expressions.length === 0) {
    return property.quasis[0]!.value.cooked ?? undefined
  }
  return undefined
}

/**
True when `node` is Nave's `cx` itself: an import binding, or `ns.cx` on a namespace import.
 */
function isCxReference(node: TSESTree.Node, bindings: CxBindings, scope: Scope.Scope): boolean {
  if (node.type === 'Identifier') {
    const variable = findVariable(node.name, scope)
    return variable !== undefined && bindings.cxVariables.has(variable)
  }
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
    const variable = findVariable(node.object.name, scope)
    return (
      variable !== undefined &&
      bindings.namespaceVariables.has(variable) &&
      staticPropertyName(node) === 'cx'
    )
  }
  return false
}

/**
 * The properties of Nave's `cx` the rules recognise a call to: `raw`, the declared escape, and
 * `dynamic`, which names atoms the build cannot see.
 */
type CxProperty = 'dynamic' | 'raw'

/**
 * True when `node` reads `property` off Nave's `cx` (`cx.raw`, `cx['raw']`, `` cx[`raw`] ``,
 * `ns.cx.raw`).
 */
function isPropertyAccess(
  node: TSESTree.Node,
  property: CxProperty,
  bindings: CxBindings,
  scope: Scope.Scope,
): boolean {
  return (
    node.type === 'MemberExpression' &&
    staticPropertyName(node) === property &&
    isCxReference(node.object, bindings, scope)
  )
}

/**
 * One-hop resolution of an identifier to `property` of Nave's `cx`, through a `const` only (a
 * `let` or `var` can be reassigned, so what it holds is not read from its declaration):
 * `const r = cx.raw`, or `const { raw } = cx` / `const { raw: esc } = cx`.
 */
function isOneHopPropertyAccess(
  node: TSESTree.Identifier,
  property: CxProperty,
  bindings: CxBindings,
  scope: Scope.Scope,
): boolean {
  const variable = findVariable(node.name, scope)
  if (variable?.defs.length !== 1) return false
  const def = variable.defs[0]!
  if (def.type !== 'Variable' || def.parent.kind !== 'const') return false
  const declarator = def.node as unknown as TSESTree.VariableDeclarator
  const init = declarator.init
  if (!init) return false

  if (declarator.id.type === 'Identifier') {
    return isPropertyAccess(init, property, bindings, variable.scope)
  }

  if (declarator.id.type !== 'ObjectPattern' || !isCxReference(init, bindings, variable.scope)) {
    return false
  }
  return declarator.id.properties.some(
    (entry) =>
      entry.type === 'Property' &&
      !entry.computed &&
      entry.key.type === 'Identifier' &&
      entry.key.name === property &&
      entry.value.type === 'Identifier' &&
      entry.value.name === node.name,
  )
}

/**
 * How a message at `scope` names Nave's `cx.raw`: through the first named `cx` import that name
 * still reaches there (`ncx.raw` when aliased), else the first such namespace import
 * (`c.cx.raw`), else `cx.raw`, so a local that shadows an import is never named as Nave's.
 */
export function rawCalleeText(bindings: CxBindings, scope: Scope.Scope): string {
  const isReached = (variable: Scope.Variable): boolean =>
    findVariable(variable.name, scope) === variable
  const cxVariable = [...bindings.cxVariables].find((variable) => isReached(variable))
  if (cxVariable) return `${cxVariable.name}.raw`
  const namespaceVariable = [...bindings.namespaceVariables].find((variable) => isReached(variable))
  if (namespaceVariable) return `${namespaceVariable.name}.cx.raw`
  return 'cx.raw'
}

/**
 * Resolves a call expression's callee against `bindings`: `'cx'` when it is Nave's `cx` itself,
 * `'raw'` or `'dynamic'` when it is Nave's `cx.raw` or `cx.dynamic`, reached directly or through
 * exactly one `const` hop, `'none'` otherwise. A second hop (aliasing an already-resolved binding
 * again) is never followed, and neither is a hop to `cx` itself.
 */
export function resolveCxCallee(
  callee: TSESTree.Node,
  bindings: CxBindings,
  scope: Scope.Scope,
): 'cx' | 'dynamic' | 'none' | 'raw' {
  if (isCxReference(callee, bindings, scope)) return 'cx'
  for (const property of ['raw', 'dynamic'] as const) {
    if (
      isPropertyAccess(callee, property, bindings, scope) ||
      (callee.type === 'Identifier' && isOneHopPropertyAccess(callee, property, bindings, scope))
    ) {
      return property
    }
  }
  return 'none'
}
