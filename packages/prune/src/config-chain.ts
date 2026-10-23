/**
 * The files the resolver reads its config from: `tsconfig.json`, else `jsconfig.json`, and every
 * config either names, through `extends` and `references`. A file the resolver looked for and did
 * not find is in the list all the same, since creating it changes the resolution.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

/**
 * The index after the string that starts at `start`.
 */
function stringEnd(text: string, start: number): number {
  let index = start + 1
  while (index < text.length && text[index] !== '"') index += text[index] === '\\' ? 2 : 1
  return Math.min(index + 1, text.length)
}

/**
 * The index after the comment that starts at `index`, or `undefined` when none does.
 */
function commentEnd(text: string, index: number): number | undefined {
  if (text.startsWith('//', index)) {
    const end = text.indexOf('\n', index)
    return end === -1 ? text.length : end
  }
  if (text.startsWith('/*', index)) {
    const end = text.indexOf('*/', index + 2)
    return end === -1 ? text.length : end + 2
  }
  return undefined
}

/**
 * `text` without its comments, which a tsconfig allows.
 */
function withoutComments(text: string): string {
  let plain = ''
  let index = 0
  while (index < text.length) {
    const skipped = commentEnd(text, index)
    const end = text[index] === '"' ? stringEnd(text, index) : (skipped ?? index + 1)
    if (skipped === undefined) plain += text.slice(index, end)
    index = end
  }
  return plain
}

/**
 * The value of a tsconfig, which allows comments and trailing commas, or `undefined` when the
 * text is not one.
 */
function parseConfig(text: string): unknown {
  try {
    return JSON.parse(withoutComments(text).replaceAll(/,(\s*[\]}])/gu, '$1')) as unknown
  } catch {
    return undefined
  }
}

/**
 * The paths an `extends` value could name from the config at `from`: a relative path as written
 * and with `.json`, or the file a package of that name provides.
 */
function extendsCandidates(from: string, value: string): string[] {
  if (value.startsWith('.') || path.isAbsolute(value)) {
    const target = path.resolve(path.dirname(from), value)
    return target.endsWith('.json') ? [target] : [target, `${target}.json`]
  }
  const require = createRequire(from)
  for (const specifier of [value, `${value}/tsconfig.json`]) {
    try {
      return [require.resolve(specifier)]
    } catch {
      // Not that file: try the next form.
    }
  }
  return []
}

/**
 * A value that is one string or a list, as a list.
 */
function listOf(value: unknown): unknown[] {
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value : []
}

/**
 * The config file a project reference names: a config file as written, or the one in the directory.
 */
function referencedConfig(from: string, reference: unknown): string[] {
  const target = (reference as { path?: unknown } | null)?.path
  if (typeof target !== 'string') return []
  const resolved = path.resolve(path.dirname(from), target)
  return [resolved.endsWith('.json') ? resolved : path.join(resolved, 'tsconfig.json')]
}

/**
 * The configs a config names: those it extends and the projects it references.
 */
function namedConfigs(file: string, config: unknown): string[] {
  if (typeof config !== 'object' || config === null) return []
  const { extends: extended, references } = config as Record<string, unknown>
  return [
    ...listOf(extended).flatMap((value) =>
      typeof value === 'string' ? extendsCandidates(file, value) : [],
    ),
    ...listOf(references).flatMap((reference) => referencedConfig(file, reference)),
  ]
}

/**
 * Adds the config file and everything it names, recursively, to `found`.
 */
function addChain(found: Set<string>, file: string): void {
  if (found.has(file)) return
  found.add(file)
  if (!existsSync(file)) return
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  const named = namedConfigs(file, parseConfig(text))
  for (const next of named) addChain(found, next)
}

/**
 * The config files the resolver reads for the project in `dir`, absolute: the one it uses, and
 * the `tsconfig.json` ahead of a `jsconfig.json` or of nothing, which is not there.
 */
export function resolverConfigFiles(dir: string): string[] {
  const found = new Set<string>()
  for (const name of CONFIG_NAMES) {
    const file = path.join(dir, name)
    addChain(found, file)
    if (existsSync(file)) break
  }
  return [...found]
}
