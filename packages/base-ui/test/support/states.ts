/**
 * The props that put each overlay's scene in its open state, keyed by marker, for a scene config.
 */
import type { Props } from './scenes.ts'

export const OVERLAYS = ['Dialog', 'Popover', 'Menu', 'Select', 'Tooltip'] as const

export const openProps = (): Record<string, Props> =>
  Object.fromEntries(OVERLAYS.map((name) => [`${name}.Root`, { open: true }]))

/**
The overlay a subpath's scene is, or undefined for a scene with nothing to open.
 */
export const isOverlay = (subpath: string): boolean =>
  (OVERLAYS as readonly string[]).includes(
    `${subpath.slice(0, 1).toUpperCase()}${subpath.slice(1)}`,
  )
