import { createRef, type RefObject } from 'react'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import type { ElementRecord } from '../support/dom.ts'
import type { Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { describeAtRest, fullProps, settle, underSetups } from '../support/feedback-render.ts'
import { cleanup, render } from '../support/react.ts'
import {
  harnessCaseCount,
  parityCases,
  uncoveredSubpaths,
} from '../support/registry/render-cases.ts'
import { copyParityViolations } from '../support/registry/render-parity.ts'
import {
  asCopy,
  misspeltDialog,
  prepareCopies,
  removeScratchDirectories,
  withAttribute,
} from '../support/registry/render-prepare.ts'
import { styledSubpaths } from '../support/registry/styled-subpaths.ts'
import { scenes } from '../support/scenes.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { topName } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'

const styled = styledSubpaths()
const cases = parityCases(styled)

const packageSource = await loadNave()
const bare = await loadBare()

/**
 * The registry read, its copies written and loaded: once for the file, and a failure (the build did
 * not write the registry) reaches every test that asks.
 */
const prepared = (() => {
  let made: ReturnType<typeof prepareCopies> | undefined
  return () => (made ??= prepareCopies(styled, bare))
})()

afterAll(removeScratchDirectories)

afterEach(cleanup)

const sceneOf = (subpath: string): NonNullable<(typeof scenes)[string]> => {
  const scene = scenes[subpath]
  if (scene === undefined) throw new Error(`no scene for ${subpath}`)
  return scene
}

interface Scenario {
  readonly props: Record<string, unknown>
  readonly subpath: string
}

const documentOf = async (
  source: Source,
  { props, subpath }: Scenario,
): Promise<ElementRecord[]> => {
  await render(sceneOf(subpath).render(source, { props: props as never }))
  return describeAtRest()
}

/**
 * Where the copy's document differs from the package's for one scenario, read in every setup the
 * scene needs to put all its parts on the page.
 */
const violationsOf = async (
  source: Source,
  scenario: Scenario,
  tokens: ReadonlyMap<string, string>,
): Promise<string[]> => {
  const found: string[] = []
  await underSetups(scenario.subpath, async () => {
    const expected = await documentOf(packageSource, scenario)
    const actual = await documentOf(source, scenario)
    found.push(...copyParityViolations(expected, actual, tokens))
  })
  return found
}

const comparedCases: string[] = []

describe('AC-base-ui-registry-18: The copy renders the package DOM, part for part, in the four runs', () => {
  it('runs in one of the four runs, and every styled subpath has a scene and a parity row', () => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-run variables set by vitest.config.ts, not build inputs
    const run = `${process.env.NAVE_BASE_UI}-react-${process.env.NAVE_REACT}`
    expect(['current-react-18', 'current-react-19', 'floor-react-18', 'floor-react-19']).toContain(
      run,
    )
    expect(styled.length).toBeGreaterThan(0)
    expect(uncoveredSubpaths(styled)).toEqual([])
    expect(styled.filter((subpath) => scenes[subpath] === undefined)).toEqual([])
  })

  it('reads every class token a copy hands out as exactly one atom', async () => {
    const { atomOfToken, mapping } = await prepared()
    expect(mapping.problems).toEqual([])
    expect(mapping.atomOf.size).toBeGreaterThan(0)
    expect(atomOfToken.size).toBeGreaterThanOrEqual(mapping.atomOf.size)
  })

  it.each(cases)('$name', async ({ name, props, subpath }) => {
    const { atomOfToken, copies } = await prepared()
    comparedCases.push(name)
    expect(await violationsOf(copies, { props, subpath }, atomOfToken)).toEqual([])
  })

  it('compares as many (scene, state) pairs in this run as the package parity rows have, and not zero', () => {
    expect(harnessCaseCount(styled)).toBeGreaterThan(0)
    expect(cases).toHaveLength(harnessCaseCount(styled))
    expect(comparedCases).toHaveLength(harnessCaseCount(styled))
  })
})

/**
 * The parts of a styled subpath's scene whose class the package adds: Table P's rows for its
 * namespace (the Menubar's scene holds Menu parts as well).
 */
