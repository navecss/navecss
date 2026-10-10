/**
 * The `cx` exports a value takes by static keys: the member read or destructuring of a namespace
 * (an import of a module, the awaited result of an `import()`, or the parameter of the inline
 * `.then` callback of one) names those keys, and anything else, or a key that is computed, takes
 * the whole namespace.
 */
import type { AstNode } from './vite-ast.ts'
import type { Reference, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, propertyNameOf, stringAt } from './vite-ast.ts'
import { memberReadOf, patternDestructuring } from './vite-cx-reference.ts'

/**
 * The `cx` exports of the module; `undefined` when they are not known, which counts every name.
 */
export type CxNames = ReadonlySet<string> | undefined

/**
 * Whether `name` is one of the `cx` exports.
 */
export function isCxName(names: CxNames, name: string): boolean {
  return names === undefined || names.has(name)
}

/**
 * The `cx` exports an object pattern takes by static keys, or `undefined` when it takes the whole
 * object: a rest element, or a key that is computed.
 */
function patternKeys(pattern: AstNode, names: CxNames): string[] | undefined {
  const taken: string[] = []
  for (const property of nodesAt(pattern, 'properties')) {
    const key =
      property.type === 'Property'
        ? propertyNameOf(nodeAt(property, 'key'), property.computed === true)
        : undefined
    if (key === undefined) return undefined
    if (isCxName(names, key)) taken.push(key)
  }
  return taken
}

/**
 * The names one reference to a namespace takes: a member read by a static key, or a destructuring
 * by static keys, take the keys that are `cx` exports; anything else takes the whole namespace.
 */
export function referenceTakes(
  analysis: ScopeAnalysis,
  node: AstNode,
  names: CxNames,
): string[] | undefined {
  const read = memberReadOf({ analysis }, node)
  if (read) {
    if (read.key === undefined) return undefined
    return isCxName(names, read.key) ? [read.key] : []
  }
  const pattern = patternDestructuring({ analysis }, node)
  return pattern?.type === 'ObjectPattern' ? patternKeys(pattern, names) : undefined
}

/**
 * The expression that stands for `node` where it is parenthesised.
 */
function outermost(analysis: ScopeAnalysis, node: AstNode): AstNode {
  let current = node
  let parent = analysis.parentOf.get(current)
  while (parent?.type === 'ParenthesizedExpression') {
    current = parent
    parent = analysis.parentOf.get(current)
  }
  return current
}

/**
 * The `.then(...)` call whose object is the `import()` `node`, when `node` is that object.
 */
function thenCall(analysis: ScopeAnalysis, node: AstNode): AstNode | undefined {
  const member = analysis.parentOf.get(node)
  if (member?.type !== 'MemberExpression' || nodeAt(member, 'object') !== node) return undefined
  const key = propertyNameOf(nodeAt(member, 'property'), member.computed === true)
  const call = analysis.parentOf.get(member)
  return key === 'then' && call?.type === 'CallExpression' && nodeAt(call, 'callee') === member
    ? call
    : undefined
}

/**
 * The inline callback of `import(...).then(callback)`, if the `import()` is read that way.
 */
function thenCallback(analysis: ScopeAnalysis, node: AstNode): AstNode | undefined {
  const call = thenCall(analysis, node)
  const callback = call && nodesAt(call, 'arguments')[0]
  const isInline =
    callback?.type === 'ArrowFunctionExpression' || callback?.type === 'FunctionExpression'
  return isInline ? callback : undefined
}

/**
 * The references to the parameter `name` that the function `owner` declares.
 */
function referencesToParameter(
  analysis: ScopeAnalysis,
  owner: AstNode,
  name: string,
): readonly Reference[] {
  return analysis.references.filter(
    ({ binding }) => binding?.kind === 'param' && binding.owner === owner && binding.name === name,
  )
}

/**
 * The `cx` exports the first parameter of the inline callback `callback` takes, by static keys;
 * `undefined` when it takes the whole namespace, as a parameter that is reassigned or used any
 * other way than as a member read or a destructuring does.
 */
function parameterTakes(
  analysis: ScopeAnalysis,
  callback: AstNode,
  names: CxNames,
): string[] | undefined {
  const parameter = nodesAt(callback, 'params')[0]
  if (parameter === undefined) return []
  if (parameter.type === 'ObjectPattern') return patternKeys(parameter, names)
  const name = parameter.type === 'Identifier' ? stringAt(parameter, 'name') : undefined
  if (name === undefined) return undefined
  const found: string[] = []
  for (const { binding, node } of referencesToParameter(analysis, callback, name)) {
    const taken = binding?.writes === 0 ? referenceTakes(analysis, node, names) : undefined
    if (taken === undefined) return undefined
    found.push(...taken)
  }
  return found
}

/**
 * The `cx` exports an `import()` takes: those of its awaited result, or of the parameter of an
 * inline `.then` callback, read by static keys; `undefined` for any other use of it.
 */
export function dynamicKeys(
  analysis: ScopeAnalysis,
  node: AstNode,
  names: CxNames,
): string[] | undefined {
  const awaited = analysis.parentOf.get(node)
  if (awaited?.type === 'AwaitExpression') {
    return referenceTakes(analysis, outermost(analysis, awaited), names)
  }
  const callback = thenCallback(analysis, node)
  return callback && parameterTakes(analysis, callback, names)
}
