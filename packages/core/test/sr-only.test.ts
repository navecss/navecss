/**
 * srOnly modernization + srOnlyFocusable variant.
 *
 * 1. The deprecated `clip: rect(...)` must not reappear — `clip-path: inset(50%)`
 *    is the Baseline 2024 replacement and, unlike `clip`, keeps working if a
 *    consumer overrides `position`.
 * 2. `srOnlyFocusable` must exist and reveal on both :focus-visible (the
 *    hidden element IS the focusable, e.g. a skip link) and :focus-within
 *    (the hidden element WRAPS the focusable).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'

const ATOMIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/atomic.css')
const css = readFileSync(ATOMIC, 'utf8')

describe('srOnly', () => {
  it('never emits the deprecated clip() property', () => {
    expect(css).not.toContain('clip:')
    expect(css).toContain('clip-path: inset(50%)')
  })

  it('srOnly and srOnlyFocusable share the same hidden declarations', () => {
    expect(atoms.srOnly.declarations).toEqual(atoms.srOnlyFocusable.declarations)
  })

  it('srOnlyFocusable reveals on :focus-visible and :focus-within, identically', () => {
    const pseudos = atoms.srOnlyFocusable.pseudos
    expect(pseudos).toBeDefined()
    expect(pseudos![':focus-visible']).toBeDefined()
    expect(pseudos![':focus-within']).toBeDefined()
    expect(pseudos![':focus-visible']).toEqual(pseudos![':focus-within'])
    // The revealed state must actually be visible again.
    expect(pseudos![':focus-visible']!.position).toBe('static')
    expect(pseudos![':focus-visible']!.overflow).toBe('visible')
  })

  it('generated atomic.css nests both revealing pseudos under .nave-sr-only-focusable', () => {
    const block = css.slice(css.indexOf('.nave-sr-only-focusable'), css.indexOf('.nave-no-wrap'))
    expect(block).toContain('&:focus-visible')
    expect(block).toContain('&:focus-within')
  })
})
