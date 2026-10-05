import { afterEach, describe, expect, it } from 'vitest'

import type { ElementRecord } from '../support/dom.ts'
import type { Props } from '../support/scenes.ts'

import { describeDocument, marked, parityViolations, partsNamed } from '../support/dom.ts'
import { act, cleanup, render, user } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { isOverlay, openProps } from '../support/states.ts'
import { SUBPATHS, topName } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'

const bare = await loadBare()
const nave = await loadNave()

afterEach(cleanup)

const VARIANT_PARTS = [
  'Button',
  'Toolbar.Button',
  'Dialog.Trigger',
  'Dialog.Close',
  'Popover.Trigger',
  'Popover.Close',
  'Menu.Trigger',
  'Tooltip.Trigger',
]

const HIGHLIGHT_ATTRIBUTE = '[data-highlighted]'

const VARIANT_PROPS: Record<string, Props> = {
  ...Object.fromEntries(
    VARIANT_PARTS.map((part) => [part, { size: 'sm', variant: 'primary' }] as const),
  ),
  Toggle: { size: 'sm' },
}

const TRANSITION_ATTRIBUTES = ['data-starting-style', 'data-ending-style']

const settle = (milliseconds: number): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  })

const isInTransition = (): boolean =>
  document.querySelector(TRANSITION_ATTRIBUTES.map((name) => `[${name}]`).join(',')) !== null

const serialized = (records: readonly ElementRecord[]): string =>
  JSON.stringify(records.map(({ attributes, tag }) => [tag, [...attributes]]))

/**
 * The document once it is at rest: no element is mid-transition, and two reads a moment apart
 * agree. Base UI marks an opening part with `data-starting-style` (and a transient
 * `transition: none`) for a frame or two, and which side of that a read lands on depends on how
 * busy the machine is, so a comparison of two documents is made between documents at rest.
 */
const describeAtRest = async (): Promise<ElementRecord[]> => {
  let previous = ''
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const records = describeDocument()
    const current = serialized(records)
    if (current === previous && !isInTransition()) {
      return records
    }
    previous = current
    await settle(25)
  }
  throw new Error('the document never came to rest')
}

const VARIANT_PART_NAMES: ReadonlySet<string> = new Set(Object.keys(VARIANT_PROPS))

describe("AC-base-ui-bridge-12: a wrapper renders exactly the bare part's DOM, plus its class and data-nave-*", () => {
  for (const subpath of SUBPATHS) {
    const states: { label: string; props: Record<string, Props> }[] = isOverlay(subpath)
      ? [
          { label: 'closed', props: {} },
          { label: 'open', props: openProps() },
        ]
      : [{ label: 'rendered', props: {} }]
    for (const { label, props } of states) {
      for (const isVariants of [false, true]) {
        it(`${subpath}, ${label}${isVariants ? ', with variant and size' : ''}`, async () => {
          const scene = scenes[subpath]
          if (scene === undefined) {
            throw new Error(`no scene for ${subpath}`)
          }
          await render(scene.render(bare, { props }))
          const expected = await describeAtRest()
          await render(
            scene.render(nave, { props: { ...props, ...(isVariants && VARIANT_PROPS) } }),
          )
          expect(parityViolations(expected, await describeAtRest())).toEqual([])
        })
      }
    }
  }

  it('gives a data-nave-* attribute to no part but the ones AC-14 names', async () => {
    const offenders: string[] = []
    for (const subpath of SUBPATHS) {
      await render(
        scenes[subpath]?.render(nave, { props: { ...openProps(), ...VARIANT_PROPS } }) as never,
      )
      for (const { element, part } of marked()) {
        const names = element
          .getAttributeNames()
          .filter((name) => name.startsWith('data-nave-'))
          .join(' ')
        if (names !== '' && !VARIANT_PART_NAMES.has(part)) {
          offenders.push(`${part}: ${names}`)
        }
      }
      await cleanup()
    }
    expect(offenders).toEqual([])
  })

  it('control: a document still in a starting style is read only once it has rested', async () => {
    await render(scenes.button?.render(bare) as never)
    const button = document.querySelector('button')
    button?.setAttribute('data-starting-style', '')
    setTimeout(() => button?.removeAttribute('data-starting-style'), 100)
    const records = await describeAtRest()
    expect(records.some(({ attributes }) => attributes.has('data-starting-style'))).toBe(false)
  })

  it('control: a part that gains an aria-label is reported, naming its element', async () => {
    const scene = scenes.button
    if (scene === undefined) {
      throw new Error('no scene for button')
    }
    await render(scene.render(bare))
    const expected = describeDocument()
    await render(scene.render(nave))
    const wrapped = describeDocument()
    const at = wrapped.findIndex((record) => record.tag === 'button')
    const tampered = wrapped.map((record, index) =>
      index === at
        ? { ...record, attributes: new Map([...record.attributes, ['aria-label', 'x']]) }
        : record,
    )
    expect(parityViolations(expected, tampered)).toEqual([
      `element ${at} <button> aria-label: x, the bare render has absent`,
    ])
  })
})

