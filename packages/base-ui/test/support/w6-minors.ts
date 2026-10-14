/**
 * Rendering the wrappers against a Base UI minor other than the two the runs install. A run
 * aliases `@base-ui/react` to the floor (1.3.0) or leaves the current devDependency (1.8.0); the
 * minors in between are installed as devDependency aliases (`base-ui-react-<version>`) for the
 * tests that read their declaration files. Here the Base UI specifiers the wrappers import are
 * redirected to one of those aliases for the length of a load, so the wrappers, `Field` and
 * every Base UI part they render share that one copy.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'

import type { Source, Ui } from './scenes.ts'

import { PACKAGE_DIR } from './stylesheet.ts'
import { topName } from './subpaths.ts'

/**
The minors from the floor to the current run that the combined criterion names, and the
devDependency alias that installs each one (the floor's alias is `base-ui-react-floor`).
 */
export const FLOOR_MINOR = { alias: 'base-ui-react-floor', version: '1.3.0' } as const

export const CURRENT_MINOR = { alias: '@base-ui/react', version: '1.8.0' } as const

export const MINORS = [
  FLOOR_MINOR,
  { alias: 'base-ui-react-1.4.0', version: '1.4.0' },
  { alias: 'base-ui-react-1.5.0', version: '1.5.0' },
  { alias: 'base-ui-react-1.6.0', version: '1.6.0' },
  { alias: 'base-ui-react-1.7.0', version: '1.7.0' },
  CURRENT_MINOR,
] as const

export type Minor = (typeof MINORS)[number]

export const isInstalled = (minor: Minor): boolean =>
  existsSync(path.join(PACKAGE_DIR, 'node_modules', minor.alias, 'package.json'))

type Wrapped = 'autocomplete' | 'combobox' | 'field'

type Loaders = Readonly<Record<Wrapped, () => Promise<Record<string, unknown>>>>

/**
Each Base UI subpath the combined criterion renders, imported from the alias with a literal
specifier so the bundler sees it.
 */
const loadersOf = (alias: string): Loaders => {
  switch (alias) {
    case 'base-ui-react-1.4.0': {
      return {
        autocomplete: () => import('base-ui-react-1.4.0/autocomplete'),
        combobox: () => import('base-ui-react-1.4.0/combobox'),
        field: () => import('base-ui-react-1.4.0/field'),
      }
    }
    case 'base-ui-react-1.5.0': {
      return {
        autocomplete: () => import('base-ui-react-1.5.0/autocomplete'),
        combobox: () => import('base-ui-react-1.5.0/combobox'),
        field: () => import('base-ui-react-1.5.0/field'),
      }
    }
    case 'base-ui-react-1.6.0': {
      return {
        autocomplete: () => import('base-ui-react-1.6.0/autocomplete'),
        combobox: () => import('base-ui-react-1.6.0/combobox'),
        field: () => import('base-ui-react-1.6.0/field'),
      }
    }
    case 'base-ui-react-1.7.0': {
      return {
        autocomplete: () => import('base-ui-react-1.7.0/autocomplete'),
        combobox: () => import('base-ui-react-1.7.0/combobox'),
        field: () => import('base-ui-react-1.7.0/field'),
      }
    }
    default: {
      throw new Error(`no loader for ${alias}: add it here and install ${alias}`)
    }
  }
}

const WRAPPED: readonly Wrapped[] = ['autocomplete', 'combobox', 'field']

/**
The wrapped `autocomplete`, `combobox` and `field` over the Base UI alias. The wrappers are
loaded afresh with the three Base UI specifiers redirected, and the redirect is taken out again.
 */
export const loadNaveOver = async (alias: string): Promise<Source> => {
  const loaders = loadersOf(alias)
  vi.resetModules()
  for (const subpath of WRAPPED) {
    vi.doMock(`@base-ui/react/${subpath}`, () => loaders[subpath]())
  }
  try {
    const modules = {
      autocomplete: await import('../../src/autocomplete/index.ts'),
      combobox: await import('../../src/combobox/index.ts'),
      field: await import('../../src/field/index.ts'),
    }
    return (subpath) => {
      const module = modules[subpath as keyof typeof modules] as Record<string, unknown> | undefined
      const ui = module?.[topName(subpath)] as Ui | undefined
      if (ui === undefined) {
        throw new Error(`no component for the subpath ${subpath}`)
      }
      return ui
    }
  } finally {
    for (const subpath of WRAPPED) {
      vi.doUnmock(`@base-ui/react/${subpath}`)
    }
    // The wrappers loaded over the alias must not be what a later import of `src/` returns.
    vi.resetModules()
  }
}

/**
The Base UI part a minor's own module exports, to tell that a wrapped pass-through part is that
copy's and no other.
 */
export const baseUiPart = async (
  alias: string,
  subpath: Wrapped,
  name: string,
): Promise<unknown> => {
  const namespace = await loadersOf(alias)[subpath]()
  const component = namespace?.[topName(subpath)] as Record<string, unknown> | undefined
  return component?.[name]
}

/**
The minor the run's own Base UI is: the floor for the floor runs, the devDependency otherwise.
 */
export const runMinor = (): Minor => {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable set by vitest.config.ts, not a build input
  const isFloor = process.env.NAVE_BASE_UI === 'floor'
  return isFloor ? FLOOR_MINOR : CURRENT_MINOR
}
