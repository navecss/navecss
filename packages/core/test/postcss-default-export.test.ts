/**
 * AC-directive-core-28: host-loaded entry points also carry a default
 * export (R22) — `./postcss` is the one that exists at slice 1.
 */
import { describe, expect, it } from 'vitest'

import postcssModule, { navePlugin } from '../src/postcss.ts'

describe('AC-directive-core-28 — ./postcss also carries a default export', () => {
  it('is the same function object as the named navePlugin', () => {
    expect(postcssModule).toBe(navePlugin)
  })

  it('still carries navePlugin.postcss', () => {
    expect(postcssModule.postcss).toBe(true)
  })
})
