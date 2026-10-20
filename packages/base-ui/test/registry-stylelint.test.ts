import { describe, expect, it } from 'vitest'

import { cleared } from './support/registry/cleared.ts'
import { addDeclarationToAtom, copyPackage, runGenerator } from './support/registry/css-build.ts'
import { byCodeUnit } from './support/registry/css-rules.ts'
import {
  disableCommentLines,
  disableProblems,
  focusableAtomsOf,
  GUARD_RULE,
  hasRingAfter,
  lintModule,
  moduleTexts,
  outlineNoneDeclarations,
  prettified,
  reportedProblems,
  strippedProblems,
  withOutlineZeroInRing,
} from './support/registry/css-stylelint.ts'
import { loadRegistry } from './support/registry/load.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'

const GENERATOR_TIMEOUT = 180_000
const PLANTED_ATOM = 'baseUiSelectIcon'

const loadedModules = (): ReturnType<typeof moduleTexts>['found'] => {
  const { found, problems } = moduleTexts(loadRegistry())
  expect(problems).toEqual([])
  return found
}

describe('AC-base-ui-registry-22: the stylelint config passes the modules as generated and after Prettier, and the disable comment covers the paired declarations and nothing else', () => {
  it('reports nothing over the modules as generated', async () => {
    const modules = loadedModules()
    expect(modules.length).toBe(styledSubpaths().length)
    expect(await reportedProblems(modules)).toEqual([])
  }, 120_000)

  it('reports nothing over the modules after prettier with its default options', async () => {
    const modules = loadedModules()
    const formatted = await Promise.all(
      modules.map(async (module) => ({ ...module, text: await prettified(module.text) })),
    )
    expect(await reportedProblems(formatted)).toEqual([])
  }, 120_000)

  it('has the cleared comment alone on its line before each outline: none, and counts that agree', () => {
    const modules = loadedModules()
    expect(disableProblems(modules)).toEqual([])
    const comments = modules.reduce(
      (sum, module) => sum + disableCommentLines(module.text).length,
      0,
    )
    const declarations = modules.reduce(
      (sum, module) => sum + outlineNoneDeclarations(module.text).length,
      0,
    )
    expect(comments).toBeGreaterThan(0)
    expect(modules.flatMap((module) => focusableAtomsOf(module.atomNames)).length).toBe(comments)
    expect(declarations).toBe(comments)
  })

  it('reports exactly one guard problem at each outline: none once the comments are removed', async () => {
    const modules = loadedModules()
    expect(
      modules.reduce((sum, module) => sum + disableCommentLines(module.text).length, 0),
    ).toBeGreaterThan(0)
    expect(await strippedProblems(modules)).toEqual([])
  }, 120_000)

  it('reports outline: 0 planted on its own line inside a copied :focus-visible rule, with the comments in place', async () => {
    const [module] = loadedModules()
    if (module === undefined) throw new Error('no module')
    const planted = withOutlineZeroInRing(module.text)
    const reports = await lintModule(module.label, planted)
    expect(reports.map((report) => report.rule)).toEqual([GUARD_RULE])
    expect(planted.split('\n')[(reports[0]?.line ?? 0) - 1]?.trim()).toBe('outline: 0;')
  })

  it('reports a disable comment above a declaration that is not an outline', async () => {
    const [module] = loadedModules()
    if (module === undefined) throw new Error('no module')
    const planted = module.text.replace(
      /^( +)(box-sizing: )/m,
      (_match, indent: string, property: string) =>
        `${indent}${cleared('W-outline')}\n${indent}${property}`,
    )
    expect(planted).not.toBe(module.text)
    const reports = await lintModule(module.label, planted)
    expect(reports.length).toBeGreaterThan(0)
    expect(reports.map((report) => report.rule).join(',')).toContain('needless')
  })

  it(
    'makes the build exit non-zero, naming the atom and writing no item, when one atom gains outline: none with no ring',
    () => {
      const temp = copyPackage()
      try {
        addDeclarationToAtom(temp, PLANTED_ATOM, 'outline', 'none')
        const run = runGenerator(temp)
        expect(run.status).not.toBe(0)
        expect(run.status).not.toBeNull()
        expect(run.output).toMatch(/baseUiSelectIcon|nave-base-ui-select-icon|selectIcon/)
        expect(run.itemFiles).toEqual([])
      } finally {
        temp.remove()
      }
    },
    GENERATOR_TIMEOUT,
  )

  it(
    'makes the build exit non-zero, naming the atom and writing no item, when one atom gains outline: 0',
    () => {
      const temp = copyPackage()
      try {
        addDeclarationToAtom(temp, PLANTED_ATOM, 'outline', '0')
        const run = runGenerator(temp)
        expect(run.status).not.toBe(0)
        expect(run.status).not.toBeNull()
        expect(run.output).toMatch(/baseUiSelectIcon|nave-base-ui-select-icon|selectIcon/)
        expect(run.itemFiles).toEqual([])
      } finally {
        temp.remove()
      }
    },
    GENERATOR_TIMEOUT,
  )

  it(
    'builds the unedited temp copy, so the refusals above are the edits and not the copy',
    () => {
      const temp = copyPackage()
      try {
        const run = runGenerator(temp)
        expect(run.output).not.toMatch(/Cannot find|ERR_MODULE_NOT_FOUND/)
        expect(run.status).toBe(0)
        const expected = styledSubpaths().map((subpath) => `base-ui-${subpath}.json`)
        expect(run.itemFiles.toSorted(byCodeUnit)).toEqual(expected.toSorted(byCodeUnit))
      } finally {
        temp.remove()
      }
    },
    GENERATOR_TIMEOUT,
  )
})

