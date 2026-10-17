import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { LoadedRegistry, RegistryItem } from './support/registry/load.ts'
import type { SubpathReferences } from './support/registry/render-type-fixture.ts'
import type { BaseUiVersion, Problem } from './support/registry/render-types.ts'

import { loadRegistry } from './support/registry/load.ts'
import { makeScratchDirectory, removeScratchDirectory } from './support/registry/render-scratch.ts'
import {
  withAppendedLine,
  withDirectCreateItems,
  withRequiredCloseProp,
} from './support/registry/render-type-controls.ts'
import {
  assignabilityText,
  fixtureText,
  generatedModuleOf,
  referencesOf,
  rewrittenToCopies,
  typeChain,
} from './support/registry/render-type-fixture.ts'
import {
  compileSources,
  describeProblems,
  readTemplate,
  sourcesOf,
} from './support/registry/render-types.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'

const VERSIONS: readonly BaseUiVersion[] = ['floor', 'current']
const TIMEOUT = 900_000

const styled = styledSubpaths()
const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) removeScratchDirectory(directory)
})

const newScratch = (): string => {
  const directory = makeScratchDirectory('test', '.registry-types-')
  scratch.push(directory)
  return directory
}

const memo = <T>(make: () => T): (() => T) => {
  let made: { value: T } | undefined
  return () => (made ??= { value: make() }).value
}

const registryOnce = memo((): LoadedRegistry => loadRegistry())

const itemOf = (name: string): RegistryItem => {
  const item = registryOnce().items.get(name)
  if (item === undefined) throw new Error(`the registry has no item ${name}`)
  return item
}

const FIXTURE = 'fixture.ts'
const COPY_FIXTURE = 'fixture-copy.ts'
const ASSIGNABLE = 'assignable.ts'

interface Run {
  readonly copies: Problem[]
  readonly fixture: string
  readonly package: Problem[]
  readonly references: SubpathReferences[]
}

const inFile = (problems: readonly Problem[], name: string): string[] =>
  describeProblems(problems.filter((problem) => problem.file === path.join('src', name)))

const outsideFiles = (problems: readonly Problem[], names: readonly string[]): string[] =>
  describeProblems(
    problems.filter((problem) => names.every((name) => problem.file !== path.join('src', name))),
  )

/**
 * One run: the package's fixture compiled against the package, and the copies with the rewritten
 * fixture and the assignability assertions compiled together, each in a scratch directory of its
 * own, with the run's Base UI.
 */
const runs: Record<BaseUiVersion, () => Run> = {
  current: memo(() => runAt('current')),
  floor: memo(() => runAt('floor')),
}

function runAt(version: BaseUiVersion): Run {
  const items = styled.map((subpath) => itemOf(`base-ui-${subpath}`))
  const references = referencesOf(newScratch(), version, styled)
  const fixture = fixtureText(references)
  return {
    copies: compileSources(newScratch(), version, {
      ...sourcesOf(items),
      [ASSIGNABLE]: assignabilityText(references),
      [COPY_FIXTURE]: rewrittenToCopies(fixture),
    }),
    fixture,
    package: compileSources(newScratch(), version, { [FIXTURE]: fixture }),
    references,
  }
}

