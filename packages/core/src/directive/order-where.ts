/**
 * How a warning says where a value holds: `on :focus-visible`, `under @media (width >= 75em)`, or
 * both. A selector that is one compound starting with `&` is named by what follows the `&`; any
 * other selector is named as written. When a second place is named after the first (the overrider
 * has a state or condition of its own), what the first already says is left out.
 */
import type { ConditionRule } from './condition-overlap.ts'

/**
 * What a state implies: an element matching `:focus-visible` matches `:focus` and `:focus-within`.
 */
const IMPLIED_STATES = new Map<string, readonly string[]>([
  [':focus', [':focus-within']],
  [':focus-visible', [':focus', ':focus-within']],
])

interface Scan {
  depth: number
  quote: string | undefined
}

/**
 * Advances the scan over one character; true when the character is code (outside a string).
 */
function isCodeChar(scan: Scan, text: string, i: number): boolean {
  const char = text[i]!
  if (scan.quote) {
    if (char === scan.quote && text[i - 1] !== '\\') scan.quote = undefined
    return false
  }
  if (char === '"' || char === "'") {
    scan.quote = char
    return false
  }
  if ('(['.includes(char)) scan.depth++
  else if (')]'.includes(char)) scan.depth--
  return true
}

/**
 * Whether the character starts a new simple selector of a compound.
 */
function isPartStart(text: string, i: number): boolean {
  return '.#[:'.includes(text[i]!) && text[i - 1] !== ':'
}

/**
 * The simple selectors after the `&` of a selector that is one compound starting with `&`, or
 * `undefined` when the selector is anything else (a combinator, a list, a second `&`).
 */
function compoundParts(selector: string): readonly string[] | undefined {
  const text = selector.trim()
  if (!text.startsWith('&')) return undefined
  const parts: string[] = []
  const scan: Scan = { depth: 0, quote: undefined }
  for (let i = 1; i < text.length; i++) {
    const isTopLevel = scan.depth === 0 && scan.quote === undefined
    const isCode = isCodeChar(scan, text, i)
    const isSeparator = isTopLevel && isCode && /[\s,>+~&]/.test(text[i]!)
    if (isSeparator || !isCharAppended(parts, text, i, isTopLevel && isCode)) return undefined
  }
  return parts
}

/**
 * Writes the character at `i` onto the compound's last simple selector, starting a new one first
 * where it begins one; false when there is no simple selector to write it onto.
 */
function isCharAppended(parts: string[], text: string, i: number, isCodeAtTop: boolean): boolean {
  if (isCodeAtTop && isPartStart(text, i)) parts.push('')
  const current = parts.pop()
  if (current === undefined) return false
  parts.push(current + text[i]!)
  return true
}

/**
 * A condition as a warning names it.
 */
function conditionText(condition: ConditionRule): string {
  return `@${condition.name} ${condition.prelude.replaceAll(/\s+/g, ' ').trim()}`
}

/**
 * `on <selector part>` and `under <conditions>`, whichever there are, in that order.
 */
function phrase(onText: string | undefined, conditions: readonly ConditionRule[]): string {
  const on = onText === undefined || onText === '' ? [] : [`on ${onText}`]
  const under =
    conditions.length === 0
      ? []
      : [`under ${conditions.map((c) => conditionText(c)).join(' and ')}`]
  return [...on, ...under].join(' ')
}

/**
 * The simple selectors after the `&` of a selector that is one compound starting with `&`, and
 * none for any other selector.
 */
export function statesOf(selector: string): readonly string[] {
  return compoundParts(selector) ?? []
}

/**
 * Where a selector under some conditions holds.
 */
export function whereOf(selector: string, conditions: readonly ConditionRule[]): string {
  const parts = compoundParts(selector)
  return phrase(parts === undefined ? selector.trim() : parts.join(''), conditions)
}

/**
 * Whether the states of `place` say `part` already, by naming it or by implying it.
 */
function isSaid(part: string, said: readonly string[]): boolean {
  const lower = part.toLowerCase()
  return said.some(
    (s) => s.toLowerCase() === lower || (IMPLIED_STATES.get(s.toLowerCase()) ?? []).includes(lower),
  )
}

/**
 * Where the overrider holds beyond what the first place says; empty when it adds nothing.
 */
export function alsoWhere(
  first: {
    readonly conditions: readonly ConditionRule[]
    readonly said?: readonly string[] | undefined
    readonly selector: string
  },
  later: { readonly conditions: readonly ConditionRule[]; readonly selector: string },
): string {
  const firstParts = first.said ?? compoundParts(first.selector) ?? []
  const laterParts = compoundParts(later.selector)
  const seen = new Set(first.conditions.map((c) => conditionText(c)))
  const conditions = later.conditions.filter((c) => !seen.has(conditionText(c)))
  if (laterParts === undefined) return phrase(later.selector.trim(), conditions)
  return phrase(laterParts.filter((part) => !isSaid(part, firstParts)).join(''), conditions)
}
