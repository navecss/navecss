/**
 * AC-base-ui-feedback-navigation-01, the minor runs: at every minor of Base UI from the 1.3.0 floor
 * to the devDependency, each of the seven wrapper modules exports exactly what Base UI's own
 * subpath does, and each namespace has the keys of Base UI's, functions included. A floor run
 * reads 1.3.0; a current run reads the minors after it (the devDependency is the run's own, the
 * ones in between are the aliases), each on React 18 and 19.
 */
import { describe, expect, it } from 'vitest'

import { loadBaseAt, loadWrappers } from '../support/feedback-minors.ts'
import {
  FEEDBACK_KEYS,
  FEEDBACK_SUBPATHS,
  FEEDBACK_TOP,
  type FeedbackSubpath,
} from '../support/feedback-subpaths.ts'
import { isInstalled, type Minor, MINORS, runMinor } from '../support/w6-minors.ts'

const byCodeUnit = (a: string, b: string): number => a.localeCompare(b)

type Module = Record<string, unknown>

const minorsOfRun = (): readonly Minor[] =>
  runMinor().version === '1.3.0'
    ? [runMinor()]
    : MINORS.filter(({ version }) => version !== '1.3.0')

/**
What differs between a wrapper module's exports and Base UI's for one subpath: names only in one,
and, for a namespace, the keys only in one of the two.
 */
const differences = (subpath: string, nave: Module, base: Module): string[] => {
  const top = FEEDBACK_TOP[subpath] ?? ''
  const naveNames = Object.keys(nave)
  const baseNames = Object.keys(base)
  const found = [
    ...baseNames
      .filter((key) => !naveNames.includes(key))
      .map((key) => `${subpath}: ${key} is missing`),
    ...naveNames
      .filter((key) => !baseNames.includes(key))
      .map((key) => `${subpath}: ${key} is extra`),
  ]
  const [naveTop, baseTop] = [nave[top], base[top]]
  if (
    typeof naveTop === 'object' &&
    naveTop !== null &&
    typeof baseTop === 'object' &&
    baseTop !== null
  ) {
    const [naveKeys, baseKeys] = [Object.keys(naveTop), Object.keys(baseTop)]
    found.push(
      ...baseKeys.filter((key) => !naveKeys.includes(key)).map((key) => `${top}.${key} is missing`),
      ...naveKeys.filter((key) => !baseKeys.includes(key)).map((key) => `${top}.${key} is extra`),
    )
  }
  return found
}

const wrappersAt = new Map<string, Promise<Readonly<Record<string, Module>>>>()

const wrappersOver = (minor: Minor): Promise<Readonly<Record<string, Module>>> => {
  const cached = wrappersAt.get(minor.version)
  if (cached !== undefined) {
    return cached
  }
  const loaded = loadWrappers(minor.version === runMinor().version ? undefined : minor.alias)
  wrappersAt.set(minor.version, loaded)
  return loaded
}

const wrapperOf = async (minor: Minor, subpath: FeedbackSubpath): Promise<Module> => {
  const wrappers = await wrappersOver(minor)
  return wrappers[subpath] ?? {}
}

describe('AC-base-ui-feedback-navigation-01 (supersedes AC-base-ui-overlay-completion-01): the seven subpaths mirror Base UI at every minor', () => {
  for (const minor of minorsOfRun()) {
    for (const subpath of FEEDBACK_SUBPATHS) {
      it(`${subpath} at ${minor.version}: the runtime exports equal those of @base-ui/react/${subpath}`, async () => {
        const nave = await wrapperOf(minor, subpath)
        const base = await loadBaseAt(minor, runMinor().version, subpath)
        expect(Object.keys(nave)).toEqual([FEEDBACK_TOP[subpath]])
        expect(differences(subpath, nave, base)).toEqual([])
      })
    }

    it(`at ${minor.version}: every namespace has the keys the spec measured, functions included`, async () => {
      const wrappers = await wrappersOver(minor)
      for (const [subpath, keys] of Object.entries(FEEDBACK_KEYS)) {
        const top = FEEDBACK_TOP[subpath] ?? ''
        const nave = wrappers[subpath]?.[top] as Record<string, unknown>
        expect(Object.keys(nave).toSorted(byCodeUnit), `${top} at ${minor.version}`).toEqual(
          [...keys].toSorted(byCodeUnit),
        )
      }
    })

    it(`at ${minor.version}: Toast.createToastManager and Toast.useToastManager are functions, and createToastManager() returns an object with an add method`, async () => {
      const module = await wrapperOf(minor, 'toast')
      const Toast = module.Toast as Record<string, unknown>
      expect(typeof Toast.createToastManager).toBe('function')
      expect(typeof Toast.useToastManager).toBe('function')
      const manager = (Toast.createToastManager as () => Record<string, unknown>)()
      expect(typeof manager).toBe('object')
      expect(typeof manager.add).toBe('function')
    })

    it(`at ${minor.version}: Separator is a single component, not a namespace`, async () => {
      const module = await wrapperOf(minor, 'separator')
      const baseModule = await loadBaseAt(minor, runMinor().version, 'separator')
      const [Separator, base] = [module.Separator as object, baseModule.Separator as object]
      expect(Reflect.has(Separator, '$$typeof')).toBe(true)
      expect(Reflect.has(base, '$$typeof')).toBe(true)
      expect(Object.keys(Separator)).toEqual(Object.keys(base))
      expect(Object.keys(Separator)).not.toContain('Root')
    })

    it(`at ${minor.version}: control, a key deleted from the wrapper's Toast namespace reds the comparison, naming it`, async () => {
      const nave = await wrapperOf(minor, 'toast')
      const base = await loadBaseAt(minor, runMinor().version, 'toast')
      expect(differences('toast', nave, base)).toEqual([])
      const { useToastManager: _removed, ...rest } = nave.Toast as Record<string, unknown>
      expect(differences('toast', { Toast: rest }, base)).toContain(
        'Toast.useToastManager is missing',
      )
    })
  }

  it('names the six minors of the criterion, and runs each one that is installed', () => {
    expect(MINORS.map(({ version }) => version)).toEqual([
      '1.3.0',
      '1.4.0',
      '1.5.0',
      '1.6.0',
      '1.7.0',
      '1.8.0',
    ])
    expect(minorsOfRun().every(isInstalled)).toBe(true)
  })

  it('lists the seven subpaths the criterion names', () => {
    expect([...FEEDBACK_SUBPATHS] satisfies FeedbackSubpath[]).toEqual([
      'toast',
      'navigation-menu',
      'scroll-area',
      'meter',
      'progress',
      'avatar',
      'separator',
    ])
  })
})
