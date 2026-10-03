/**
 * Vue single-file components, as `@vitejs/plugin-vue` compiles them when the template is not
 * inlined into `setup()` (the dev server always; a build with `<template src>` or production
 * devtools). The component's `<script setup>` returns an object exposing its bindings to the
 * template, and the compiled template reads them off `$setup`. A `cx` import is exposed under its
 * own name by a getter (`get cx() { return cx; }`), which is no use of it; a call on `$setup.cx`
 * in the template is a direct call; and a name the setup return exposes that is bound to a string
 * resolves as that string. This module reads both halves: what a script exposes, and what a
 * template reads.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'
import type { SetupExposure, SetupExposures } from './vite-setup-member.ts'

import { nodeAt, nodesAt, propertyNameOf, stringAt } from './vite-ast.ts'
import { resolveArgument } from './vite-cx-args.ts'
import { setupMemberName } from './vite-setup-member.ts'

/**
 * The object a compiled `<script setup>` returns to its template, if the module has one.
 */
function returnedObject(analysis: ScopeAnalysis): AstNode | undefined {
  for (const [node] of analysis.parentOf) {
    if (node.type !== 'VariableDeclarator') continue
    if (stringAt(nodeAt(node, 'id') ?? node, 'name') !== '__returned__') continue
    const init = nodeAt(node, 'init')
    if (init?.type === 'ObjectExpression') return init
  }
  return undefined
}

/**
 * The names bound to strings that the setup return exposes: `{ v }` where `v` is a `const` (or a
 * binding nothing else writes) whose initialiser resolves.
 */
export function stringExposures(analysis: ScopeAnalysis): Map<string, SetupExposure> {
  const exposures = new Map<string, SetupExposure>()
  const object = returnedObject(analysis)
  const properties = object ? nodesAt(object, 'properties') : []
  for (const property of properties) {
    const value = nodeAt(property, 'value')
    const name = propertyNameOf(nodeAt(property, 'key'), property.computed === true)
    if (name === undefined || value?.type !== 'Identifier' || property.kind === 'get') continue
    const possibles = resolveArgument(value, analysis)
    if (possibles) exposures.set(name, { kind: 'values', values: possibles.map((p) => p.value) })
  }
  return exposures
}

/**
 * Every `$setup.<name>` read in a template module whose name the component's script exposes as
 * Nave's `cx`.
 */
export function cxReadsOnSetup(analysis: ScopeAnalysis, exposures: SetupExposures): AstNode[] {
  const reads: AstNode[] = []
  for (const reference of analysis.references) {
    if (stringAt(reference.node, 'name') !== '$setup') continue
    const member = analysis.parentOf.get(reference.node)
    const name = member && setupMemberName(member)
    if (member && name !== undefined && exposures.get(name)?.kind === 'cx') reads.push(member)
  }
  return reads
}
