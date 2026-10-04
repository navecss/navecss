/**
 * Just enough structure over a stylesheet to find and rewrite the blocks of one layer: the
 * statements of a region (a rule, an at-rule with a block, or a plain statement) with the
 * matching brace of each block. Built on the first-party tokenizer, so strings, comments,
 * escapes and parentheses are read the way the CSS syntax reads them, never by a regex.
 */
import type { Token } from './directive/tokenizer.ts'

import { tokenize } from './directive/tokenizer.ts'

export interface Statement {
  /**
   * The token range, leading whitespace included: `[from, to)`.
   */
  readonly from: number
  readonly to: number
  /**
   * For a statement with a block: the tokens of its `{` and its matching `}`.
   */
  readonly open?: number
  readonly close?: number
}

export interface Sheet {
  readonly tokens: readonly Token[]
  /**
   * The text of the tokens `[from, to)`.
   */
  slice(from: number, to: number): string
  /**
   * The statements of the token range `[from, to)`.
   */
  statements(from: number, to: number): Statement[]
}

/**
 * The index of the matching `}` of each `{` token.
 */
function matchBraces(tokens: readonly Token[]): Map<number, number> {
  const matches = new Map<number, number>()
  const open: number[] = []
  for (const [index, token] of tokens.entries()) {
    if (token.type === '{-token') open.push(index)
    else if (token.type === '}-token' && open.length > 0) matches.set(open.pop()!, index)
  }
  return matches
}

/**
 * Whether a token range holds only whitespace and comments.
 */
function isBlank(tokens: readonly Token[], from: number, to: number): boolean {
  for (let index = from; index < to; index += 1) {
    const type = tokens[index]!.type
    if (type !== 'whitespace-token' && type !== 'comment') return false
  }
  return true
}

const OPENERS = new Set(['(-token', '[-token', 'function-token'])
const CLOSERS = new Set([')-token', ']-token'])

/**
 * Reads `css` into a `Sheet`.
 */
export function readSheet(css: string): Sheet {
  const tokens = tokenize(css)
  const matches = matchBraces(tokens)
  return {
    tokens,
    slice: (from, to) =>
      css.slice(tokens[from]?.startIndex ?? css.length, tokens[to - 1]?.endIndex ?? 0),
    statements(from, to) {
      const found: Statement[] = []
      let start = from
      let index = from
      let depth = 0
      while (index < to) {
        const type = tokens[index]!.type
        if (OPENERS.has(type)) depth += 1
        else if (CLOSERS.has(type)) depth = Math.max(0, depth - 1)
        // A `{}` inside parentheses or brackets is a value in a prelude, not the block of the rule.
        const close = type === '{-token' && depth === 0 ? matches.get(index) : undefined
        if (close !== undefined && close < to) {
          found.push({ from: start, to: close + 1, open: index, close })
          index = close + 1
          start = index
        } else if (type === 'semicolon-token') {
          found.push({ from: start, to: index + 1 })
          index += 1
          start = index
        } else {
          index += 1
        }
      }
      if (!isBlank(tokens, start, to)) found.push({ from: start, to })
      return found
    },
  }
}

/**
 * The index of the first token in `[from, to)` that is neither whitespace nor a comment.
 */
export function firstSignificant(tokens: readonly Token[], from: number, to: number): number {
  let index = from
  while (index < to && isBlank(tokens, index, index + 1)) index += 1
  return index
}
