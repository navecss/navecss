/**
 * Which `@import` of a stylesheet names a bare module specifier: one a browser cannot load, which
 * `navecss-core expand` reports because it never inlines an import. Reads CSS Syntax Level 3 tokens
 * and looks only at an at-rule of the stylesheet itself, so an `@import` in a comment, a string, a
 * declaration value or a block is never one. The answer to "does this name a file beside the
 * stylesheet" is the caller's: this module reads no file.
 */
import type { Diagnostic } from './diagnostics-types.ts'
import type { Token } from './tokenizer.ts'

import { atKeywordName } from './block-reader.ts'
import { tokenize } from './tokenizer.ts'

const OPENERS: ReadonlySet<string> = new Set(['(-token', '[-token', 'function-token', '{-token'])
const CLOSERS: ReadonlySet<string> = new Set([')-token', ']-token', '}-token'])
const SCHEME = /^[a-z][a-z\d+.-]*:/i

/**
 * Whether `token` is trivia between the pieces of a prelude.
 */
function isTrivia(token: Token): boolean {
  return token.type === 'whitespace-token' || token.type === 'comment'
}

/**
 * The specifier an `@import` names, from the tokens after its keyword: a string, a `url()` token,
 * or `url(` with a string argument. `undefined` for anything else (`@import layer(x);`).
 */
function specifierOf(prelude: readonly Token[]): string | undefined {
  const [first, second] = prelude.filter((token) => !isTrivia(token))
  if (first?.type === 'string-token' || first?.type === 'url-token') {
    return (first.structured as { value: string }).value
  }
  const isUrlFunction =
    first?.type === 'function-token' &&
    (first.structured as { value: string }).value.toLowerCase() === 'url'
  if (isUrlFunction && second?.type === 'string-token') {
    return (second.structured as { value: string }).value
  }
  return undefined
}

/**
 * Whether `specifier` is a bare module specifier: none of the URL forms a browser resolves on its
 * own (an absolute path, a relative one, anything with a scheme, a query or fragment alone), and no
 * file of that name beside the importing stylesheet (`hasFile`, asked about the specifier without a
 * query or fragment).
 */
function isBare(specifier: string, hasFile: (specifier: string) => boolean): boolean {
  const isUrlForm =
    withoutQueryOrFragment(specifier) === '' ||
    specifier.startsWith('/') ||
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    SCHEME.test(specifier)
  return !isUrlForm && !hasFile(decoded(withoutQueryOrFragment(specifier)))
}

/**
 * `specifier` up to its first `?` or `#`.
 */
function withoutQueryOrFragment(specifier: string): string {
  const ends = [specifier.indexOf('?'), specifier.indexOf('#')].filter((at) => at !== -1)
  return ends.length === 0 ? specifier : specifier.slice(0, Math.min(...ends))
}

/**
 * The file name a URL path names: its percent-encoded characters read as the characters they are
 * (`theme%20file.css` is `theme file.css`), or the text as it is when it is not valid encoding.
 */
function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/**
 * The index of the token that ends the at-rule opening at `from`: its `;`, or a `{` (a block
 * at-rule, whose block the depth count of the caller then reads), or the end of the input.
 */
function endOfPrelude(tokens: readonly Token[], from: number): number {
  const end = tokens.findIndex(
    (token, index) =>
      index >= from && (token.type === 'semicolon-token' || token.type === '{-token'),
  )
  return end === -1 ? tokens.length : end
}

interface ImportAt {
  readonly diagnostic: Diagnostic | undefined
  /**
   * The index of the last token the at-rule read.
   */
  readonly end: number
}

/**
 * Reads the `@import` whose keyword is `tokens[index]`: its diagnostic when it names a bare
 * module, and where the at-rule ends.
 */
function readImport(
  tokens: readonly Token[],
  index: number,
  hasFile: (specifier: string) => boolean,
): ImportAt {
  const end = endOfPrelude(tokens, index + 1)
  const specifier = specifierOf(tokens.slice(index + 1, end))
  if (specifier === undefined || !isBare(specifier, hasFile)) return { diagnostic: undefined, end }
  const lastIndex = tokens[end]?.type === 'semicolon-token' ? end : end - 1
  const diagnostic: Diagnostic = {
    code: 'bare-import',
    offset: tokens[index]!.startIndex,
    endOffset: tokens[lastIndex]!.endIndex,
    text: specifier,
  }
  return { diagnostic, end }
}

/**
 * One `bare-import` diagnostic per top-level `@import` of `css` that names a bare module, in
 * source order. `offset` is its `@` and `endOffset` the end of the at-rule (through its `;`).
 */
export function findBareImports(
  css: string,
  hasFile: (specifier: string) => boolean,
): Diagnostic[] {
  const tokens = tokenize(css)
  const found: Diagnostic[] = []
  let depth = 0
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    let next = index + 1
    // Every kind of open bracket counts, so an `@import` token inside `:is(...)` or `[...]` is
    // not an at-rule of the stylesheet.
    if (OPENERS.has(token.type)) depth++
    else if (CLOSERS.has(token.type)) depth = Math.max(0, depth - 1)
    else if (
      depth === 0 &&
      token.type === 'at-keyword-token' &&
      atKeywordName(token) === 'import'
    ) {
      const read = readImport(tokens, index, hasFile)
      if (read.diagnostic) found.push(read.diagnostic)
      next = read.end + 1
    }
    index = next
  }
  return found
}
