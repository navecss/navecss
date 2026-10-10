/**
 * The problems a module makes by naming a `cx` source in a statement other than an import:
 * a re-export from it, and a dynamic import of it. A re-export from Nave's own module is refused
 * outside a module listed in `cxModules` (which `declaredExportProblems` judges whole), and a
 * re-export of a listed module's `cx` is refused everywhere, since the build follows one step.
 */
import type { AstNode } from './vite-ast.ts'
import type { Problem } from './vite-problems.ts'

import { childrenOf, exportNameOf, nodeAt, nodesAt, staticStringOf, stringAt } from './vite-ast.ts'

export interface SourceFormOptions {
  /**
   * The specifiers that bind a `cx`: Nave's own module and the listed modules this one imports.
   */
  readonly cxSources: ReadonlySet<string>
  /**
   * The specifiers in `cxSources` that name a listed module.
   */
  readonly declaredSources?: ReadonlySet<string> | undefined
  /**
   * Whether the module is itself listed.
   */
  readonly isDeclared?: boolean | undefined
}

const REEXPORT_TEXT =
  'a re-export of cx, which the build follows only from a module listed in cxModules.'
const SECOND_HOP_TEXT =
  'a re-export of the cx of a module listed in cxModules, which the build follows one step only.'
const DYNAMIC_IMPORT_TEXT =
  'a dynamic import of cx, which the build cannot follow. Import it at the top of the module.'

/**
 * Whether an export-from statement exports `cx`: a star re-export always does, a named one when
 * a specifier takes the name `cx`.
 */
function isExportingCx(node: AstNode): boolean {
  if (node.type === 'ExportAllDeclaration') return true
  return nodesAt(node, 'specifiers').some((specifier) => {
    const local = nodeAt(specifier, 'local')
    return (local?.type === 'Identifier' ? stringAt(local, 'name') : staticStringOf(local)) === 'cx'
  })
}

/**
 * Whether an export-from statement gives `cx` out under a name other than `cx`: a namespace
 * (`export * as n`), or a specifier that takes `cx` and exports it under another name.
 */
function isExportingRenamed(node: AstNode): boolean {
  if (node.type === 'ExportAllDeclaration') return nodeAt(node, 'exported') !== undefined
  return nodesAt(node, 'specifiers').some(
    (specifier) =>
      exportNameOf(nodeAt(specifier, 'local')) === 'cx' &&
      exportNameOf(nodeAt(specifier, 'exported')) !== 'cx',
  )
}

/**
 * The names an export-from statement gives Nave's `cx` out under: `cx` for a star re-export
 * (which the module of `cx` exports under that name), the namespace's name for `export * as`, and
 * for a named one each name a specifier that takes `cx` exports it as.
 */
function exportedNamesOf(node: AstNode): string[] {
  if (node.type === 'ExportAllDeclaration') {
    return [exportNameOf(nodeAt(node, 'exported')) ?? 'cx']
  }
  return nodesAt(node, 'specifiers')
    .filter((specifier) => exportNameOf(nodeAt(specifier, 'local')) === 'cx')
    .flatMap((specifier) => exportNameOf(nodeAt(specifier, 'exported')) ?? [])
}

/**
 * The problem a re-export from a `cx` source makes, if it makes one.
 */
function reexportProblem(code: string, node: AstNode, isListed: boolean): Problem | undefined {
  if (isListed && !isExportingCx(node)) return undefined
  return {
    kind: 'reexport',
    offset: node.start,
    construct: code.slice(node.start, node.end),
    text: isListed ? SECOND_HOP_TEXT : REEXPORT_TEXT,
    isListable: !isListed,
    ...(!isListed && isExportingRenamed(node) && { isRenamed: true }),
    ...(!isListed && { exportedAs: exportedNamesOf(node) }),
  }
}

/**
 * The problem a node that names a `cx` source makes, if it makes one.
 */
function sourceFormProblem(
  code: string,
  node: AstNode,
  options: SourceFormOptions,
): Problem | undefined {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (source === undefined || !options.cxSources.has(source)) return undefined
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
    // A listed module's exports are judged whole by `declaredExportProblems`.
    if (options.isDeclared === true) return undefined
    return reexportProblem(code, node, options.declaredSources?.has(source) === true)
  }
  if (node.type !== 'ImportExpression') return undefined
  const construct = code.slice(node.start, node.end)
  return { kind: 'reference', offset: node.start, construct, text: DYNAMIC_IMPORT_TEXT }
}

/**
 * Re-exports straight from a `cx` source, and dynamic imports of one.
 */
export function sourceFormProblems(
  code: string,
  program: AstNode,
  options: SourceFormOptions,
): Problem[] {
  const problems: Problem[] = []
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const problem = sourceFormProblem(code, node, options)
    if (problem) problems.push(problem)
    stack.push(...childrenOf(node))
  }
  return problems
}
