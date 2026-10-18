/**
 * The styled subpaths, derived the way the spec's conventions say: the keys of the manifest's
 * `exports` other than `.`, `./styles.css` and `./package.json`, whose generated module
 * (`src/<s>/parts.generated.ts`) names at least one `nave-base-ui-` class. It reads the manifest
 * and those modules and nothing from `scripts/generate-registry.ts`, so a completeness check built
 * on it does not inherit the generator's blind spots.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { byCodeUnit } from './load.ts'

const NOT_A_SUBPATH: ReadonlySet<string> = new Set(['.', './package.json', './styles.css'])

export const manifestOf = (): {
  exports: Record<string, unknown>
  files: string[]
  peerDependencies: Record<string, string>
  version: string
} => JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as never

/**
 * Every component subpath of the manifest, as `dialog`, sorted by code unit.
 */
export const componentSubpaths = (): string[] =>
  Object.keys(manifestOf().exports)
    .filter((key) => !NOT_A_SUBPATH.has(key))
    .map((key) => key.slice(2))
    .toSorted(byCodeUnit)

/**
 * The subpaths whose generated module names at least one Nave class.
 */
export const styledSubpaths = (): string[] =>
  componentSubpaths().filter((subpath) => {
    const generated = path.join(PACKAGE_DIR, 'src', subpath, 'parts.generated.ts')
    return existsSync(generated) && readFileSync(generated, 'utf8').includes('nave-base-ui-')
  })
