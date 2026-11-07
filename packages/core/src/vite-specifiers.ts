/**
 * The module specifiers a module's text writes, read from its parse.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleHost } from './vite-takes-host.ts'

import { childrenOf, nodeAt, pushAll, staticStringOf } from './vite-ast.ts'
import { parseOf } from './vite-takes-host.ts'

export interface Importer {
  readonly id: string
  readonly code: string
}

/**
 * Every module specifier written in `program`: imports, re-exports and dynamic imports, each once,
 * in the order it is first written.
 */
export function specifiersIn(program: AstNode): string[] {
  const found = new Map<string, number>()
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const where = nodeAt(node, 'source')
    const source = staticStringOf(where)
    if (where !== undefined && source !== undefined) {
      found.set(source, Math.min(found.get(source) ?? Infinity, where.start))
    }
    pushAll(stack, childrenOf(node))
  }
  return [...found].toSorted(([, a], [, b]) => a - b).map(([source]) => source)
}

/**
 * Every specifier `importer` writes, or `undefined` when its text cannot be read.
 */
export function specifiersOf(host: ModuleHost, importer: Importer): string[] | undefined {
  try {
    return specifiersIn(parseOf(host, importer.code, importer.id) as AstNode)
  } catch {
    return undefined
  }
}
