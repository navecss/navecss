/**
 * The record of a CSS Module: a Nave class it composes from global is a use. By the time the
 * post-order half sees the module, Vite has turned it into JavaScript whose exports are the
 * resolved class lists (`export const box = "_box_x nave-flex"`, and the same lists as the values
 * of the default export, the only place a class that is no identifier, `my-box`, appears). Only
 * those string values are read. The module's stylesheet text is not: in the dev server Vite
 * inlines it as a string, and a Nave class the stylesheet names only in a selector
 * (`:global(.nave-grid)`) is not a use. Under `css.modules.exportGlobals: true`, Vite also writes
 * that class into the class map, where it is read like any other value.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleRecord } from './vite-state.ts'
import type { TransformContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { isNode, nodeAt, nodesAt } from './vite-ast.ts'
import { isCssModuleId } from './vite-css-id.ts'
import {
  CLASS_MAP_NOT_PARSED,
  SOURCE_TYPES,
  textRecord,
  unreadableRecord,
} from './vite-unread-record.ts'

/**
 * The string `node` is, when it is a string literal.
 */
function stringOf(node: AstNode | undefined): string | undefined {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
}

/**
 * The string values of the initialisers of `export const name = "..."`.
 */
function namedStrings(declaration: AstNode): string[] {
  return nodesAt(declaration, 'declarations').map(
    (declarator) => stringOf(nodeAt(declarator, 'init')) ?? '',
  )
}

/**
 * The string values of `export default { ... }`.
 */
function defaultStrings(declaration: AstNode): string[] {
  return nodesAt(declaration, 'properties').map(
    (property) => stringOf(nodeAt(property, 'value')) ?? '',
  )
}

/**
 * The string values of the exports a class map has: the named constants and the default object.
 */
function exportedStrings(program: AstNode): string[] {
  const strings = nodesAt(program, 'body').flatMap((statement) => {
    const declaration = nodeAt(statement, 'declaration')
    if (declaration === undefined) return []
    if (statement.type === 'ExportNamedDeclaration' && declaration.type === 'VariableDeclaration') {
      return namedStrings(declaration)
    }
    if (statement.type === 'ExportDefaultDeclaration' && declaration.type === 'ObjectExpression') {
      return defaultStrings(declaration)
    }
    return []
  })
  return strings.filter((text) => text !== '')
}

/**
 * The record of the CSS Module `id`, whose JavaScript is `code`: the Nave classes its exported
 * class lists name, and no problem. A module whose JavaScript does not parse is recorded with no
 * atoms and one problem, `CLASS_MAP_NOT_PARSED`, which fails the build as any module that could not
 * be read does. Its text is not scanned for atoms instead: in the dev server it can hold the
 * inlined stylesheet, whose selectors are not uses. Vite's own output always parses, so only a
 * plugin that rewrites the module after Vite's CSS step can reach this.
 */
function cssModuleRecord(
  context: UsedContext,
  ctx: TransformContext,
  input: { readonly code: string; readonly id: string; readonly pkg: string | undefined },
): ModuleRecord {
  const { code, id, pkg } = input
  let program: unknown
  try {
    program = ctx.parse(code)
  } catch {
    const unreadable = unreadableRecord(context, { code: '', id, pkg }, CLASS_MAP_NOT_PARSED)
    // `keepFor` stands in for reading a package's calls, not for a class map: the problem is kept.
    return {
      ...unreadable,
      problems: [...unreadable.problems, ...unreadable.suppressed],
      suppressed: [],
    }
  }
  const strings = isNode(program) ? exportedStrings(program) : []
  // One class list to a line, so a name ending one list does not run into the next.
  return textRecord(context, { code: strings.join('\n'), id, pkg })
}

/**
 * The record of a module the plugin reads without parsing it for calls, or `undefined` for one it
 * parses: a CSS Module, read through its class map, and a module the host converts to JavaScript
 * after every transform (`json`, `text`, a plugin's own), whose text is only scanned.
 */
export function recordWithoutCalls(
  context: UsedContext,
  ctx: TransformContext,
  module: {
    readonly code: string
    readonly id: string
    readonly moduleType?: string | undefined
    readonly pkg: string | undefined
  },
): ModuleRecord | undefined {
  if (isCssModuleId(module.id)) return cssModuleRecord(context, ctx, module)
  const { moduleType } = module
  if (moduleType !== undefined && !SOURCE_TYPES.has(moduleType)) return textRecord(context, module)
  return undefined
}
