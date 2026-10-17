import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  castStatement,
  type YoungPart,
  youngPartProblems,
  youngParts,
} from './support/registry/files-floor.ts'
import { problemsAt, problemTexts } from './support/registry/files-problem.ts'
import { cloneRegistry, loadRegistry } from './support/registry/load.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

// What the package's own modules declare through `PartOf`, which is where the generator marks a part
// younger than the floor: an independent reading of the same set.
const declaredThroughPartOf = (): string[] =>
  styledSubpaths().flatMap((subpath) => {
    const text = readFileSync(path.join(PACKAGE_DIR, 'src', subpath, 'parts.generated.ts'), 'utf8')
    return text
      .matchAll(/PartOf<typeof Base, '(\w+)'>/g)
      .map((match) => `${subpath}/${match[1] ?? ''}`)
      .toArray()
  })

const byName = (a: string, b: string): number => a.localeCompare(b)

describe('AC-base-ui-registry-11: a part younger than the floor is read in a form the floor accepts', () => {
  const registry = loadRegistry()
  let young: YoungPart[] = []

  beforeAll(() => {
    young = youngParts()
  }, 180_000)

  it('derives a non-empty set from the two installed declarations, agreeing with the package modules', () => {
    expect(young.length).toBeGreaterThan(0)
    const derived = young.map(({ key, subpath }) => `${subpath}/${key}`).toSorted(byName)
    expect(derived).toEqual([...new Set(declaredThroughPartOf())].toSorted(byName))
  })

  it('reads each member through PartOf in the cast form, with no direct Base.<key> access', () => {
    expect(problemTexts(youngPartProblems(registry, young))).toEqual([])
  })

  it('reds the direct Base.<key> form of each member, naming its file', () => {
    for (const { key, subpath } of young) {
      const clone = cloneRegistry(registry)
      const target = `components/nave/nave-${subpath}.parts.ts`
      const file = clone.items
        .get(`base-ui-${subpath}`)
        ?.files.find((entry) => entry.target === target)
      if (file?.content === undefined) throw new Error(`base-ui-${subpath} has no parts file`)
      const planted = `export const ${key}: PartOf<typeof Base, '${key}'> = /*#__PURE__*/ (() => Base.${key})()`
      expect(file.content).toContain(castStatement(key))
      file.content = file.content.replace(castStatement(key), () => planted)
      const messages = problemsAt(youngPartProblems(clone, young), `base-ui-${subpath}`, target)
      expect(messages.join('\n')).toContain(`direct Base.${key} property access`)
    }
  })

  it('reds a member read without PartOf', () => {
    const [first] = young
    if (first === undefined) throw new Error('no part younger than the floor')
    const clone = cloneRegistry(registry)
    const target = `components/nave/nave-${first.subpath}.parts.ts`
    const file = clone.items
      .get(`base-ui-${first.subpath}`)
      ?.files.find((entry) => entry.target === target)
    if (file?.content === undefined) throw new Error('no parts file')
    file.content = file.content.replace(
      castStatement(first.key),
      () => `export const ${first.key} = (Base as Record<string, unknown>).${first.key}`,
    )
    const messages = problemsAt(youngPartProblems(clone, young), `base-ui-${first.subpath}`, target)
    expect(messages.join('\n')).toContain('is not read through PartOf')
  })
})
