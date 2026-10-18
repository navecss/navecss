import { describe, expect, it } from 'vitest'

import { importDist, manifest, readDist } from './support/dist.ts'
import {
  FEEDBACK_KEYS,
  FEEDBACK_SINGLE_COMPONENT,
  FEEDBACK_SUBPATHS,
  FEEDBACK_TOP,
} from './support/feedback-subpaths.ts'
import { isLeftOut } from './support/left-out.ts'
import {
  COMPLETION_SUBPATHS,
  FIRST_RELEASE_SUBPATHS,
  SINGLE_COMPONENT,
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
      ...baseKeys
        .filter((key) => !naveKeys.includes(key) && !isLeftOut(`${top}.${key}`))
        .map((key) => `${top}.${key} is missing`),
      ...naveKeys.filter((key) => !baseKeys.includes(key)).map((key) => `${top}.${key} is extra`),
      ...naveKeys
        .filter((key) => isLeftOut(`${top}.${key}`))
        .map((key) => `${top}.${key} is left out and still carried`),
    )
  }
  return differences
}

const HOOKS_AND_FACTORIES: Readonly<Record<string, readonly string[]>> = {
  autocomplete: ['useFilter', 'useFilteredItems'],
  'alert-dialog': ['createHandle', 'Handle'],
  combobox: ['useFilter', 'useFilteredItems'],
  'preview-card': ['createHandle', 'Handle'],
}

const loadBase = (subpath: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ `@base-ui/react/${subpath}`) as Promise<Record<string, unknown>>

// The subpaths before the seven, listed as the earlier criteria list them: the package's own list
// grows with the seven and is not what the earlier expectation reads.
const EARLIER_SUBPATHS: readonly string[] = [...FIRST_RELEASE_SUBPATHS, ...COMPLETION_SUBPATHS]

