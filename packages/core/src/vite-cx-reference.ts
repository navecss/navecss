/**
 * Every use of the `cx` import in a module, told apart by what it does with the binding: a
 * direct call, a `cx.raw` reach (never an atom), a `cx.dynamic` call, or anything else, which the
 * build refuses. References are attributed to the import by lexical scope, so a parameter or a
 * `let` of the same name in an inner scope is not a use.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxBinding, CxUse } from './vite-cx-use.ts'
import type { Reference } from './vite-scope.ts'

import { nodeAt, nodesAt, propertyNameOf } from './vite-ast.ts'
import {
  isReexportOf,
  isRenamedReexportOf,
  phraseFor,
  type Reading,
  reexportNameOf,
} from './vite-cx-refuse.ts'
import { isSetupReturn } from './vite-setup-member.ts'

/**
 * Whether `node` is the callee of the call `parent`.
 */
function isCallee(parent: AstNode | undefined, node: AstNode): boolean {
  return parent?.type === 'CallExpression' && nodeAt(parent, 'callee') === node
}

/**
 * Whether `pattern` destructures nothing but `raw` from the object it reads.
 */
function isOnlyRaw(pattern: AstNode): boolean {
  const properties = nodesAt(pattern, 'properties')
  const only = properties[0]
  if (properties.length !== 1 || only?.type !== 'Property') return false
  const name = propertyNameOf(nodeAt(only, 'key'), only.computed === true)
  return name === 'raw' && nodeAt(only, 'value')?.type === 'Identifier'
}

/**
 * A refused use.
 */
function refused(node: AstNode, local: string, phrase: string): CxUse {
  return { kind: 'refused', node, local, phrase }
}

/**
 * `cx.raw`: a call, or an alias held by a plain name, is never collected and never an error.
 */
function rawMemberUse(parent: AstNode | undefined, member: AstNode, local: string): CxUse {
  const isAlias =
    parent?.type === 'VariableDeclarator' &&
    nodeAt(parent, 'init') === member &&
    nodeAt(parent, 'id')?.type === 'Identifier'
  if (isAlias || isCallee(parent, member)) return { kind: 'raw', node: member, local }
  return refused(member, local, `${local}.raw is used other than by calling it`)
}

/**
 * The use a member read on the binding (`cx.raw`, `cx.dynamic`, ...) makes.
 */
function memberUse(reading: Reading, member: AstNode, local: string): CxUse {
  const parent = reading.analysis.parentOf.get(member)
  const isComputed = member.computed === true
  const name = propertyNameOf(nodeAt(member, 'property'), isComputed)
  if (name === 'raw') return rawMemberUse(parent, member, local)
  if (name === 'dynamic' && !isComputed) {
    if (parent && isCallee(parent, member)) return { kind: 'dynamic', node: parent, local }
    return refused(member, local, `${local}.dynamic is referenced other than by a direct call`)
  }
  if (name === 'call' || name === 'apply') {
    return refused(member, local, `${local} is called through .${name}()`)
  }
  if (isComputed) return refused(member, local, `${local} is read with a computed member`)
  return refused(member, local, `${local}.${name ?? '?'} is not a member the build reads`)
}

/**
 * Whether the callee of a call is `unref` imported from `vue` under any local name.
 */
function isVueUnref(reading: Reading, callee: AstNode | undefined): boolean {
  if (callee?.type !== 'Identifier') return false
  const binding = reading.analysis.referenceOf(callee)?.binding
  return binding?.kind === 'import' && binding.source === 'vue' && binding.imported === 'unref'
}

/**
 * Looks through `unref(cx)`, which `@vitejs/plugin-vue` compiles a template reference into: the
 * call stands for the binding wherever the binding may stand.
 */
function throughUnref(reading: Reading, expression: AstNode): AstNode {
  let current = expression
  for (;;) {
    const call = reading.analysis.parentOf.get(current)
    const args = call ? nodesAt(call, 'arguments') : []
    const isUnref =
      call?.type === 'CallExpression' &&
      args.length === 1 &&
      args[0] === current &&
      isVueUnref(reading, nodeAt(call, 'callee'))
    if (!isUnref) return current
    current = call
  }
}

