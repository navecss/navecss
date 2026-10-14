/**
 * What the rewrite tests share: a module text read and rewritten the way the build does it, and
 * a way to run the result.
 */
import { runInNewContext } from 'node:vm'
import { parseAst } from 'vite'

import type { AstNode } from '../../src/vite-ast.ts'
import type { Edit } from '../../src/vite-rewrite-edit.ts'

import { CX_SOURCE, readModule, type ReadOptions } from '../../src/vite-collect.ts'
import { applyEdits } from '../../src/vite-rewrite-edit.ts'

export const IMPORT = `import { cx } from '${CX_SOURCE}'\n`

export interface Rewritten {
  readonly code: string
  readonly edits: readonly Edit[]
  readonly map: string
  readonly problems: number
}

/**
 * `code` rewritten the way the build rewrites it, `keep` being the map a `cx.dynamic()` call
 * looks a name up in.
 */
export function rewrite(
  code: string,
  keep: Readonly<Record<string, string>> = {},
  options: Partial<ReadOptions> = {},
): Rewritten {
  const reading = readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: false,
    rewrite: { keep },
    ...options,
  })
  return {
    ...applyEdits(code, 'module.js', reading.edits),
    edits: reading.edits,
    problems: reading.problems.length,
  }
}

/**
 * What the module text `text` exports as its default, run with `cx` as the one binding it reads
 * (its import of `cx` taken away, since the rewrite may have taken it already).
 */
export function evaluate<T>(text: string, cx: unknown): T {
  const body = text.replaceAll(/^import .*\n/gm, '').replace('export default', 'return')
  return runInNewContext(`(() => {\n${body}\n})()`, { cx }) as T
}

/**
 * The imports a module text declares, as the specifiers it names.
 */
export function importsOf(code: string): string[] {
  return (parseAst(code).body as unknown as AstNode[])
    .filter((node) => node.type === 'ImportDeclaration')
    .map((node) => (node.source as { value: string }).value)
}
