import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateWrappers } from '../scripts/generate-wrappers.ts'
import { boundaryProblems, hasDirective, hasExportStar, kindOf } from './support/client-boundary.ts'
import { DIST_DIR, filesUnder, SRC_DIR } from './support/dist.ts'
import { SINGLE_COMPONENT, SUBPATHS } from './support/subpaths.ts'

const withoutExtension = (file: string): string => file.replace(/\.(?:js|tsx?)$/, '')

const read = (directory: string, extensions: readonly string[]): Map<string, string> =>
  new Map(
    filesUnder(directory, extensions).map((file) => [
      withoutExtension(file),
      readFileSync(path.join(directory, file), 'utf8'),
    ]),
  )

const MODULES = SUBPATHS.length * 2 + 2

describe("AC-base-ui-bridge-52: the directive sits on the part modules and on no entry module, and no client boundary holds an 'export *'", () => {
  const built = read(DIST_DIR, ['.js'])
  const sources = read(SRC_DIR, ['.ts', '.tsx'])
  const generated = new Map(
    generateWrappers()
      .entries()
      .map(([file, text]) => [withoutExtension(file), text] as const),
  )

  it('classifies each of the 74 modules of the build and of src/, and the 73 the generator writes', () => {
    expect(MODULES).toBe(74)
    expect(built.size).toBe(MODULES)
    expect(sources.size).toBe(MODULES)
    // `part` is the helper, written by hand.
    expect(generated.size).toBe(MODULES - 1)
    for (const modules of [built, sources, generated]) {
      expect(
        modules
          .keys()
          .filter((module) => kindOf(module) === 'unclassified')
          .toArray(),
      ).toEqual([])
    }
  })

  it.each([
    ['the build', built],
    ['src/', sources],
    ["the generator's output", generated],
  ])('puts the directive on every part module and on no entry module, in %s', (_where, modules) => {
    const parts = modules
      .keys()
      .filter((module) => kindOf(module) === 'part')
      .toArray()
    const entries = modules
      .keys()
      .filter((module) => kindOf(module) === 'entry')
      .toArray()
    expect(parts.filter((module) => !hasDirective(modules.get(module) ?? ''))).toEqual([])
    expect(entries.filter((module) => hasDirective(modules.get(module) ?? ''))).toEqual([])
    expect(boundaryProblems(modules)).toEqual([])
  })

  it('has no entry module with the directive among the namespaces, the single components and the root', () => {
    const single = [...SINGLE_COMPONENT].map((subpath) => `${subpath}/index`)
    const namespaces = SUBPATHS.filter((subpath) => !SINGLE_COMPONENT.has(subpath)).map(
      (subpath) => `${subpath}/index`,
    )
    expect(single).toHaveLength(9)
    expect(namespaces).toHaveLength(27)
    for (const module of [...namespaces, ...single, 'index']) {
      expect(hasDirective(built.get(module) ?? 'missing')).toBe(false)
      expect(built.has(module)).toBe(true)
    }
  })

  it("control: 0.2.0's own dist/dialog/index.js reds the entry clause and the export * clause, naming the module", () => {
    const shipped = `'use client';\nexport * as Dialog from "./parts.generated.js";\n`
    expect(boundaryProblems(new Map([['dialog/index', shipped]]))).toEqual([
      'dialog/index: an entry module with the directive',
      'dialog/index: the directive and an export *',
    ])
  })

  it('control: a part module without the directive reds', () => {
    expect(
      boundaryProblems(new Map([['dialog/parts.generated', 'export const Root = 1\n']])),
    ).toEqual(['dialog/parts.generated: a part module without the directive'])
  })

  it('control: an entry module without the directive and a part module without any export * pass', () => {
    expect(
      boundaryProblems(
        new Map([
          ['dialog/index', `export * as Dialog from './parts.generated.js'\n`],
          ['dialog/parts.generated', `'use client'\nexport const Root = 1\n`],
        ]),
      ),
    ).toEqual([])
  })

  it('control: a module outside both classes reds', () => {
    expect(boundaryProblems(new Map([['dialog/helper', `'use client'\n`]]))).toEqual([
      'dialog/helper: neither a part module nor an entry module',
    ])
  })

  it('control: both forms of export * are seen, and an export of a name is not', () => {
    expect(hasExportStar(`export * from './a.js'`)).toBe(true)
    expect(hasExportStar(`export * as A from './a.js'`)).toBe(true)
    expect(hasExportStar(`export type * from '@base-ui/react/dialog'`)).toBe(false)
    expect(hasExportStar(`export const A = 1`)).toBe(false)
  })
})
