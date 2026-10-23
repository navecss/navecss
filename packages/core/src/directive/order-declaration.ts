/**
 * Reads a declaration the order check compares: the value without a trailing `!important`, and
 * that flag as a fact of its own.
 */
import type { OrderDeclaration } from './order-model.ts'
import type { Declaration } from './plan.ts'

import { tokenize } from './tokenizer.ts'

/**
 * The index of the last token that is not whitespace or a comment, or -1.
 */
function lastSignificant(tokens: ReturnType<typeof tokenize>, before: number): number {
  let i = before - 1
  while (i >= 0 && (tokens[i]!.type === 'whitespace-token' || tokens[i]!.type === 'comment')) i--
  return i
}

/**
 * A declaration whose value may end in `!important`, as the declaration and the flag.
 */
export function toOrderDeclaration(declaration: Declaration): OrderDeclaration {
  const tokens = tokenize(declaration.value)
  const last = lastSignificant(tokens, tokens.length)
  const ident = tokens[last]
  if (
    ident?.type !== 'ident-token' ||
    String(ident.structured?.value).toLowerCase() !== 'important'
  ) {
    return { prop: declaration.prop, value: declaration.value, important: false }
  }
  const bang = lastSignificant(tokens, last)
  if (tokens[bang]?.type !== 'delim-token' || tokens[bang].structured?.value !== '!') {
    return { prop: declaration.prop, value: declaration.value, important: false }
  }
  const value = declaration.value.slice(0, tokens[bang].startIndex).trim()
  return { prop: declaration.prop, value, important: true }
}
