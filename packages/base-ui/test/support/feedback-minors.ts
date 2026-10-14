/**
 * Loading the wrappers of the seven subpaths over a Base UI minor, and the wrappers over stand-ins
 * for Base UI's parts. The module paths are built at run time on purpose: a literal specifier of a
 * module that does not exist yet fails the transform of the whole test file, and a test per module
 * must fail on its own.
 *
 * The Base UI specifiers of the wrappers are redirected for the length of a load, as
 * `w6-minors.ts` does for the three subpaths it renders; the minors in between the two ends of a
 * run are the devDependency aliases (`base-ui-react-<version>`).
 */
import path from 'node:path'
import { vi } from 'vitest'

import type { Minor } from './w6-minors.ts'

import { FEEDBACK_SUBPATHS, type FeedbackSubpath } from './feedback-subpaths.ts'
import { PACKAGE_DIR } from './stylesheet.ts'

type Module = Record<string, unknown>

type Loaders = Readonly<Record<FeedbackSubpath, () => Promise<Module>>>

/**
Base UI's seven subpaths from the Base UI the run installed (the floor in a floor run).
 */
export const ownLoaders: Loaders = {
  toast: () => import('@base-ui/react/toast'),
  'navigation-menu': () => import('@base-ui/react/navigation-menu'),
  'scroll-area': () => import('@base-ui/react/scroll-area'),
  meter: () => import('@base-ui/react/meter'),
  progress: () => import('@base-ui/react/progress'),
  avatar: () => import('@base-ui/react/avatar'),
  separator: () => import('@base-ui/react/separator'),
}

/**
Base UI's seven subpaths from a devDependency alias, imported with literal specifiers so the
bundler sees them.
 */
export const loadersOf = (alias: string): Loaders => {
  switch (alias) {
    case 'base-ui-react-1.4.0': {
      return {
        toast: () => import('base-ui-react-1.4.0/toast'),
        'navigation-menu': () => import('base-ui-react-1.4.0/navigation-menu'),
        'scroll-area': () => import('base-ui-react-1.4.0/scroll-area'),
        meter: () => import('base-ui-react-1.4.0/meter'),
        progress: () => import('base-ui-react-1.4.0/progress'),
        avatar: () => import('base-ui-react-1.4.0/avatar'),
        separator: () => import('base-ui-react-1.4.0/separator'),
      }
    }
    case 'base-ui-react-1.5.0': {
      return {
        toast: () => import('base-ui-react-1.5.0/toast'),
        'navigation-menu': () => import('base-ui-react-1.5.0/navigation-menu'),
        'scroll-area': () => import('base-ui-react-1.5.0/scroll-area'),
        meter: () => import('base-ui-react-1.5.0/meter'),
        progress: () => import('base-ui-react-1.5.0/progress'),
        avatar: () => import('base-ui-react-1.5.0/avatar'),
        separator: () => import('base-ui-react-1.5.0/separator'),
      }
    }
    case 'base-ui-react-1.6.0': {
      return {
        toast: () => import('base-ui-react-1.6.0/toast'),
        'navigation-menu': () => import('base-ui-react-1.6.0/navigation-menu'),
        'scroll-area': () => import('base-ui-react-1.6.0/scroll-area'),
        meter: () => import('base-ui-react-1.6.0/meter'),
        progress: () => import('base-ui-react-1.6.0/progress'),
        avatar: () => import('base-ui-react-1.6.0/avatar'),
        separator: () => import('base-ui-react-1.6.0/separator'),
      }
    }
    case 'base-ui-react-1.7.0': {
      return {
        toast: () => import('base-ui-react-1.7.0/toast'),
        'navigation-menu': () => import('base-ui-react-1.7.0/navigation-menu'),
        'scroll-area': () => import('base-ui-react-1.7.0/scroll-area'),
        meter: () => import('base-ui-react-1.7.0/meter'),
        progress: () => import('base-ui-react-1.7.0/progress'),
        avatar: () => import('base-ui-react-1.7.0/avatar'),
        separator: () => import('base-ui-react-1.7.0/separator'),
      }
    }
    default: {
      throw new Error(`no loader for ${alias}: add it here and install ${alias}`)
    }
  }
}

/**
The Base UI module of a subpath at a minor: the run's own for the run's minor, else the alias.
 */
export const loadBaseAt = (
  minor: Minor,
  ownVersion: string,
  subpath: FeedbackSubpath,
): Promise<Module> =>
  (minor.version === ownVersion ? ownLoaders : loadersOf(minor.alias))[subpath]()

const srcModule = (subpath: string): string => path.join(PACKAGE_DIR, 'src', subpath, 'index.ts')

/**
The wrapper module of each of the seven, loaded from `src/` afresh. With an alias, the Base UI
specifiers the wrappers import are redirected to it for the length of the load; with none, the
wrappers share the run's own Base UI. Rejects, naming the subpath, where a module does not exist.
 */
export const loadWrappers = async (alias?: string): Promise<Readonly<Record<string, Module>>> => {
  vi.resetModules()
  const loaders = alias === undefined ? undefined : loadersOf(alias)
  for (const subpath of FEEDBACK_SUBPATHS) {
    if (loaders !== undefined) {
      vi.doMock(`@base-ui/react/${subpath}`, () => loaders[subpath]())
    }
  }
  try {
    const entries = await Promise.all(
      FEEDBACK_SUBPATHS.map(async (subpath) => {
        const module = (await import(/* @vite-ignore */ srcModule(subpath))) as Module
        return [subpath, module] as const
      }),
    )
    return Object.fromEntries(entries)
  } finally {
    for (const subpath of FEEDBACK_SUBPATHS) {
      vi.doUnmock(`@base-ui/react/${subpath}`)
    }
    // The wrappers loaded over the alias must not be what a later import of `src/` returns.
    vi.resetModules()
  }
}

/**
The wrapper module of one subpath, loaded over stand-ins for Base UI's parts: `stand` builds the
module `@base-ui/react/<subpath>` is replaced with.
 */
export const loadWrapperOver = async (
  subpath: FeedbackSubpath,
  stand: () => Module,
): Promise<Module> => {
  vi.resetModules()
  vi.doMock(`@base-ui/react/${subpath}`, stand)
  try {
    return (await import(/* @vite-ignore */ srcModule(subpath))) as Module
  } finally {
    vi.doUnmock(`@base-ui/react/${subpath}`)
    vi.resetModules()
  }
}
