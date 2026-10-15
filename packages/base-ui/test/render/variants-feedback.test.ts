import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { marked, partsNamed } from '../support/dom.ts'
import { fullProps, settle, underSetups } from '../support/feedback-render.ts'
import { FEEDBACK_SUBPATHS, feedbackNave } from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { tableP } from '../support/table-p.ts'

afterEach(cleanup)

const renderIn = async (subpath: string, props: Record<string, Props> = {}): Promise<void> => {
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  await render(scene.render(await feedbackNave(), { props: { ...fullProps(), ...props } }))
}

const naveAttributes = (element: Element): Record<string, string> =>
  Object.fromEntries(
    [...element.attributes]
      .filter(({ name }) => name.startsWith('data-nave-'))
      .map(({ name, value }) => [name, value]),
  )

interface Case {
  readonly expected: Record<string, string>
  readonly label: string
  readonly props: Props
}

const BUTTON_CASES: readonly Case[] = [
  { expected: {}, label: 'no props', props: {} },
  {
    expected: { 'data-nave-variant': 'primary' },
    label: 'variant="primary"',
    props: { variant: 'primary' },
  },
  {
    expected: { 'data-nave-variant': 'ghost' },
    label: 'variant="ghost"',
    props: { variant: 'ghost' },
  },
  { expected: { 'data-nave-size': 'sm' }, label: 'size="sm"', props: { size: 'sm' } },
  {
    expected: {},
    label: 'variant="secondary" size="md"',
    props: { size: 'md', variant: 'secondary' },
  },
]

const AVATAR_CASES: readonly Case[] = [
  { expected: {}, label: 'no props', props: {} },
  { expected: { 'data-nave-size': 'sm' }, label: 'size="sm"', props: { size: 'sm' } },
  { expected: {}, label: 'size="md"', props: { size: 'md' } },
  { expected: { 'data-nave-size': 'lg' }, label: 'size="lg"', props: { size: 'lg' } },
  // From untyped JavaScript: a size the stylesheet does not key renders no attribute.
  { expected: {}, label: 'size="xl" (untyped)', props: { size: 'xl' } },
]

describe("AC-base-ui-feedback-navigation-04: data-nave-* only off the default, for the Button family's new parts and for Avatar.Root", () => {
  for (const part of ['Toast.Action', 'Toast.Close']) {
    for (const { expected, label, props } of BUTTON_CASES) {
      it(`${part} with ${label}`, async () => {
        await renderIn('toast', { [part]: props })
        const elements = partsNamed(part)
        expect(elements.length, `${part} rendered`).toBeGreaterThan(0)
        for (const element of elements) {
          expect(naveAttributes(element)).toEqual(expected)
          expect(element.hasAttribute('variant')).toBe(false)
          expect(element.hasAttribute('size')).toBe(false)
        }
      })
    }
  }

  for (const { expected, label, props } of AVATAR_CASES) {
    it(`Avatar.Root with ${label}`, async () => {
      await renderIn('avatar', { 'Avatar.Root': props })
      const [root, ...rest] = partsNamed('Avatar.Root')
      expect(root, 'Avatar.Root rendered').toBeDefined()
      expect(rest).toEqual([])
      expect(root === undefined ? {} : naveAttributes(root)).toEqual(expected)
      expect(root?.hasAttribute('variant')).toBe(false)
      expect(root?.hasAttribute('size')).toBe(false)
    })
  }
})

/**
 * Every part of the seven outside the Button family and `Avatar.Root`: none takes `variant` or
 * `size`, so the scenes give none, and none carries a `data-nave-*` attribute or the button class.
 */
