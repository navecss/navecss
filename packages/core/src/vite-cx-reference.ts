/**
 * Every use of the `cx` import in a module, told apart by what it does with the binding: a
 * direct call, a `cx.raw` reach (never an atom), a `cx.dynamic` call, or anything else, which the
 * build refuses. References are attributed to the import by lexical scope, so a parameter or a
 * `let` of the same name in an inner scope is not a use.
 */
import type { AstNode } from './vite-ast.ts'
import type { Binding, Reference } from './vite-scope.ts'

import { nodeAt, nodesAt, propertyNameOf, stringAt } from './vite-ast.ts'
import { isReexportOf, phraseFor, type Reading } from './vite-cx-refuse.ts'

type UseKind = 'call' | 'dynamic' | 'exposure' | 'raw' | 'refused'

export interface CxUse {
  readonly kind: UseKind
  /**
   * For a call, the call; for a refused use, the construct that refuses (where its error points).
   */
  readonly node: AstNode
  /**
   * The name the module gives the binding (`cx`, or an alias).
   */
  readonly local: string
  /**
   * For a refused use: what it does with the binding, as the report words it.
   */
  readonly phrase?: string
  /**
   * Whether the refused use is a re-export of the binding, which `cxModules` declares away.
   */
  readonly isReexport?: boolean
  /**
   * For an exposure: the name a compiled Vue component's setup return gives the binding.
   */
  readonly exposedAs?: string
}

/**
 * What a binding stands for in the module: Nave's `cx` itself, or the namespace holding it.
 */
export interface CxBinding {
  readonly binding: Binding
  readonly isNamespace: boolean
}

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
 * Whether `declarator` declares the object a compiled `<script setup>` returns to its template.
 */
function isReturnedObject(declarator: AstNode | undefined): boolean {
  if (declarator?.type !== 'VariableDeclarator') return false
  return stringAt(nodeAt(declarator, 'id') ?? declarator, 'name') === '__returned__'
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
  if (!isGetter || !isReturn || !isReturnedObject(ancestor(reading, expression, 6)))
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
  return { ...refused(expression, local, phrase), isReexport: isReexportOf(reading, expression) }
}

/**
 * The use one reference to a cx binding makes.
 */
export function useOf(reading: Reading, reference: Reference, cx: CxBinding): CxUse {
  const local = cx.binding.name
  const expression = reference.node
  if (!cx.isNamespace) return useOfExpression(reading, expression, local)
  const member = reading.analysis.parentOf.get(expression)
  const isCx =
    member?.type === 'MemberExpression' &&
    nodeAt(member, 'object') === expression &&
    propertyNameOf(nodeAt(member, 'property'), member.computed === true) === 'cx'
  if (!isCx) return refused(expression, local, `${local} is used other than as ${local}.cx`)
  return useOfExpression(reading, member, `${local}.cx`)
}