describe('AC-base-ui-feedback-navigation-01 (supersedes AC-base-ui-overlay-completion-01 and AC-base-ui-bridge-01 for the combined package): the export map mirrors Base UI, and each subpath exports what Base UI does', () => {
  it('has exactly the package root, the stylesheet, the manifest, the 23 first-release subpaths, the six and the seven', () => {
    expect(FIRST_RELEASE_SUBPATHS).toHaveLength(23)
    expect(COMPLETION_SUBPATHS).toHaveLength(6)
    expect(FEEDBACK_SUBPATHS).toHaveLength(7)
    // 36 component subpaths, plus `.`, `./styles.css` and `./package.json`.
    expect(EARLIER_SUBPATHS.length + FEEDBACK_SUBPATHS.length).toBe(36)
    const keys = Object.keys(manifest().exports)
    expect(keys).toHaveLength(39)
    expect(keys.toSorted(byCodeUnit)).toEqual(
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
        './toast',
        './navigation-menu',
        './scroll-area',
        './meter',
        './progress',
        './avatar',
        './separator',
      ].toSorted(byCodeUnit),
    )
  })

  it.each([...COMPLETION_SUBPATHS, ...FEEDBACK_SUBPATHS])(
    '%s: the export entry resolves the types, the module and the default to the built subpath',
    (subpath) => {
      expect(manifest().exports[`./${subpath}`]).toEqual({
        types: `./dist/${subpath}/index.d.ts`,
        import: `./dist/${subpath}/index.js`,
        default: `./dist/${subpath}/index.js`,
      })
    },
  )

  for (const subpath of [...EARLIER_SUBPATHS, ...FEEDBACK_SUBPATHS]) {
    it(`${subpath}: the runtime exports equal those of @base-ui/react/${subpath}`, async () => {
      const nave = await importDist(`${subpath}/index.js`)
      const base = await loadBase(subpath)
      expect(exportDifferences(subpath, nave, base)).toEqual([])
    })
  }

  it.each(FEEDBACK_SUBPATHS)(
    '%s: the one runtime export is the component, built to a module and a declaration file',
    async (subpath) => {
      const nave = await importDist(`${subpath}/index.js`)
      expect(Object.keys(nave)).toEqual([FEEDBACK_TOP[subpath]])
      expect(readDist(`${subpath}/index.d.ts`).length).toBeGreaterThan(0)
    },
  )

  it.each(Object.entries(FEEDBACK_KEYS))(
    '%s: the namespace has the keys the spec measured, and they are the keys of Base UI',
    async (subpath, keys) => {
      const top = FEEDBACK_TOP[subpath] ?? ''
      const [naveModule, baseModule] = [
        await importDist(`${subpath}/index.js`),
        await loadBase(subpath),
      ]
      const [nave, base] = [
        naveModule[top] as Record<string, unknown>,
        baseModule[top] as Record<string, unknown>,
      ]
      expect(Object.keys(nave).toSorted(byCodeUnit)).toEqual([...keys].toSorted(byCodeUnit))
      expect(Object.keys(base).toSorted(byCodeUnit)).toEqual([...keys].toSorted(byCodeUnit))
    },
  )

  it('toast: createToastManager and useToastManager are functions, and createToastManager() returns an object with an add method', async () => {
    const module = await importDist('toast/index.js')
    const Toast = module.Toast as Record<string, unknown>
    expect(typeof Toast.createToastManager).toBe('function')
    expect(typeof Toast.useToastManager).toBe('function')
    const manager = (Toast.createToastManager as () => Record<string, unknown>)()
    expect(typeof manager).toBe('object')
    expect(typeof manager.add).toBe('function')
  })

  it('separator: Separator is a single component, not a namespace', async () => {
    const nave = await importDist('separator/index.js')
    const base = await loadBase('separator')
    expect(FEEDBACK_SINGLE_COMPONENT).toBe('separator')
    expect(SINGLE_COMPONENT.has('menubar')).toBe(true)
    expect(Object.keys(nave)).toEqual(['Separator'])
    expect(Reflect.has(nave.Separator as object, '$$typeof')).toBe(true)
    expect(Reflect.has(base.Separator as object, '$$typeof')).toBe(true)
    expect(typeof nave.Separator).toBe(typeof base.Separator)
    // The forward-ref object Base UI exports and the one this package exports have the same own keys.
    expect(Object.keys(nave.Separator as object)).toEqual(Object.keys(base.Separator as object))
  })

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

  it('the package root re-exports exactly the first-release components, the six and the seven', async () => {
    const root = await importDist('index.js')
    expect(Object.keys(root).toSorted(byCodeUnit)).toEqual(
      [...EARLIER_SUBPATHS, ...FEEDBACK_SUBPATHS]
        .map((subpath) => topName(subpath))
        .toSorted(byCodeUnit),
    )
    expect(Object.keys(root)).toHaveLength(36)
    for (const subpath of FEEDBACK_SUBPATHS) {
      const top = FEEDBACK_TOP[subpath] ?? ''
      const module = await importDist(`${subpath}/index.js`)
      expect(root[top], `${top} is exported from the package root`).toBe(module[top])
    }
  })

  it('control: a pass-through deleted from the built module reds the check, naming it', async () => {
    const nave = await importDist('menu/index.js')
    const base = (await import('@base-ui/react/menu')) as Record<string, unknown>
    const { SubmenuRoot: _removed, ...rest } = nave.Menu as Record<string, unknown>
    expect(exportDifferences('menu', { Menu: rest }, base)).toContain('Menu.SubmenuRoot is missing')
  })

  it('control: useToastManager deleted from the built Toast namespace reds the check, naming it', async () => {
    const nave = await importDist('toast/index.js')
    const base = await loadBase('toast')
    expect(exportDifferences('toast', nave, base)).toEqual([])
    const { useToastManager: _removed, ...rest } = nave.Toast as Record<string, unknown>
    expect(exportDifferences('toast', { Toast: rest }, base)).toContain(
      'Toast.useToastManager is missing',
    )
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

  it('combobox: createItems is the one member left out, and it is a key of Base UI at the installed version', async () => {
    const nave = await importDist('combobox/index.js')
    const base = await loadBase('combobox')
    expect(Object.keys(base.Combobox as object)).toContain('createItems')
    expect(Object.keys(nave.Combobox as object)).not.toContain('createItems')
  })

  it('control: createItems added to the built Combobox namespace (a dynamic re-export) reds the check, naming it', async () => {
    const nave = await importDist('combobox/index.js')
    const base = await loadBase('combobox')
    const added = {
      ...(nave.Combobox as Record<string, unknown>),
      createItems: Reflect.get(base.Combobox as object, 'createItems') as unknown,
    }
    expect(exportDifferences('combobox', { Combobox: added }, base)).toContain(
      'Combobox.createItems is left out and still carried',
    )
  })
})

describe('AC-base-ui-bridge-06: Slider ships exactly when its signature does (signed)', () => {
  it('exports ./slider', () => {
    expect(Object.keys(manifest().exports)).toContain('./slider')
  })
})
