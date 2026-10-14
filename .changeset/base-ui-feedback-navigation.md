---
'@navecss/base-ui': minor
---

Seven more components: Toast, Navigation Menu, Scroll Area, Meter, Progress, Avatar and Separator.

`@navecss/base-ui/toast`, `/navigation-menu`, `/scroll-area`, `/meter`, `/progress`, `/avatar` and
`/separator` each re-export every part and every type of their Base UI subpath, with Nave's classes
on the parts the package styles. The package now wraps 36 components.

Toasts are a plain list fixed to the bottom corner of the window, above Nave's dialogs and popups,
and they fade in and out. Toasts beyond the provider's `limit`, which Base UI makes inert, are
hidden. `Toast.Action` and `Toast.Close` join the Button family. The Navigation Menu's trigger has
a quieter look of its own, its panel fades in, and the link for the current page, the one with
`aria-current="page"`, gets a thicker underline. Scroll Area paints its scrollbars as a 24px strip
and always shows them, because Base UI hides the browser's own. Meter and Progress share one bar:
an outlined track with a solid fill, and only the track for an indeterminate Progress. `Avatar.Root`
takes a `size` of `'sm'`, `'md'` or `'lg'`. `Separator` is the separator the Toolbar already uses.

The stylesheet now sets one `z-index`, on the toast area, from `--nave-layer-toast`. All the new
motion is switched off under `prefers-reduced-motion`, even when you have changed Nave's motion
tokens. The README says how to set up Toast and Navigation Menu and what to give the viewport of a
Scroll Area.
