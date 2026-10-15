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

/**
 * An array or object literal passed to Nave's `cx.dynamic()`, with each callee as the file names
 * it. `cx.dynamic()` takes one name and returns no class for anything that is not an atom, so
 * neither half of `cx()`'s explanation holds for it.
 */
export function dynamicContainerMessage(
  callee: string,
  rendered: string,
  declared: string,
  rawCallee: string,
): string {
  return `${callee}(${rendered}) is not a Nave atom: ${callee}() takes one name, so an array or object is stringified into one name first: ['flex', 'block'] becomes "flex,block" and { flex: on } becomes "[object Object]", neither is an atom name, and the call renders no class. Write the atoms through cx(), each as its own argument with its own condition if it needs one: cx('flex', on && 'block'); pass ${callee}() one name chosen at run time: ${callee}(name). ${preferredRemedies(declared)} ${rawCallee}() with a reason.`
}

/**
 * A literal atom name given to Nave's `cx.dynamic()`. The name is already an atom, so the one
 * remedy is writing it through `cx()`, which the build reads; no other remedy is a better write.
 */
export function dynamicNameMessage(callee: string, rendered: string, name: string): string {
  return `${callee}(${rendered}) writes the atom ${name} in the source: a name written in the source goes through cx(), which the build reads, and ${callee}() is for a name chosen at run time. Write cx('${name}').`
}

/**
 * The same, for a literal atom name that sits beside a value chosen at run time: two calls to
 * choose between, with no rewrite of the whole argument.
 */
export function dynamicNameBesideMessage(callee: string, rendered: string, name: string): string {
  return `${callee}(${rendered}) writes the atom ${name} in the source beside a value chosen at run time: a name written in the source goes through cx(), which the build reads, and ${callee}() is for a name chosen at run time, so choose between two calls, cx('${name}') for the written name and ${callee}() for the run-time value.`
}

/**
 * An argument after the first of Nave's `cx.dynamic()`, which takes one name and ignores the
 * rest. It does not say the first argument is wrong, and offers no call with several arguments.
 */
export function dynamicExtraMessage(
  callee: string,
  rendered: string,
  declared: string,
  rawCallee: string,
): string {
  return `${callee}() takes one name and ignores ${rendered}, so it applies no class. Pass one name per ${callee}() call, and write several names given in the source through cx(): cx('flex', on && 'block'). ${preferredRemedies(declared)} ${rawCallee}() with a reason.`
}

/**
 * The first non-spread argument of Nave's `cx.dynamic()` when only spreads come before it. It
 * says what is true either way, whatever the spreads hold: with items in any of them the call
 * takes the first item and ignores this argument, and with all empty this argument is the name.
 */
export function dynamicSpreadMessage(
  callee: string,
  rendered: string,
  spreadCount: number,
  { declared, rawCallee }: { declared: string; rawCallee: string },
): string {
  const cases =
    spreadCount === 1
      ? `follows a spread: when the spread has items, ${callee}() takes the first of them and ignores ${rendered}, and when the spread is empty, ${rendered} is the name.`
      : `follows spreads: when any of them has items, ${callee}() takes the first item and ignores ${rendered}, and when all of them are empty, ${rendered} is the name.`
  return `The argument ${rendered} ${cases} Pass one name as the only argument, ${callee}(name), and write names given in the source through cx(). ${preferredRemedies(declared)} ${rawCallee}() with a reason.`
}

/**
 * A name built at run time inside Nave's `cx.dynamic()` that no atom name fits the text written
 * around the slots of: no value of the slots can make it an atom. Names no atom as a near match.
 */
export function dynamicBuiltMessage(
  callee: string,
  rendered: string,
  declared: string,
  rawCallee: string,
): string {
  return `${callee}(${rendered}) builds a name that is not a Nave atom: no Nave atom name fits the text written around its slots, so the call renders no class. ${preferredRemedies(declared)} ${rawCallee}() with a reason.`
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
