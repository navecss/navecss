/**
 * R5(b): the directive's prelude is read as CSS component values, not split
 * on whitespace. An ident is a candidate atom name; a comma, a string, a
 * number, a function together with its arguments, a simple `[...]`/`{...}`
 * block, and a `!` together with the ident that follows it are each ONE
 * `bad-token` component spanning the whole thing.
 */
import { type Token, tokenize } from './tokenizer.ts'

export interface IdentComponent {
  readonly kind: 'ident'
  readonly name: string
  readonly offset: number
  readonly endOffset: number
}

export interface BadTokenComponent {
  readonly kind: 'bad-token'
  readonly text: string
  readonly offset: number
  readonly endOffset: number
}

export type PreludeComponent = IdentComponent | BadTokenComponent

const OPENERS = new Set(['(-token', '[-token', 'function-token', '{-token'])
const CLOSERS = new Set([')-token', ']-token', '}-token'])

/**
The index just past the token that closes the balanced group opened at `tokens[start]`.
 */
function findGroupEnd(tokens: readonly Token[], start: number): number {
  let depth = 1
  let i = start + 1
  while (i < tokens.length && depth > 0) {
    if (OPENERS.has(tokens[i]!.type)) depth++
    else if (CLOSERS.has(tokens[i]!.type)) depth--
    i++
  }
  return i
}

/**
The whole balanced group (a function call or a `[...]`/`{...}` block) as one `bad-token` component.
 */
function readGroup(tokens: readonly Token[], start: number, prelude: string): BadTokenComponent {
  const end = findGroupEnd(tokens, start)
  const last = tokens[end - 1] ?? tokens[start]!
  return {
    kind: 'bad-token',
    text: prelude.slice(tokens[start]!.startIndex, last.endIndex),
    offset: tokens[start]!.startIndex,
    endOffset: last.endIndex,
  }
}

/**
True at a `!` delim immediately followed by an ident — R5(b)'s `!important`-shaped pair.
 */
function isBangIdent(tokens: readonly Token[], i: number): boolean {
  const t = tokens[i]!
  return (
    t.type === 'delim-token' && t.structured?.value === '!' && tokens[i + 1]?.type === 'ident-token'
  )
}

/**
A `!` plus the ident after it, as one `bad-token` component.
 */
function readBangIdent(tokens: readonly Token[], i: number): BadTokenComponent {
  const bang = tokens[i]!
  const ident = tokens[i + 1]!
  return {
    kind: 'bad-token',
    text: bang.raw + ident.raw,
    offset: bang.startIndex,
    endOffset: ident.endIndex,
  }
}

/**
An ident becomes a candidate atom name; anything else is its own one-token `bad-token`.
 */
function readSingleToken(t: Token): PreludeComponent {
  if (t.type === 'ident-token') {
    return {
      kind: 'ident',
      name: t.structured?.value as string,
      offset: t.startIndex,
      endOffset: t.endIndex,
    }
  }
  return { kind: 'bad-token', text: t.raw, offset: t.startIndex, endOffset: t.endIndex }
}

/**
The prelude's component values, comments and whitespace already skipped.
 */
export function readPreludeComponents(prelude: string): PreludeComponent[] {
  const tokens = tokenize(prelude).filter(
    (t) => t.type !== 'whitespace-token' && t.type !== 'comment',
  )
  const components: PreludeComponent[] = []

  let i = 0
  while (i < tokens.length) {
    if (OPENERS.has(tokens[i]!.type)) {
      components.push(readGroup(tokens, i, prelude))
      i = findGroupEnd(tokens, i)
      continue
    }
    if (isBangIdent(tokens, i)) {
      components.push(readBangIdent(tokens, i))
      i += 2
      continue
    }
    components.push(readSingleToken(tokens[i]!))
    i++
  }

  return components
}
