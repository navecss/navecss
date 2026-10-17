/**
 * What the copies' render comparison needs, set up once from the registry the build wrote: the copies
 * on disk, loaded as a scene source, and the atom each class token they hand out stands for.
 */
import type { ElementRecord } from '../dom.ts'
import type { Source } from '../scenes.ts'
import type { LoadedRegistry, RegistryItem } from './load.ts'
import type { AtomMapping } from './render-mapping.ts'

import { readStylesheet } from '../stylesheet.ts'
import { loadRegistry, REGISTRY_DIR } from './load.ts'
import { loadCopySource, loadModuleClasses } from './render-copy-source.ts'
import { atomMapping, localClassesOf, tokenAtoms } from './render-mapping.ts'
import {
  makeScratchDirectory,
  removeScratchDirectory,
  writeCopies,
  writeItemFiles,
} from './render-scratch.ts'

const SCRATCH_PARENT = 'test/render'
const SCRATCH_PREFIX = '.registry-copies-'

const scratch: string[] = []

const newScratch = (): string => {
  const directory = makeScratchDirectory(SCRATCH_PARENT, SCRATCH_PREFIX)
  scratch.push(directory)
  return directory
}

/**
 * Removes every scratch directory this module made.
 */
export const removeScratchDirectories = (): void => {
  for (const directory of scratch) removeScratchDirectory(directory)
}

const moduleOf = (item: RegistryItem): string =>
  item.files.find((file) => file.target.endsWith('.module.css'))?.content ?? ''

/**
 * The local names each item's module has a rule for, by subpath.
 */
const localsBySubpath = (items: Iterable<RegistryItem>): Map<string, string[]> =>
  new Map(
    [...items].map((item) => [
      item.name.replace(/^base-ui-/, ''),
      [...localClassesOf(moduleOf(item))],
    ]),
  )

export interface Prepared {
  readonly atomOfToken: ReadonlyMap<string, string>
  readonly copies: Source
  readonly mapping: AtomMapping
  readonly registry: LoadedRegistry
}

/**
 * Reads the registry (the build's `dist/registry`; failing, naming the directory, when the build did
 * not write it), writes every
 * item's files to a scratch directory and loads the copies of the given styled subpaths from it.
 */
export const prepareCopies = async (
  styled: readonly string[],
  unstyled: Source,
  registryDirectory: string = REGISTRY_DIR,
): Promise<Prepared> => {
  const registry = loadRegistry(registryDirectory)
  const directory = newScratch()
  writeCopies(registry.items.values(), directory)
  const mapping = atomMapping(
    new Map(registry.items.values().map((item) => [item.name, moduleOf(item)])),
    readStylesheet(),
  )
  const classes = await loadModuleClasses(directory, localsBySubpath(registry.items.values()))
  return {
    atomOfToken: tokenAtoms(classes, mapping),
    copies: await loadCopySource(directory, styled, unstyled),
    mapping,
    registry,
  }
}

const MISSPELT_FROM = 'styles.dialogPopup'
const MISSPELT_TO = 'styles.dialogPopop'

/**
 * The Dialog copy with one reference in its parts file changed (`styles.dialogPopup` misspelt),
 * written to a directory of its own, with the class tokens its module hands out added to the known
 * ones.
 */
export const misspeltDialog = async (
  prepared: Prepared,
  unstyled: Source,
): Promise<{ source: Source; tokens: Map<string, string> }> => {
  const item = prepared.registry.items.get('base-ui-dialog')
  if (item === undefined) throw new Error('the registry has no item base-ui-dialog')
  const mutated = structuredClone(item)
  const parts = mutated.files.find((file) => file.target.endsWith('nave-dialog.parts.ts'))
  if (parts?.content?.includes(MISSPELT_FROM) !== true) {
    throw new Error(`nave-dialog.parts.ts has no reference ${MISSPELT_FROM} to misspell`)
  }
  parts.content = parts.content.replace(MISSPELT_FROM, () => MISSPELT_TO)
  const directory = newScratch()
  writeItemFiles(mutated, directory)
  const classes = await loadModuleClasses(directory, localsBySubpath([mutated]))
  return {
    source: await loadCopySource(directory, ['dialog'], unstyled),
    tokens: new Map([...prepared.atomOfToken, ...tokenAtoms(classes, prepared.mapping)]),
  }
}

/**
 * The package's records with each package class read as the token of the copy that stands for it, so
 * a comparison of the two is clean until a control changes one.
 */
export const asCopy = (
  records: readonly ElementRecord[],
  atomOfToken: ReadonlyMap<string, string>,
): ElementRecord[] => {
  const tokenOf = new Map([...atomOfToken].map(([token, atom]) => [atom, token] as const))
  return records.map((record) => {
    const classes = (record.attributes.get('class') ?? '')
      .split(' ')
      .filter((token) => token !== '')
      .map((atom) => tokenOf.get(atom) ?? atom)
    return {
      ...record,
      attributes: new Map([
        ...[...record.attributes].filter(([name]) => name !== 'class'),
        ...(classes.length > 0 ? [['class', classes.join(' ')] as const] : []),
      ]),
    }
  })
}

/**
 * The records with one attribute of the part's element set to a value.
 */
export const withAttribute = (
  records: readonly ElementRecord[],
  part: string,
  name: string,
  value: string,
): ElementRecord[] =>
  records.map((record) =>
    record.attributes.get('data-part') === part
      ? { ...record, attributes: new Map([...record.attributes, [name, value]]) }
      : record,
  )
