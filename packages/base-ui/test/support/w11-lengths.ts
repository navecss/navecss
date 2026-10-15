/**
 * Lengths for the stylesheet criteria that are arithmetic on the built tokens: a box family
 * (`padding`, `scroll-padding`) spread over its four edges, and a length with each `var()` read
 * from the built tokens and each `calc()` evaluated.
 */
import type { AttributeState, RuleBlock } from './w11-rules.ts'

import { builtTokens } from './w6-sheet.ts'
import { effectiveOrdered } from './w11-rules.ts'

export const EDGES = ['block-start', 'inline-end', 'block-end', 'inline-start'] as const
export type Edge = (typeof EDGES)[number]
type Edges = Partial<Record<Edge, string>>

const PHYSICAL: Readonly<Record<string, Edge>> = {
  top: 'block-start',
  right: 'inline-end',
  bottom: 'block-end',
  left: 'inline-start',
}

const topLevelWords = (value: string): string[] => {
  const words: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    if (char === ' ' && depth === 0) {
      if (current !== '') words.push(current)
      current = ''
    } else current += char
  }
  if (current !== '') words.push(current)
  return words
}

const spread = (words: readonly string[]): Edges => {
  const [a] = words
  if (a === undefined || words.length > 4) return {}
  const b = words[1] ?? a
  const c = words[2] ?? a
  const d = words[3] ?? b
  return { 'block-start': a, 'inline-end': b, 'block-end': c, 'inline-start': d }
}

const pairEdges = (axis: 'block' | 'inline', words: readonly string[]): Edges => {
  const [first] = words
  if (first === undefined || words.length > 2) return {}
  const second = words[1] ?? first
  return axis === 'block'
    ? { 'block-start': first, 'block-end': second }
    : { 'inline-start': first, 'inline-end': second }
}

const edgeNamed = (suffix: string): Edge | undefined =>
  EDGES.find((edge) => edge === suffix) ?? PHYSICAL[suffix]

/**
What one declaration of a box family sets, edge by edge, with a horizontal left-to-right writing
mode for the physical names. A property of the family that this cannot read throws, so a plant it
cannot see is loud.
 */
const edgesSet = (base: string, property: string, value: string): Edges => {
  const words = topLevelWords(value)
  const suffix = property === base ? '' : property.slice(base.length + 1)
  if (suffix === '') return spread(words)
  if (suffix === 'block' || suffix === 'inline') return pairEdges(suffix, words)
  const edge = edgeNamed(suffix)
  if (edge === undefined) throw new Error(`cannot read ${property}: ${value}`)
  return { [edge]: words[0] ?? '' }
}

const isOfFamily = (base: string, property: string): boolean =>
  property === base || property.startsWith(`${base}-`)

/**
The four edges of a box family on an element carrying the attributes, as written (unresolved).
 */
export const boxEdges = (
  blocks: readonly RuleBlock[],
  state: AttributeState,
  base: string,
): Edges => {
  let edges: Edges = {}
  for (const [property, value] of effectiveOrdered(blocks, state)) {
    if (isOfFamily(base, property)) edges = { ...edges, ...edgesSet(base, property, value) }
  }
  return edges
}

const PX_PER_REM = 16
const TOKEN = /(\d*\.?\d+)(px|rem)?|[()*+/-]/g

const substituteTokens = (value: string, tokens: ReadonlyMap<string, string>): string => {
  let out = value
  for (let round = 0; round < 10 && out.includes('var('); round += 1) {
    out = out.replaceAll(/var\((--[\w-]+)\)/g, (_, name: string) => {
      const token = tokens.get(name)
      if (token === undefined) throw new Error(`${name} is not a built token`)
      return token
    })
  }
  return out
}

interface Cursor {
  readonly words: readonly string[]
  at: number
}

const take = (cursor: Cursor): string | undefined => {
  const word = cursor.words[cursor.at]
  cursor.at += 1
  return word
}

const isNextAmong = (cursor: Cursor, ...operators: string[]): boolean =>
  operators.includes(cursor.words[cursor.at] ?? '')

const toPx = (word: string): number => {
  const [, amount = '', unit] = /^(\d*\.?\d+)(px|rem)?$/.exec(word) ?? []
  if (amount === '') throw new Error(`cannot read ${word} as a length`)
  return Number(amount) * (unit === 'rem' ? PX_PER_REM : 1)
}

const factor = (cursor: Cursor): number => {
  const word = take(cursor)
  if (word === '(') {
    const inner = sum(cursor)
    if (take(cursor) !== ')') throw new Error('unbalanced calc()')
    return inner
  }
  if (word === '-') return -factor(cursor)
  if (word === undefined) throw new Error('a length ends early')
  return toPx(word)
}

const product = (cursor: Cursor): number => {
  let total = factor(cursor)
  while (isNextAmong(cursor, '*', '/')) {
    const operator = take(cursor)
    const next = factor(cursor)
    total = operator === '*' ? total * next : total / next
  }
  return total
}

/**
 *
 */
function sum(cursor: Cursor): number {
  let total = product(cursor)
  while (isNextAmong(cursor, '+', '-')) {
    const operator = take(cursor)
    const next = product(cursor)
    total = operator === '+' ? total + next : total - next
  }
  return total
}

/**
 * A length in pixels, with the built tokens substituted for each `var()` and `calc()` evaluated
 * (`+`, `-`, `*`, `/` and parentheses; `px`, `rem` and bare numbers). It is a tiny reader of exactly
 * that, and throws on anything else.
 */
export const lengthPx = (
  value: string,
  tokens: ReadonlyMap<string, string> = builtTokens(),
): number => {
  const text = substituteTokens(value, tokens).replaceAll('calc(', '(')
  const cursor: Cursor = { words: text.match(TOKEN) ?? [], at: 0 }
  const result = sum(cursor)
  if (cursor.at !== cursor.words.length || cursor.words.join('') !== text.replaceAll(/\s+/g, '')) {
    throw new Error(`cannot read ${value}`)
  }
  return result
}
