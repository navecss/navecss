/**
 * The package's own source for one subpath, and the small readings of it the file-form checks
 * share: the whitespace fold, an atom's local name, and which class belongs to which atom.
 */
import { toClassName } from '@navecss/core/atoms'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { atoms } from '../../../styles/atoms.ts'
import { PACKAGE_DIR } from '../stylesheet.ts'

export interface PackageSources {
  /**
  `src/<s>/parts.generated.ts`.
   */
  readonly generated: string
  /**
  `src/<s>/index.ts`.
   */
  readonly index: string
  /**
  `src/part.ts`.
   */
  readonly part: string
}

const readSource = (relative: string): string =>
  readFileSync(path.join(PACKAGE_DIR, 'src', relative), 'utf8')

export const packageSources = (subpath: string): PackageSources => ({
  generated: readSource(`${subpath}/parts.generated.ts`),
  index: readSource(`${subpath}/index.ts`),
  part: readSource('part.ts'),
})

/**
 * Whitespace folded to single spaces, so a comparison does not depend on where lines break.
 */
export const foldWhitespace = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()

/**
 * The local name of an atom: the atom's name minus `baseUi`, first letter lower-cased.
 */
export const localNameOf = (atom: string): string => {
  const rest = atom.replace(/^baseUi/, '')
  return `${rest.slice(0, 1).toLowerCase()}${rest.slice(1)}`
}

/**
 * The local name of every atom, by the class the package stylesheet gives the atom.
 */
export const localNameByClass = (): Map<string, string> =>
  new Map(
    Object.keys(atoms).map(
      (atom) =>
        [toClassName(atom as Parameters<typeof toClassName>[0]), localNameOf(atom)] as const,
    ),
  )
