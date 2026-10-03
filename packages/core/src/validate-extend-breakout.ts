/**
 * Whether a string `validateExtendAtoms` or `validateExtendAtomsHostFree` refused would still sit
 * inside the rule it is spliced into. It runs on the refusal path only, so it never changes what
 * is accepted: it decides which sentence the refusal prints. The string is spliced into a probe
 * stylesheet where the expander would put it, a sentinel rule follows, and the core's own
 * tokenizer and block reader read the whole. The string stays inside its rule when the probe is
 * read as exactly one rule that closes where it should, followed by the sentinel as its own
 * top-level rule; anything else (a rule that closes early, an extra top-level item, a block that
 * swallows the sentinel) is a break-out.
 */
import type { Item } from './directive/block-reader.ts'
import type { Token } from './directive/tokenizer.ts'

import { matchBrackets, readItem } from './directive/block-reader.ts'
import { tokenize } from './directive/tokenizer.ts'

const SENTINEL = '.nave-sentinel{}'

/**
 * The top-level items of `tokens`, in order, skipping whitespace and comments between them.
 */
function topLevelItems(tokens: readonly Token[], closerFor: Int32Array): Item[] {
  const items: Item[] = []
  let i = 0
  while (i < tokens.length) {
    const type = tokens[i]!.type
    if (type === 'whitespace-token' || type === 'comment') {
      i++
      continue
    }
    const item = readItem(tokens, i, tokens.length, closerFor)
    items.push(item)
    i = Math.max(item.end, i + 1)
  }
  return items
}

/**
 * Whether `probe`, read followed by a sentinel rule, is one rule with a closed block and then the
 * sentinel as its own top-level rule.
 */
export function isInsideRule(probe: string): boolean {
  const tokens = tokenize(`${probe}${SENTINEL}`)
  const closerFor = matchBrackets(tokens)
  const [first, sentinel, ...rest] = topLevelItems(tokens, closerFor)
  if (first === undefined || sentinel === undefined || rest.length > 0) return false
  if (first.blockStart === undefined || closerFor[first.blockStart - 1] !== first.blockEnd) {
    return false
  }
  const sentinelText = tokens
    .slice(sentinel.start, sentinel.end)
    .map((token) => token.raw)
    .join('')
  return sentinelText === SENTINEL
}
