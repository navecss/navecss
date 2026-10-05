import { afterEach, describe, expect, it } from 'vitest'

import type { Props } from '../support/scenes.ts'

import { describeDocument, marked, parityViolations, partsNamed } from '../support/dom.ts'
import { cleanup, render, user } from '../support/react.ts'
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

const VARIANT_PROPS: Record<string, Props> = {
  ...Object.fromEntries(
    VARIANT_PARTS.map((part) => [part, { size: 'sm', variant: 'primary' }] as const),
  ),
  Toggle: { size: 'sm' },
}

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
          const expected = describeDocument()
          await render(
            scene.render(nave, { props: { ...props, ...(isVariants && VARIANT_PROPS) } }),
          )
          expect(parityViolations(expected, describeDocument())).toEqual([])
        })
      }
    }
  }

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
