/**
 * The project the plugin reads: the directory holding `next.config`. Next.js loads `next.config`
 * from the directory `next` was started in, so `next build apps/web` run from a repository's top
 * hands the plugin the top. Webpack passes its own project directory to the wrapper's callback;
 * Turbopack runs PostCSS with the project directory as the working directory.
 */
import type { Handoff } from './handoff.ts'

import { hasNextConfig } from './config-files.ts'
import { isInside } from './source-files.ts'

/**
 * The hand-off with the project directory this run reads: webpack's, when its callback passed it
 * on; otherwise the working directory, when it holds a `next.config`; otherwise the directory
 * `next.config` was loaded from. A root that does not hold the project directory was taken from
 * the same wrong directory, so it becomes the project directory too.
 * @param handoff What `withNave()` handed over.
 * @param cwd The working directory the bundler runs PostCSS in.
 * @returns The hand-off to read the project with.
 */
export function projectHandoff(handoff: Handoff, cwd: string = process.cwd()): Handoff {
  if (handoff.isBundlerDir === true || cwd === handoff.dir || !hasNextConfig(cwd)) return handoff
  return { ...handoff, dir: cwd, root: isInside(handoff.root, cwd) ? handoff.root : cwd }
}
