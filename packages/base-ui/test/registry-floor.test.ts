import { beforeAll, describe, expect, it } from 'vitest'

import {
  exportedNames,
  membersRead,
  youngDeclarationProblems,
  type YoungPart,
  youngParts,
  youngReadProblems,
} from './support/registry/files-floor.ts'
import { problemsAt, problemTexts } from './support/registry/files-problem.ts'
import { cloneRegistry, type LoadedRegistry, loadRegistry } from './support/registry/load.ts'

const COMBOBOX = 'base-ui-combobox'
const COMBOBOX_PARTS = 'components/nave/nave-combobox.parts.ts'

const withAppended = (
  registry: LoadedRegistry,
  item: string,
  target: string,
  text: string,
): LoadedRegistry => {
  const clone = cloneRegistry(registry)
  const file = clone.items.get(item)?.files.find((candidate) => candidate.target === target)
  if (file?.content === undefined) throw new Error(`${item} has no ${target}`)
  file.content = `${file.content}\n${text}\n`
  return clone
}

// One planted declaration per form the declaration check reads.
const DECLARATION_FORMS: Record<string, string> = {
  'export const': 'export const createItems = 1',
  'export function': 'export function createItems() {}',
  'export declare namespace': 'export declare namespace createItems { type Props = 1 }',
  'export { x as createItems }': 'const x = 1\nexport { x as createItems }',
  'destructured export const': 'export const { createItems: x } = { createItems: 1 }',
  'export * as createItems': "export * as createItems from './elsewhere'",
}

// One planted read per form the read check reads, and the wrappers it looks through.
const READ_FORMS: Record<string, string> = {
  'Base.X': 'export const a = Base.createItems',
  "Base['X']": "export const a = Base['createItems']",
  'Base[`X`]': 'export const a = Base[`createItems`]',
  'Base?.X': 'export const a = Base?.createItems',
  '{ X } = Base': 'export const { createItems: a } = Base',
  '({ X } = Base)': 'let a: unknown\n;({ createItems: a } = Base)',
  'a parenthesised cast': 'export const a = (Base as Record<string, unknown>).createItems',
  'a non-null assertion': 'export const a = Base!.createItems',
  'a satisfies': 'export const a = (Base satisfies object)["createItems"]',
  'an angle-bracket assertion': 'export const a = (<object>Base).createItems',
}

describe('AC-base-ui-registry-11: nothing younger than the floor is copied, and a read of one is caught', () => {
  const registry = loadRegistry()
  let young: YoungPart[] = []

  beforeAll(() => {
    young = youngParts()
  }, 180_000)

  const declared = (clone: LoadedRegistry): string[] =>
    problemsAt(youngDeclarationProblems(clone, young), COMBOBOX, COMBOBOX_PARTS)
  const read = (clone: LoadedRegistry): string[] =>
    problemsAt(youngReadProblems(clone, young), COMBOBOX, COMBOBOX_PARTS)

  it('reads a non-empty set from the two installed declarations, with Combobox createItems in it', () => {
    expect(young.length).toBeGreaterThan(0)
    expect(young).toContainEqual({ key: 'createItems', subpath: 'combobox' })
  })

  it('has the parsers find something in a real parts file, so a clean registry is not an empty read', () => {
    const content = registry.items
      .get(COMBOBOX)
      ?.files.find((file) => file.target === COMBOBOX_PARTS)?.content
    expect(content).toBeDefined()
    expect(exportedNames(content ?? '').length).toBeGreaterThan(0)
    expect(exportedNames(content ?? '')).toContain('Root')
    expect(membersRead(content ?? '')).toContain('Root')
  })

  it("declares no export named after a member of its own subpath's set, in any parts file", () => {
    expect(problemTexts(youngDeclarationProblems(registry, young))).toEqual([])
  })

  it("reads no member of its own subpath's set off the Base UI binding, in any parts file", () => {
    expect(problemTexts(youngReadProblems(registry, young))).toEqual([])
  })

  describe('controls: the declaration check', () => {
    it("reds the spec's appended line, naming createItems", () => {
      const planted = withAppended(
        registry,
        COMBOBOX,
        COMBOBOX_PARTS,
        'export const createItems: typeof Base.createItems = /*#__PURE__*/ (() => Base.createItems)()',
      )
      expect(declared(planted).join('\n')).toContain('createItems')
    })

    it.each(Object.entries(DECLARATION_FORMS))('reds %s, and no read', (_form, text) => {
      const planted = withAppended(registry, COMBOBOX, COMBOBOX_PARTS, text)
      expect(declared(planted).join('\n')).toContain('createItems')
      expect(read(planted)).toEqual([])
    })

    it("leaves a type position and another name alone, and does not take another subpath's set", () => {
      const other = withAppended(
        registry,
        COMBOBOX,
        COMBOBOX_PARTS,
        'export const createdItems = 1',
      )
      expect(declared(other)).toEqual([])
      const elsewhere = withAppended(
        registry,
        'base-ui-dialog',
        'components/nave/nave-dialog.parts.ts',
        DECLARATION_FORMS['export const'] ?? '',
      )
      expect(problemTexts(youngDeclarationProblems(elsewhere, young))).toEqual([])
    })
  })

  describe('controls: the read check', () => {
    it("reds the spec's appended cast read, naming createItems, with no declaration", () => {
      const planted = withAppended(
        registry,
        COMBOBOX,
        COMBOBOX_PARTS,
        'export const ci = (Base as Record<string, unknown>).createItems',
      )
      expect(read(planted).join('\n')).toContain('createItems')
      expect(declared(planted)).toEqual([])
    })

    it.each(Object.entries(READ_FORMS))('reds %s', (_form, text) => {
      const planted = withAppended(registry, COMBOBOX, COMBOBOX_PARTS, text)
      expect(read(planted).join('\n')).toContain('createItems')
    })

    it('leaves a type position, another key and another binding alone', () => {
      const forms = [
        'export type T = typeof Base.createItems',
        "export type U = (typeof Base)['createItems']",
        'export const root = Base.Root',
        'const other = { createItems: 1 }\nexport const b = other.createItems',
      ]
      for (const text of forms) {
        const planted = withAppended(registry, COMBOBOX, COMBOBOX_PARTS, text)
        expect(read(planted), text).toEqual([])
      }
    })
  })
})
