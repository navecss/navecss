import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'
import { SUBPATHS } from './support/subpaths.ts'

/**
 * The Base UI subpaths this package does not wrap. Each is a decision: a subpath Base UI adds
 * is either wrapped (it joins `SUBPATHS`) or listed here, so a new one is never missed silently.
 * `otp-field` came in Base UI 1.4.
 */
const NOT_WRAPPED: ReadonlySet<string> = new Set([
  'csp-provider',
  'direction-provider',
  'drawer',
  'merge-props',
  'otp-field',
  'types',
  'unstable-use-media-query',
  'use-render',
])

const MODULES = path.join(PACKAGE_DIR, 'node_modules')

/**
 * The Base UI installs: the one the package builds against and the older minors and the floor, each
 * installed under an alias.
 */
const INSTALLS: readonly string[] = [
  '@base-ui/react',
  ...readdirSync(MODULES).filter((name) => name.startsWith('base-ui-react-')),
]

/**
 * The subpaths an install's `exports` map names, without the root, `package.json`, the `internals`
 * that are not a public entry, and the entries set to `null`.
 */
const subpathsOf = (install: string): string[] => {
  const { exports } = JSON.parse(
    readFileSync(path.join(MODULES, install, 'package.json'), 'utf8'),
  ) as {
    exports: Record<string, unknown>
  }
  return Object.entries(exports)
    .filter(([, target]) => target !== null)
    .map(([key]) => key)
    .filter((key) => key !== '.' && key !== './package.json' && !key.startsWith('./internals/'))
    .map((key) => key.replace('./', ''))
}

const unaccountedFor = (subpaths: readonly string[]): string[] =>
  subpaths.filter(
    (name) => !(SUBPATHS as readonly string[]).includes(name) && !NOT_WRAPPED.has(name),
  )

describe('every Base UI subpath is wrapped by this package or listed as not wrapped', () => {
  it.each(INSTALLS)('%s', (install) => {
    expect(unaccountedFor(subpathsOf(install))).toEqual([])
  })

  it('the Base UI the package builds against has exactly the wrapped subpaths and the listed ones', () => {
    expect(subpathsOf('@base-ui/react').toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...SUBPATHS, ...NOT_WRAPPED].toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it('control: a subpath that is neither wrapped nor listed is reported', () => {
    expect(unaccountedFor([...subpathsOf('@base-ui/react'), 'planted'])).toEqual(['planted'])
  })
})
