/**
 * A selector read as a structure: a list of complex selectors, each a run of compound
 * selectors, each a run of simple selectors. Built on the CSS tokenizer (`tokenize`), so a
 * `&`, a comma or a colon inside a string, an attribute value, a comment or an escape is
 * never mistaken for selector syntax. It records WHAT each simple selector is and keeps
 * a functional pseudo's argument as tokens; weighing them is `selector-specificity.ts`'s job.
 */
import { type Token, tokenize } from './tokenizer.ts'

export type Simple =
  | { readonly kind: 'class' | 'id' | 'nesting' | 'type' | 'universal' }
  | { readonly args: readonly Token[]; readonly kind: 'function'; readonly name: string }
  | { readonly args: readonly Token[]; readonly kind: 'pseudo-element'; readonly name: string }

export type Compound = readonly Simple[]
export type Complex = readonly Compound[]

const OPENERS = new Set(['(-token', '[-token', 'function-token', '{-token'])
const CLOSERS = new Set([')-token', ']-token', '}-token'])
const COMBINATOR_DELIMS = new Set(['+', '>', '~'])
const LEGACY_PSEUDO_ELEMENTS = new Set(['after', 'before', 'first-letter', 'first-line'])

interface Read {
  readonly simple?: Simple
  readonly next: number
}

/**
 * Whether `token` is the delimiter `value`.
 */
function isDelim(token: Token | undefined, value: string): boolean {
  return token?.type === 'delim-token' && token.raw === value
}

/**
 * Whether `token` can name a type selector: an ident or `*`.
 */
function isTypeName(token: Token | undefined): boolean {
  return token?.type === 'ident-token' || isDelim(token, '*')
}

/**
 * The index of the token that closes the group opened at `tokens[start]`, or the token count
 * when the group is never closed.
 */
function groupEnd(tokens: readonly Token[], start: number): number {
  let depth = 1
  let index = start + 1
  while (index < tokens.length) {
    const { type } = tokens[index]!
    if (OPENERS.has(type)) depth += 1
    else if (CLOSERS.has(type)) depth -= 1
    if (depth === 0) return index
    index += 1
  }
  return tokens.length
}

/**
 * The type selector (or `*`) that starts at `index`, taking an optional namespace prefix
 * (`svg|a`, `*|*`, `|a`) as part of it.
 */
function readTypeSelector(tokens: readonly Token[], index: number): Read {
  let nameIndex = index
  if (
    isTypeName(tokens[index]) &&
    isDelim(tokens[index + 1], '|') &&
    isTypeName(tokens[index + 2])
  ) {
    nameIndex = index + 2
  } else if (isDelim(tokens[index], '|') && isTypeName(tokens[index + 1])) {
    nameIndex = index + 1
  }
  const kind = isDelim(tokens[nameIndex], '*') ? 'universal' : 'type'
  return { simple: { kind }, next: nameIndex + 1 }
}

/**
 * The pseudo-class or pseudo-element written as an ident (`:hover`, `::before`, legacy
 * `:after`), whose name token is at `nameIndex`.
 */
function readIdentPseudo(name: Token, nameIndex: number, isElement: boolean): Read {
  const lowered = name.raw.toLowerCase()
  const isPseudoElement = isElement || LEGACY_PSEUDO_ELEMENTS.has(lowered)
  const simple: Simple = isPseudoElement
    ? { kind: 'pseudo-element', args: [], name: lowered }
    : { kind: 'class' }
  return { simple, next: nameIndex + 1 }
}

/**
 * The functional pseudo-class or pseudo-element (`:is(...)`, `::part(x)`) whose function
 * token is at `nameIndex`; its argument stays as tokens.
 */
function readFunctionPseudo(tokens: readonly Token[], nameIndex: number, isElement: boolean): Read {
  const end = groupEnd(tokens, nameIndex)
  const name = (tokens[nameIndex]!.structured as { value: string }).value.toLowerCase()
  const args = tokens.slice(nameIndex + 1, end)
  const kind = isElement ? 'pseudo-element' : 'function'
  return { simple: { kind, args, name }, next: end + 1 }
}

/**
 * The pseudo-class or pseudo-element whose colon is at `index`.
 */
