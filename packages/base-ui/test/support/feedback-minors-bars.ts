/**
 * Rendering the wrappers of the value bars and the separator against a Base UI minor other than
 * the two the runs install, as `w6-minors.ts` does for the Combobox: the Base UI specifiers the
 * wrappers import are redirected to the devDependency alias that installs the minor, for the
 * length of a load, so the wrappers and every part they render share that one copy.
 */
import { vi } from 'vitest'

import type { Source, Ui } from './scenes.ts'

import { topName } from './subpaths.ts'

type Wrapped = 'avatar' | 'meter' | 'progress' | 'separator'

type Loaders = Readonly<Record<Wrapped, () => Promise<Record<string, unknown>>>>

/**
Each Base UI subpath the criteria render at every minor, imported from the alias with a literal
specifier so the bundler sees it.
 */
const loadersOf = (alias: string): Loaders => {
  switch (alias) {
    case 'base-ui-react-1.4.0': {
      return {
        avatar: () => import('base-ui-react-1.4.0/avatar'),
        meter: () => import('base-ui-react-1.4.0/meter'),
        progress: () => import('base-ui-react-1.4.0/progress'),
        separator: () => import('base-ui-react-1.4.0/separator'),
      }
    }
    case 'base-ui-react-1.5.0': {
      return {
        avatar: () => import('base-ui-react-1.5.0/avatar'),
        meter: () => import('base-ui-react-1.5.0/meter'),
        progress: () => import('base-ui-react-1.5.0/progress'),
        separator: () => import('base-ui-react-1.5.0/separator'),
      }
    }
    case 'base-ui-react-1.6.0': {
      return {
        avatar: () => import('base-ui-react-1.6.0/avatar'),
        meter: () => import('base-ui-react-1.6.0/meter'),
        progress: () => import('base-ui-react-1.6.0/progress'),
        separator: () => import('base-ui-react-1.6.0/separator'),
      }
    }
    case 'base-ui-react-1.7.0': {
      return {
        avatar: () => import('base-ui-react-1.7.0/avatar'),
        meter: () => import('base-ui-react-1.7.0/meter'),
        progress: () => import('base-ui-react-1.7.0/progress'),
        separator: () => import('base-ui-react-1.7.0/separator'),
      }
    }
    default: {
      throw new Error(`no loader for ${alias}: add it here and install ${alias}`)
    }
  }
}

/**
 * The wrapper of `src/`, imported by a specifier the bundler does not analyse: a wrapper that does
 * not exist yet fails the test that asks for it, with the missing module's name, instead of
 * failing the whole file at transform time.
 */
const importWrapper = (subpath: Wrapped): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ `../../src/${subpath}/index.ts`) as Promise<Record<string, unknown>>

const WRAPPED: readonly Wrapped[] = ['avatar', 'meter', 'progress', 'separator']

/**
The wrapped `meter`, `progress` and `separator` (and `avatar`) over the Base UI alias. The wrappers
are loaded afresh with the Base UI specifiers redirected, and the redirect is taken out again.
 */
export const loadValueBarsOver = async (alias: string): Promise<Source> => {
  const loaders = loadersOf(alias)
  vi.resetModules()
  for (const subpath of WRAPPED) {
    vi.doMock(`@base-ui/react/${subpath}`, () => loaders[subpath]())
  }
  try {
    const modules: Record<Wrapped, Record<string, unknown>> = {
      avatar: await importWrapper('avatar'),
      meter: await importWrapper('meter'),
      progress: await importWrapper('progress'),
      separator: await importWrapper('separator'),
    }
    return (subpath) => {
      const module = modules[subpath as Wrapped] as Record<string, unknown> | undefined
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