const RING =
  '&:focus-visible { outline-style: solid; outline-width: 2px; outline-color: red; outline-offset: 2px; }'

/**
 * A module with the atom's class rule holding two leading nodes and then `body`.
 */
const planted = (body: string, group = '@layer components.consumer'): string =>
  `${group} {\n  .a { color: red; &:hover { color: blue; } ${body} }\n}\n`

describe('AC-base-ui-registry-22: a ring follows an outline: none only as the build reads it', () => {
  it.each([
    [
      'P1 a comment beside the declaration in the wrapper',
      `& { /* comment */ outline: none; } ${RING}`,
      true,
    ],
    ['P2 the declaration bare in the atom rule', `outline: none; ${RING}`, true],
    [
      'P3 the wrapper, another rule, then the ring',
      `& { outline: none; } &:active { color: green; } ${RING}`,
      true,
    ],
    ['N1 no ring after', '& { outline: none; }', false],
    ['N2 a second declaration in the wrapper', `& { outline: none; color: red; } ${RING}`, false],
    [
      'N2b a nested rule in the wrapper',
      `& { outline: none; &:hover { color: red; } } ${RING}`,
      false,
    ],
    ['N3 a wrapper in a wrapper', `& { & { outline: none; } } ${RING}`, false],
    ['N3b a wrapper in another state', `&:hover { & { outline: none; } } ${RING}`, false],
    ['N4 the ring before the wrapper', `${RING} & { outline: none; }`, false],
    ['N5 the declaration in another state', `&:hover { outline: none; } ${RING}`, false],
    ['N6 the ring in another state beside it', `&:hover { outline: none; ${RING} }`, false],
    ['N7 the ring inside the wrapper', `& { outline: none; ${RING} }`, false],
    [
      'N8 the wrapper in a group, the ring beside it',
      `@media (hover: hover) { & { outline: none; } ${RING} }`,
      false,
    ],
    [
      'N9 the declaration in a group, the ring beside it',
      `@media (hover: hover) { outline: none; ${RING} }`,
      false,
    ],
    [
      'N10 a ring that sets no solid style',
      '& { outline: none; } &:focus-visible { outline-width: 2px; }',
      false,
    ],
  ])('%s', (_name, body, expected) => {
    const declarations = outlineNoneDeclarations(planted(body))

    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.map((declaration) => hasRingAfter(declaration))).toEqual(
      declarations.map(() => expected),
    )
  })

  it.each([
    [
      'N11 a ring whose outline style is dashed',
      `& { outline: none; } &:focus-visible { outline-style: dashed; }`,
      '@layer components.consumer',
    ],
    [
      'N12 the atom rule in a group, not in the layer',
      `& { outline: none; } ${RING}`,
      '@media (hover: hover)',
    ],
    [
      'N13 a ring selector with a space after the &',
      `& { outline: none; } & :focus-visible { outline-style: solid; }`,
      '@layer components.consumer',
    ],
    [
      'N13b a ring selector in a list',
      `& { outline: none; } &:focus-visible, &:hover { outline-style: solid; }`,
      '@layer components.consumer',
    ],
    [
      'N13c a ring selector that negates the state',
      `& { outline: none; } &:not(:focus-visible) { outline-style: solid; }`,
      '@layer components.consumer',
    ],
  ])('%s', (_name, body, group) => {
    const declarations = outlineNoneDeclarations(planted(body, group))

    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.map((declaration) => hasRingAfter(declaration))).toEqual(
      declarations.map(() => false),
    )
  })
})
