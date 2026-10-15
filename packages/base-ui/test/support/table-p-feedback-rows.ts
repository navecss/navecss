/**
 * Table P's rows for the seven feedback and navigation components that no earlier row names: the
 * Toast, the Navigation Menu, the Scroll Area, the value bars and the Avatar. Their other parts
 * (the Button family's, the arrows, the labels) are listed in the rows they share.
 */
import type { Row } from './table-p-rows.ts'

import { always, row, signedWith } from './table-p-rows.ts'

export const feedbackRows: readonly Row[] = [
  // Toast: the viewport is placed and stacked only with `toast-placement`, the card fades with
  // `toast-fade` and hides its limited toasts with `toast-limit`.
  row(
    ['Toast.Viewport'],
    always('toast-viewport'),
    signedWith('toast-placement', 'toast-placement'),
  ),
  row(
    ['Toast.Root'],
    always('toast-root'),
    signedWith('toast-fade', 'toast-fade'),
    signedWith('toast-limit', 'toast-limit'),
  ),
  row(['Toast.Title'], always('title')),
  row(['Toast.Description'], always('description')),
  // Navigation Menu: the trigger is its own atom, the popup is the popover's with a fade-in.
  row(['NavigationMenu.List'], always('navigation-menu-list')),
  row(['NavigationMenu.Trigger'], always('navigation-menu-trigger')),
  row(['NavigationMenu.Icon'], always('navigation-menu-icon')),
  row(
    ['NavigationMenu.Popup'],
    always('popover-popup'),
    signedWith('navigation-menu-fade', 'navigation-menu-fade'),
  ),
  // Scroll Area.
  row(['ScrollArea.Root'], always('scroll-area')),
  row(['ScrollArea.Viewport'], always('scroll-area-viewport')),
  row(['ScrollArea.Scrollbar'], always('scroll-area-scrollbar')),
  row(['ScrollArea.Thumb'], always('scroll-area-thumb')),
  row(['ScrollArea.Corner'], always('scroll-area-corner')),
  // Meter and Progress share one value bar.
  row(['Meter.Root', 'Progress.Root'], always('value-bar')),
  row(['Meter.Track', 'Progress.Track'], always('value-bar-track')),
  row(['Meter.Indicator', 'Progress.Indicator'], always('value-bar-indicator')),
  // Avatar.
  row(['Avatar.Root'], always('avatar')),
  row(['Avatar.Image'], always('avatar-image')),
  row(['Avatar.Fallback'], always('avatar-fallback')),
]
