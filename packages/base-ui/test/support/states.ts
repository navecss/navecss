/**
 * The props that put each overlay's scene in its open state, keyed by marker, for a scene config.
 */
import type { Props } from './scenes.ts'

import { topName } from './subpaths.ts'

export const OVERLAYS = [
  'Dialog',
  'Popover',
  'Menu',
  'Select',
  'Tooltip',
  'AlertDialog',
  'ContextMenu',
  'PreviewCard',
  'Combobox',
  'Autocomplete',
] as const

export const openProps = (): Record<string, Props> =>
  Object.fromEntries(OVERLAYS.map((name) => [`${name}.Root`, { open: true }]))

/**
The overlay a subpath's scene is, or false for a scene with nothing to open. The Menubar's scene
opens through its Menu roots, which `openProps` opens.
 */
export const isOverlay = (subpath: string): boolean =>
  subpath === 'menubar' || (OVERLAYS as readonly string[]).includes(topName(subpath))

/**
The props that put the Navigation Menu's scene in its open state: the item the scene names `a` is
open. The component has no `open` prop of its own, so `openProps` does not reach it.
 */
export const navigationMenuOpenProps = (): Record<string, Props> => ({
  'NavigationMenu.Root': { defaultValue: 'a' },
})
