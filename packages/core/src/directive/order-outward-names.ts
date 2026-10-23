/**
 * How an outward warning names the blocks in it and the place it holds: a block by its printed
 * name, with an ordinal where another has the same name, and a place with the selectors of the
 * rules on the path folded in.
 */
import type { ModelNode } from './rule-model.ts'

import { printedValue } from './order-print.ts'
import { tokenize } from './tokenizer.ts'

/**
 * How a warning names a nested node of the rule's own.
 */
export function nestedText(node: ModelNode): string {
  if (node.kind === 'rule') return `the ${printedValue(node.selector)} block`
  if (node.kind === 'group' || node.kind === 'opaque') {
    return ['the', `@${node.name}`, printedValue(node.prelude), 'block']
      .filter((part) => part !== '')
      .join(' ')
  }
  return ''
}

const SMALL_ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
]

/**
 * `first` to `tenth`, then `11th`, `21st`, `22nd`, `23rd`.
 */
function ordinal(place: number): string {
  if (place <= SMALL_ORDINALS.length) return SMALL_ORDINALS[place - 1]!
  const lastTwo = place % 100
  const last = place % 10
  if (lastTwo < 11 || lastTwo > 13) {
    if (last === 1) return `${place}st`
    if (last === 2) return `${place}nd`
    if (last === 3) return `${place}rd`
  }
  return `${place}th`
}

/**
 * What a block is called without its article: a rule by its selector, an at-rule by its name and
 * prelude, both in printed form.
 */
function bareName(node: ModelNode): string | undefined {
  if (node.kind === 'rule') return printedValue(node.selector)
  if (node.kind === 'group' || node.kind === 'opaque') {
    return [`@${node.name}`, printedValue(node.prelude)]
      .filter((part) => part !== '@' && part !== '')
      .join(' ')
  }
  return undefined
}

/**
 * How each block among `nodes` is named in an outward warning, by its `ref`: `the {name} block`,
 * with an ordinal (`the second & block`) where another of them has the same name.
 */
export function namesOf(nodes: readonly ModelNode[]): Map<number, string> {
  const names = nodes.map((node) => bareName(node))
  const places = new Map<string, number>()
  const names2 = new Map<number, string>()
  for (const [index, node] of nodes.entries()) {
    const name = names[index]
    if (name === undefined) continue
    const count = names.filter((other) => other === name).length
    const place = (places.get(name) ?? 0) + 1
    places.set(name, place)
    names2.set(node.ref, count > 1 ? `the ${ordinal(place)} ${name} block` : `the ${name} block`)
  }
  return names2
}

/**
 * The selector `selector` stands for once each `&` in it is the place so far, inside `:is( )`
 * where that is a list.
 */
function foldInto(selector: string, place: string): string {
  const tokens = tokenize(selector)
  let depth = 0
  let isList = false
  for (const token of tokenize(place)) {
    if (token.type === '(-token' || token.type === 'function-token') depth += 1
    else if (token.type === ')-token') depth -= 1
    else if (depth === 0 && token.type === 'comma-token') isList = true
  }
  const replacement = isList ? `:is(${place})` : place
  return tokens
    .map((token) => (token.type === 'delim-token' && token.raw === '&' ? replacement : token.raw))
    .join('')
}

/**
 * Where a block holds, folding the selectors of the rules on the path into the block's own: a
 * bare `&` adds nothing.
 */
export function placeOf(path: readonly string[], blockSelector: string): string {
  let place = '&'
  for (const selector of [...path, blockSelector]) {
    const printed = printedValue(selector)
    if (printed !== '&') place = foldInto(printed, place)
  }
  return place
}
