/**
 * AC-directive-core-28: host-loaded entry points also carry a default
 * export (R22) — `./postcss` is the one that exists at slice 1.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import postcssModule, { navePlugin } from '../src/postcss.ts'
import { extractCoreImports, extractFences } from './doc-fences.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_ROOT = path.resolve(HERE, '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const DOC_PATHS = [
  path.join(REPO_ROOT, 'README.md'),
  path.join(CORE_ROOT, 'README.md'),
  path.join(CORE_ROOT, 'CONSUMER-ATOMS.md'),
]

describe('AC-directive-core-28 — ./postcss also carries a default export', () => {
  it('is the same function object as the named navePlugin', () => {
    expect(postcssModule).toBe(navePlugin)
  })

  it('still carries navePlugin.postcss', () => {
    expect(postcssModule.postcss).toBe(true)
  })

  it('no other entry source declares a default export', () => {
    const otherEntries = ['atoms.ts', 'cx.ts', 'directive/check.ts']
    for (const entry of otherEntries) {
      const text = readFileSync(path.join(CORE_ROOT, 'src', entry), 'utf8')
      expect(text, `${entry} must not gain a default export`).not.toMatch(/^export\s+default\b/m)
    }
  })

  it('every README/CONSUMER-ATOMS.md fence imports the named navePlugin, none a default (a floor)', () => {
    const fences = DOC_PATHS.flatMap((file) =>
      extractFences(path.relative(REPO_ROOT, file), readFileSync(file, 'utf8')),
    )
    const defaultPostcssImports = fences
      .flatMap((f) => extractCoreImports(f.body))
      .filter((imp) => imp.specifier === '@navecss/core/postcss')
      .flatMap((imp) => imp.names)
      .filter((name) => name.isDefault)

    expect(defaultPostcssImports).toEqual([])
  })
})
