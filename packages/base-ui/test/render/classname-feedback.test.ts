import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { fullProps, PASS_THROUGHS, settle, underSetups } from '../support/feedback-render.ts'
import {
  FEEDBACK_SINGLE_COMPONENT,
  FEEDBACK_SUBPATHS,
  feedbackNave,
  KEY_SETS,
  qualified,
} from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { topName } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'

afterEach(cleanup)

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
 * The class Base UI adds to a part itself, after the ones composed from `className` (it hides the
 * native scrollbar of the Scroll Area's viewport with it).
 */
const BASE_UI_CLASSES: Readonly<Record<string, string>> = {
  'ScrollArea.Viewport': 'base-ui-disable-scrollbar',
}

/**
 * The styled parts of a subpath, as the scenes mark them.
 */
const styledOf = (subpath: (typeof FEEDBACK_SUBPATHS)[number]): string[] =>
  subpath === FEEDBACK_SINGLE_COMPONENT
    ? [topName(subpath)]
    : KEY_SETS[subpath].styled.map((key) => qualified(subpath, key))

/**
 * Renders a subpath's scene with every given part carrying the form's props, and reports each
 * part whose class or element is not what the form promises. `classes` gives a part's own classes.
 */
const problemsOf = async (
  subpath: (typeof FEEDBACK_SUBPATHS)[number],
  parts: readonly string[],
  form: Form,
  classes: (part: string) => string,
): Promise<string[]> => {
  const received = new Map<string, unknown>()
  const props = Object.fromEntries(parts.map((part) => [part, form.props(part, received)]))
  const nave = await feedbackNave()
  const found: string[] = []
  await underSetups(subpath, async () => {
    await render(scenes[subpath]?.render(nave, { props: { ...fullProps(), ...props } }) as never)
    await settle(10)
    for (const part of parts) {
      const element = partsNamed(part)[0]
      if (element === undefined) {
        // The Scroll Area's corner and the Avatar's image show under one setup only.
        continue
      }
      const expected = [form.suffix(classes(part), received.get(part)), BASE_UI_CLASSES[part]]
        .filter((name) => name !== undefined && name !== '')
        .join(' ')
      if (element.className.trim() !== expected.trim()) {
        found.push(`${part} (${form.label}): "${element.className}", expected "${expected}"`)
      } else if (form.tag !== undefined && element.tagName !== form.tag) {
        found.push(`${part} (${form.label}): <${element.tagName}>`)
      }
    }
  })
  return found
}

describe('AC-base-ui-feedback-navigation-46 (AC-10): className composes in both forms, and render carries the class, on the seven', () => {
  it('composes for every styled part in every form', async () => {
    const problems: string[] = []
    for (const subpath of FEEDBACK_SUBPATHS) {
      for (const form of FORMS) {
        problems.push(
          ...(await problemsOf(subpath, styledOf(subpath), form, (part) =>
            (tableP.get(part) ?? []).join(' '),
          )),
        )
      }
    }
    expect(problems).toEqual([])
  })

  it('looks at every styled part of the seven: each renders under some setup', async () => {
    const nave = await feedbackNave()
    const seen = new Set<string>()
    for (const subpath of FEEDBACK_SUBPATHS) {
      await underSetups(subpath, async () => {
        await render(scenes[subpath]?.render(nave, { props: fullProps() }) as never)
        await settle(10)
        for (const part of styledOf(subpath)) {
          if (partsNamed(part).length > 0) {
            seen.add(part)
          }
        }
      })
    }
    expect(
      FEEDBACK_SUBPATHS.flatMap((subpath) => styledOf(subpath)).filter((part) => !seen.has(part)),
    ).toEqual([])
  })

  it('passes className and render through on the unstyled parts, in every form, adding no class', async () => {
    const problems: string[] = []
    for (const subpath of FEEDBACK_SUBPATHS) {
      const parts = PASS_THROUGHS[subpath] ?? []
      for (const form of FORMS) {
        problems.push(...(await problemsOf(subpath, parts, form, () => '')))
      }
    }
    expect(problems).toEqual([])
  })

  it("hands a className function the part's state: the Navigation Menu's popup reads it", async () => {
    const received = new Map<string, unknown>()
    const form = FORMS.find((candidate) => candidate.label === 'a function of state')!
    const nave = await feedbackNave()
    await render(
      scenes['navigation-menu']?.render(nave, {
        props: {
          'NavigationMenu.Popup': form.props('NavigationMenu.Popup', received),
          'NavigationMenu.Root': { defaultValue: 'a' },
        },
      }) as never,
    )
    await settle(30)
    expect(received.get('NavigationMenu.Popup')).toBeTypeOf('object')
    expect(partsNamed('NavigationMenu.Popup')[0]?.className).toBe(
      `${(tableP.get('NavigationMenu.Popup') ?? []).join(' ')} ${stateName(received.get('NavigationMenu.Popup'))}`,
    )
  })
})
