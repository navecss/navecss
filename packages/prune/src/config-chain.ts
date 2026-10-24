/**
 * The files the resolver reads its config from: `tsconfig.json`, else `jsconfig.json`, and every
 * config either names, through `extends` and `references`. A file the resolver looked for and did
 * not find is in the list all the same, since creating it changes the resolution; a directory is
 * never in it, since a bundler cannot depend on one as a file.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
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
 * `text` without the byte order mark that Windows editors put in front of a file.
 */
function withoutByteOrderMark(text: string): string {
  return text.startsWith('\u{FEFF}') ? text.slice(1) : text
}

/**
 * The value of a tsconfig, which allows a byte order mark, comments and trailing commas, or
 * `undefined` when the text is not one.
 */
function parseConfig(text: string): unknown {
  try {
    const plain = withoutComments(withoutByteOrderMark(text))
    return JSON.parse(plain.replaceAll(/,(\s*[\]}])/gu, '$1')) as unknown
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

export interface ConfigFile {
  readonly file: string
  /**
   * The parsed config, or `undefined` for a file that is not there or is not a config.
   */
  readonly config: unknown
}

/**
 * Whether a path is a directory.
 */
function isDirectory(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isDirectory() === true
}

/**
 * The config at `file`, parsed, or `undefined`.
 */
function readConfig(file: string): unknown {
  if (!existsSync(file)) return undefined
  try {
    return parseConfig(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Adds the config file and everything it names, recursively, to `found`.
 */
function addChain(found: Map<string, ConfigFile>, file: string): void {
  if (found.has(file) || isDirectory(file)) return
  const config = readConfig(file)
  found.set(file, { file, config })
  for (const next of namedConfigs(file, config)) addChain(found, next)
}

/**
 * The config files the resolver reads for the project in `dir`, absolute, each with its parsed
 * value: the one it uses, and the `tsconfig.json` ahead of a `jsconfig.json` or of nothing, which
 * is not there.
 */
export function resolverConfigs(dir: string): ConfigFile[] {
  const found = new Map<string, ConfigFile>()
  for (const name of CONFIG_NAMES) {
    const file = path.join(dir, name)
    addChain(found, file)
    if (existsSync(file)) break
  }
  return found.values().toArray()
}
