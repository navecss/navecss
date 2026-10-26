/**
 * AC-secondary-action-states-01, the browser clause: at the default tint the engine computes the
 * values `action.secondary`'s two state fills are specified to have, from the built tokens alone.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { tokens, useSheets } from './support/page.ts'
import { colorOf, type Scheme, SCHEMES, useScheme } from './support/w7-css.ts'

/**
The two state fills' values at the default tint, as the engine serialises them.
 */
const AT_DEFAULT_TINT: Readonly<Record<string, Readonly<Record<Scheme, string>>>> = {
  '--nave-color-action-secondary-hover': {
    dark: 'oklch(0.37 0.0067 186.17)',
    light: 'oklch(0.94 0.0067 186.17)',
  },
  '--nave-color-action-secondary-active': {
    dark: 'oklch(0.225 0.0067 186.17)',
    light: 'oklch(0.905 0.0067 186.17)',
  },
}

describe("action.secondary's state fills", () => {
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens)
  })

  afterEach(() => {
    removeScheme?.()
    removeSheets?.()
  })

  describe.each(SCHEMES)('in %s', (scheme) => {
    it.each(Object.entries(AT_DEFAULT_TINT))(
      'AC-secondary-action-states-01: %s computes its value at the default tint',
      (name, values) => {
        removeScheme = useScheme(scheme)
        expect(colorOf(`var(${name})`)).toBe(values[scheme])
      },
    )
  })
})