const OUTSIDE = [
  'NavigationMenu.Trigger',
  'NavigationMenu.Link',
  'NavigationMenu.Icon',
  'Toast.Root',
  'Avatar.Image',
  'Avatar.Fallback',
  'ScrollArea.Root',
  'ScrollArea.Viewport',
  'ScrollArea.Content',
  'ScrollArea.Scrollbar',
  'ScrollArea.Thumb',
  'ScrollArea.Corner',
  'Meter.Root',
  'Meter.Label',
  'Meter.Value',
  'Meter.Track',
  'Meter.Indicator',
  'Progress.Root',
  'Progress.Label',
  'Progress.Value',
  'Progress.Track',
  'Progress.Indicator',
  'Separator',
]

/**
The rendered parts the second scenario names.
 */
const outsideParts = (): ReturnType<typeof marked> =>
  marked().filter(({ part }) => OUTSIDE.includes(part))

describe('AC-base-ui-feedback-navigation-04: the other new parts are outside the Button family', () => {
  it('carries no data-nave-* attribute and not the button class, and the trigger only its own class', async () => {
    const rendered = new Set<string>()
    const triggerClasses: string[][] = []
    for (const subpath of FEEDBACK_SUBPATHS) {
      await underSetups(subpath, async () => {
        await renderIn(subpath)
        await settle(10)
        for (const { element, part } of outsideParts()) {
          rendered.add(part)
          expect(naveAttributes(element), part).toEqual({})
          expect(element.classList.contains('nave-base-ui-button'), part).toBe(false)
          triggerClasses.push(
            ...(part === 'NavigationMenu.Trigger'
              ? [element.className.split(/\s+/).filter((name) => name.startsWith('nave-'))]
              : []),
          )
        }
      })
    }
    // The trigger carries its own class and no other Nave class.
    expect(triggerClasses).toEqual([['nave-base-ui-navigation-menu-trigger']])
    // Every part the criterion names was looked at.
    expect(OUTSIDE.filter((part) => !rendered.has(part))).toEqual([])
  })

  it('carries none of them when given the props the Button family takes, outside it', async () => {
    for (const subpath of FEEDBACK_SUBPATHS) {
      const given = Object.fromEntries(
        OUTSIDE.map((part) => [part, { size: 'sm', variant: 'primary' }] as const),
      )
      await renderIn(subpath, given)
      for (const { element, part } of outsideParts()) {
        expect(naveAttributes(element), part).toEqual({})
      }
    }
  })

  it('control: Toast.Close in the same render carries the button class', async () => {
    await renderIn('toast')
    const [close] = partsNamed('Toast.Close')
    expect(close?.classList.contains('nave-base-ui-button')).toBe(true)
    expect(tableP.get('Toast.Close')).toEqual(['nave-base-ui-button'])
  })
})

describe('AC-base-ui-feedback-navigation-07: data-nave-size takes sm and lg on -avatar only among the seven', () => {
  it('appears with sm on Toast.Action, Toast.Close and Avatar.Root, and with lg on Avatar.Root alone', async () => {
    const carriers = new Map<string, Set<string>>()
    for (const [subpath, props] of [
      ['toast', { 'Toast.Action': { size: 'sm' }, 'Toast.Close': { size: 'sm' } }],
      ['avatar', { 'Avatar.Root': { size: 'sm' } }],
    ] as const) {
      await renderIn(subpath, props)
      for (const { element, part } of marked()) {
        const size = element.dataset.naveSize
        if (size !== undefined) {
          carriers.set(size, (carriers.get(size) ?? new Set()).add(part))
        }
      }
    }
    expect(carriers.get('sm')).toEqual(new Set(['Avatar.Root', 'Toast.Action', 'Toast.Close']))
    await renderIn('avatar', { 'Avatar.Root': { size: 'lg' } })
    const large = marked().filter(({ element }) => element.dataset.naveSize === 'lg')
    expect(large.map(({ part }) => part)).toEqual(['Avatar.Root'])
    // The Button family's own `lg` stays deferred: it renders no attribute.
    await renderIn('toast', { 'Toast.Action': { size: 'lg' }, 'Toast.Close': { size: 'lg' } })
    expect(marked().filter(({ element }) => element.dataset.naveSize === 'lg')).toEqual([])
  })
})