function readPseudo(tokens: readonly Token[], index: number): Read {
  const isElement = tokens[index + 1]?.type === 'colon-token'
  const nameIndex = index + (isElement ? 2 : 1)
  const name = tokens[nameIndex]
  if (name?.type === 'ident-token') return readIdentPseudo(name, nameIndex, isElement)
  if (name?.type === 'function-token') return readFunctionPseudo(tokens, nameIndex, isElement)
  return { next: nameIndex }
}

/**
 * The simple selector that starts at `index`, or none for a token that is not selector
 * syntax; `next` is always past at least one token.
 */
function readSimple(tokens: readonly Token[], index: number): Read {
  const token = tokens[index]!
  if (isDelim(token, '&')) return { simple: { kind: 'nesting' }, next: index + 1 }
  if (isTypeName(token) || isDelim(token, '|')) return readTypeSelector(tokens, index)
  if (isDelim(token, '.') && tokens[index + 1]?.type === 'ident-token') {
    return { simple: { kind: 'class' }, next: index + 2 }
  }
  if (token.type === 'hash-token') return { simple: { kind: 'id' }, next: index + 1 }
  if (token.type === '[-token')
    return { simple: { kind: 'class' }, next: groupEnd(tokens, index) + 1 }
  if (token.type === 'colon-token') return readPseudo(tokens, index)
  return { next: index + 1 }
}

/**
 * Whether `token` separates two compound selectors: whitespace or a combinator.
 */
function isCombinator(token: Token): boolean {
  return (
    token.type === 'whitespace-token' ||
    (token.type === 'delim-token' && COMBINATOR_DELIMS.has(token.raw))
  )
}

/**
 * One complex selector read from its tokens, as the compound selectors between its
 * combinators; a leading combinator (`> .a`, as a relative selector begins) adds none.
 */
function parseComplex(tokens: readonly Token[]): Complex {
  const compounds: Simple[][] = []
  let current: Simple[] = []
  let index = 0
  while (index < tokens.length) {
    if (isCombinator(tokens[index]!)) {
      if (current.length > 0) compounds.push(current)
      current = []
      index += 1
      continue
    }
    const read = readSimple(tokens, index)
    if (read.simple) current.push(read.simple)
    index = read.next
  }
  if (current.length > 0) compounds.push(current)
  return compounds
}

/**
 * The tokens cut at the commas that sit outside every bracket, parenthesis and function.
 */
function splitOnCommas(tokens: readonly Token[]): Token[][] {
  const parts: Token[][] = [[]]
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.type === 'comma-token') {
      parts.push([])
      index += 1
      continue
    }
    const end = OPENERS.has(token.type) ? groupEnd(tokens, index) : index
    parts.at(-1)!.push(...tokens.slice(index, end + 1))
    index = end + 1
  }
  return parts
}

/**
 * The tokens of `text` with comments removed.
 */
function codeTokens(text: string): Token[] {
  return tokenize(text).filter((token) => token.type !== 'comment')
}

/**
 * A selector list read from its tokens, one `Complex` per comma-separated selector (a blank
 * part, as a trailing comma leaves, is dropped).
 */
export function parseSelectorTokens(tokens: readonly Token[]): Complex[] {
  return splitOnCommas(tokens)
    .map((part) => parseComplex(part))
    .filter((complex) => complex.length > 0)
}

/**
 * A selector list read from text.
 */
export function parseSelectorList(selectorList: string): Complex[] {
  return parseSelectorTokens(codeTokens(selectorList))
}

/**
 * The selector list that follows `of` in the argument of `:nth-child(An+B of S)`, or no tokens
 * when the argument has no `of` clause.
 */
export function tokensAfterOf(args: readonly Token[]): readonly Token[] {
  const ofIndex = args.findIndex(
    (token, index) =>
      token.type === 'ident-token' &&
      token.raw.toLowerCase() === 'of' &&
      args[index - 1]?.type === 'whitespace-token',
  )
  return ofIndex === -1 ? [] : args.slice(ofIndex + 1)
}

/**
 * The compound selector the declarations of `complex` apply to: its last one.
 */
export function subjectOf(complex: Complex): Compound {
  return complex.at(-1) ?? []
}

/**
 * Whether the compound holds a pseudo-element, which moves the match off the element.
 */
export function hasPseudoElement(compound: Compound): boolean {
  return compound.some((simple) => simple.kind === 'pseudo-element')
}
