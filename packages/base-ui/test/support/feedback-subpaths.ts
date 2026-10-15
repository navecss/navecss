/**
 * The seven subpaths the feedback and navigation spec adds, written out here and not read from the
 * package's own subpath list: a test that took its expectation from the module the subject reads
 * would agree with the subject whatever it did. The key sets are the spec's measured ones (Base UI
 * 1.3.0, 1.5.0, 1.6.0 and 1.8.0 agree), sorted by code unit.
 */

/**
Subpath to the one runtime export the subpath has (`navigation-menu` exports `NavigationMenu`).
 */
export const FEEDBACK_TOP: Readonly<Record<string, string>> = {
  avatar: 'Avatar',
  meter: 'Meter',
  'navigation-menu': 'NavigationMenu',
  progress: 'Progress',
  'scroll-area': 'ScrollArea',
  separator: 'Separator',
  toast: 'Toast',
}

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
The one subpath of the seven whose export is a single component and not a namespace of parts.
 */
export const FEEDBACK_SINGLE_COMPONENT: FeedbackSubpath = 'separator'

/**
The keys of each namespace of the seven, as the spec measured them (Toast 13, Navigation Menu 13,
Scroll Area 6, Meter 5, Progress 5, Avatar 3). `Progress.Status` is type-only and is not a key.
 */
export const FEEDBACK_KEYS: Readonly<
  Record<Exclude<FeedbackSubpath, 'separator'>, readonly string[]>
> = {
  avatar: ['Fallback', 'Image', 'Root'],
  meter: ['Indicator', 'Label', 'Root', 'Track', 'Value'],
  'navigation-menu': [
    'Arrow',
    'Backdrop',
    'Content',
    'Icon',
    'Item',
    'Link',
    'List',
    'Popup',
    'Portal',
    'Positioner',
    'Root',
    'Trigger',
    'Viewport',
  ],
  progress: ['Indicator', 'Label', 'Root', 'Track', 'Value'],
  'scroll-area': ['Content', 'Corner', 'Root', 'Scrollbar', 'Thumb', 'Viewport'],
  toast: [
    'Action',
    'Arrow',
    'Close',
    'Content',
    'Description',
    'Portal',
    'Positioner',
    'Provider',
    'Root',
    'Title',
    'Viewport',
    'createToastManager',
    'useToastManager',
  ],
}

/**
Table P's rows for the seven (the spec's Table P delta, for the signature state in which every
draft is signed): the wrapped parts and the classes each takes, by `<Namespace>.<Part>`. A part not
here is a pass-through (Table T0). `Separator` is the component itself.
 */
export const FEEDBACK_TABLE_P: Readonly<Record<string, readonly string[]>> = {
  'Avatar.Fallback': ['avatar-fallback'],
  'Avatar.Image': ['avatar-image'],
  'Avatar.Root': ['avatar'],
  'Meter.Indicator': ['value-bar-indicator'],
  'Meter.Label': ['label'],
  'Meter.Root': ['value-bar'],
  'Meter.Track': ['value-bar-track'],
  'Meter.Value': ['slider-value'],
  'NavigationMenu.Arrow': ['arrow', 'arrow-inline'],
  'NavigationMenu.Icon': ['navigation-menu-icon'],
  'NavigationMenu.Link': ['toolbar-link', 'current-link'],
  'NavigationMenu.List': ['navigation-menu-list'],
  'NavigationMenu.Popup': ['popover-popup', 'navigation-menu-fade'],
  'NavigationMenu.Trigger': ['navigation-menu-trigger'],
  'Progress.Indicator': ['value-bar-indicator'],
  'Progress.Label': ['label'],
  'Progress.Root': ['value-bar'],
  'Progress.Track': ['value-bar-track'],
  'Progress.Value': ['slider-value'],
  'ScrollArea.Corner': ['scroll-area-corner'],
  'ScrollArea.Root': ['scroll-area'],
  'ScrollArea.Scrollbar': ['scroll-area-scrollbar'],
  'ScrollArea.Thumb': ['scroll-area-thumb'],
  'ScrollArea.Viewport': ['scroll-area-viewport'],
  Separator: ['toolbar-separator'],
  'Toast.Action': ['button'],
  'Toast.Arrow': ['arrow', 'arrow-inline'],
  'Toast.Close': ['button'],
  'Toast.Description': ['description'],
  'Toast.Root': ['toast-root', 'toast-fade', 'toast-limit'],
  'Toast.Title': ['title'],
  'Toast.Viewport': ['toast-viewport', 'toast-placement'],
}

/**
The Base UI parts of the seven that stay Base UI's own (Table T0), by `<Namespace>.<Part>`. The
two Toast functions are not parts that render and are listed with them.
 */
export const FEEDBACK_PASS_THROUGHS: readonly string[] = [
  'NavigationMenu.Backdrop',
  'NavigationMenu.Content',
  'NavigationMenu.Item',
  'NavigationMenu.Portal',
  'NavigationMenu.Positioner',
  'NavigationMenu.Root',
  'NavigationMenu.Viewport',
  'ScrollArea.Content',
  'Toast.Content',
  'Toast.Portal',
  'Toast.Positioner',
  'Toast.Provider',
  'Toast.createToastManager',
  'Toast.useToastManager',
]