describe('AC-base-ui-registry-19: The copies typecheck as a consumer compiles them, and the import swap carries every type', () => {
  it('compiles under the create-vite react-ts tsconfig.app.json as recorded, with the flags the criterion names', () => {
    const { compilerOptions } = readTemplate()
    expect(compilerOptions.noUnusedLocals).toBe(true)
    expect(compilerOptions.verbatimModuleSyntax).toBe(true)
    expect(compilerOptions.erasableSyntaxOnly).toBe(true)
    expect(compilerOptions.types).toEqual(['vite/client'])
    expect(compilerOptions.moduleResolution).toBe('bundler')
  })

  describe.each(VERSIONS)('with Base UI at the %s version', (version) => {
    it(
      'compiles every copy with no error, library declarations included',
      { timeout: TIMEOUT },
      () => {
        const { copies } = runs[version]()
        expect(outsideFiles(copies, [COPY_FIXTURE, ASSIGNABLE])).toEqual([])
      },
    )

    it(
      'compiles the type fixture unrewritten against the package (the fixture is valid)',
      { timeout: TIMEOUT },
      () => {
        expect(outsideFiles(runs[version]().package, [])).toEqual([])
      },
    )

    it('compiles the same fixture rewritten to the copies entries', { timeout: TIMEOUT }, () => {
      expect(inFile(runs[version]().copies, COPY_FIXTURE)).toEqual([])
    })

    it(
      'finds each wrapped part props type mutually assignable between the package and its copy',
      { timeout: TIMEOUT },
      () => {
        const { copies } = runs[version]()
        expect(inFile(copies, ASSIGNABLE)).toEqual([])
      },
    )

    it('names every export of every styled subpath, Props and State of every part, and every wrapped part', () => {
      const { fixture, references } = runs[version]()
      expect(references.map(({ subpath }) => subpath)).toEqual(styled)
      for (const { subpath, types, values } of references) {
        expect(values.length, `values of ${subpath}`).toBeGreaterThan(0)
        expect(types.length, `types of ${subpath}`).toBeGreaterThan(0)
        const { typeNames, wrapped } = generatedModuleOf(subpath)
        expect(wrapped.length + typeNames.size, `parts of ${subpath}`).toBeGreaterThan(0)
        const named = new Set(types.map(({ chain }) => chain.join('.')))
        const missing = [...typeNames].flatMap(([part, names]) =>
          names
            .filter((name) => name === 'Props' || name === 'State')
            .map((name) => typeChain(subpath, part, name).join('.'))
            .filter((chain) => !named.has(chain)),
        )
        expect(missing, `${subpath}: Props and State the fixture does not name`).toEqual([])
      }
      expect(fixture).toContain('export type T')
      expect(fixture).toContain('export const V')
    })
  })
})

const SMALL_TIMEOUT = 300_000

const smallCompile = (
  version: BaseUiVersion,
  items: readonly RegistryItem[],
  extra: Readonly<Record<string, string>> = {},
): Problem[] => compileSources(newScratch(), version, { ...sourcesOf(items), ...extra })

describe('AC-base-ui-registry-11 (compile half): a part younger than the floor is read in a form the floor types accept', () => {
  it("compiles Combobox's copy as generated at the floor", { timeout: SMALL_TIMEOUT }, () => {
    const problems = smallCompile('floor', [itemOf('base-ui-combobox')])
    expect(describeProblems(problems)).toEqual([])
  })

  it(
    "control: Combobox's line written as Base.createItems reds the floor run with TS2339, and not the current one",
    { timeout: SMALL_TIMEOUT },
    () => {
      const planted = withDirectCreateItems(itemOf('base-ui-combobox'))
      const atFloor = smallCompile('floor', [planted])
      const parts = path.join('src', 'nave-combobox.parts.ts')
      const direct = atFloor.filter((problem) => problem.code === 2339)
      expect(direct.map((problem) => problem.file)).toEqual([parts])
      expect(direct[0]?.text).toContain("'createItems'")
      expect(atFloor.filter((problem) => problem.file !== parts)).toEqual([])
      expect(describeProblems(smallCompile('current', [planted]))).toEqual([])
    },
  )
})

describe('AC-base-ui-registry-19, controls', () => {
  it(
    'a property the package props do not require, planted in a copy, reds the assignability check naming the part',
    { timeout: SMALL_TIMEOUT },
    () => {
      const references = runs.current().references.filter(({ subpath }) => subpath === 'dialog')
      const extra = { [ASSIGNABLE]: assignabilityText(references) }
      const dialog = itemOf('base-ui-dialog')
      expect(describeProblems(smallCompile('current', [dialog], extra))).toEqual([])
      const planted = smallCompile(
        'current',
        [withRequiredCloseProp(itemOf('base-ui-dialog'))],
        extra,
      )
      expect(planted.map((problem) => problem.file)).toEqual([path.join('src', ASSIGNABLE)])
      const line = extra[ASSIGNABLE]?.split('\n')[(planted[0]?.line ?? 0) - 1]
      expect(line).toMatch(
        /Assert<Same<P_dialog\.Dialog\.Close\.Props, C_dialog\.Dialog\.Close\.Props>>/,
      )
    },
  )

  it(
    "an unused local and an enum planted in a copy red the run: the template's flags are in force",
    { timeout: SMALL_TIMEOUT },
    () => {
      const button = itemOf('base-ui-button')
      expect(describeProblems(smallCompile('current', [button]))).toEqual([])
      const unused = smallCompile('current', [withAppendedLine(button, 'const unused = 1')])
      expect(unused.map((problem) => problem.code)).toEqual([6133])
      const erasable = smallCompile('current', [
        withAppendedLine(button, 'export enum Planted { A }'),
      ])
      expect(erasable.map((problem) => problem.code)).toEqual([1294])
    },
  )
})
