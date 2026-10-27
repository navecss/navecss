/**
 * What `withNave()` hands the PostCSS plugin: one environment variable holding the options, the
 * project directory, `distDir` and the root the config sets, if any, as JSON. No file
 * carries it: a file needs a path the wrapper cannot reliably know.
 */
import type { NaveOptions } from './options.ts'

export const HANDOFF_VARIABLE = 'NAVECSS_PRUNE'

export interface Handoff {
  readonly options: NaveOptions
  /**
   * The directory holding `next.config`.
   */
  readonly dir: string
  readonly distDir: string
  /**
   * The root the config sets (`outputFileTracingRoot`, else `turbopack.root`), absent when it sets
   * none: the plugin then uses the root Next.js infers, as Turbopack does.
   */
  readonly root?: string
  /**
   * The phase Next.js called a function config with (`phase-development-server`,
   * `phase-production-build`, ...); absent for an object config, which is given none.
   */
  readonly phase?: string
  /**
   * Set when webpack's `webpack(config, ctx)` callback passed its own project directory on as
   * `dir`. Absent when `dir` is the directory `next.config` was loaded from, which is wherever
   * `next` was started: `next build apps/web` run from a repository's top loads it from the top.
   */
  readonly isBundlerDir?: boolean
  /**
   * The config's `pageExtensions`, absent when it sets none.
   */
  readonly pageExtensions?: readonly string[]
}

/**
 * The text the wrapper puts in the environment variable.
 */
export function encodeHandoff(handoff: Handoff): string {
  return JSON.stringify(handoff)
}

const isText = (value: unknown): boolean => typeof value === 'string'
const isTextList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => isText(item))

/**
 * Whether `value` is absent or passes `isValid`.
 */
function isOptional(value: unknown, isValid: (value: unknown) => boolean): boolean {
  return value === undefined || isValid(value)
}

/**
 * Whether a parsed value has the shape the wrapper writes.
 */
function isHandoff(value: unknown): value is Handoff {
  if (typeof value !== 'object' || value === null) return false
  const { options, dir, distDir, root, phase, isBundlerDir, pageExtensions } = value as Record<
    string,
    unknown
  >
  return (
    typeof options === 'object' &&
    options !== null &&
    [dir, distDir].every((field) => isText(field)) &&
    [root, phase].every((field) => isOptional(field, isText)) &&
    isOptional(isBundlerDir, (flag) => typeof flag === 'boolean') &&
    isOptional(pageExtensions, isTextList)
  )
}

/**
 * The parsed text of the variable, or `undefined` when it is not JSON.
 */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * The handoff in `env`, or `undefined` when the wrapper did not run (the variable is unset).
 * Throws when the variable holds something other than what the wrapper writes.
 */
export function readHandoff(env: NodeJS.ProcessEnv = process.env): Handoff | undefined {
  const text = env[HANDOFF_VARIABLE]
  if (text === undefined || text === '') return undefined
  const value = parsed(text)
  if (!isHandoff(value)) {
    throw new Error(
      `the ${HANDOFF_VARIABLE} environment variable does not hold what withNave() sets: ${JSON.stringify(text)}`,
    )
  }
  return value
}
