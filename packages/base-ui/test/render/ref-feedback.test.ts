import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { fullProps, PASS_THROUGHS, settle, underSetups } from '../support/feedback-render.ts'
import {
  FEEDBACK_SINGLE_COMPONENT,
  FEEDBACK_SUBPATHS,
  feedbackBare,
  feedbackNave,
  KEY_SETS,
  qualified,
} from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { topName } from '../support/subpaths.ts'

afterEach(cleanup)

/**
 * The styled parts of the seven, as the scenes mark them, and the parts that pass through, by
 * subpath: what `ref` is checked on.
 */
const subjects = (): { part: string; subpath: string }[] =>
  FEEDBACK_SUBPATHS.flatMap((subpath) => [
    ...(subpath === FEEDBACK_SINGLE_COMPONENT
      ? [topName(subpath)]
      : KEY_SETS[subpath].styled.map((key) => qualified(subpath, key))
    ).map((part) => ({ part, subpath })),
    ...(PASS_THROUGHS[subpath] ?? []).map((part) => ({ part, subpath })),
  ])

interface Reading {
  /**
  How many elements carry the part's marker.
   */
  readonly count: number
  /**
  The tag of the element the ref reached, when it reached one of them.
   */
  readonly reached: string | undefined
  /**
  The tag of the first element.
   */
  readonly tag: string | undefined
}

/**
 * What a ref passed to a part reaches in a render of its component's scene, once for each setup
 * the scene is read under (the Scroll Area's corner and the Avatar's image show under one only).
 * A part a scene renders twice gets the same ref twice, and the ref ends up on the last. The read
 * is made inside the setup: the next render unmounts this one and clears its ref.
 */
const readings = async (source: Source, subpath: string, part: string): Promise<Reading[]> => {
  const found: Reading[] = []
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  await underSetups(subpath, async () => {
    const ref: RefObject<unknown> = createRef<unknown>()
    await render(scene.render(source, { props: { ...fullProps(), [part]: { ref } } }))
    await settle(10)
    const elements = partsNamed(part)
    if (elements.length > 0) {
      found.push({
        count: elements.length,
        reached: elements.find((element) => element === ref.current)?.tagName,
        tag: elements[0]?.tagName,
      })
    }
  })
  return found
}

describe('AC-base-ui-feedback-navigation-46 (AC-09): a wrapped part of the seven forwards its ref to the DOM', () => {
  it('reaches the element Base UI renders, for every styled part and the pass-throughs', async () => {
    const bare = await feedbackBare()
    const nave = await feedbackNave()
    const problems: string[] = []
    for (const { part, subpath } of subjects()) {
      const expected = await readings(bare, subpath, part)
      const wrapped = await readings(nave, subpath, part)
      if (wrapped.length === 0 || expected.length === 0) {
        problems.push(`${part} did not render`)
      }
      for (const { count, reached, tag } of wrapped) {
        if (reached === undefined || reached !== expected[0]?.tag) {
          problems.push(`${part}: ref does not reach one of the ${count} <${tag}> it renders`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('checks every styled part of the seven, Separator, and one pass-through per namespace that has one', () => {
    const parts = subjects().map(({ part }) => part)
    expect(parts).toContain('Separator')
    expect(parts).toContain('Toast.Viewport')
    expect(parts).toContain('Toast.Positioner')
    expect(parts).toContain('NavigationMenu.Viewport')
    expect(parts).toContain('ScrollArea.Content')
    // Provider and Portal render no element of their own and are not rows.
    expect(parts).not.toContain('Toast.Provider')
    expect(parts).not.toContain('Toast.Portal')
    // 7 + 6 + 5 + 5 + 5 + 3 + 1 styled, and 2 + 4 + 1 pass-throughs.
    expect(parts).toHaveLength(7 + 6 + 5 + 5 + 5 + 3 + 1 + 2 + 4 + 1)
  })
})
