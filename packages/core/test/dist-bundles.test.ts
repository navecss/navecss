/**
 * Traceability: C12 (tsup triple-bundles atoms.ts into atoms.js, cx.js and
 * postcss.js). The atom declaration data must exist once in dist/, with cx.js
 * and postcss.js referencing it rather than carrying their own copy.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const read = (file: string): string => readFileSync(path.join(DIST, file), 'utf8')

/** A declaration string that only ever appears in the atoms source of truth. */
const ATOM_DECLARATION_MARKER = 'container-type'

describe('C12 — the atoms object is bundled once, not three times', () => {
  it('keeps the declaration data out of cx.js', () => {
    expect(read('cx.js')).not.toContain(ATOM_DECLARATION_MARKER)
  })

  it('keeps the declaration data out of postcss.js', () => {
    expect(read('postcss.js')).not.toContain(ATOM_DECLARATION_MARKER)
  })

  it('still exposes working entry points', () => {
    expect(read('cx.js')).toContain('cx')
    expect(read('postcss.js')).toContain('postcssPlugin')
  })
})