/**
 * What each state change leaves alone: the class and `data-nave-*` of every marked element,
 * keyed by marker and by which of its occurrences the element is.
 */
const ownAttributes = (): Map<string, string> => {
  const seen = new Map<string, number>()
  return new Map(
    marked().map(({ element, part }) => {
      const index = seen.get(part) ?? 0
      seen.set(part, index + 1)
      const dataNave = [...element.attributes]
        .filter(({ name }) => name.startsWith('data-nave-'))
        .map(({ name, value }) => `${name}=${value}`)
        .join(' ')
      return [`${part}#${index}`, `${element.getAttribute('class') ?? ''} | ${dataNave}`] as const
    }),
  )
}

/**
 * The states each component is driven through, as props by marker, and which part a click on
 * flips (expanded, pressed, checked, selected).
 */
const STATES: Readonly<
  Record<string, { clicks?: readonly string[]; configs: readonly Record<string, Props>[] }>
> = {
  accordion: { clicks: ['Accordion.Trigger'], configs: [{}] },
  button: { configs: [{}, { Button: { disabled: true } }] },
  'checkbox-group': { configs: [{}, { CheckboxGroup: { disabled: true } }] },
  checkbox: {
    clicks: ['Checkbox.Root'],
    configs: [
      {},
      { 'Checkbox.Root': { disabled: true } },
      { 'Checkbox.Root': { indeterminate: true } },
    ],
  },
  collapsible: { clicks: ['Collapsible.Trigger'], configs: [{}] },
  field: { configs: [{}, { 'Field.Root': { disabled: true, invalid: false } }] },
  fieldset: { configs: [{}, { 'Fieldset.Root': { disabled: true } }] },
  input: { configs: [{}, { Input: { disabled: true } }] },
  'number-field': { configs: [{}, { 'NumberField.Root': { disabled: true } }] },
  'radio-group': { configs: [{}, { RadioGroup: { disabled: true } }] },
  radio: { clicks: ['Radio.Root'], configs: [{}] },
  slider: { configs: [{}, { 'Slider.Root': { orientation: 'vertical' } }] },
  switch: { clicks: ['Switch.Root'], configs: [{}, { 'Switch.Root': { disabled: true } }] },
  tabs: { clicks: ['Tabs.Tab'], configs: [{}, { 'Tabs.Root': { orientation: 'vertical' } }] },
  toggle: { clicks: ['Toggle'], configs: [{}, { Toggle: { disabled: true } }] },
  'toggle-group': { configs: [{}, { ToggleGroup: { orientation: 'vertical' } }] },
  toolbar: { configs: [{}, { 'Toolbar.Root': { disabled: true, orientation: 'vertical' } }] },
}

type Scene = NonNullable<(typeof scenes)[string]>

/**
 * The marked elements the highlight is on, keyed as `ownAttributes` keys them.
 */
const highlighted = (): string[] => {
  const seen = new Map<string, number>()
  return marked().flatMap(({ element, part }) => {
    const index = seen.get(part) ?? 0
    seen.set(part, index + 1)
    return element.matches(HIGHLIGHT_ATTRIBUTE) ? [`${part}#${index}`] : []
  })
}

