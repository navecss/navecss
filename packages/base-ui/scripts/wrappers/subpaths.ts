/**
 * "The first release's subpaths": the 22 components it lists, plus the Slider because its signature is
 * given. Each is also a subpath of `@base-ui/react`.
 */
export const FIRST_RELEASE_SUBPATHS = [
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

/**
The six components the overlay completion adds.
 */
export const COMPLETION_SUBPATHS = [
  'alert-dialog',
  'context-menu',
  'menubar',
  'preview-card',
  'combobox',
  'autocomplete',
] as const

/**
The seven components the feedback and navigation release adds.
 */
const FEEDBACK_SUBPATHS = [
  'toast',
  'navigation-menu',
  'scroll-area',
  'meter',
  'progress',
  'avatar',
  'separator',
] as const

/**
Every subpath the package ships.
 */
export const SUBPATHS = [
  ...FIRST_RELEASE_SUBPATHS,
  ...COMPLETION_SUBPATHS,
  ...FEEDBACK_SUBPATHS,
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
  'menubar',
  'radio-group',
  'separator',
  'toggle',
  'toggle-group',
])
