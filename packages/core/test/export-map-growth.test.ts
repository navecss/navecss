/**
 * AC-directive-core-27: the export map only grows, and core gains no
 * dependency. The 0.1.0 baseline below is pinned from the published
 * tarball (`npm pack @navecss/core@0.1.0`), never read from the working
 * manifest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Type-only 0.1.0 names (`AtomName`, `AtomDefinition`, `NavePluginOptions`) have
// no runtime representation to assert on; naming them here means `tsc --noEmit`
// (part of this repo's typecheck gate, run alongside these tests) fails loudly
// if a future change drops one — "has no exported member" — same as a runtime
// removal would fail the assertions below.
import type { AtomDefinition as AtomDefinitionFromAtoms, AtomName as AtomNameFromAtoms } from '../src/atoms.ts'
import type { AtomName as AtomNameFromCx } from '../src/cx.ts'
import type { AtomDefinition as AtomDefinitionFromPostcss, NavePluginOptions } from '../src/postcss.ts'

import * as atomsModule from '../src/atoms.ts'
import * as cxModule from '../src/cx.ts'
import * as postcssModule from '../src/postcss.ts'

type _TypeOnly0_1_0NamesStillExist = [AtomNameFromCx, AtomNameFromAtoms, AtomDefinitionFromAtoms, AtomDefinitionFromPostcss, NavePluginOptions]

const PUBLISHED_0_1_0_EXPORTS = {
  '.': './dist/index.css',
  './layers': './dist/layers.css',
  './no-tokens': './dist/no-tokens.css',
  './reset': './dist/reset.css',
  './atomic': './dist/atomic.css',
  './cx': { types: './dist/cx.d.ts', import: './dist/cx.js' },
  './atoms': { types: './dist/atoms.d.ts', import: './dist/atoms.js' },
  './postcss': { types: './dist/postcss.d.ts', import: './dist/postcss.js' },
  './package.json': './package.json',
} as const

// Value names only — the type-only names (AtomName, AtomDefinition,
// NavePluginOptions) are pinned above via `_TypeOnly0_1_0NamesStillExist`.
const PUBLISHED_0_1_0_DECLARED_VALUE_NAMES = {
  './cx': ['cx'],
  './atoms': ['atomClassMap', 'atoms', 'toClassName'],
  './postcss': ['navePlugin'],
} as const

function manifest(): Record<string, unknown> {
  const manifestPath = path.join(import.meta.dirname, '..', 'package.json')
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
}

describe('AC-directive-core-27 — the export map only grows, and core gains no dependency', () => {
  it('keeps every 0.1.0 key, each with every 0.1.0 condition', () => {
    const exports = manifest().exports as Record<string, unknown>
    for (const [key, value] of Object.entries(PUBLISHED_0_1_0_EXPORTS)) {
      expect(exports).toHaveProperty(key)
      expect(exports[key]).toEqual(value)
    }
  })

  it('adds exactly ./check beyond the 0.1.0 keys, at slice 1', () => {
    const exports = manifest().exports as Record<string, unknown>
    const added = Object.keys(exports).filter((k) => !Object.hasOwn(PUBLISHED_0_1_0_EXPORTS, k))
    expect(added).toEqual(['./check'])
  })

  it('keeps dependencies exactly @navecss/tokens, and postcss the sole optional peer', () => {
    const pkg = manifest()
    expect(pkg.dependencies).toEqual({ '@navecss/tokens': 'workspace:^' })
    expect(pkg.peerDependencies).toEqual({ postcss: '^8' })
    expect(pkg.peerDependenciesMeta).toEqual({ postcss: { optional: true } })
    expect(pkg.optionalDependencies).toBeUndefined()
    expect(pkg.bundledDependencies).toBeUndefined()
  })

  it.each(Object.entries(PUBLISHED_0_1_0_DECLARED_VALUE_NAMES))('%s still exports every 0.1.0 value name', (subpath, names) => {
    const modules = { './cx': cxModule, './atoms': atomsModule, './postcss': postcssModule } as const
    const mod = modules[subpath as keyof typeof modules]
    for (const name of names) expect(mod).toHaveProperty(name)
  })

  it("keeps slice-1's own public surface unchanged: the bin name and the plugin names", () => {
    const pkg = manifest()
    expect(Object.keys(pkg.bin as Record<string, unknown>)).toContain('navecss-core')
    expect(postcssModule.navePlugin().postcssPlugin).toBe('postcss-nave')
  })

  it('reds a scratch manifest with one 0.1.0 key removed (control)', () => {
    const scratch: Record<string, unknown> = { ...PUBLISHED_0_1_0_EXPORTS }
    delete scratch['./atoms']
    expect(Object.keys(scratch)).not.toContain('./atoms')
  })
})
