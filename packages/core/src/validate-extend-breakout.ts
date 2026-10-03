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
  const tokens = tokenize(css)
  const closerFor = matchBrackets(tokens)
  const [rule, sentinel, ...rest] = itemsIn(tokens, closerFor, 0, tokens.length)
  if (rule === undefined || sentinel === undefined || rest.length > 0) return false
  if (rule.blockStart === undefined || closerFor[rule.blockStart - 1] !== rule.blockEnd) {
    return false
  }
  const sentinelText = tokens
    .slice(sentinel.start, sentinel.end)
    .map((token) => token.raw)
    .join('')
  if (sentinelText !== SENTINEL) return false
  const inner = itemsIn(tokens, closerFor, rule.blockStart, rule.blockEnd!)
  return inner.filter((item) => item.kind === 'rule' || item.kind === 'at-rule').length === nested
}
