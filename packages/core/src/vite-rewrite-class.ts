/**
 * The edits that turn the atoms an argument of a `cx()` call can be into their classes, leaving
 * everything else of the argument where it is, so the argument is evaluated once and in its
 * place. The argument is read the way `vite-cx-args.ts` reads it.
 */
import type { AstNode } from './vite-ast.ts'
import type { Edit } from './vite-rewrite-edit.ts'
import type { ScopeAnalysis } from './vite-scope.ts'
import type { SetupExposures } from './vite-setup-member.ts'

import { atomClassMap } from './atoms.ts'
import { nodeAt, staticStringOf } from './vite-ast.ts'
import { operandsRead, resolveArgument } from './vite-cx-args.ts'

export interface ArgumentFrame {
  readonly code: string
  readonly analysis: ScopeAnalysis
  readonly setup: SetupExposures | undefined
}

type Collector = (node: AstNode, frame: ArgumentFrame, out: Edit[]) => void

/**
 * The class of the atom `name`, as `cx()` returns it.
 */
export function classOf(name: string): string {
  return Object.hasOwn(atomClassMap, name) ? atomClassMap[name as keyof typeof atomClassMap] : name
}

/**
 * A name, or a read of a name, as the class its atom maps to: the text of `node` read again for
 * each atom it can be, which is a read of a binding no statement writes and costs nothing. A
 * value that is no atom (a falsy one) is left as it is.
 */
function decode(node: AstNode, frame: ArgumentFrame, out: Edit[]): void {
  const found = resolveArgument(node, frame.analysis, frame.setup) ?? []
  const values = [...new Set(found.map((possible) => possible.value))]
  if (values.length === 0) return
  const text = frame.code.slice(node.start, node.end)
  const chain = values
    .map((value) => `${text} === ${JSON.stringify(value)} ? ${JSON.stringify(classOf(value))} : `)
    .join('')
  out.push({ start: node.start, end: node.end, text: `(${chain}${text})` })
}

/**
 * A name `undefined` that no declaration binds is the value `cx()` filters out, not a binding.
 */
const decodeName: Collector = (node, frame, out) => {
  if (frame.analysis.referenceOf(node)?.binding) decode(node, frame, out)
}

const collectEach =
  (keys: readonly string[]): Collector =>
  (node, frame, out) => {
    for (const key of keys) collect(nodeAt(node, key)!, frame, out)
  }

const COLLECTORS: ReadonlyMap<string, Collector> = new Map<string, Collector>([
  ['ConditionalExpression', collectEach(['consequent', 'alternate'])],
  ['Identifier', decodeName],
  [
    'LogicalExpression',
    (node, frame, out) => {
      for (const operand of operandsRead(node)) collect(operand, frame, out)
    },
  ],
  ['MemberExpression', decode],
  ['ParenthesizedExpression', collectEach(['expression'])],
])

/**
 * Appends to `out` the edits for the atoms `node` can be. A literal or unary value that `cx()`
 * filters out holds no atom, so it has none.
 */
function collect(node: AstNode, frame: ArgumentFrame, out: Edit[]): void {
  const text = staticStringOf(node)
  if (text === undefined) {
    COLLECTORS.get(node.type)?.(node, frame, out)
  } else if (text !== '') {
    out.push({ start: node.start, end: node.end, text: JSON.stringify(classOf(text)) })
  }
}

/**
 * The edits that replace each atom `argument` can be by its class.
 */
export function classEdits(argument: AstNode, frame: ArgumentFrame): Edit[] {
  const out: Edit[] = []
  collect(argument, frame, out)
  return out
}
