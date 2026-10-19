/**
 * The wrapped Toast and Navigation Menu over a Base UI minor other than the one the run installs,
 * the way `w6-minors.ts` does it for the Combobox, the Autocomplete and the Field: the Base UI
 * specifiers the two wrappers import are redirected to the minor's devDependency alias for the
 * length of a load, so the wrappers and every Base UI part they render share that one copy. The
 * loaders are written with literal specifiers so the bundler sees them.
 */
import { vi } from 'vitest'

import type { Feedback } from './w10-feedback.ts'

import { FLOOR_MINOR, isInstalled, type Minor, MINORS, runMinor } from './w6-minors.ts'

type Loader = () => Promise<Record<string, unknown>>

interface Loaders {
  readonly 'navigation-menu': Loader
  readonly toast: Loader
}

const loadersOf = (alias: string): Loaders => {
  switch (alias) {
    case 'base-ui-react-1.4.0': {
      return {
        'navigation-menu': () => import('base-ui-react-1.4.0/navigation-menu'),
        toast: () => import('base-ui-react-1.4.0/toast'),
      }
    }
    case 'base-ui-react-1.5.0': {
      return {
        'navigation-menu': () => import('base-ui-react-1.5.0/navigation-menu'),
        toast: () => import('base-ui-react-1.5.0/toast'),
      }
    }
    case 'base-ui-react-1.6.0': {
      return {
        'navigation-menu': () => import('base-ui-react-1.6.0/navigation-menu'),
        toast: () => import('base-ui-react-1.6.0/toast'),
      }
    }
    case 'base-ui-react-1.7.0': {
      return {
        'navigation-menu': () => import('base-ui-react-1.7.0/navigation-menu'),
        toast: () => import('base-ui-react-1.7.0/toast'),
      }
    }
    case 'base-ui-react-1.8.0': {
      return {
        'navigation-menu': () => import('base-ui-react-1.8.0/navigation-menu'),
        toast: () => import('base-ui-react-1.8.0/toast'),
      }
    }
    default: {
      throw new Error(`no loader for ${alias}: add it here and install ${alias}`)
    }
  }
}

/**
The wrapped Toast and Navigation Menu over the Base UI alias. The wrappers are loaded afresh
with the two Base UI specifiers redirected, and the redirect is taken out again.
 */
export const loadFeedbackOver = async (alias: string): Promise<Feedback> => {
  const loaders = loadersOf(alias)
  vi.resetModules()
  vi.doMock('@base-ui/react/toast', () => loaders.toast())
  vi.doMock('@base-ui/react/navigation-menu', () => loaders['navigation-menu']())
  try {
    const toast = await import('../../src/toast/index.ts')
    const navigationMenu = await import('../../src/navigation-menu/index.ts')
    return {
      NavigationMenu: navigationMenu.NavigationMenu as unknown as Feedback['NavigationMenu'],
      Toast: toast.Toast as unknown as Feedback['Toast'],
    }
  } finally {
    vi.doUnmock('@base-ui/react/toast')
    vi.doUnmock('@base-ui/react/navigation-menu')
    // The wrappers loaded over the alias must not be what a later import of `src/` returns.
    vi.resetModules()
  }
}

/**
The minors a run covers for a "minor runs" criterion, as the other minor files do: the floor
runs cover the floor, the current runs the five above it (the run's own Base UI is the last).
 */
export const minorsOfRun = (): readonly Minor[] =>
  runMinor().version === FLOOR_MINOR.version
    ? [runMinor()]
    : MINORS.filter(({ version }) => version !== FLOOR_MINOR.version)

/**
The wrapped components over a minor: the run's own for the run's minor, the redirected load for
any other.
 */
export const feedbackFor = async (own: Feedback, minor: Minor): Promise<Feedback> =>
  minor.version === runMinor().version ? own : loadFeedbackOver(minor.alias)

/**
Base UI's own Toast and Navigation Menu namespaces of a minor, to tell that a wrapped
pass-through part (Provider, Positioner, Content) is that copy's and no other.
 */
export const baseNamespaces = async (minor: Minor): Promise<Feedback> => {
  const loaders =
    minor.version === runMinor().version
      ? {
          'navigation-menu': () => import('@base-ui/react/navigation-menu'),
          toast: () => import('@base-ui/react/toast'),
        }
      : loadersOf(minor.alias)
  const [toast, navigationMenu] = await Promise.all([loaders.toast(), loaders['navigation-menu']()])
  return {
    NavigationMenu: navigationMenu.NavigationMenu as Feedback['NavigationMenu'],
    Toast: toast.Toast as Feedback['Toast'],
  }
}

export interface Redirect {
  readonly isDifferentFromAnotherMinor: boolean
  readonly isInstalled: boolean
  readonly isThisMinor: boolean
}

/**
Whether a minor's wrapped parts are that minor's Base UI own (a pass-through part of the
namespace is the same object), and, as the control, not another minor's.
 */
export const redirectOf = async (
  feedback: Feedback,
  minor: Minor,
  probe: { readonly namespace: keyof Feedback; readonly part: string },
): Promise<Redirect> => {
  const base = await baseNamespaces(minor)
  const another = await baseNamespaces(minor.version === '1.4.0' ? MINORS[2] : MINORS[1])
  return {
    isDifferentFromAnotherMinor:
      feedback[probe.namespace][probe.part] !== another[probe.namespace][probe.part],
    isInstalled: isInstalled(minor),
    isThisMinor: feedback[probe.namespace][probe.part] === base[probe.namespace][probe.part],
  }
}