const wrappedPartsOf = (subpath: string): string[] => {
  const namespaces = subpath === 'menubar' ? ['Menubar', 'Menu'] : [topName(subpath)]
  return tableP
    .keys()
    .filter((part) =>
      namespaces.some((namespace) => part === namespace || part.startsWith(`${namespace}.`)),
    )
    .toArray()
}

/**
 * The tag of the element a ref passed to a part reaches, once for each setup the scene is read under
 * that rendered the part and the ref reached.
 */
const refTags = async (source: Source, subpath: string, part: string): Promise<string> => {
  const tags: string[] = []
  await underSetups(subpath, async () => {
    const ref: RefObject<unknown> = createRef<unknown>()
    const props = { ...openProps(), ...fullProps(), [part]: { ref } }
    await render(sceneOf(subpath).render(source, { props }))
    await settle(10)
    const reached = partsNamed(part).find((element) => element === ref.current)
    if (reached !== undefined) tags.push(reached.tagName)
  })
  return tags.join(' ')
}

describe('AC-base-ui-registry-18, refs: a ref passed to every wrapped part receives an element of the same tag in both', () => {
  it.each(styled)('%s', async (subpath) => {
    const { copies } = await prepared()
    const wrapped = wrappedPartsOf(subpath)
    expect(wrapped.length, `Table P names parts of ${subpath}`).toBeGreaterThan(0)
    const problems: string[] = []
    for (const part of wrapped) {
      const expected = await refTags(packageSource, subpath, part)
      const actual = await refTags(copies, subpath, part)
      if (expected === '') {
        problems.push(`${part}: the package's ref reached no element`)
      } else if (actual !== expected) {
        problems.push(`${part}: the copy's ref reaches [${actual}], the package's [${expected}]`)
      }
    }
    expect(problems).toEqual([])
  })
})

const DIALOG_OPEN: Scenario = { props: openProps(), subpath: 'dialog' }

describe('AC-base-ui-registry-18, controls', () => {
  it('a misspelt styles reference in a copy of nave-dialog.parts.ts reds the run, naming the part', async () => {
    const ready = await prepared()
    const { source, tokens } = await misspeltDialog(ready, bare)
    const violations = await violationsOf(source, DIALOG_OPEN, tokens)
    expect(violations.some((line) => line.includes('Dialog.Popup'))).toBe(true)
    // The same scenario through the unmodified copy is clean: the change is what reds it.
    expect(await violationsOf(ready.copies, DIALOG_OPEN, ready.atomOfToken)).toEqual([])
  })

  it('reports a class token that is "undefined", a dropped atom and a changed attribute, naming the part', async () => {
    const { atomOfToken } = await prepared()
    const expected = await documentOf(packageSource, DIALOG_OPEN)
    const copy = asCopy(expected, atomOfToken)
    expect(copyParityViolations(expected, copy, atomOfToken)).toEqual([])
    const popupClass = copy
      .find((record) => record.attributes.get('data-part') === 'Dialog.Popup')
      ?.attributes.get('class')
    const [firstToken = ''] = (popupClass ?? '').split(' ', 1)
    expect(firstToken).not.toBe('')
    const undefinedToken = withAttribute(copy, 'Dialog.Popup', 'class', `${popupClass} undefined`)
    expect(copyParityViolations(expected, undefinedToken, atomOfToken)).toEqual([
      expect.stringContaining('Dialog.Popup: the class token "undefined"'),
    ])
    const dropped = withAttribute(copy, 'Dialog.Popup', 'class', firstToken)
    expect(copyParityViolations(expected, dropped, atomOfToken)).toEqual([
      expect.stringContaining('Dialog.Popup: classes are atoms'),
    ])
    const sized = withAttribute(copy, 'Dialog.Trigger', 'data-nave-size', 'sm')
    expect(copyParityViolations(expected, sized, atomOfToken)).toEqual([
      expect.stringContaining('Dialog.Trigger: data-nave-size is sm, the package has absent'),
    ])
  })
})
