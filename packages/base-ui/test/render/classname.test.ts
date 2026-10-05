import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement, forwardRef, memo, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { wrapPart } from '../../src/part.ts'
import { filesUnder, SRC_DIR } from '../support/dist.ts'
import { partsNamed } from '../support/dom.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'
import { SUBPATHS } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'

const bare = await loadBare()
const nave = await loadNave()

afterEach(cleanup)

const subpathOf = (part: string): string | undefined => {
  const top = part.split('.', 1)[0] ?? ''
  return SUBPATHS.find((subpath) => subpath.replaceAll('-', '').toLowerCase() === top.toLowerCase())
}

/**
 * The element a styled part renders, given the props the consumer passed it.
 */
const elementWith = async (part: string, props: Props): Promise<HTMLElement | undefined> => {
  const subpath = subpathOf(part)
  const scene = subpath === undefined ? undefined : scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${part}`)
  }
  await render(scene.render(nave, { props: { ...openProps(), [part]: props } }))
  return partsNamed(part)[0]
}

/**
Which styled parts this Base UI renders at all (a part younger than the floor does not).
 */
const renderedStyledParts = async (): Promise<string[]> => {
  const present: string[] = []
  for (const part of tableP.keys()) {
    const subpath = subpathOf(part)
    const scene = subpath === undefined ? undefined : scenes[subpath]
    if (scene !== undefined) {
      await render(scene.render(bare, { props: openProps() }))
      if (partsNamed(part).length > 0) {
        present.push(part)
      }
    }
  }
  return present
}

describe('AC-base-ui-bridge-10: className composes in both forms, and render hasItem the class', () => {
  it('composes for every styled part in every form', async () => {
    const problems: string[] = []
    const parts = await renderedStyledParts()
    for (const part of parts) {
      const own = (tableP.get(part) ?? []).join(' ')
      let received: unknown
      const forms: {
        expected: (el: HTMLElement) => string
        label: string
        props: Props
        tag?: string
      }[] = [
        { expected: () => own, label: 'no className', props: {} },
        { expected: () => own, label: 'className=""', props: { className: '' } },
        { expected: () => `${own} mine`, label: 'className="mine"', props: { className: 'mine' } },
        {
          expected: () => {
            const state = received as { open?: boolean } | undefined
            return `${own} mine-${state?.open ? 'open' : 'x'}`
          },
          label: 'a function of state',
          props: {
            className: (state: unknown) => {
              received = state
              return `mine-${(state as { open?: boolean }).open ? 'open' : 'x'}`
            },
          },
        },
        {
          expected: () => own,
          label: 'a function returning undefined',
          props: { className: () => {} },
        },
        {
          expected: () => `r ${own}`,
          label: 'render as an element',
          props: { render: createElement('section', { className: 'r' }) },
          tag: 'SECTION',
        },
        {
          expected: () => own,
          label: 'render as a function',
          props: { render: (props: Props): ReactElement => createElement('section', props) },
          tag: 'SECTION',
        },
      ]
      for (const form of forms) {
        const element = await elementWith(part, form.props)
        if (element === undefined) {
          problems.push(`${part} (${form.label}) did not render`)
        } else if (element.className.trim() !== form.expected(element)) {
          problems.push(
            `${part} (${form.label}): "${element.className}", expected "${form.expected(element)}"`,
          )
        } else if (form.tag !== undefined && element.tagName !== form.tag) {
          problems.push(`${part} (${form.label}): <${element.tagName}>`)
        }
      }
      if (typeof received !== 'object' || received === null) {
        problems.push(`${part}: the className function did not receive the part's state`)
      }
    }
    expect(problems).toEqual([])
  })
})

type Wrap = (part: never, className: string) => unknown

const consumer = (): string => 'mine'

// A wrapper that composes a new className function on every render.
const naive: Wrap = (part, className) =>
  forwardRef<unknown, { className?: unknown }>((props, ref) =>
    createElement(part, {
      ...props,
      className:
        typeof props.className === 'function'
          ? (state: unknown) => `${className} ${(props.className as (s: unknown) => string)(state)}`
          : className,
      ref,
    }),
  )

/**
 * Re-renders a parent twice with the same consumer function and once with a new one, around a
 * `React.memo` double that counts its renders and records the className it is given.
 */
const isMemoizedBy = async (wrap: Wrap): Promise<boolean> => {
  const classNames: unknown[] = []
  let count = 0
  const Double = memo(
    forwardRef<HTMLDivElement, { className?: unknown }>((props, ref) => {
      count += 1
      classNames.push(props.className)
      return createElement('div', { ref })
    }),
  )
  const Wrapped = wrap(Double as never, 'nave-x') as never
  const element = (fn: () => string): ReactElement => createElement(Wrapped, { className: fn })
  const mounted = await render(element(consumer))
  await mounted.rerender(element(consumer))
  await mounted.rerender(element(consumer))
  const isSameWhileUnchanged = count === 1 && Object.is(classNames[0], classNames.at(-1))
  await mounted.rerender(element(() => 'other'))
  const isNewAfterChange = count === 2 && !Object.is(classNames[0], classNames.at(-1))
  return isSameWhileUnchanged && isNewAfterChange
}

describe('AC-base-ui-bridge-11: the composed className function is memoized on the consumer function', () => {
  it('hands the part the same function until the consumer function changes', async () => {
    expect(await isMemoizedBy(wrapPart as Wrap)).toBe(true)
  })

  it('control: a wrapper that composes a new function on every render is reported', async () => {
    expect(await isMemoizedBy(naive)).toBe(false)
  })

  it('builds every part module with the shared helper: no module but the helper makes a component', () => {
    const modules = filesUnder(SRC_DIR, ['.ts', '.tsx']).filter((file) => file !== 'part.ts')
    expect(
      modules.filter((file) =>
        /\b(?:forwardRef|createElement)\b/.test(readFileSync(path.join(SRC_DIR, file), 'utf8')),
      ),
    ).toEqual([])
  })
})
