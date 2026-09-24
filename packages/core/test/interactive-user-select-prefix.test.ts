/**
 * `interactive` shipped `user-select: none` with no `-webkit-` prefix. BCD: Safari reads it
 * unprefixed only in preview builds, and every released Safari plus every iOS browser (which
 * all embed WebKit, regardless of the label on the tin) reads only `-webkit-user-select`. A
 * consumer whose pipeline does not run a prefixer (a direct `dist/atomic.css` link, or a
 * prefixer ordered before `navePlugin()`) ships an atom that never suppresses selection on
 * those engines.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'

const ATOMIC_CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/atomic.css')
const atomicCss = readFileSync(ATOMIC_CSS, 'utf8')

describe('interactive user-select prefixing', () => {
  it('declares both the -webkit- prefixed and unprefixed user-select in the atom map, so both emitters ship the prefix for free', () => {
    expect(atoms.interactive.declarations['-webkit-user-select']).toBe('none')
    expect(atoms.interactive.declarations['user-select']).toBe('none')
  })

  it('the built atomic.css ships the prefix alongside the standard property, not the standard property alone', () => {
    const start = atomicCss.indexOf('.nave-interactive')
    const block = atomicCss.slice(start, atomicCss.indexOf('\n\n  .nave-', start))
    expect(block).toMatch(/-webkit-user-select:\s*none/)
    expect(block).toMatch(/(?<!-webkit-)user-select:\s*none/)
  })
})
