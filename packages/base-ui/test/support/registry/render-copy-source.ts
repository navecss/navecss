/**
 * The copies as a scene source: each styled subpath's entry (`nave-<subpath>.ts`) imported as source
 * from a directory the item files were written to, so the run's aliases (the Base UI floor, React 18)
 * apply to it as they do to the package's own source.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Source, Ui } from '../scenes.ts'

import { topName } from '../subpaths.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * The specifier the module runner resolves relative to this file. It is computed, because the copies
 * exist only once the test has written them.
 */
const specifierFor = (directory: string, file: string): string => {
  const relative = path.relative(HERE, path.join(directory, file))
  return relative.startsWith('.') ? relative : `./${relative}`
}

const importCopy = async (directory: string, subpath: string): Promise<Ui> => {
  if (!existsSync(path.join(directory, `nave-${subpath}.ts`))) {
    throw new Error(`the registry has no item base-ui-${subpath}`)
  }
  const module = (await import(
    /* @vite-ignore */ specifierFor(directory, `nave-${subpath}.ts`)
  )) as Record<string, unknown>
  return module[topName(subpath)] as Ui
}

/**
 * A source that serves each styled subpath from its copy, and a subpath the registry does not style
 * from `unstyled`. A copy that is missing or does not load fails the lookup of that subpath alone,
 * with its own message: it never falls back to the package, which would compare the package with
 * itself.
 */
export const loadCopySource = async (
  directory: string,
  styled: readonly string[],
  unstyled: Source,
): Promise<Source> => {
  const found = new Map<string, Ui>()
  const failures = new Map<string, unknown>()
  await Promise.all(
    styled.map(async (subpath) => {
      try {
        found.set(subpath, await importCopy(directory, subpath))
      } catch (error) {
        failures.set(subpath, error)
      }
    }),
  )
  return (subpath) => {
    const ui = found.get(subpath)
    if (ui !== undefined) return ui
    if (!styled.includes(subpath)) return unstyled(subpath)
    const reason = failures.get(subpath)
    throw new Error(
      `no copy for the subpath ${subpath}: ${reason instanceof Error ? reason.message : String(reason)}`,
    )
  }
}

/**
 * What each copy's CSS Module hands out for the local names its text has a rule for: the class made
 * of each, by reading `styles[local]` off the module's default export. (The test runner's CSS Modules
 * transform serves that object as a Proxy that makes a class of any name it is asked, so its keys
 * cannot be listed; the names come from the module's text.) A subpath whose module is not on disk is
 * left out; its copy fails to load on its own.
 */
export const loadModuleClasses = async (
  directory: string,
  localsBySubpath: ReadonlyMap<string, readonly string[]>,
): Promise<Record<string, string>[]> => {
  const present = [...localsBySubpath].filter(([subpath]) =>
    existsSync(path.join(directory, `nave-${subpath}.module.css`)),
  )
  return Promise.all(
    present.map(async ([subpath, locals]) => {
      const module = (await import(
        /* @vite-ignore */ specifierFor(directory, `nave-${subpath}.module.css`)
      )) as { default: Record<string, string> }
      return Object.fromEntries(
        locals.map((local) => [local, module.default[local] ?? ''] as const),
      )
    }),
  )
}
