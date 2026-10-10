/**
 * The words for a use of the `cx` binding that the build refuses, from where the binding sits.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { exportNameOf, nodeAt, stringAt } from './vite-ast.ts'

export interface Reading {
  readonly analysis: ScopeAnalysis
  readonly code: string
  /**
   * Whether the module is a compiled Vue component's script, the one place a getter that returns
   * the binding exposes it to the template instead of using it.
   */
  readonly allowsExposure?: boolean
  /**
   * The import specifiers that name a module listed in `cxModules`, as opposed to Nave's own `cx`.
   */
  readonly declaredSources?: ReadonlySet<string> | undefined
}

type Phrase = (reading: Reading, parent: AstNode, local: string) => string

/**
 * The source text of `node`.
 */
function textOf(reading: Reading, node: AstNode): string {
  return reading.code.slice(node.start, node.end)
}

/**
 * The name a refused use points at: the callee of the call it is passed to.
 */
function calleeName(reading: Reading, call: AstNode): string {
  const callee = nodeAt(call, 'callee')
  if (!callee) return 'a function'
  if (callee.type === 'Identifier') return stringAt(callee, 'name') ?? 'a function'
  const isPlainMember = callee.type === 'MemberExpression' && callee.computed !== true
  const property = isPlainMember ? nodeAt(callee, 'property') : undefined
  return stringAt(property ?? callee, 'name') ?? textOf(reading, callee)
}

const assignedTo: Phrase = (reading, parent, local) => {
  const target = nodeAt(parent, 'id') ?? nodeAt(parent, 'left') ?? parent
  return `${local} is assigned to ${textOf(reading, target)}`
}

const reexported: Phrase = (reading, parent, local) =>
  `${textOf(reading, parent)}: a re-export of ${local}, which the build follows only from a module listed in cxModules`

const PHRASES: Readonly<Record<string, Phrase>> = {
  VariableDeclarator: assignedTo,
  AssignmentExpression: assignedTo,
  CallExpression: (reading, parent, local) =>
    `${local} is passed to ${calleeName(reading, parent)}() as a value instead of being called`,
  SpreadElement: (_reading, _parent, local) => `${local} is spread`,
  ExportSpecifier: reexported,
  ExportDefaultDeclaration: reexported,
}

/**
 * The phrase for a use that is none of the readable shapes, from where the binding sits.
 */
export function phraseFor(reading: Reading, expression: AstNode, local: string): string {
  const parent = reading.analysis.parentOf.get(expression)
  const phrase = parent && PHRASES[parent.type]
  return phrase && parent
    ? phrase(reading, parent, local)
    : `${local} is used as a value instead of being called`
}

/**
 * Whether the use is a re-export of the binding, which `cxModules` declares away.
 */
export function isReexportOf(reading: Reading, expression: AstNode): boolean {
  const parent = reading.analysis.parentOf.get(expression)
  return parent?.type === 'ExportSpecifier' || parent?.type === 'ExportDefaultDeclaration'
}

/**
 * Whether the re-export of the binding gives it out under a name other than `cx`: as the default
 * export, or in `export { cx as other }`.
 */
export function isRenamedReexportOf(reading: Reading, expression: AstNode): boolean {
  const parent = reading.analysis.parentOf.get(expression)
  if (parent?.type === 'ExportDefaultDeclaration') return true
  return parent?.type === 'ExportSpecifier' && exportNameOf(nodeAt(parent, 'exported')) !== 'cx'
}
