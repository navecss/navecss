/**
 * What `withNave()` hands the PostCSS plugin: one environment variable holding the options, the
 * project directory, `distDir` and the root the bundler resolves paths against, as JSON. No file
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
   * The root the bundler resolves paths against: no file or directory outside it is declared.
   */
  readonly root: string
}

/**
 * The text the wrapper puts in the environment variable.
 */
export function encodeHandoff(handoff: Handoff): string {
  return JSON.stringify(handoff)
}

/**
 * The handoff in `env`, or `undefined` when the wrapper did not run (the variable is unset).
 */
export function readHandoff(env: NodeJS.ProcessEnv = process.env): Handoff | undefined {
  const text = env[HANDOFF_VARIABLE]
  if (text === undefined || text === '') return undefined
  return JSON.parse(text) as Handoff
}
