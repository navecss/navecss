/**
 * Reading a declaration file of `@base-ui/react` at the exact minor a row names. Each minor comes
 * from a devDependency alias (`base-ui-react-<version>`), the floor alias and the package itself
 * included, whichever of them carries the version. The lookup is lazy: a minor whose alias is not
 * installed fails the test that asks for it, naming the alias to add, and nothing else.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR } from './stylesheet.ts'

const MODULES = path.join(PACKAGE_DIR, 'node_modules')

const candidates = (version: string): string[] => [
  `base-ui-react-${version}`,
  'base-ui-react-floor',
  '@base-ui/react',
]

const versionOf = (dir: string): string | undefined => {
  const manifest = path.join(dir, 'package.json')
  if (!existsSync(manifest)) {
    return undefined
  }
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version
}

/**
What to add to `packages/base-ui/package.json`'s devDependencies, then install, for a minor that
no installed alias carries.
 */
export const installHint = (version: string): string =>
  `@base-ui/react@${version} is not installed: add "base-ui-react-${version}": "npm:@base-ui/react@${version}" to the devDependencies and run pnpm install`

/**
The directory of the installed package at that exact version, or undefined when no installed alias
carries it.
 */
export const baseUiRootAt = (version: string): string | undefined =>
  candidates(version)
    .map((name) => path.join(MODULES, name))
    .find((candidate) => versionOf(candidate) === version)

/**
A declaration file's text, by its path inside the package's modules. The older layout keeps the
modules under `esm/`, the newer one beside the package manifest; the file is read from whichever
holds it.
 */
const readDeclarationFile = (root: string, file: string): string => {
  const found = [path.join(root, 'esm', file), path.join(root, file)].find((candidate) =>
    existsSync(candidate),
  )
  if (found === undefined) {
    throw new Error(`${file} is in neither ${path.join(root, 'esm')} nor ${root}`)
  }
  return readFileSync(found, 'utf8')
}

/**
Whether a declaration file says it declares the item. A `data-*` name must be an enum member's
value (`highlighted = "data-highlighted"`), so a doc comment that merely mentions it does not
count; any other item (a value such as `inline-start`) must appear in the file's quoted types.
 */
export const isDeclared = (text: string, item: string): boolean =>
  item.startsWith('data-')
    ? new RegExp(String.raw`=\s*"${item}"`).test(text)
    : text.includes(`'${item}'`)

/**
The items a file lacks, read from the package installed at the given root.
 */
export const itemsMissingFrom = (
  root: string,
  file: string,
  items: readonly string[],
): string[] => {
  const text = readDeclarationFile(root, file)
  return items.filter((item) => !isDeclared(text, item))
}
