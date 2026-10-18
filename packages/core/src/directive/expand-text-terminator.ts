/**
 * The `;` a block's last item may be missing before `expandText()` appends text after it, split
 * out of `expand-text-walk.ts` to keep that file under the project's file-length lint.
 */
import type { Item } from './block-reader.ts'
import type { Token } from './tokenizer.ts'

import { isNaveAtKeyword } from './block-reader.ts'

/**
 * The offset right after the last real token of `item` when `item` has no `;` and text appended
 * after it would be read as more of it, else `undefined`. Appending after `color: red` gives a
 * value `red &:focus-visible { ... }` that the browser drops together with the declaration, so
 * the `;` goes straight after `red`, ahead of any comment or space that follows.
 *
 * A rule, or an at-rule with a block, ends in its own `}`. A `@nave` directive is replaced by
 * text that carries its own `;`.
 */
export function unterminatedEnd(
  tokens: readonly Token[],
  item: Item | undefined,
): number | undefined {
  if (item === undefined || item.blockStart !== undefined) return undefined
  if (item.kind === 'at-rule' && isNaveAtKeyword(tokens[item.start]!)) return undefined
  let i = item.end - 1
  while (
    i > item.start &&
    (tokens[i]!.type === 'whitespace-token' || tokens[i]!.type === 'comment')
  ) {
    i--
  }
  const last = tokens[i]!
  return last.type === 'semicolon-token' ? undefined : last.endIndex
}
