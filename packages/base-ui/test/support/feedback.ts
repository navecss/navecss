/**
 * What the seven feedback and navigation components need that the shared support does not have:
 * their subpaths, the two sources they render from (loaded lazily, so a wrapper that does not
 * exist yet fails the test that asks for it and nothing else), and the key sets the spec measured.
 */
import type { Source, Ui } from './scenes.ts'

import { SUBPATHS, topName } from './subpaths.ts'

/**
The seven subpaths the spec adds.
 */
export const FEEDBACK_SUBPATHS = [
  'toast',
  'navigation-menu',
  'scroll-area',
  'meter',
  'progress',
  'avatar',
  'separator',
] as const

export type FeedbackSubpath = (typeof FEEDBACK_SUBPATHS)[number]

/**
The subpath whose export is a single component rather than a namespace of parts.
 */
export const FEEDBACK_SINGLE_COMPONENT: FeedbackSubpath = 'separator'

/**
The subpaths of the v1 package and the overlay completion: the shipping subpaths with the seven
taken out, whether or not the package's list already holds them. What the older render files loop
over, so each keeps to the components its scenes and sources were written for, and the seven are
checked by the files of their own.
 */
export const EARLIER_SUBPATHS: readonly string[] = SUBPATHS.filter(
  (subpath) => !(FEEDBACK_SUBPATHS as readonly string[]).includes(subpath),
)

/**
Whether a part (as `Namespace.Part`, or the bare component) belongs to one of the seven.
 */
export const isFeedbackPart = (part: string): boolean =>
  FEEDBACK_SUBPATHS.some((subpath) => {
    const top = topName(subpath)
    return part === top || part.startsWith(`${top}.`)
  })

type Loaders = Readonly<Record<FeedbackSubpath, () => Promise<Record<string, unknown>>>>

/**
Written as literal specifiers so the run's aliases (the Base UI floor, React 18) apply.
 */
const bareLoaders: Loaders = {
  toast: () => import('@base-ui/react/toast'),
  'navigation-menu': () => import('@base-ui/react/navigation-menu'),
  'scroll-area': () => import('@base-ui/react/scroll-area'),
  meter: () => import('@base-ui/react/meter'),
  progress: () => import('@base-ui/react/progress'),
  avatar: () => import('@base-ui/react/avatar'),
  separator: () => import('@base-ui/react/separator'),
}

/**
 * The wrappers of `src/`, imported by a specifier the bundler does not analyse: a wrapper that
 * does not exist yet then fails the test that asks for it, with the missing module's name, instead
 * of failing the whole file at transform time.
 */
const importWrapper = (subpath: FeedbackSubpath): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ `../../src/${subpath}/index.ts`) as Promise<Record<string, unknown>>

const naveLoaders: Loaders = {
  toast: () => importWrapper('toast'),
  'navigation-menu': () => importWrapper('navigation-menu'),
  'scroll-area': () => importWrapper('scroll-area'),
  meter: () => importWrapper('meter'),
  progress: () => importWrapper('progress'),
  avatar: () => importWrapper('avatar'),
  separator: () => importWrapper('separator'),
}

const load = async (loaders: Loaders): Promise<Source> => {
  const entries = await Promise.all(
    FEEDBACK_SUBPATHS.map(async (subpath) => {
      const module = await loaders[subpath]()
      return [subpath, module[topName(subpath)] as Ui] as const
    }),
  )
  const byName = new Map<string, Ui>(entries)
  return (subpath) => {
    const ui = byName.get(subpath)
    if (ui === undefined) {
      throw new Error(`no component for the subpath ${subpath}`)
    }
    return ui
  }
}

const once = <T>(make: () => Promise<T>): (() => Promise<T>) => {
  let made: Promise<T> | undefined
  return () => {
    made ??= make()
    return made
  }
}

/**
The seven, from the Base UI the run installed.
 */
export const feedbackBare: () => Promise<Source> = once(() => load(bareLoaders))

/**
The seven, as the package's wrappers: a rejection (the module does not exist yet) reaches the
test that asked, and each later ask gets the same rejection.
 */
export const feedbackNave: () => Promise<Source> = once(() => load(naveLoaders))

/**
The measured key set of each namespace (measured at 1.3.0, 1.5.0, 1.6.0 and 1.8.0, identical), split into
the keys Table P styles and the keys Table T0 leaves unstyled; `Meter` and `Progress` have only
runtime keys here (`Progress.Status` is a type). Written out, not derived from Table P or T0.
 */
export const KEY_SETS: Readonly<
  Record<
    FeedbackSubpath,
    { readonly styled: readonly string[]; readonly unstyled: readonly string[] }
  >
> = {
  toast: {
    styled: ['Viewport', 'Root', 'Title', 'Description', 'Action', 'Close', 'Arrow'],
    unstyled: [
      'Provider',
      'Portal',
      'Positioner',
      'Content',
      'createToastManager',
      'useToastManager',
    ],
  },
  'navigation-menu': {
    styled: ['List', 'Trigger', 'Icon', 'Link', 'Popup', 'Arrow'],
    unstyled: ['Root', 'Item', 'Content', 'Portal', 'Positioner', 'Viewport', 'Backdrop'],
  },
  'scroll-area': {
    styled: ['Root', 'Viewport', 'Scrollbar', 'Thumb', 'Corner'],
    unstyled: ['Content'],
  },
  meter: { styled: ['Root', 'Track', 'Indicator', 'Value', 'Label'], unstyled: [] },
  progress: { styled: ['Root', 'Track', 'Indicator', 'Value', 'Label'], unstyled: [] },
  avatar: { styled: ['Root', 'Image', 'Fallback'], unstyled: [] },
  separator: { styled: [], unstyled: [] },
}

/**
A part as `Namespace.Part`, or the bare component for the single one.
 */
export const qualified = (subpath: FeedbackSubpath, key: string): string =>
  `${topName(subpath)}.${key}`

/**
Every key of a subpath's export at the run's Base UI, as the table names them: `Toast.Root`, or
`Separator` for the single component.
 */
export const keysOf = (source: Source, subpath: FeedbackSubpath): string[] =>
  subpath === FEEDBACK_SINGLE_COMPONENT
    ? [topName(subpath)]
    : Object.keys(source(subpath)).map((key) => qualified(subpath, key))
