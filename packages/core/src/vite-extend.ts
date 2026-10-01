/**
 * Where the Vite plugin's `extend` atoms come from. An object is snapshotted and validated once,
 * when the plugin is built. A string is a module specifier: resolved against the project root
 * when Vite resolves its config, then loaded for its default export before every stylesheet is
 * read (re-read whenever the file's own bytes change, so a dev server needs no restart), declared
 * to Vite with `addWatchFile` so a change to it re-runs the stylesheets that used it, and
 * snapshotted and validated after every load.
 */
import type { AtomDefinition } from './atoms.ts'
import type { ExtendMap } from './directive/resolve.ts'

import { applyExtendModule, resolveExtendSpecifier } from './postcss-extend-module.ts'
import { snapshotExtendMap } from './snapshot-extend-atoms.ts'
import { validateExtendAtomsHostFree } from './validate-extend-host-free.ts'

export interface ExtendSource {
  /**
  Tells the source which directory a module specifier resolves from; called once Vite knows its root.
   */
  configure?(root: string): void
  /**
  The atoms to expand with right now; for a module specifier, registers the module with `addWatchFile` first.
   */
  current(watch: (file: string) => void): Promise<ExtendMap>
}

/**
 * A deep copy of `value`, read once, that has passed the dependency-free validator.
 */
function snapshotAndValidate(value: ExtendMap): ExtendMap {
  const snapshot = snapshotExtendMap(value)
  validateExtendAtomsHostFree(snapshot)
  return snapshot
}

/**
 * The source for an atom map passed inline: checked once, now.
 */
function objectSource(extend: ExtendMap): ExtendSource {
  const snapshot = snapshotAndValidate(extend)
  return {
    current: () => Promise.resolve(snapshot),
  }
}

/**
 * The source for a module specifier: resolved when Vite knows its root, loaded on every read.
 */
function moduleSource(specifier: string): ExtendSource {
  const cache = new Map<string, Promise<ExtendMap>>()
  let root = process.cwd()
  let file: string | undefined
  return {
    configure(directory) {
      root = directory
      file = resolveExtendSpecifier(specifier, root)
    },
    async current(watch) {
      file ??= resolveExtendSpecifier(specifier, root)
      watch(file)
      let loaded: ExtendMap = {}
      await applyExtendModule(file, cache, (value) => {
        loaded = snapshotAndValidate(value)
      })
      return loaded
    },
  }
}

/**
 * The `extend` option as the plugin reads it: an atom map, or the specifier of a module whose
 * default export is one.
 */
export function createExtendSource(
  option: Record<string, AtomDefinition> | string | undefined,
): ExtendSource {
  if (typeof option === 'string') return moduleSource(option)
  return objectSource(option ?? {})
}
