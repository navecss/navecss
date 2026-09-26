import type { Diagnostic } from './diagnostics-types.ts'
import type { ExtendMap } from './resolve.ts'

/**
 * R6: the diagnostic texts, owned by the core. Every host prints
 * these bodies unchanged apart from its own prefix and frame.
 */
import { atomClassMap, type AtomDefinition, atoms } from '../atoms.ts'

export interface FormatOptions {
  readonly extend?: ExtendMap
}

/**
Every currently-valid atom name, built-ins first (in definition order), then `extend`'s own (round-3 decision 2, AC-14).
 */
function vocabulary(extend: ExtendMap): string[] {
  const extendKeys = new Set(Object.keys(extend))
  const names: string[] = []
  for (const [name, definition] of Object.entries(atoms as Record<string, AtomDefinition>)) {
    if (definition && !extendKeys.has(name)) names.push(name)
  }
  for (const [name, definition] of Object.entries(extend)) {
    if (definition) names.push(name)
  }
  return names
}

/**
True Damerau-Levenshtein distance (adjacent transpositions count as one edit), on normalized names.
 */
function distance(a: string, b: string): number {
  const d: number[][] = []
  for (let i = 0; i <= a.length; i++) d.push([i])
  for (let j = 0; j <= b.length; j++) d[0]![j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1)
      }
      d[i]![j] = best
    }
  }
  return d[a.length]![b.length]!
}

/**
Lowercased, `-`-stripped, with a leading `nave` prefix (from `nave-`) dropped, per the hint rule.
 */
function normalize(name: string): string {
  const lower = name.toLowerCase()
  const withoutPrefix = lower.startsWith('nave-') ? lower.slice(5) : lower
  return withoutPrefix.replaceAll('-', '')
}

interface Hint {
  readonly candidates: readonly string[]
  readonly camelCaseNote: boolean
}

/**
R6's hint rule: candidates at the minimum distance, when that distance is <= 2 and strictly below half the normalized typed name's length.
 */
function findHint(typed: string, extend: ExtendMap): Hint | undefined {
  const normalizedTyped = normalize(typed)
  const names = vocabulary(extend)

  let minDistance = Infinity
  const byDistance = new Map<number, string[]>()
  for (const name of names) {
    const d = distance(normalizedTyped, normalize(name))
    if (!byDistance.has(d)) byDistance.set(d, [])
    byDistance.get(d)!.push(name)
    if (d < minDistance) minDistance = d
  }

  if (minDistance > 2 || minDistance >= normalizedTyped.length / 2) return undefined
  const candidates = byDistance.get(minDistance) ?? []
  if (candidates.length === 0) return undefined

  const isHyphenated = typed.includes('-')
  const isNormalizesToExactlyOne = candidates.length === 1 && minDistance === 0
  return { candidates, camelCaseNote: isHyphenated && isNormalizesToExactlyOne }
}

/**
 *
 */
function quoteList(items: readonly string[]): string {
  if (items.length === 1) return `"${items[0]}"`
  return `${items.slice(0, -1).map((i) => `"${i}"`).join(', ')} or "${items.at(-1)}"`
}

/**
 *
 */
function formatUnknownAtom(name: string, extend: ExtendMap): string {
  const first = `@nave: unknown atom "${name}".`
  const hint = findHint(name, extend)
  if (hint) {
    const camelCase = hint.camelCaseNote
      ? ` Atom names are camelCase; "${atomClassMap[hint.candidates[0] as keyof typeof atomClassMap]}" is its class.`
      : ''
    return `${first} Did you mean ${quoteList(hint.candidates)}?${camelCase}`
  }
  const available = vocabulary(extend).join(', ')
  return `${first} If it is an atom of your own, pass it in the extend option.\nAvailable: ${available}`
}

const BAD_PARENT_WORKAROUND = ' A directive here can be written `& { @nave ...; }` inside the group rule instead.'

/**
 *
 */
function formatBadParent(diagnostic: Diagnostic): string {
  const workaround = diagnostic.detail === 'nested-group' ? BAD_PARENT_WORKAROUND : ''
  return `@nave must be the direct child of a CSS rule selector block${workaround}`
}

/**
Every diagnostic whose text needs nothing beyond the diagnostic itself — no vocabulary, no hint.
 */
const FIXED_TEXTS: Readonly<Record<Exclude<Diagnostic['code'], 'unknown-atom' | 'bad-parent'>, (d: Diagnostic) => string>> = {
  'bad-token': (d) => `@nave: unexpected "${d.text ?? ''}"; separate atom names with spaces`,
  'bare-import': () => '@import specifies a bare module: a browser cannot load it',
  'has-block': () => '@nave: a directive with a {} block is not supported',
  'in-keyframes': () => '@nave cannot be used inside @keyframes',
  'missing-declarations': (d) => `@nave: atom "${d.name ?? ''}" is registered without a declarations object`,
  'no-atom': () => '@nave: directive names no atom',
}

/**
 * `formatDiagnostic(diagnostic, options)`: the one text a host prints for
 * `diagnostic`, its own prefix/frame aside.
 */
export function formatDiagnostic(diagnostic: Diagnostic, options: FormatOptions = {}): string {
  if (diagnostic.code === 'unknown-atom') return formatUnknownAtom(diagnostic.name!, options.extend ?? {})
  if (diagnostic.code === 'bad-parent') return formatBadParent(diagnostic)
  return FIXED_TEXTS[diagnostic.code](diagnostic)
}
