/**
 * Who wrote the stylesheets holding the atomic layer. The environment that writes the first one
 * decides which case the build is in: a client environment (a plain Vite build) or a server one
 * (Astro writes its CSS in its server build, before the browser's build runs). Every environment
 * that writes filters with a set of its own, fixed when it renders its first chunk.
 */
import type { RootState } from './vite-state.ts'

export interface Writers {
  /**
   * The environment that fixed `emitted`, and whether it renders for a browser or a server.
   */
  emittedBy: string | undefined
  firstWriter: 'client' | 'server' | undefined
  /**
   * The set each environment that writes stylesheets filtered with, by environment name. The
   * first one is `emitted`; a later one reads every atom up to its own first chunk.
   */
  readonly fixed: Map<string, ReadonlySet<string>>
  /**
   * The environments whose build wrote a stylesheet holding the layer, with what each renders for.
   */
  readonly writers: Map<string, string>
  /**
   * The stylesheets a later server environment left whole because an earlier one wrote them too:
   * `<environment>\0<id>`.
   */
  readonly whole: Set<string>
  /**
   * The assets those stylesheets became, which the check of the layer does not hold to the set:
   * `<environment>|<names>|<original file names>`.
   */
  readonly wholeAssets: Set<string>
}

/**
 * A state in which nothing has been written.
 */
export function freshWriters(): Writers {
  return {
    emittedBy: undefined,
    firstWriter: undefined,
    fixed: new Map(),
    writers: new Map(),
    whole: new Set(),
    wholeAssets: new Set(),
  }
}

/**
 * Whether the environment `name` has a stylesheet holding the atomic layer in its module graph, so
 * that its own build writes one.
 */
export function hasStylesheet(state: RootState, name: string): boolean {
  const prefix = `${name}\0`
  return state.sheets.keys().some((key) => key.startsWith(prefix))
}

/**
 * Forgets which environment wrote first and what each filtered with, so the next build in a
 * process that builds again (watch mode) fixes its sets anew.
 */
export function forgetWriters(state: RootState): void {
  state.emitted = undefined
  state.emittedBy = undefined
  state.firstWriter = undefined
  state.fixed.clear()
  state.writers.clear()
  state.whole.clear()
  state.wholeAssets.clear()
}