const styledPartsOf = (subpath: string): string[] =>
  tableP
    .keys()
    .filter((part) => part === topName(subpath) || part.startsWith(`${topName(subpath)}.`))
    .toArray()

const mergeProps = (
  consumer: Record<string, Props>,
  config: Record<string, Props>,
): Record<string, Props> =>
  Object.fromEntries(
    new Set([...Object.keys(consumer), ...Object.keys(config)])
      .values()
      .map((part) => [part, { ...consumer[part], ...config[part] }] as const),
  )

/**
 * The own attributes after each click on the parts a click flips, for the component that is
 * currently rendered.
 */
const clickedSnapshots = async (subpath: string): Promise<Map<string, string>[]> => {
  const snapshots: Map<string, string>[] = []
  const clicks = STATES[subpath]?.clicks ?? []
  for (const part of clicks) {
    const [target] = partsNamed(part)
    if (target !== undefined) {
      await user().click(target)
      snapshots.push(ownAttributes())
    }
  }
  return snapshots
}

const snapshotsAcross = async (
  scene: Scene,
  subpath: string,
  consumer: Record<string, Props>,
  configs: readonly Record<string, Props>[],
): Promise<Map<string, string>[]> => {
  const snapshots: Map<string, string>[] = []
  for (const config of configs) {
    await render(scene.render(nave, { props: mergeProps(consumer, config) }))
    snapshots.push(ownAttributes())
    const clicked = await clickedSnapshots(subpath)
    snapshots.push(...clicked)
  }
  return snapshots
}

describe("AC-base-ui-bridge-37: Nave's contribution is chosen by the consumer's props, never by state", () => {
  for (const subpath of SUBPATHS) {
    it(`${subpath}: the class and data-nave-* are identical in every state`, async () => {
      const scene = scenes[subpath]
      if (scene === undefined) {
        throw new Error(`no scene for ${subpath}`)
      }
      const styled = styledPartsOf(subpath)
      const consumer = Object.fromEntries(styled.map((part) => [part, { className: 'consumer' }]))
      const configs = isOverlay(subpath) ? [{}, openProps()] : (STATES[subpath]?.configs ?? [{}])
      const snapshots = await snapshotsAcross(scene, subpath, consumer, configs)
      const [first, ...rest] = snapshots
      const differing = rest.flatMap((snapshot) =>
        [...snapshot]
          .filter(([key, value]) => first?.has(key) === true && first.get(key) !== value)
          .map(([key]) => key),
      )
      // A component with no styled part has nothing a state could change.
      expect(snapshots.length > 1 || styled.length === 0).toBe(true)
      expect(differing).toEqual([])
    })
  }

  describe.each([
    ['menu', 'Menu.Item'],
    ['select', 'Select.Item'],
  ] as const)('%s: moving the highlight', (subpath, item) => {
    it(`leaves the class and data-nave-* of every part alone`, async () => {
      const scene = scenes[subpath]
      if (scene === undefined) {
        throw new Error(`no scene for ${subpath}`)
      }
      const consumer = Object.fromEntries(
        styledPartsOf(subpath).map((part) => [part, { className: 'consumer' }]),
      )
      const props = mergeProps(consumer, openProps())
      await render(scene.render(nave, { props }))
      await settle(100)
      const [before, highlightedBefore] = [ownAttributes(), highlighted()]
      await user().hover(partsNamed(item).at(-1)!)
      await settle(100)
      // The control: the highlight did move, so the comparison below is between two states.
      expect(highlighted()).not.toEqual(highlightedBefore)
      expect([...ownAttributes()]).toEqual([...before])
    })
  })

  it('changes only when variant, size or className change', async () => {
    const scene = scenes.button
    if (scene === undefined) {
      throw new Error('no scene for button')
    }
    const attributes = async (props: Props): Promise<string> => {
      await render(scene.render(nave, { props: { Button: props } }))
      return ownAttributes().get('Button#0') ?? ''
    }
    const rest = await attributes({})
    expect(await attributes({ variant: 'primary' })).not.toBe(rest)
    expect(await attributes({ size: 'sm' })).not.toBe(rest)
    expect(await attributes({ className: 'mine' })).not.toBe(rest)
  })
})
