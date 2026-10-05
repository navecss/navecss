import { describe, expect, it } from 'vitest'

import { importDist, manifest } from './support/dist.ts'
import { SUBPATHS, topName } from './support/subpaths.ts'

/**
 * What differs between this package's runtime exports and Base UI's for one subpath: names only in
 * one, and, for a namespace export, the names only in one of its parts.
 */
const exportDifferences = (
  subpath: string,
  nave: Record<string, unknown>,
  base: Record<string, unknown>,
): string[] => {
  const top = topName(subpath)
  const differences = [
    ...Object.keys(base)
      .filter((key) => !(key in nave))
      .map((key) => `${subpath}: ${key} is missing`),
    ...Object.keys(nave)
      .filter((key) => !(key in base))
      .map((key) => `${subpath}: ${key} is extra`),
  ]
  const naveTop = nave[top]
  const baseTop = base[top]
  if (
    typeof baseTop === 'object' &&
    baseTop !== null &&
    typeof naveTop === 'object' &&
    naveTop !== null
  ) {
    const naveKeys = Object.keys(naveTop)
    const baseKeys = Object.keys(baseTop)
    differences.push(
      ...baseKeys.filter((key) => !naveKeys.includes(key)).map((key) => `${top}.${key} is missing`),
      ...naveKeys.filter((key) => !baseKeys.includes(key)).map((key) => `${top}.${key} is extra`),
    )
  }
  return differences
}

describe('AC-base-ui-bridge-01: the export map mirrors Base UI, and each subpath exports what Base UI does', () => {
  it('has exactly the package root, the stylesheet, the manifest and the v1 subpaths', () => {
    expect(Object.keys(manifest().exports).toSorted()).toEqual(
      [
        '.',
        './package.json',
        './styles.css',
        ...SUBPATHS.map((subpath) => `./${subpath}`),
      ].toSorted(),
    )
  })

  for (const subpath of SUBPATHS) {
    it(`${subpath}: the runtime exports equal those of @base-ui/react/${subpath}`, async () => {
      const nave = await importDist(`${subpath}/index.js`)
      const base = (await import(/* @vite-ignore */ `@base-ui/react/${subpath}`)) as Record<
        string,
        unknown
      >
      expect(exportDifferences(subpath, nave, base)).toEqual([])
    })
  }

  it('control: a pass-through deleted from the built module reds the check, naming it', async () => {
    const nave = await importDist('menu/index.js')
    const base = (await import('@base-ui/react/menu')) as Record<string, unknown>
    const { SubmenuRoot: _removed, ...rest } = nave.Menu as Record<string, unknown>
    expect(exportDifferences('menu', { Menu: rest }, base)).toContain('Menu.SubmenuRoot is missing')
  })
})

describe('AC-base-ui-bridge-06: Slider ships exactly when its signature does (signed)', () => {
  it('exports ./slider', () => {
    expect(Object.keys(manifest().exports)).toContain('./slider')
  })
})
