/**
 * Whether a run belongs to the development server.
 */
import type { Handoff } from './handoff.ts'

/**
 * Whether the run is `next dev`'s: the phase Next.js called a function config with when there is
 * one, otherwise `NODE_ENV`, which an object config leaves as the only sign.
 */
export function isDevelopmentRun(handoff: Pick<Handoff, 'phase'>): boolean {
  if (handoff.phase !== undefined) return handoff.phase === 'phase-development-server'
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by Next.js in the process that runs the plugin, not a build input
  return process.env.NODE_ENV === 'development'
}
