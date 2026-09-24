/**
 * `$ref`, the second of DTCG 2025.10's two reference forms, narrowed to WHOLE-TOKEN pointers.
 *
 * Implementing one of the format's two reference forms while naming the format on the package
 * README reinstates the very defect this migration closes, one level down, so `$ref` is
 * supported rather than refused. What it is narrowed AGAINST is a pointer into a sub-value
 * (one channel of a colour, one sub-field of a shadow layer), which would make a token's value
 * depend on another token's internal structure.
 *
 * **The behaviour this replaces was worse than any refusal.** A `$ref` node carries no
 * `$value`, so the tree walk read it as a GROUP, skipped its `$`-prefixed keys and emitted
 * nothing: the token silently did not exist, at exit `0`, with no message, and a consumer's
 * `var(--nave-...)` then resolved to nothing.
 */

import { READER, SPEC_POINTER } from './dtcg-shape.ts'

/**
RFC 6901: `~1` is a literal `/` and `~0` a literal `~`, unescaped in that order.
 */
const unescapeSegment = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~')

/**
 * The path a JSON Pointer names, as the dotted key the reader's own `byPath` map is built on.
 * Accepts the `#`-prefixed fragment form the format's examples use, and the bare form.
 */
function pointerToPath(pointer: string, at: string): string[] {
  const body = pointer.startsWith('#') ? pointer.slice(1) : pointer
  if (body !== '' && !body.startsWith('/')) {
    throw new TypeError(
      `${READER} "${at}" carries a $ref that is not a JSON Pointer ("${pointer}"); a pointer starts at the document root, as in "#/spacing/md". ${SPEC_POINTER}`,
    )
  }
  return body
    .split('/')
    .slice(1)
    .map((segment) => unescapeSegment(segment))
}

/**
 * The dotted path of the whole token `pointer` names, or a named refusal. A pointer whose
 * target is not a token but whose PREFIX is one is a sub-value pointer, and is refused as
 * that rather than as an unresolved target: the two are different mistakes and telling a
 * reader their token does not exist when it does sends them looking in the wrong place.
 */
export function resolveTokenPointer(
  pointer: string,
  at: string,
  isToken: (path: string) => boolean,
): string {
  const segments = pointerToPath(pointer, at)
  const target = segments.join('.')
  if (isToken(target)) return target

  for (let end = segments.length - 1; end > 0; end--) {
    const prefix = segments.slice(0, end).join('.')
    if (isToken(prefix)) {
      throw new TypeError(
        `${READER} "${at}" carries a $ref pointing into a sub-value of "${prefix}" ("${pointer}"), not at a whole token. Point at the token itself, or give the inner value a token of its own and point at that. ${SPEC_POINTER}`,
      )
    }
  }

  throw new TypeError(
    `${READER} "${at}" carries a $ref to "${pointer}", which names no token in this source. ${SPEC_POINTER}`,
  )
}

/**
 * A node may carry `$ref` or its own `$value`, never both at once. The case the format's two
 * reference forms make sharp is a `$ref` beside a `{group.token}` alias, which states the same
 * kind of thing twice; a `$ref` beside a literal is the same ambiguity with one of the two
 * silently losing, which is the failure mode this whole migration is about.
 */
export function refuseBothReferenceForms(at: string): never {
  throw new TypeError(
    `${READER} "${at}" carries both a $ref pointer and its own $value. A node states its value one way or the other: keep one and delete the other. ${SPEC_POINTER}`,
  )
}