/**
 * The node `levels` parents above `node`.
 */
function ancestor(reading: Reading, node: AstNode, levels: number): AstNode | undefined {
  let current: AstNode | undefined = node
  for (let level = 0; current && level < levels; level += 1) {
    current = reading.analysis.parentOf.get(current)
  }
  return current
}

/**
 * The name a compiled Vue component's setup return gives the binding, when `expression` is the
 * `return cx` of a getter in the `__returned__` object (`get cx() { return cx; }`): the binding
 * is exposed to the template, and its calls are read where the template is compiled.
 */
function exposureName(reading: Reading, expression: AstNode): string | undefined {
  if (reading.allowsExposure !== true) return undefined
  const getter = ancestor(reading, expression, 4)
  const isGetter = getter?.type === 'Property' && getter.kind === 'get'
  const isReturn = ancestor(reading, expression, 1)?.type === 'ReturnStatement'
  if (
    !isGetter ||
    !isReturn ||
    !isSetupReturn(ancestor(reading, expression, 6), reading.analysis.parentOf)
  )
    return undefined
  return propertyNameOf(nodeAt(getter, 'key'), getter.computed === true)
}

/**
 * `const { raw } = cx`: the declarator whose pattern takes `raw` alone from `expression`.
 */
function rawDestructuring(parent: AstNode, expression: AstNode, local: string): CxUse | undefined {
  if (parent.type !== 'VariableDeclarator' || nodeAt(parent, 'init') !== expression)
    return undefined
  const id = nodeAt(parent, 'id')
  if (id?.type !== 'ObjectPattern' || !isOnlyRaw(id)) return undefined
  return { kind: 'raw', node: id, local }
}

/**
 * The shapes a binding may be used in without being refused: called, read for a member, or
 * destructured for `raw` alone.
 */
function readableUse(reading: Reading, expression: AstNode, local: string): CxUse | undefined {
  const parent = reading.analysis.parentOf.get(expression)
  if (!parent) return undefined
  if (isCallee(parent, expression)) return { kind: 'call', node: parent, local }
  if (parent.type === 'MemberExpression' && nodeAt(parent, 'object') === expression) {
    return memberUse(reading, parent, local)
  }
  return rawDestructuring(parent, expression, local)
}

/**
 * The use `expression` makes of a cx binding named `local`: a call, a member read, a destructuring,
 * an exposure to a Vue template, or something the build refuses.
 */
export function useOfExpression(reading: Reading, start: AstNode, local: string): CxUse {
  const expression = throughUnref(reading, start)
  const readable = readableUse(reading, expression, local)
  if (readable) return readable
  const exposedAs = exposureName(reading, expression)
  if (exposedAs !== undefined) return { kind: 'exposure', node: expression, local, exposedAs }
  const phrase = phraseFor(reading, expression, local)
  const isReexport = isReexportOf(reading, expression)
  const isRenamed = isReexport && isRenamedReexportOf(reading, expression)
  const exportedAs = reexportedAs(reading, expression)
  return {
    ...refused(expression, local, phrase),
    isReexport,
    ...(isRenamed && { isRenamed }),
    ...exportedAs,
  }
}

/**
 * The name a re-export of the binding gives it out under, as the field a use carries.
 */
function reexportedAs(
  reading: Reading,
  expression: AstNode,
): { readonly exportedAs: readonly string[] } | undefined {
  const name = reexportNameOf(reading, expression)
  return name === undefined ? undefined : { exportedAs: [name] }
}

/**
 * Whether the property is a destructured key that is static and is not `cx`.
 */
function isOtherKey(property: AstNode): boolean {
  if (property.type !== 'Property') return false
  const name = propertyNameOf(nodeAt(property, 'key'), property.computed === true)
  return name !== undefined && name !== 'cx'
}

/**
 * Whether `node` assigns to a pattern in a way that leaves no value behind: a parameter's default,
 * or an assignment that is a whole statement. An assignment evaluates to its right side, which here
 * is the namespace itself, so one whose value is used hands the namespace on.
 */
