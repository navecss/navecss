/**
 * Whether a string `validateExtendAtoms` or `validateExtendAtomsHostFree` refused would still sit
 * inside the rule it is spliced into. It runs on the refusal path only, so it never changes what
 * is accepted: it decides which sentence the refusal prints. The string is put in a one-atom map
 * at its position and the expander itself expands `.p { @nave probe; }` with it, with no
 * validation, followed by a sentinel rule; the core's block reader then reads the output.
 *
 * The string stays inside its rule when `.p` closes right before the sentinel, which is its own
 * top-level rule, and `.p` holds only what the atom's shape produces: declarations, plus the one
 * nested rule or at-rule a pseudo or a condition makes. A rule that closes early, an extra
 * top-level item, a block that swallows the sentinel, or a rule or at-rule inside `.p` that the
 * shape does not produce is a break-out. An extra declaration stays inside.
 */
import type { Item } from './directive/block-reader.ts'
import type { Token } from './directive/tokenizer.ts'

import { matchBrackets, readItem } from './directive/block-reader.ts'
import { expandText } from './directive/expand-text.ts'
import { tokenize } from './directive/tokenizer.ts'
import { anchorSelectorList } from './selector-utils.ts'
import { isOnlyInert } from './validate-extend-scan.ts'

/**
 * Where a refused string sits in an atom: as the declarations of an atom, as a pseudo key, or as
 * a `@media`/`@container` condition.
 */
export type Splice =
  | {
      readonly atName: 'container' | 'media'
      readonly condition: string
      readonly kind: 'condition'
    }
  | { readonly declarations: Readonly<Record<string, string>>; readonly kind: 'declarations' }
  | { readonly key: string; readonly kind: 'pseudo' }

const SENTINEL = '.nave-sentinel{}'
const ATOM = 'probe'

/**
 * The one-atom map that holds `splice`, and how many rules or at-rules that shape itself makes
 * inside `.p`.
 */
function atomFor(splice: Splice): { atoms: Record<string, unknown>; nested: number } {
  if (splice.kind === 'declarations') {
    return { atoms: { [ATOM]: { declarations: splice.declarations } }, nested: 0 }
  }
  const color = { color: 'red' }
  if (splice.kind === 'pseudo') {
    const pseudos = { [splice.key]: color }
    return { atoms: { [ATOM]: { declarations: {}, pseudos } }, nested: 1 }
  }
  const blocks = { [splice.condition]: { declarations: color } }
  return { atoms: { [ATOM]: { declarations: {}, [splice.atName]: blocks } }, nested: 1 }
}

/**
 * The items of `tokens[from, to)`, in order, skipping whitespace and comments between them.
 */
function itemsIn(
  tokens: readonly Token[],
  closerFor: Int32Array,
  from: number,
  to: number,
): Item[] {
  const items: Item[] = []
  let i = from
  while (i < to) {
    const type = tokens[i]!.type
    if (type === 'whitespace-token' || type === 'comment') {
      i++
      continue
    }
    const item = readItem(tokens, i, to, closerFor)
    items.push(item)
    i = Math.max(item.end, i + 1)
  }
  return items
}

/**
 * The text of `tokens[from, to)`.
 */
function textOf(tokens: readonly Token[], from: number, to: number): string {
  return tokens
    .slice(from, to)
    .map((token) => token.raw)
    .join('')
}

/**
 * Whether the one rule or at-rule inside `.p` is the one `splice` itself makes: for a pseudo key a
 * style rule whose prelude is the key as the expander anchors it, for a condition the at-rule of
 * that name.
 */
function isExpectedNested(
  splice: Exclude<Splice, { kind: 'declarations' }>,
  tokens: readonly Token[],
  item: Item,
): boolean {
  if (splice.kind === 'condition') {
    return item.kind === 'at-rule' && item.atKeyword === splice.atName
  }
  if (item.kind !== 'rule' || item.blockStart === undefined) return false
  return textOf(tokens, item.start, item.blockStart - 1).trim() === anchorSelectorList(splice.key)
}

interface ReadOutput {
  readonly closerFor: Int32Array
  readonly rule: Item
  readonly tokens: readonly Token[]
}

/**
 * `css` read as `.p` closed where it should be and then the sentinel as its own top-level rule,
 * or `undefined` when it is not. The sentinel counts only if it starts exactly where the text
 * appended after the directive begins, so a string that spells one of its own does not stand in
 * for it.
 */
function readRuleThenSentinel(css: string): ReadOutput | undefined {
  const tokens = tokenize(css)
  const closerFor = matchBrackets(tokens)
  const [rule, sentinel, ...rest] = itemsIn(tokens, closerFor, 0, tokens.length)
  if (rule === undefined || sentinel === undefined || rest.length > 0) return undefined
  if (rule.blockStart === undefined || closerFor[rule.blockStart - 1] !== rule.blockEnd) {
    return undefined
  }
  const isSentinelWhereAppended =
    textOf(tokens, 0, sentinel.start).length === css.length - SENTINEL.length
  const isSentinelText = textOf(tokens, sentinel.start, sentinel.end) === SENTINEL
  const isClosedBeforeIt = isOnlyInert(tokens, rule.end, sentinel.start)
  return isSentinelWhereAppended && isSentinelText && isClosedBeforeIt
    ? { closerFor, rule, tokens }
    : undefined
}

/**
 * Whether the expander's output for `splice` is `.p` closed where it should be, holding only what
 * the shape makes, and then the sentinel as its own top-level rule. A splice the expander cannot
 * write at all (a pseudo key with an empty branch) cannot escape, so it counts as staying inside.
 */
export function isInsideRule(splice: Splice): boolean {
  const { atoms, nested } = atomFor(splice)
  let css: string
  try {
    css = expandText(`.p { @nave ${ATOM}; }\n${SENTINEL}`, {
      extend: atoms as never,
      onUnknown: 'ignore',
    }).css
  } catch {
    return true
  }
  const read = readRuleThenSentinel(css)
  if (read === undefined) return false
  const { closerFor, rule, tokens } = read
  const inner = itemsIn(tokens, closerFor, rule.blockStart!, rule.blockEnd!)
  const nestedItems = inner.filter((item) => item.kind === 'rule' || item.kind === 'at-rule')
  if (nestedItems.length !== nested) return false
  return splice.kind === 'declarations' || isExpectedNested(splice, tokens, nestedItems[0]!)
}
