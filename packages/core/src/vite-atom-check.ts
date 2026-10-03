/**
 * What `cx()` and the plugin's options say about a name that may or may not be an atom: the
 * answer for a built-in, and the texts for a name that is not one. The hint rule is
 * `directive-core`'s own (`formatDiagnostic`), run with no `extend` so a consumer's atom is never a
 * candidate: it has no class, so suggesting it sends the reader into a second error.
 */
import { atomClassMap } from './atoms.ts'
import { formatDiagnostic } from './directive/diagnostics-format.ts'

export type AtomVerdict =
  | { readonly kind: 'atom' }
  | { readonly kind: 'own' }
  | { readonly kind: 'whitespace'; readonly text: string }
  | { readonly hasHint: boolean; readonly kind: 'unknown'; readonly text: string }

/**
 * Whether `name` is a built-in atom (an inherited name such as `toString` is not).
 */
export function isBuiltInAtom(name: string): boolean {
  return Object.hasOwn(atomClassMap, name)
}

/**
 * The hint sentence for an unknown `name`, or `undefined` when no atom is near it.
 */
export function hintFor(name: string): string | undefined {
  const text = formatDiagnostic({ code: 'unknown-atom', name, offset: 0, endOffset: 0 })
  // Only what follows the sentence naming the atom, so text inside the name is never a hint.
  const hint = text.slice(`@nave: unknown atom "${name}". `.length)
  return hint.startsWith('Did you mean') ? hint : undefined
}

/**
 * The sentence for a string holding whitespace.
 */
function whitespaceText(value: string): string {
  const names = value.split(/\s+/).filter(Boolean)
  if (names.length < 2) {
    return `"${value}" has whitespace around the atom name. Write it without: cx('${names[0] ?? ''}').`
  }
  const count = names.length === 2 ? 'two' : String(names.length)
  const call = names.map((name) => `'${name}'`).join(', ')
  return `"${value}" is ${count} atom names in one string. Pass one per argument: cx(${call}).`
}

/**
 * The sentence for a name that is no atom and has no near candidate.
 */
function unknownText(name: string): string {
  return `unknown atom "${name}". cx() takes Nave atoms only; for a class of your own, use a CSS Module class or cx.raw('${name}').`
}

/**
 * Judges `value`, a non-empty string passed to `cx()`, against the built-in atoms and the names of
 * the consumer's own (`own`).
 */
export function judgeAtom(value: string, own: ReadonlySet<string>): AtomVerdict {
  if (/\s/.test(value)) return { kind: 'whitespace', text: whitespaceText(value) }
  if (isBuiltInAtom(value)) return { kind: 'atom' }
  if (own.has(value)) return { kind: 'own' }
  const hint = hintFor(value)
  if (hint) return { kind: 'unknown', text: `unknown atom "${value}". ${hint}`, hasHint: true }
  return { kind: 'unknown', text: unknownText(value), hasHint: false }
}

/**
 * The `Available:` line a report closes with: every built-in atom in definition order.
 */
export function availableLine(): string {
  return `Available: ${Object.keys(atomClassMap).join(', ')}`
}
