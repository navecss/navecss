/**
 * "The v1 subpaths" of the spec's conventions: the 22 components the first release lists, plus the
 * Slider because its signature is given. Each is also a subpath of `@base-ui/react`.
 */
export const SUBPATHS = [
  'dialog',
  'popover',
  'menu',
  'select',
  'tooltip',
  'accordion',
  'collapsible',
  'tabs',
  'button',
  'input',
  'number-field',
  'field',
  'fieldset',
  'form',
  'checkbox',
  'checkbox-group',
  'radio',
  'radio-group',
  'switch',
  'slider',
  'toggle',
  'toggle-group',
  'toolbar',
] as const

export type Subpath = (typeof SUBPATHS)[number]

/**
The one runtime export of a subpath: `dialog` exports `Dialog`, `number-field` exports `NumberField`.
 */
export const topName = (subpath: string): string =>
  subpath
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join('')

/**
The subpaths whose export is a single component rather than a namespace of parts.
 */
export const SINGLE_COMPONENT: ReadonlySet<string> = new Set([
  'button',
  'checkbox-group',
  'form',
  'input',
  'radio-group',
  'toggle',
  'toggle-group',
])
