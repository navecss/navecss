/**
 * What the two halves of the Vite plugin share: the resolved options, the `extend` source, and,
 * once Vite has resolved its config, the root, the command and the build's state.
 */
import type { ExtendSource } from './vite-extend.ts'
import type { ResolvedUsedOptions } from './vite-options.ts'
import type { RootState } from './vite-state.ts'
import type { ResolvedConfigLike } from './vite-types.ts'

import { keptAtoms } from './vite-options.ts'
import { stateFor } from './vite-state.ts'

export interface UsedContext {
  readonly options: ResolvedUsedOptions
  readonly extend: ExtendSource
  /**
   * The atoms `keep` and every `keepFor` list ship, whatever the code names.
   */
  readonly kept: readonly string[]
  /**
   * The package name of each directory already looked up, by directory.
   */
  readonly packageNames: Map<string, Promise<string | undefined>>
  root: string
  command: string
  cacheDir: string
  /**
   * Whether one process builds every environment (the config asks for a builder), so a server
   * build has no other invocation to hand its atoms to or take them from.
   */
  inProcess: boolean
  state: RootState
}

/**
 * The context for one `navePlugin()` call.
 */
export function createUsedContext(options: ResolvedUsedOptions, extend: ExtendSource): UsedContext {
  return {
    options,
    extend,
    kept: keptAtoms(options),
    packageNames: new Map(),
    root: process.cwd(),
    command: 'build',
    cacheDir: '',
    inProcess: false,
    state: stateFor('', {}),
  }
}

/**
 * Takes what Vite resolved: the root, the command, and the state of this build.
 */
export function configureUsed(context: UsedContext, config: ResolvedConfigLike): void {
  context.root = config.root
  context.command = config.command
  context.cacheDir = config.cacheDir ?? ''
  context.inProcess = config.builder !== undefined
  context.state = stateFor(config.root, config)
}

/**
 * Whether the plugin is choosing which atoms ship.
 */
export function isUsed(context: UsedContext): boolean {
  return context.options.atomic === 'used'
}

/**
 * The watch callback of a read that only wants the names: the other half watches the module.
 */
function ignoreWatch(): void {
  // Nothing to register.
}

/**
 * The names of the consumer's own atoms, which have no class. A module that will not load is the
 * other plugin's error to report, so it answers with none.
 */
export async function ownAtomNames(context: UsedContext): Promise<ReadonlySet<string>> {
  try {
    const atoms = await context.extend.current(ignoreWatch)
    return new Set(Object.keys(atoms).filter((name) => atoms[name]))
  } catch {
    return new Set()
  }
}
