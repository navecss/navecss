/**
 * Reads the items of one stylesheet block, as the block reader sees them, into the host-free
 * model `planRule()` takes. Only what the plan needs is read: a declaration's property, value and
 * `!important`, a rule's selector, a group at-rule's prelude, and the content of nested rules and
 * groups at any depth, each read when the check first enters it.
 */
import type { Item } from './block-reader.ts'
import type { ModelNode } from './rule-model.ts'
import type { Token } from './tokenizer.ts'

import { isNaveAtKeyword, readItem } from './block-reader.ts'

const GROUP_NAMES = new Set(['container', 'media', 'supports'])

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
 * The items that are nodes: an invalid item (stray tokens) is not one, and is not a nested rule
 * either.
 */
function usable(items: readonly Item[]): readonly Item[] {
  return items.filter((item) => item.kind !== 'invalid')
}

/**
 * The content of the block of `item`, read when first asked for and then kept: nobody pays for
 * the content of a nested rule the order check never enters, however deep the nesting goes, and
 * nothing recurses to read it.
 */
function contentOf(source: ModelSource, item: Item, itemOf: Item[]): () => readonly ModelNode[] {
  let nodes: readonly ModelNode[] | undefined
  return () => {
    nodes ??= readItems(source, readBlockItems(source, item.blockStart!, item.blockEnd!), itemOf)
    return nodes
  }
}

/**
 * A rule item with a block as a node whose content is read on demand.
 */
function ruleNode(source: ModelSource, item: Item, ref: number, itemOf: Item[]): ModelNode {
  const content = contentOf(source, item, itemOf)
  return {
    kind: 'rule',
    ref,
    selector: selectorOf(source, item),
    get nodes() {
      return content()
    },
  }
}

/**
 * An at-rule item as a directive, a group whose content is read on demand, or an opaque node.
 */
function atRuleNode(source: ModelSource, item: Item, ref: number, itemOf: Item[]): ModelNode {
  const prelude = source.css.slice(item.preludeOffset ?? 0, item.preludeEndOffset ?? 0)
  if (isNaveAtKeyword(source.tokens[item.start]!)) return { kind: 'directive', ref, prelude }
  const name = item.atKeyword ?? ''
  if (!GROUP_NAMES.has(name) || item.blockStart === undefined) {
    return { kind: 'opaque', ref, name, prelude: prelude.trim() }
  }
  const content = contentOf(source, item, itemOf)
  return {
    kind: 'group',
    ref,
    name,
    prelude: prelude.trim(),
    get nodes() {
      return content()
    },
  }
}

/**
 * One item as a node.
 */
function itemNode(source: ModelSource, item: Item, ref: number, itemOf: Item[]): ModelNode {
  if (item.kind === 'declaration') return declarationNode(source, item, ref)
  if (item.kind === 'rule' && item.blockStart !== undefined) {
    return ruleNode(source, item, ref, itemOf)
  }
  if (item.kind === 'at-rule') return atRuleNode(source, item, ref, itemOf)
  return { kind: 'opaque', ref, name: '', prelude: '' }
}

/**
 * `items` as nodes, appending each to `itemOf` in document order.
 */
function readItems(source: ModelSource, items: readonly Item[], itemOf: Item[]): ModelNode[] {
  return usable(items).map((item) => {
    const ref = itemOf.length
    itemOf.push(item)
    return itemNode(source, item, ref, itemOf)
  })
}

/**
 * The model of `items`, the direct content of one block.
 */
export function readBlockModel(source: ModelSource, items: readonly Item[]): BlockModel {
  const itemOf: Item[] = []
  const nodes = readItems(source, items, itemOf)
  return { nodes, itemOf }
}
