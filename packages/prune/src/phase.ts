/**
 * Whether a run belongs to the development server, and which one.
 */
import type { Handoff } from './handoff.ts'

/**
 * Whether the run is `next dev`'s: the phase Next.js called a function config with when there is
 * one. An object config is given no phase, and `NODE_ENV` cannot stand in for it, because
 * `next build --debug-prerender` runs with `NODE_ENV` set to `development`. `next dev` sets
 * `__NEXT_DEV_SERVER` in the environment of its server and of the workers that run PostCSS, on
 * Turbopack and on webpack, and a build sets it on neither. So does a server an app starts itself
 * with `next({ dev: true })`, which sets it in `prepare()`.
 */
export function isDevelopmentRun(handoff: Pick<Handoff, 'phase'>): boolean {
  if (handoff.phase !== undefined) return handoff.phase === 'phase-development-server'
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by next dev in the process that runs the plugin, not a build input
  return process.env.__NEXT_DEV_SERVER !== undefined
}

/**
 * The id of the Next.js server process this plugin runs under, which its workers share, or
 * `undefined` when Next.js sets none. A dev server writes it into the record, and prints only a
 * record that carries its own.
 */
export function serverIdOfRun(): string | undefined {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by Next.js in the process that runs the plugin, not a build input
  return process.env.NEXT_PRIVATE_START_TIME
}
