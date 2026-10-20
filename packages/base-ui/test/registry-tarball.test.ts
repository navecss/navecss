import { beforeAll, describe, expect, it } from 'vitest'

import { loadRegistry } from './support/registry/load.ts'
import {
  exportsProblems,
  missingFromTarball,
  packedEntries,
  REGISTRY_PREFIX,
  registryExportProblems,
  rosterExports,
} from './support/registry/struct-tarball.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'

describe('AC-base-ui-registry-02: the tarball carries the registry inside dist, and nothing else about the package moves', () => {
  let entries: string[] = []

  beforeAll(() => {
    entries = packedEntries()
  }, 120_000)

  it('keeps files in package.json exactly ["dist"]', () => {
    expect(manifestOf().files).toEqual(['dist'])
  })

  it('lists every file of the registry under package/dist/registry/', () => {
    const { fileNames } = loadRegistry()
    expect(fileNames.length).toBeGreaterThan(1)
    expect(entries.filter((entry) => entry.startsWith(REGISTRY_PREFIX)).length).toBeGreaterThan(1)
    expect(missingFromTarball(entries, fileNames)).toEqual([])
  })

  it('control: a registry file left out of the listing is reported by name, and a listing without a registry reports every file', () => {
    const { fileNames } = loadRegistry()
    const without = entries.filter((entry) => entry !== `${REGISTRY_PREFIX}base-ui-dialog.json`)
    expect(missingFromTarball(without, fileNames)).toEqual([
      `${REGISTRY_PREFIX}base-ui-dialog.json`,
    ])
    const none = entries.filter((entry) => !entry.startsWith(REGISTRY_PREFIX))
    expect(missingFromTarball(none, fileNames)).toHaveLength(fileNames.length)
  })

  it('keeps exports as the roster of subpaths gives it, key for key and value for value', () => {
    expect(exportsProblems(manifestOf().exports, rosterExports())).toEqual([])
  })

  it('names registry in no key or value of exports, over a non-empty exports map', () => {
    const { exports } = manifestOf()
    expect(Object.keys(exports).length).toBeGreaterThan(0)
    expect(registryExportProblems(exports)).toEqual([])
  })

  it('control: a registry key, a registry value and a nested registry value in exports are each reported', () => {
    const real = manifestOf().exports
    expect(registryExportProblems({ ...real, './registry': './dist/other.json' })).toEqual([
      'exports names registry: ./registry',
    ])
    expect(registryExportProblems({ ...real, './dialog-item': './dist/registry/x.json' })).toEqual([
      'exports names registry: ./dist/registry/x.json',
    ])
    expect(
      registryExportProblems({
        ...real,
        './item': { import: './dist/registry/base-ui-dialog.json' },
      }),
    ).toEqual(['exports names registry: ./dist/registry/base-ui-dialog.json'])
  })

  it('control: an added key, a lost key and a changed value in exports are each reported', () => {
    const real = manifestOf().exports
    expect(
      exportsProblems({ ...real, './registry': './dist/registry/registry.json' }, rosterExports()),
    ).toEqual(['exports gained ./registry'])
    const { './dialog': _lost, ...lacking } = real
    expect(exportsProblems(lacking, rosterExports())).toEqual(['exports lost ./dialog'])
    expect(
      exportsProblems({ ...real, './styles.css': './dist/other.css' }, rosterExports()),
    ).toEqual(['exports changed ./styles.css'])
    expect(
      exportsProblems(
        {
          ...real,
          './dialog': { types: './dist/dialog/index.d.ts', import: './dist/dialog/index.js' },
        },
        rosterExports(),
      ),
    ).toEqual(['exports changed ./dialog'])
  })
})
