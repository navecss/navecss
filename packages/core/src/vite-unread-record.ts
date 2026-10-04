/**
 * The records of a module the plugin does not read as source: one it could not read, which is a
 * problem to report, and one that is data when the build reads it, whose text is only scanned for
 * the Nave classes it writes.
 */
import type { ModuleRecord } from './vite-state.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { atomsWrittenIn } from './vite-literal-classes.ts'
import { moduleLabel } from './vite-module-kind.ts'

/**
 * Whether the package is listed in `keepFor`, which stands in for reading its calls.
 */
export function isListed(context: UsedContext, pkg: string | undefined): boolean {
  return pkg !== undefined && Object.hasOwn(context.options.keepFor, pkg)
}

export const NOT_PARSED =
  "the module could not be read, so the atoms it names would not ship: it did not parse as JavaScript. TypeScript and JSX must be compiled by Vite's own transform first, so leave oxc on for this file."
export const TOO_DEEP =
  'the module could not be read, so the atoms it names would not ship: it is nested too deeply.'

/**
 * The record of a module the build could not read: one problem, at its first character.
 */
export function unreadableRecord(
  context: UsedContext,
  input: { readonly code: string; readonly id: string; readonly pkg: string | undefined },
  text: string,
): ModuleRecord {
  const { code, id, pkg } = input
  const file = moduleLabel(context.root, id)
  const problem: LocatedProblem = {
    kind: 'unreadable',
    offset: 0,
    construct: '',
    text,
    file,
    pkg,
    line: 1,
    column: 1,
  }
  const isStandingIn = isListed(context, pkg)
  return {
    // The classes written whole need no parse to be found.
    atoms: atomsWrittenIn(code),
    problems: isStandingIn ? [] : [problem],
    suppressed: isStandingIn ? [problem] : [],
    dynamicCalls: [],
    pkg,
    file,
  }
}

/**
 * The module types Rolldown reads as source: JavaScript, and the two that need a transform first.
 * Any other type (`json`, `text`, a plugin's own) is data to the host, which converts it after
 * every transform, so its text is not code to parse.
 */
export const SOURCE_TYPES: ReadonlySet<string> = new Set(['js', 'jsx', 'ts', 'tsx'])

/**
/**
 * The strings a JSON text holds, as the host will decode them (`"nave-\u0066lex"` is `nave-flex`),
 * or none when it is no JSON.
 */
function jsonStrings(code: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(code)
  } catch {
    return []
  }
  const strings: string[] = []
  const stack: unknown[] = [parsed]
  while (stack.length > 0) {
    const value = stack.pop()
    if (typeof value === 'string') strings.push(value)
    else if (Array.isArray(value)) {
      for (const item of value as unknown[]) stack.push(item)
    } else if (typeof value === 'object' && value !== null) {
      for (const key of Object.keys(value)) strings.push(key)
      for (const item of Object.values(value) as unknown[]) stack.push(item)
    }
  }
  return strings
}

/**
 * The record of a module that is data when the build reads it: the Nave classes its text writes,
 * as for any other text (and, for JSON, as its strings decode), and no problem, since there is no
 * call in it to read.
 */
export function textRecord(
  context: UsedContext,
  input: {
    readonly code: string
    readonly id: string
    readonly moduleType?: string | undefined
    readonly pkg: string | undefined
  },
): ModuleRecord {
  const { code, id, moduleType, pkg } = input
  const decoded = moduleType === 'json' ? jsonStrings(code) : []
  return {
    atoms: new Set(
      [atomsWrittenIn(code), ...decoded.map((text) => atomsWrittenIn(text))].flatMap((found) => [
        ...found,
      ]),
    ),
    problems: [],
    suppressed: [],
    dynamicCalls: [],
    pkg,
    file: moduleLabel(context.root, id),
  }
}
