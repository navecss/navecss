import { createElement, createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { marked, partsNamed } from '../support/dom.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { SUBPATHS } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'
import { isInT0 } from '../support/table-t0.ts'

const bare = await loadBare()
const nave = await loadNave()

afterEach(cleanup)

/**
 * The part's elements in a render of its component's scene, with a ref passed to the part. A part
 * a scene renders twice gets the same ref twice, and the ref ends up on the last.
 */
const refAndElement = async (
  source: Source,
  subpath: string,
  part: string,
): Promise<{ elements: HTMLElement[]; ref: RefObject<unknown> }> => {
  const ref = createRef<unknown>()
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  await render(scene.render(source, { props: { ...openProps(), [part]: { ref } } }))
  return { elements: partsNamed(part), ref }
}

/**
 * Where each part first renders: the subpath whose scene holds it. Every styled part, and for
 * each subpath the first unstyled part that renders an element.
 */
const subjects = async (): Promise<{ part: string; subpath: string }[]> => {
  const found: { part: string; subpath: string }[] = []
  for (const subpath of SUBPATHS) {
    await render(scenes[subpath]?.render(bare, { props: openProps() }) as never)
    const parts = [...new Set(marked().map(({ part }) => part))]
    found.push(
      ...parts.filter((part) => tableP.has(part)).map((part) => ({ part, subpath })),
      ...parts
        .filter((part) => isInT0(part))
        .slice(0, 1)
        .map((part) => ({ part, subpath })),
    )
  }
  return found
}

describe('AC-base-ui-bridge-09: a wrapped part forwards its ref to the DOM', () => {
  it('reaches the element Base UI renders, for every styled part and one pass-through per subpath', async () => {
    const problems: string[] = []
    const placed = await subjects()
    for (const { part, subpath } of placed) {
      const bareRender = await refAndElement(bare, subpath, part)
      const expected = bareRender.elements
      const { elements, ref } = await refAndElement(nave, subpath, part)
      const reached = elements.find((element) => element === ref.current)
      if (elements.length === 0 || expected.length === 0) {
        problems.push(`${part} did not render`)
      } else if (reached === undefined || reached.tagName !== expected[0]?.tagName) {
        problems.push(
          `${part}: ref is ${String(ref.current)}, not one of the ${elements.length} <${elements[0]?.tagName}> it renders`,
        )
      }
    }
    expect(problems).toEqual([])
  })

  it('control: a wrapper written as a plain function component leaves the ref null on React 18', async () => {
    const { Dialog } = (await import('@base-ui/react/dialog')) as unknown as {
      Dialog: Record<string, never>
    }
    const Plain = (props: Record<string, unknown>): ReturnType<typeof createElement> =>
      createElement(Dialog.Close as never, props)
    const ref = createRef<unknown>()
    const popup = createElement(
      Dialog.Popup as never,
      undefined,
      createElement(Plain, { ref, 'data-part': 'plain' }),
    )
    const portal = createElement(Dialog.Portal as never, undefined, popup)
    await render(createElement(Dialog.Root as never, { open: true }, portal))
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable set by vitest.config.ts, not a build input
    const isReact18 = process.env.NAVE_REACT === '18'
    // React 19 passes `ref` as an ordinary prop, so a plain function component forwards it.
    // eslint-disable-next-line unicorn/no-null -- on React 18 the unforwarded ref stays the null it starts as
    const expected = isReact18 ? null : partsNamed('plain')[0]
    expect(ref.current).toBe(expected)
  })
})
