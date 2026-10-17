/**
 * Where the browser criteria find the copies and the apps the global setup wrote, and the shapes it
 * hands them. Pure strings and types: the setup runs in Node and the tests in the page, so nothing
 * here may import either side's APIs.
 */

/**
The folder, under the package, that holds everything the setup generates for the browser suite
(gitignored, regenerated every run).
 */
export const FIXTURES_FOLDER = 'test/browser/fixtures'

/**
The URL prefix the dev server serves the copies from: the folder, relative to the package root.
 */
export const COPIES_URL = `/${FIXTURES_FOLDER}/registry-copies`

/**
The URL prefix the page reads the built apps from (the suite's middleware serves the fixtures
folder as it is on disk).
 */
export const APPS_URL = '/__fixtures__'

/**
The variants of the Dialog copy the controls need, by the folder they are written to.
 */
export const VARIANTS = {
  editedButton: 'base-ui-dialog--edited-button',
  editedPopup: 'base-ui-dialog--edited-popup',
  noOrderStatement: 'base-ui-dialog--no-order-statement',
} as const

export type VariantName = keyof typeof VARIANTS

export interface AttributeState {
  readonly name: string
  readonly value: string
}

/**
One styled part of the roster, with what the paint comparison needs to know about its atoms.
 */
export interface PaintPart {
  readonly atoms: readonly string[]
  /**
  Whether one of its atoms carries the focus ring.
   */
  readonly isFocusable: boolean
  /**
  Whether one of its atoms carries a reduced-motion block in the package stylesheet.
   */
  readonly isGuarded: boolean
  /**
  The marker the scene gives the part (`Dialog.Popup`).
   */
  readonly key: string
  /**
  The pseudo-elements its atoms style (`::before`).
   */
  readonly pseudoElements: readonly string[]
  /**
  The states its atoms' rules select by attribute, each one set of attributes.
   */
  readonly states: readonly (readonly AttributeState[])[]
}

export interface PaintSubpath {
  /**
  The folder of the written copy, absent when the registry has no item for the subpath.
   */
  readonly copyFolder: string | undefined
  readonly parts: readonly PaintPart[]
  readonly subpath: string
}

/**
What the setup hands the paint and layer criteria. `error` is set when anything the criteria stand
on could not be made: every test then fails with it.
 */
export interface RegistryCopies {
  readonly error: string | undefined
  /**
  The styled subpaths, each with its parts and the folder of its written copy.
   */
  readonly paint: readonly PaintSubpath[]
}

export interface BuiltApp {
  /**
  The names of the built stylesheet files, under the app's URL.
   */
  readonly cssFiles: readonly string[]
  readonly exitCode: number | null
  readonly output: string
  readonly url: string
}

/**
What the setup hands the build criterion: the consumer app built with the Dialog copy beside the
package, and the same build with the copy's reduced-motion blocks removed from its module.
 */
export interface RegistryApps {
  readonly error: string | undefined
  readonly guardRemoved: BuiltApp | undefined
  /**
  The seven layer names, in Nave's order, read from the first statement of the built stylesheet.
   */
  readonly layerNames: readonly string[]
  /**
  The Dialog copy's module as served, to read what the build must have kept.
   */
  readonly moduleCss: string
  readonly normal: BuiltApp | undefined
}
