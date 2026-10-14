import { describe, expect, it } from 'vitest'

import { importDist, manifest } from './support/dist.ts'
import {
  COMPLETION_SUBPATHS,
  FIRST_RELEASE_SUBPATHS,
  SINGLE_COMPONENT,
  SUBPATHS,
  topName,
} from './support/subpaths.ts'

const byCodeUnit = (a: string, b: string): number => a.localeCompare(b)

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
  const naveNames = new Set(Object.keys(nave))
  const baseNames = new Set(Object.keys(base))
  const differences = [
    ...baseNames
      .values()
      .filter((key) => !naveNames.has(key))
      .map((key) => `${subpath}: ${key} is missing`),
    ...naveNames
      .values()
      .filter((key) => !baseNames.has(key))
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

const HOOKS_AND_FACTORIES: Readonly<Record<string, readonly string[]>> = {
  autocomplete: ['useFilter', 'useFilteredItems'],
  'alert-dialog': ['createHandle', 'Handle'],
  combobox: ['useFilter', 'useFilteredItems', 'createItems'],
  'preview-card': ['createHandle', 'Handle'],
}

const loadBase = (subpath: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ `@base-ui/react/${subpath}`) as Promise<Record<string, unknown>>

describe('AC-base-ui-overlay-completion-01 (supersedes AC-base-ui-bridge-01): the export map mirrors Base UI, and each subpath exports what Base UI does', () => {
  it('has exactly the package root, the stylesheet, the manifest, the 23 first-release subpaths and the six', () => {
    expect(FIRST_RELEASE_SUBPATHS).toHaveLength(23)
    expect(SUBPATHS).toHaveLength(29)
    expect(Object.keys(manifest().exports).toSorted(byCodeUnit)).toEqual(
      [
        '.',
        './package.json',
        './styles.css',
        ...FIRST_RELEASE_SUBPATHS.map((subpath) => `./${subpath}`),
        './alert-dialog',
        './context-menu',
        './menubar',
        './preview-card',
        './combobox',
        './autocomplete',
      ].toSorted(byCodeUnit),
    )
  })

  it.each(COMPLETION_SUBPATHS)(
    '%s: the export entry resolves the types, the module and the default to the built subpath',
    (subpath) => {
      expect(manifest().exports[`./${subpath}`]).toEqual({
        types: `./dist/${subpath}/index.d.ts`,
        import: `./dist/${subpath}/index.js`,
        default: `./dist/${subpath}/index.js`,
      })
    },
  )

  for (const subpath of SUBPATHS) {
    it(`${subpath}: the runtime exports equal those of @base-ui/react/${subpath}`, async () => {
      const nave = await importDist(`${subpath}/index.js`)
      const base = await loadBase(subpath)
      expect(exportDifferences(subpath, nave, base)).toEqual([])
    })
  }

  // The hooks and factories of the six's namespaces, at the Base UI the devDependency installs.
  it.each(Object.entries(HOOKS_AND_FACTORIES))(
    '%s: the namespace carries the hooks and factories Base UI has',
    async (subpath, names) => {
      const naveModule = await importDist(`${subpath}/index.js`)
      const baseModule = await loadBase(subpath)
      const nave = naveModule[topName(subpath)] as Record<string, unknown>
      const base = baseModule[topName(subpath)] as Record<string, unknown>
      expect(Object.keys(base)).toEqual(expect.arrayContaining([...names]))
      expect(Object.keys(nave)).toEqual(expect.arrayContaining([...names]))
    },
  )

  it('menubar: Menubar is a single component, not a namespace', async () => {
    const nave = await importDist('menubar/index.js')
    const base = await loadBase('menubar')
    expect(SINGLE_COMPONENT.has('menubar')).toBe(true)
    expect(Object.keys(nave)).toEqual(['Menubar'])
    // A component is a React element type (the forward-ref object here), a namespace is not.
    expect(Reflect.has(nave.Menubar as object, '$$typeof')).toBe(true)
    expect(Reflect.has(base.Menubar as object, '$$typeof')).toBe(true)
    expect(typeof nave.Menubar).toBe(typeof base.Menubar)
  })

  it('the package root re-exports exactly the first-release components and the six', async () => {
    const root = await importDist('index.js')
    expect(Object.keys(root).toSorted(byCodeUnit)).toEqual(
      SUBPATHS.map((subpath) => topName(subpath)).toSorted(byCodeUnit),
    )
  })

  it('control: a pass-through deleted from the built module reds the check, naming it', async () => {
    const nave = await importDist('menu/index.js')
    const base = (await import('@base-ui/react/menu')) as Record<string, unknown>
    const { SubmenuRoot: _removed, ...rest } = nave.Menu as Record<string, unknown>
    expect(exportDifferences('menu', { Menu: rest }, base)).toContain('Menu.SubmenuRoot is missing')
  })

  it('control: useFilter deleted from the built Combobox namespace reds the check, naming it', async () => {
    const nave = await importDist('combobox/index.js')
    const base = await loadBase('combobox')
    expect(exportDifferences('combobox', nave, base)).toEqual([])
    const { useFilter: _removed, ...rest } = nave.Combobox as Record<string, unknown>
    expect(exportDifferences('combobox', { Combobox: rest }, base)).toContain(
      'Combobox.useFilter is missing',
    )
  })
})

describe('AC-base-ui-bridge-06: Slider ships exactly when its signature does (signed)', () => {
  it('exports ./slider', () => {
    expect(Object.keys(manifest().exports)).toContain('./slider')
  })
})
