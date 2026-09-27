/**
 * R4: every message quotes the offending construct, lists remedies in the design system's
 * preferred order (a CSS Module class, a Nave atom through `cx()`, a declared class, and last
 * `cx.raw()` with a reason), and never offers a disable comment, a suppression command or a
 * settings key as a remedy.
 */
import type { CompiledAllowEntry } from './settings.ts'

/**
Renders the declared `allow` entries for a message, or says none are declared.
 */
export function renderDeclared(entries: CompiledAllowEntry[]): string {
  if (entries.length === 0) return 'declared: none'
  const rendered = entries.map((entry) =>
    entry.isPattern ? `pattern ${entry.raw}` : `prefix ${entry.raw}`,
  )
  return `declared: ${rendered.join(', ')}`
}

/**
The four remedies, in the design system's preferred order, for a plain literal-class report.
 */
export function classRemedies(declared: string): string {
  return (
    'Prefer, in order: a CSS Module class (styles.x), a Nave atom through cx(), a class the ' +
    `project declares as its own (${declared}), and only then cx.raw() with a reason.`
  )
}

/**
 *
 */
export function literalClassMessage(text: string, declared: string): string {
  return `"${text}" is not a CSS Module class, a Nave atom, or a class this project declares as its own. ${classRemedies(declared)}`
}

/**
 *
 */
export function cxAtomMessage(text: string, declared: string): string {
  return `cx("${text}") is not a Nave atom: a string passed to cx() must name one. ${classRemedies(declared)}`
}

const NAVE_PREFIX = 'nave-'

/**
R4(e): a literal beginning `nave-`, resolved against core's own atom-to-class map.
 */
export function naveOutputMessage(text: string, atomName: string | undefined): string {
  if (atomName) {
    return (
      `"${text}" is a class Nave's own build outputs, not one you write: it is not seen as ` +
      `input. Write the atom instead: @nave ${atomName} or cx('${atomName}').`
    )
  }
  return (
    `"${text}" begins with "${NAVE_PREFIX}", the prefix Nave's own build uses for its output ` +
    'classes, but no Nave atom emits this exact class. It is not seen as input.'
  )
}

export const isNaveOutputLike = (text: string): boolean => text.startsWith(NAVE_PREFIX)
