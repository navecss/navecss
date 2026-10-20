import { describe, expect, it } from 'vitest'

import type { LoadedRegistry } from './support/registry/load.ts'

import { cloneRegistry, loadRegistry } from './support/registry/load.ts'
import { itemIn, itemsOf } from './support/registry/struct-mutate.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'

/**
 * Each item whose `meta.version` is not the given version.
 */
const versionProblems = (registry: LoadedRegistry, version: string): string[] =>
  itemsOf(registry)
    .filter((item) => item.meta?.version !== version)
    .map((item) => `${item.name}: meta.version is ${String(item.meta?.version)}, not ${version}`)

describe('AC-base-ui-registry-32: every release regenerates the registry at its own version', () => {
  it("has, for every item, a meta.version equal to package.json's version, over a non-empty registry", () => {
    const { version } = manifestOf()
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
    const registry = loadRegistry()
    expect(registry.items.size).toBeGreaterThan(0)
    expect(versionProblems(registry, version)).toEqual([])
  })

  it('control: one item at another version reds the check naming the item', () => {
    const { version } = manifestOf()
    const registry = cloneRegistry(loadRegistry())
    const item = itemIn(registry, 'base-ui-dialog')
    item.meta = { ...item.meta, version: '0.0.0-stale' }
    expect(versionProblems(registry, version)).toEqual([
      `base-ui-dialog: meta.version is 0.0.0-stale, not ${version}`,
    ])
  })

  it('control: an item with no meta, or a range for the version, reds the check', () => {
    const { version } = manifestOf()
    const bare = cloneRegistry(loadRegistry())
    delete itemIn(bare, 'base-ui-dialog').meta
    expect(versionProblems(bare, version)).toEqual([
      `base-ui-dialog: meta.version is undefined, not ${version}`,
    ])
    const ranged = cloneRegistry(loadRegistry())
    const item = itemIn(ranged, 'base-ui-dialog')
    item.meta = { ...item.meta, version: `^${version}` }
    expect(versionProblems(ranged, version)).toEqual([
      `base-ui-dialog: meta.version is ^${version}, not ${version}`,
    ])
  })
})
