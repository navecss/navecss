/**
 * Every message quotes the offending construct as written, lists remedies in the design
 * system's preferred order (a CSS Module class, a Nave atom through `cx()`, a declared class, and
 * last the escape with a reason), and never offers a disable comment, a suppression command or a
 * settings key as a remedy: its reader, often a coding agent, takes the first remedy that fits.
 */
import type { CompiledAllowEntry } from './settings.ts'

import { isAtomName } from './atoms.ts'

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
 * The design-system remedies, in order, ahead of the escape the caller names last. When the
 * class text is itself an atom name, the atom remedy is spelled out (`cx('flex')`).
 */
function preferredRemedies(declared: string, text?: string): string {
  const atom = text !== undefined && isAtomName(text) ? ` (here cx('${text}'))` : ''
  return (
    `Prefer, in order: a CSS Module class (styles.x), a Nave atom through cx()${atom}, a class ` +
    `the project declares as its own (${declared}), and only then`
  )
}

/**
 * A literal class in a class position that the project does not declare, with the escape named
 * as the file binds `cx.raw` (`rawCallee`).
 */
export function literalClassMessage(text: string, declared: string, rawCallee: string): string {
  return `"${text}" is not a CSS Module class, a Nave atom, or a class this project declares as its own. ${preferredRemedies(declared, text)} ${rawCallee}() with a reason.`
}

/**
An argument of Nave's `cx()` that is not one atom name, with each callee as the file names it.
 */
export function cxAtomMessage(
  callee: string,
  rendered: string,
  declared: string,
  rawCallee: string,
): string {
  return `${callee}(${rendered}) is not a Nave atom: a string passed to ${callee}() must name one. ${preferredRemedies(declared)} ${rawCallee}() with a reason.`
}

/**
 * Why an array or object passed to Nave's `cx()` is not an atom name, and what to write instead:
 * `cx()` maps each argument whole, so the remedy is one atom name per argument.
 */
function containerExplanation(callee: string): string {
  return `${callee}() maps each argument whole, so an array or object is stringified first: ['flex', 'block'] renders the class "flex,block" and { flex: on } renders "[object Object]". Pass atom names as separate arguments, each with its own condition if it needs one: ${callee}('flex', on && 'block').`
}

/**
An array or object literal passed to Nave's `cx()`, with each callee as the file names it.
 */
export function cxContainerMessage(
  callee: string,
  rendered: string,
  declared: string,
  rawCallee: string,
): string {
  return `${callee}(${rendered}) is not a Nave atom: ${containerExplanation(callee)} ${preferredRemedies(declared)} ${rawCallee}() with a reason.`
}

const NAVE_PREFIX = 'nave-'

/**
A literal beginning `nave-`, resolved against core's own atom-to-class map.
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

/**
 * The problem half of a `cx.raw()` missing-reason message: what the offending literal is, the
 * `nave-` explanation when it is one of Nave's output classes, the inner call when it is an
 * argument of Nave's `cx()` that names no atom (a string, or an array or object), with each
 * callee as written.
 */
export function rawProblemText(
  text: string,
  callee: string,
  atomName: string | undefined,
  atomCall?: { callee: string; isContainer: boolean; rendered: string },
): string {
  if (isNaveOutputLike(text)) return naveOutputMessage(text, atomName)
  if (atomCall) {
    const why = atomCall.isContainer
      ? containerExplanation(atomCall.callee)
      : `a string passed to ${atomCall.callee}() must name one.`
    return `${atomCall.callee}(${atomCall.rendered}) in ${callee}() is not a Nave atom: ${why}`
  }
  return `"${text}" in ${callee}() is class text this project does not declare as its own.`
}

/**
The remedy half of a `cx.raw()` missing-reason message: the design system first, the reason last.
 */
export function rawRemedyText(declared: string, text: string, reasonForm: string): string {
  return `${preferredRemedies(declared, text)} a reason, first inside the parentheses: ${reasonForm}.`
}
