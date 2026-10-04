/**
 * What a compiled Vue component's script exposes to its template, and how a template reads it:
 * `$setup.<name>`.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, propertyNameOf, stringAt } from './vite-ast.ts'

export type SetupExposure =
  { readonly kind: 'cx' } | { readonly kind: 'values'; readonly values: readonly string[] }

export type SetupExposures = ReadonlyMap<string, SetupExposure>

/**
 * The name `$setup.<name>` reads, when `node` is such a member read.
 */
export function setupMemberName(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression') return undefined
  const object = nodeAt(node, 'object')
  if (object?.type !== 'Identifier' || stringAt(object, 'name') !== '$setup') return undefined
  return propertyNameOf(nodeAt(node, 'property'), node.computed === true)
}

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
])

/**
 * Whether no function surrounds `node`.
 */
function isOutsideFunctions(node: AstNode, parentOf: ReadonlyMap<AstNode, AstNode>): boolean {
  for (let current = parentOf.get(node); current; current = parentOf.get(current)) {
    if (FUNCTION_TYPES.has(current.type)) return false
  }
  return true
}

/**
 * Where a compiled render function takes `$setup`: fourth for the client's `render`, sixth for the
 * server's `ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, ...)`.
 */
const SETUP_PARAMETER_POSITIONS: readonly number[] = [3, 5]

/**
 * Whether `identifier` reads the `$setup` parameter of a compiled template's render function: the
 * parameter of that name in the position the client or the server signature gives it, of a
 * function at the top of the module. A name the template declares itself (a `v-for` alias is a
 * parameter of a function inside the render function) is not it.
 */
export function isSetupParameter(analysis: ScopeAnalysis, identifier: AstNode): boolean {
  const binding = analysis.referenceOf(identifier)?.binding
  const owner = binding?.owner
  if (!owner || binding.kind !== 'param' || binding.name !== '$setup') return false
  if (!isOutsideFunctions(owner, analysis.parentOf)) return false
  const params = nodesAt(owner, 'params')
  return SETUP_PARAMETER_POSITIONS.some((position) => {
    const parameter = params[position]
    return parameter?.type === 'Identifier' && stringAt(parameter, 'name') === binding.name
  })
}

/**
 * Whether `setup` is the method of an object that a component is made of: `setup() { ... }`.
 */
function isSetupMethod(
  setup: AstNode | undefined,
  parentOf: ReadonlyMap<AstNode, AstNode>,
): boolean {
  const property = setup && parentOf.get(setup)
  if (setup?.type !== 'FunctionExpression' || property?.type !== 'Property') return false
  return propertyNameOf(nodeAt(property, 'key'), property.computed === true) === 'setup'
}

/**
 * Whether `declarator` declares the object a compiled `<script setup>` returns to its template:
 * the `__returned__` the compiler writes in the body of the component's own `setup()`, not a
 * variable of that name the author declares deeper in.
 */
export function isSetupReturn(
  declarator: AstNode | undefined,
  parentOf: ReadonlyMap<AstNode, AstNode>,
): boolean {
  if (declarator?.type !== 'VariableDeclarator') return false
  if (stringAt(nodeAt(declarator, 'id') ?? declarator, 'name') !== '__returned__') return false
  const declaration = parentOf.get(declarator)
  const block = declaration && parentOf.get(declaration)
  return block?.type === 'BlockStatement' && isSetupMethod(parentOf.get(block), parentOf)
}

/**
 * What a template module can read off `$setup`: what its component's script exposes, which a
 * template compiled into the script's own module (the dev server always; a build with production
 * devtools) finds in that module's own setup return.
 */
export function mergedExposures(
  linked: SetupExposures | undefined,
  own: ReadonlyMap<string, SetupExposure>,
): SetupExposures | undefined {
  if (own.size === 0) return linked
  return new Map([...own, ...(linked ?? [])])
}
