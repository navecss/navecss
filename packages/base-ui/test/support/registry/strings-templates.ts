/**
 * The cleared item templates filled the way the spec names their slots, computed without the
 * generator: `<Component>`, `<Export>` and `<subpath>` from the subpath, `<version>` from the
 * manifest and the three floors worded from `peerDependencies`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { LoadedRegistry } from './load.ts'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { cleared } from './cleared.ts'
import { floorsOf } from './strings-floors.ts'
import { itemsOf } from './strings-text.ts'

export interface ManifestFacts {
  readonly peerDependencies: Readonly<Record<string, string>>
  readonly version: string
}

export interface ItemStrings {
  readonly description: string
  readonly docs: string
  readonly title: string
}

const capitalised = (word: string): string => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`

/**
 * The display name from the subpath: each `-`-separated word capitalised (`alert-dialog`).
 */
export const componentNameOf = (subpath: string): string =>
  subpath
    .split('-')
    .map((word) => capitalised(word))
    .join(' ')

/**
 * The name the package's `src/<subpath>/index.ts` exports for the subpath: the namespace of
 * `export * as Dialog from` or the name in `export { Button } from`.
 */
export const exportNameOf = (subpath: string): string => {
  const source = readFileSync(path.join(PACKAGE_DIR, 'src', subpath, 'index.ts'), 'utf8')
  const match = /^export (?:\* as (\w+)|\{ (\w+) \}) from '\.\/parts\.generated\.ts'$/m.exec(source)
  const name = match?.[1] ?? match?.[2]
  if (name === undefined) throw new Error(`src/${subpath}/index.ts exports no component name`)
  return name
}

/**
 * The three templates with every slot filled for one subpath.
 */
export const expectedStrings = (subpath: string, manifest: ManifestFacts): ItemStrings => {
  const floors = floorsOf(manifest.peerDependencies)
  const slots: Readonly<Record<string, string>> = {
    '<Component>': componentNameOf(subpath),
    '<Export>': exportNameOf(subpath),
    '<base-ui floor>': floors.baseUi,
    '<react floor>': floors.react,
    '<subpath>': subpath,
    '<tokens floor>': floors.tokens,
    '<version>': manifest.version,
  }
  const fill = (template: string): string =>
    template.replaceAll(/<[\w -]+>/g, (slot) => slots[slot] ?? slot)
  return {
    description: fill(cleared('T-desc')),
    docs: fill(cleared('T-docs')),
    title: fill(cleared('T-title')),
  }
}

/**
 * Problems with the items' `title`, `description` and `docs`: one per item and field that is not
 * the filled template, and one per subpath with no item.
 */
export const templateProblems = (
  registry: LoadedRegistry,
  subpaths: readonly string[],
  manifest: ManifestFacts,
): string[] =>
  subpaths.flatMap((subpath) => {
    const item = registry.items.get(`base-ui-${subpath}`)
    if (item === undefined) return [`base-ui-${subpath}: no item`]
    const expected = expectedStrings(subpath, manifest)
    return (['title', 'description', 'docs'] as const)
      .filter((field) => item[field] !== expected[field])
      .map((field) => `${item.name} ${field} is not the filled template`)
  })

/**
 * Problems with the `docs` messages: any that names a folder, which `--path` moves.
 */
export const docsFolderProblems = (registry: LoadedRegistry): string[] =>
  itemsOf(registry).flatMap((item) =>
    ['components/nave', 'src/']
      .filter((folder) => item.docs.includes(folder))
      .map((folder) => `${item.name} docs names ${folder}`),
  )
