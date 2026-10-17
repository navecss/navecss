/**
 * Writes `dist/registry/`: a shadcn registry of the components this package styles, one universal
 * item per styled subpath plus `registry.json`, generated from the package's own source, so a copy
 * is the package's component and cannot drift from it. Run after `build-styles.ts`:
 *
 *   node scripts/generate-registry.ts [--root <package directory>] [--out <directory>]
 *
 * `--root` is the directory whose `package.json` and `LICENSE` are read (default: this package);
 * the code that is read (the wrapper generator, the atoms, `src/part.ts`) is always this script's
 * own package. `main` is exported for the tests, which pass `mutate` to plant a bad item before the
 * items are validated; the file-writing driver stays behind `isMain`.
 */
import type { AtomName } from '@navecss/core/atoms'

import { toClassName } from '@navecss/core/atoms'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

import type { Manifest, RegistryItem } from './registry/items.ts'

import { atomsFor, focusRingAtoms } from '../styles/atoms.ts'
import { RegistryBuildError } from './registry/errors.ts'
import { buildIndex, buildItem } from './registry/items.ts'
import { cssHeader, readLicense, typescriptHeader } from './registry/license.ts'
import { localName, moduleBody } from './registry/module-css.ts'
import { entryModule, partsModule, wrapModule } from './registry/sources.ts'
import { validateItem } from './registry/validate.ts'
import { generateWrappers } from './generate-wrappers.ts'

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

/**
 * The layer order statement, read from core's own copy as `build-styles.ts` reads it: layer order
 * is fixed by first appearance, so the statement a module opens with must be Nave's, byte for byte.
 */
const readOrderStatement = (): string => {
  const layersPath = fileURLToPath(import.meta.resolve('@navecss/core/layers'))
  let statement: string | undefined
  postcss.parse(readFileSync(layersPath, 'utf8')).walkAtRules('layer', (rule) => {
    if (statement === undefined && rule.nodes === undefined) statement = `@layer ${rule.params};`
  })
  if (statement === undefined) throw new Error(`no layer order statement in ${layersPath}`)
  return statement
}

export interface MainOptions {
  readonly argv?: readonly string[]
  /**
  Called with the items before they are validated; it may change them in place.
   */
  readonly mutate?: (items: RegistryItem[]) => unknown
  readonly out?: string
  readonly root?: string
}

const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

/**
 * The subpaths a registry has an item for: those whose generated module names a Nave class.
 */
const styledSubpaths = (wrapped: ReadonlyMap<string, string>): string[] =>
  [...wrapped.keys()]
    .filter((name) => name.endsWith('/parts.generated.ts'))
    .filter((name) => wrapped.get(name)?.includes('nave-base-ui-') === true)
    .map((name) => name.slice(0, name.indexOf('/')))
    .toSorted((a, b) => a.localeCompare(b))

const readManifest = (root: string): Manifest =>
  JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as Manifest

const atomClasses = (atoms: Readonly<Record<string, unknown>>): Map<string, string> => {
  const byClass = new Map<string, string>()
  const byLocal = new Map<string, string>()
  for (const atom of Object.keys(atoms)) {
    byClass.set(toClassName(atom as AtomName), atom)
    const clash = byLocal.get(localName(atom))
    if (clash !== undefined) {
      throw new RegistryBuildError(`the atoms ${clash} and ${atom} both become ${localName(atom)}`)
    }
    byLocal.set(localName(atom), atom)
  }
  return byClass
}

/**
 * Every item of the registry, from the package's own source.
 */
export const generateItems = async (root: string): Promise<RegistryItem[]> => {
  const manifest = readManifest(root)
  const license = readLicense(root)
  const atoms = atomsFor([])
  const atomOfClass = atomClasses(atoms)
  const orderStatement = readOrderStatement()
  const wrapped = generateWrappers()
  const part = readFileSync(path.join(PACKAGE, 'src/part.ts'), 'utf8')
  const items: RegistryItem[] = []
  for (const subpath of styledSubpaths(wrapped)) {
    const ts = typescriptHeader(license)
    const parts = partsModule(
      subpath,
      wrapped.get(`${subpath}/parts.generated.ts`) ?? '',
      atomOfClass,
      ts,
    )
    const body = await moduleBody({ atoms, focusRingAtoms, orderStatement, used: parts.used })
    items.push(
      buildItem(
        {
          entry: entryModule(subpath, wrapped.get(`${subpath}/index.ts`) ?? '', ts),
          module: `${cssHeader(license)}${body}`,
          parts: parts.text,
          subpath,
          wrap: wrapModule(part, ts),
        },
        license.text,
        manifest,
      ),
    )
  }
  return items
}

const writeJson = (directory: string, name: string, value: unknown): void => {
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Builds the registry and writes it, emptied first; returns the process exit code. A refusal
 * prints the item and file it concerns and writes no item.
 */
export const main = async (options: MainOptions = {}): Promise<number> => {
  const argv = options.argv ?? process.argv.slice(2)
  const root = path.resolve(options.root ?? optionOf(argv, '--root') ?? PACKAGE)
  const out = path.resolve(
    options.out ?? optionOf(argv, '--out') ?? path.join(root, 'dist/registry'),
  )
  try {
    rmSync(out, { force: true, recursive: true })
    const items = await generateItems(root)
    options.mutate?.(items)
    for (const item of items) validateItem(item)
    mkdirSync(out, { recursive: true })
    for (const item of items) writeJson(out, `${item.name}.json`, item)
    writeJson(out, 'registry.json', buildIndex(items, readManifest(root)))
    return 0
  } catch (error) {
    if (!(error instanceof RegistryBuildError)) throw error
    // eslint-disable-next-line no-console -- the build's refusal goes to stderr, naming the item and file
    console.error(`generate-registry: ${error.message}`)
    return 1
  }
}

if (isMain) {
  process.exitCode = await main()
}
