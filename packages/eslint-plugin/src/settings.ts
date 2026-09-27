/**
 * R6: the consumer's own classes, declared once in ESLint's shared `settings` under this
 * plugin's namespace (`settings['@navecss']`), read by every rule this package ships. Settings
 * are JSON data, never a `RegExp` object, because ESLint's cache does not see a changed `RegExp`
 * and does see a changed string.
 */
import type { Rule } from 'eslint'

const NAMESPACE = '@navecss'

const DEFAULT_HELPERS = ['clsx', 'classnames', 'classNames', 'cn']

export interface NaveSettings {
  allow: string[]
  cxModules: string[]
  helpers: string[]
}

export interface CompiledAllowEntry {
  readonly raw: string
  /**
  True for a `/…/` pattern entry; false for a plain prefix entry.
   */
  readonly isPattern: boolean
  test(token: string): boolean
}

const PATTERN_FLAG_CHARS = new Set(['d', 'i', 'm', 's', 'u', 'v'])

/**
Configuration-error text a `settings['@navecss'].allow` entry that cannot compile carries.
 */
class NaveSettingsError extends Error {}

/**
 * Compiles one `allow` entry. A string beginning with `/` is a pattern, written
 * `/<source>/<flags>`; anything else is a prefix, matched with `startsWith`. An entry that
 * begins with `/` and is malformed, does not compile, or carries a flag outside `dimsuv` fails
 * as a configuration error — never read as a prefix and never silently ignored. The empty
 * string is a configuration error too: it is not a legitimate "admit nothing" prefix.
 */
function compileAllowEntry(raw: string): CompiledAllowEntry {
  if (raw.length === 0) {
    throw new NaveSettingsError(
      `${NAMESPACE} settings: "allow" entry "" is a configuration error (the empty string is never a prefix).`,
    )
  }

  if (!raw.startsWith('/')) {
    return { raw, isPattern: false, test: (token) => token.startsWith(raw) }
  }

  const closingSlash = raw.lastIndexOf('/')
  if (closingSlash <= 0) {
    throw new NaveSettingsError(
      `${NAMESPACE} settings: "allow" entry "${raw}" begins with "/" but is not a valid /source/flags pattern.`,
    )
  }
  const source = raw.slice(1, closingSlash)
  const flags = raw.slice(closingSlash + 1)
  if (source.length === 0) {
    throw new NaveSettingsError(
      `${NAMESPACE} settings: "allow" entry "${raw}" has an empty pattern source.`,
    )
  }
  for (const flag of flags) {
    if (!PATTERN_FLAG_CHARS.has(flag)) {
      throw new NaveSettingsError(
        `${NAMESPACE} settings: "allow" entry "${raw}" carries flag "${flag}", which is not one of d, i, m, s, u, v.`,
      )
    }
  }

  let compiled: RegExp
  try {
    compiled = new RegExp(source, flags)
  } catch {
    throw new NaveSettingsError(
      `${NAMESPACE} settings: "allow" entry "${raw}" does not compile as a regular expression.`,
    )
  }
  return { raw, isPattern: true, test: (token) => compiled.test(token) }
}

type SettingsField = 'allow' | 'cxModules' | 'helpers'

/**
How a settings entry is shown in a configuration error: a string quoted, anything else as written.
 */
function describeEntry(entry: unknown): string {
  if (typeof entry === 'string') return JSON.stringify(entry)
  if (entry instanceof RegExp) return String(entry)
  return JSON.stringify(entry) ?? String(entry)
}

/**
 * Validates one settings field: absent, or an array of strings. Anything else is a configuration
 * error naming the field and the offending entry, never a raw exception from further in.
 */
function readArrayField(raw: Record<string, unknown>, field: SettingsField): string[] | undefined {
  const value = raw[field]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new NaveSettingsError(`${NAMESPACE} settings: "${field}" must be an array of strings.`)
  }
  const badIndex = value.findIndex((candidate: unknown) => typeof candidate !== 'string')
  if (badIndex !== -1) {
    throw new NaveSettingsError(
      `${NAMESPACE} settings: "${field}" entry ${describeEntry(value[badIndex])} is a configuration error: every entry must be a string.`,
    )
  }
  return value as string[]
}

/**
 * The `settings['@navecss']` object itself: absent, or a plain object. Keys other than the three
 * this package reads are ignored, since `settings` is a namespace a consumer's other tools may
 * share.
 */
function readNamespace(context: Rule.RuleContext): Record<string, unknown> {
  const raw = (context.settings as Record<string, unknown>)[NAMESPACE]
  if (raw === undefined) return {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new NaveSettingsError(
      `${NAMESPACE} settings: settings['${NAMESPACE}'] must be an object with "allow", "cxModules" and "helpers" keys, not ${describeEntry(raw)}.`,
    )
  }
  return raw as Record<string, unknown>
}

/**
Reads and validates `settings['@navecss']`, applying every default.
 */
export function getNaveSettings(context: Rule.RuleContext): NaveSettings {
  const raw = readNamespace(context)
  return {
    allow: readArrayField(raw, 'allow') ?? [],
    cxModules: readArrayField(raw, 'cxModules') ?? [],
    helpers: readArrayField(raw, 'helpers') ?? DEFAULT_HELPERS,
  }
}

const compiledCache = new WeakMap<string[], CompiledAllowEntry[]>()

/**
Compiles `settings.allow`, memoised by array identity (settings are read fresh per lint run).
 */
export function compileAllow(allow: string[]): CompiledAllowEntry[] {
  const cached = compiledCache.get(allow)
  if (cached) return cached
  const compiled = allow.map((entry) => compileAllowEntry(entry))
  compiledCache.set(allow, compiled)
  return compiled
}

/**
True when `token` matches a declared entry: any entry for a full token, prefix-only when truncated.
 */
export function isDeclared(
  token: string,
  entries: CompiledAllowEntry[],
  isTruncated: boolean,
): boolean {
  return entries.some((entry) => (!isTruncated || !entry.isPattern) && entry.test(token))
}