function isPatternAssignment(
  reading: Pick<Reading, 'analysis'>,
  node: AstNode | undefined,
): node is AstNode {
  if (node?.type === 'AssignmentPattern') return true
  return (
    node?.type === 'AssignmentExpression' &&
    node.operator === '=' &&
    reading.analysis.parentOf.get(node)?.type === 'ExpressionStatement'
  )
}

/**
 * The pattern `expression` is destructured by, when it is the whole initialiser of a declaration
 * (`const { a } = ns`), the right side of an assignment statement (`({ a } = ns)`) or a
 * parameter's default (`({ a } = ns) => a`). An assignment whose value is used, as in
 * `const r = ({ a } = ns)`, hands the namespace on, so it is not one.
 */
export function patternDestructuring(
  reading: Pick<Reading, 'analysis'>,
  expression: AstNode,
): AstNode | undefined {
  const parent = reading.analysis.parentOf.get(expression)
  if (parent?.type === 'VariableDeclarator' && nodeAt(parent, 'init') === expression) {
    return nodeAt(parent, 'id')
  }
  return isPatternAssignment(reading, parent) && nodeAt(parent, 'right') === expression
    ? nodeAt(parent, 'left')
    : undefined
}

/**
 * Whether `expression` is the whole source of an object destructuring that takes static keys other
 * than `cx` and nothing else: no rest element, no computed key.
 */
function isOtherKeysDestructuring(reading: Reading, expression: AstNode): boolean {
  const pattern = patternDestructuring(reading, expression)
  return (
    pattern?.type === 'ObjectPattern' && nodesAt(pattern, 'properties').every((p) => isOtherKey(p))
  )
}

/**
 * The member read `expression.key` that `expression` is the object of, with the static key it
 * reads (`undefined` when the key is computed from anything but a string).
 */
export function memberReadOf(
  reading: Pick<Reading, 'analysis'>,
  expression: AstNode,
): { key: string | undefined; member: AstNode } | undefined {
  const member = reading.analysis.parentOf.get(expression)
  if (member?.type !== 'MemberExpression' || nodeAt(member, 'object') !== expression) {
    return undefined
  }
  return { member, key: propertyNameOf(nodeAt(member, 'property'), member.computed === true) }
}

/**
 * The use one reference to a namespace import makes, or `undefined` when it makes none of `cx`.
 * `ns.cx` is Nave's `cx`. For a namespace of a listed module, which exports more than `cx`, a
 * member read by a static key other than `cx`, and a destructuring of such keys, read another
 * export. Everything else may carry `cx` where the build cannot follow it.
 */
function namespaceUse(reading: Reading, expression: AstNode, cx: CxBinding): CxUse | undefined {
  const local = cx.binding.name
  const read = memberReadOf(reading, expression)
  if (read?.key === 'cx') return useOfExpression(reading, read.member, `${local}.cx`)
  const isListed = reading.declaredSources?.has(cx.binding.source ?? '') === true
  const isOtherExport = read
    ? read.key !== undefined
    : isOtherKeysDestructuring(reading, expression)
  if (isListed && isOtherExport) return undefined
  const use = refused(expression, local, `${local} is used other than as ${local}.cx`)
  // A namespace holding `cx` that the module exports is a `cx` export under another name than `cx`:
  // an importer reads it as `ns.cx`, which no `cxModules` entry follows.
  const exportedAs = reexportedAs(reading, expression)
  return exportedAs ? { ...use, ...exportedAs, isRenamed: true } : use
}

/**
 * The use one reference to a cx binding makes, or `undefined` when it makes none of `cx`.
 */
export function useOf(reading: Reading, reference: Reference, cx: CxBinding): CxUse | undefined {
  if (cx.isNamespace) return namespaceUse(reading, reference.node, cx)
  const local = cx.binding.name
  const use = useOfExpression(reading, reference.node, local)
  if (!use.isReexport) return use
  const isDeclaredSource = reading.declaredSources?.has(cx.binding.source ?? '') === true
  return { ...use, isListable: !isDeclaredSource }
}
