/**
 * Traceability: C3/C8 shape parity. build-css.ts and the @nave plugin
 * are two renderers of one atoms.ts; they must emit the same nested shape, or
 * the global-class path and the directive path drift apart.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'

const ATOMIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/atomic.css')
const css = readFileSync(ATOMIC, 'utf8')

describe('generated atomic.css', () => {
  it('parses as valid CSS', () => {
    expect(() => postcss.parse(css)).not.toThrow()
  })

  it('emits one class per atom', () => {
    for (const name of Object.keys(atoms)) {
      const className = `nave-${name.replaceAll(/([A-Z])/g, '-$1').toLowerCase()}`
      expect(css, `${name} missing`).toContain(`.${className}`)
    }
  })

  it('nests pseudo rules with & instead of concatenating selectors', () => {
    expect(css).toContain('&:focus-visible')
    expect(css).not.toContain('.nave-focus-ring:focus-visible')
  })

  it('nests media blocks inside the class and wraps declarations in &', () => {
    const block = css.slice(css.indexOf('.nave-hide-phone-only'))

    expect(block).toMatch(/@media \(width < [\d.]+em\)/)
    expect(block.slice(0, block.indexOf('}\n}'))).toContain('& {')
  })
})
