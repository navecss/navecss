/**
 * Reads the items of one stylesheet block, as the block reader sees them, into the host-free
 * model `planRule()` takes. Only what the plan needs is read: a declaration's property, value and
 * `!important`, a rule's selector, a group at-rule's prelude, and the content of nested rules and
 * groups down to a fixed depth.
 */
import type { Item } from './block-reader.ts'
import type { ModelNode } from './rule-model.ts'
import type { Token } from './tokenizer.ts'

import { isNaveAtKeyword, readItem } from './block-reader.ts'

const GROUP_NAMES = new Set(['container', 'media', 'supports'])

/**
 * Nested rules and groups are read this deep; anything below is treated as one opaque node. The
 * walk stays iterative everywhere else, so a stylesheet cannot overflow the stack by nesting.
 */
const MAX_READ_DEPTH = 24

export interface ModelSource {
  readonly css: string
  readonly tokens: readonly Token[]
  readonly closerFor: Int32Array
}

/**
 * The model of a block, and the item behind each `ref` it hands out.
 */
export interface BlockModel {
  readonly nodes: readonly ModelNode[]
  readonly itemOf: readonly Item[]
}

/**
 * Whether a token is whitespace or a comment.
 */
function isInert(token: Token): boolean {
  return token.type === 'whitespace-token' || token.type === 'comment'
}

/**
 * Every item of the block `[start, limit)`, in order.
 */
export function readBlockItems(source: ModelSource, start: number, limit: number): readonly Item[] {
  const items: Item[] = []
  let i = start
  while (i < limit) {
    if (isInert(source.tokens[i]!)) {
      i++
      continue
    }
    const item = readItem(source.tokens, i, limit, source.closerFor)
    items.push(item)
    i = item.end
  }
  return items
}

/**
 * The index of the declaration's colon.
 */
function colonIndex(tokens: readonly Token[], item: Item): number {
  let i = item.start + 1
  while (i < item.end && tokens[i]!.type !== 'colon-token') i++
  return i
}

/**
 * The index just past the last token of the value: before a terminating `;`.
 */
function valueEndIndex(tokens: readonly Token[], item: Item): number {
  const last = tokens[item.end - 1]
  return last?.type === 'semicolon-token' ? item.end - 1 : item.end
}

/**
 * The index of the last token in `[from, to)` that is not whitespace or a comment, or `from - 1`.
 */
function lastSignificant(tokens: readonly Token[], from: number, to: number): number {
  let i = to - 1
  while (i >= from && isInert(tokens[i]!)) i--
  return i
}

/**
 * Whether `token` is the ident `important`, in any case.
 */
function isImportantIdent(token: Token | undefined): boolean {
  return (
    token?.type === 'ident-token' && String(token.structured?.value).toLowerCase() === 'important'
  )
}

/**
 * The index of the `!` of a trailing `!important` in `[from, to)`, or `undefined` when the value
 * does not end in one.
 */
function importantIndex(tokens: readonly Token[], from: number, to: number): number | undefined {
  const ident = lastSignificant(tokens, from, to)
  if (!isImportantIdent(tokens[ident])) return undefined
  const bang = lastSignificant(tokens, from, ident)
  const token = tokens[bang]
  return token?.type === 'delim-token' && token.structured?.value === '!' ? bang : undefined
}

/**
 * The text of the tokens `[from, to)` without whitespace or comments at either end.
 */
function trimmedText(source: ModelSource, from: number, to: number): string {
  let start = from
  let end = to
  while (start < end && isInert(source.tokens[start]!)) start++
  while (end > start && isInert(source.tokens[end - 1]!)) end--
  if (start >= end) return ''
  return source.css.slice(source.tokens[start]!.startIndex, source.tokens[end - 1]!.endIndex)
}

/**
 * A declaration item as a model node.
 */
function declarationNode(source: ModelSource, item: Item, ref: number): ModelNode {
  const { tokens } = source
  const colon = colonIndex(tokens, item)
  const end = valueEndIndex(tokens, item)
  const bang = importantIndex(tokens, colon + 1, end)
  return {
    kind: 'decl',
    ref,
    prop: String(tokens[item.start]!.structured?.value),
    value: trimmedText(source, colon + 1, bang ?? end),
    important: bang !== undefined,
  }
}

/**
 * The selector of a rule item: the tokens before its `{`.
 */
function selectorOf(source: ModelSource, item: Item): string {
  return trimmedText(source, item.start, item.blockStart! - 1)
}

/**
 * Reads `items`, with their nested content to `depth` levels, appending each to `itemOf`. An
 * invalid item (stray tokens) is not a node: it is not a nested rule either.
 */
function readItems(
  source: ModelSource,
  items: readonly Item[],
  itemOf: Item[],
  depth: number,
): ModelNode[] {
  return items
    .filter((item) => item.kind !== 'invalid')
    .map((item) => itemNode(source, item, itemOf, depth))
}

/**
 * The content of a nested block, or nothing past the depth limit.
 */
function childrenOf(
  source: ModelSource,
  item: Item,
  itemOf: Item[],
  depth: number,
): ModelNode[] | undefined {
  if (item.blockStart === undefined || depth >= MAX_READ_DEPTH) return undefined
  const children = readBlockItems(source, item.blockStart, item.blockEnd!)
  return readItems(source, children, itemOf, depth + 1)
}

/**
 * One item as a model node.
 */
function itemNode(source: ModelSource, item: Item, itemOf: Item[], depth: number): ModelNode {
  const ref = itemOf.length
  itemOf.push(item)
  if (item.kind === 'declaration') return declarationNode(source, item, ref)
  if (item.kind === 'rule') {
    const nodes = childrenOf(source, item, itemOf, depth)
    if (nodes === undefined) return { kind: 'opaque', ref }
    return { kind: 'rule', ref, selector: selectorOf(source, item), nodes }
  }
  if (item.kind === 'at-rule') return atRuleNode(source, item, ref, { itemOf, depth })
  return { kind: 'opaque', ref }
}

/**
 * An at-rule item as a directive, a group whose content is read, or an opaque nested node.
 */
function atRuleNode(
  source: ModelSource,
  item: Item,
  ref: number,
  where: { depth: number; itemOf: Item[] },
): ModelNode {
  const prelude = source.css.slice(item.preludeOffset ?? 0, item.preludeEndOffset ?? 0)
  if (isNaveAtKeyword(source.tokens[item.start]!)) return { kind: 'directive', ref, prelude }
  const nodes = GROUP_NAMES.has(item.atKeyword ?? '')
    ? childrenOf(source, item, where.itemOf, where.depth)
    : undefined
  if (nodes === undefined) return { kind: 'opaque', ref }
  return { kind: 'group', ref, name: item.atKeyword!, prelude: prelude.trim(), nodes }
}

/**
 * The model of `items`, the direct content of one block.
 */
export function readBlockModel(source: ModelSource, items: readonly Item[]): BlockModel {
  const itemOf: Item[] = []
  const nodes = readItems(source, items, itemOf, 0)
  return { nodes, itemOf }
}
