import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement, forwardRef, memo, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { wrapPart } from '../../src/part.ts'
import { filesUnder, SRC_DIR } from '../support/dist.ts'
import { marked, partsNamed } from '../support/dom.ts'
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
Which styled parts this Base UI renders at all (a part younger than the floor does not), by the
subpath whose scene holds them.
 */
const renderedStyledParts = async (): Promise<Map<string, string[]>> => {
  const bySubpath = new Map<string, string[]>()
  for (const subpath of SUBPATHS) {
    await render(scenes[subpath]?.render(bare, { props: openProps() }) as never)
    const present = new Set(marked().map(({ part }) => part))
    bySubpath.set(
      subpath,
      tableP
        .keys()
        .filter((part) => present.has(part) && subpathOf(part) === subpath)
        .toArray(),
    )
  }
  return bySubpath
}

interface Form {
  readonly label: string
  /**
  The props for a part, and what its class must read: the part's own classes, then the rest.
   */
  readonly props: (part: string, received: Map<string, unknown>) => Props
  readonly suffix: (own: string, received: unknown) => string
  readonly tag?: string
}

const stateName = (state: unknown): string =>
  `mine-${(state as { open?: boolean }).open ? 'open' : 'x'}`

const FORMS: readonly Form[] = [
  { label: 'no className', props: () => ({}), suffix: (own) => own },
  { label: 'className=""', props: () => ({ className: '' }), suffix: (own) => own },
  {
    label: 'className="mine"',
    props: () => ({ className: 'mine' }),
    suffix: (own) => `${own} mine`,
  },
  {
    label: 'a function of state',
    props: (part, received) => ({
      className: (state: unknown) => {
        received.set(part, state)
        return stateName(state)
      },
    }),
    suffix: (own, state) => `${own} ${stateName(state)}`,
  },
  {
    label: 'a function returning undefined',
    props: () => ({ className: () => {} }),
    suffix: (own) => own,
  },
  {
    label: 'render as an element',
    props: () => ({ render: createElement('section', { className: 'r' }) }),
    suffix: (own) => `r ${own}`,
    tag: 'SECTION',
  },
  {
    label: 'render as a function',
    props: () => ({ render: (props: Props): ReactElement => createElement('section', props) }),
    suffix: (own) => own,
    tag: 'SECTION',
  },
]

/**
 * Renders a subpath's scene with every styled part given the form's props, and reports each part
 * whose class or element is not what the form promises.
 */
const problemsOf = async (
  subpath: string,
  parts: readonly string[],
  form: Form,
): Promise<string[]> => {
  const received = new Map<string, unknown>()
  const props = Object.fromEntries(parts.map((part) => [part, form.props(part, received)]))
  await render(scenes[subpath]?.render(nave, { props: { ...openProps(), ...props } }) as never)
  return parts.flatMap((part) => {
    const element = partsNamed(part)[0]
    const own = (tableP.get(part) ?? []).join(' ')
    const expected = form.suffix(own, received.get(part))
    if (element === undefined) {
      return [`${part} (${form.label}) did not render`]
    }
    if (element.className.trim() !== expected) {
      return [`${part} (${form.label}): "${element.className}", expected "${expected}"`]
    }
    return form.tag !== undefined && element.tagName !== form.tag
      ? [`${part} (${form.label}): <${element.tagName}>`]
      : []
  })
}

describe('AC-base-ui-bridge-10: className composes in both forms, and render hasItem the class', () => {
  it('composes for every styled part in every form', async () => {
    const problems: string[] = []
    const styledParts = await renderedStyledParts()
    for (const [subpath, parts] of styledParts) {
      for (const form of FORMS) {
        problems.push(...(await problemsOf(subpath, parts, form)))
      }
    }
    expect(problems).toEqual([])
  })

  it("hands a className function the part's state", async () => {
    const received = new Map<string, unknown>()
    const form = FORMS.find((candidate) => candidate.label === 'a function of state')!
    await render(
      scenes.dialog?.render(nave, {
        props: { ...openProps(), 'Dialog.Popup': form.props('Dialog.Popup', received) },
      }) as never,
    )
    expect(received.get('Dialog.Popup')).toBeTypeOf('object')
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
