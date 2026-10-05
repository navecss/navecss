/**
 * One scene per v1 component: a tree that renders every part of the component's namespace that
 * renders an element, with each part carrying `data-part="<Namespace>.<Part>"` so a test finds it
 * without a class (the bare Base UI part and the wrapped part get the identical props, so the
 * marker never shows up in a comparison). A scene takes a source, a function from a subpath to
 * that component's export (`Menu`, or `Button` itself), from either Base UI or the wrapper, so the
 * same tree renders bare and through the wrapper, and a group component's children come from the
 * same source as the group.
 *
 * A part the installed Base UI does not have (a part younger than the floor) renders as nothing
 * around its children, which is how a scene runs at the floor.
 */
import { createElement, type ElementType, Fragment, type ReactElement, type ReactNode } from 'react'

import { topName } from './subpaths.ts'

export type Props = Record<string, unknown>

/**
The component's export: a namespace of parts, or the component itself.
 */
export type Ui = Record<string, unknown>

/**
Where a scene gets components from: `source('menu')` is `Menu`.
 */
export type Source = (subpath: string) => Ui

export interface SceneConfig {
  /**
  Extra props by part, keyed as the `data-part` marker is (`Menu.Item`, `Button`).
   */
  readonly props?: Readonly<Record<string, Props>>
}

export interface Scene {
  readonly render: (source: Source, config?: SceneConfig) => ReactElement
  readonly subpath: string
}

type Make = (part: string, props?: Props, ...children: ReactNode[]) => ReactNode
type Other = (subpath: string) => Make

const maker =
  (ui: Ui, namespace: string, config: SceneConfig): Make =>
  (part, props = {}, ...children) => {
    const type = part === '.' ? ui : ui[part]
    if (type === undefined) {
      return createElement(Fragment, null, ...children)
    }
    const marker = part === '.' ? namespace : `${namespace}.${part}`
    const extra = config.props?.[marker]
    // A config can replace a part's children, for a test about what a part is given to hold.
    const content = extra?.children === undefined ? children : [extra.children as ReactNode]
    return createElement(
      type as never,
      { 'data-part': marker, ...props, ...extra, children: undefined } as never,
      ...content,
    )
  }

const scene = (subpath: string, build: (h: Make, other: Other) => ReactNode): Scene => ({
  render: (source, config = {}) => {
    const other: Other = (name) => maker(source(name), topName(name), config)
    return build(other(subpath), other) as ReactElement
  },
  subpath,
})

const menuContent = (h: Make): ReactNode[] => [
  h('Arrow'),
  h(
    'Viewport',
    {},
    h('Item', {}, 'Item'),
    h('LinkItem', { href: '#' }, 'Link'),
    h('CheckboxItem', { defaultChecked: true }, h('CheckboxItemIndicator', {}, 'x'), 'Check'),
    h(
      'RadioGroup',
      { defaultValue: 'a' },
      h('RadioItem', { value: 'a' }, h('RadioItemIndicator', {}, 'o'), 'Radio'),
    ),
    h('Group', {}, h('GroupLabel', {}, 'Group'), h('Item', {}, 'Grouped')),
    h('Separator'),
    h(
      'SubmenuRoot',
      {},
      h('SubmenuTrigger', {}, 'More'),
      h('Portal', {}, h('Positioner', {}, h('Popup', {}, h('Item', {}, 'Nested')))),
    ),
  ),
]

const selectContent = (h: Make): ReactNode[] => [
  h('ScrollUpArrow'),
  h('Arrow'),
  h(
    'List',
    {},
    h(
      'Group',
      {},
      h('GroupLabel', {}, 'Group'),
      h('Item', { value: 'a' }, h('ItemText', {}, 'A'), h('ItemIndicator', {}, 'x')),
      h('Item', { value: 'b' }, h('ItemText', {}, 'B'), h('ItemIndicator', {}, 'x')),
    ),
    h('Separator'),
  ),
  h('ScrollDownArrow'),
]

const dialogScene = scene('dialog', (h) =>
  h(
    'Root',
    {},
    h('Trigger', {}, 'Open'),
    h(
      'Portal',
      {},
      h('Backdrop'),
      h(
        'Viewport',
        {},
        h(
          'Popup',
          {},
          h('Title', {}, 'Title'),
          h('Description', {}, 'Description'),
          h('Close', {}, 'Close'),
        ),
      ),
    ),
  ),
)

const popoverScene = scene('popover', (h) =>
  h(
    'Root',
    {},
    h('Trigger', {}, 'Open'),
    h(
      'Portal',
      {},
      h('Backdrop'),
      h(
        'Positioner',
        {},
        h(
          'Popup',
          {},
          h('Arrow'),
          h(
            'Viewport',
            {},
            h('Title', {}, 'Title'),
            h('Description', {}, 'Description'),
            h('Close', {}, 'Close'),
          ),
        ),
      ),
    ),
  ),
)

const menuScene = scene('menu', (h) =>
  h(
    'Root',
    {},
    h('Trigger', {}, 'Open'),
    h('Portal', {}, h('Backdrop'), h('Positioner', {}, h('Popup', {}, ...menuContent(h)))),
  ),
)

const selectScene = scene('select', (h) =>
  h(
    'Root',
    { defaultValue: 'a' },
    h('Label', {}, 'Label'),
    h('Trigger', {}, h('Value'), h('Icon', {}, 'v')),
    h('Portal', {}, h('Backdrop'), h('Positioner', {}, h('Popup', {}, ...selectContent(h)))),
  ),
)

const tooltipScene = scene('tooltip', (h) =>
  h(
    'Provider',
    {},
    h(
      'Root',
      {},
      h('Trigger', {}, 'Hover'),
      h('Portal', {}, h('Positioner', {}, h('Popup', {}, h('Arrow'), h('Viewport', {}, 'Tip')))),
    ),
  ),
)

const disclosureScenes = [
  scene('accordion', (h) =>
    h(
      'Root',
      {},
      h(
        'Item',
        { value: 'a' },
        h('Header', {}, h('Trigger', {}, 'Question')),
        h('Panel', {}, 'Answer'),
      ),
    ),
  ),
  scene('collapsible', (h) => h('Root', {}, h('Trigger', {}, 'Toggle'), h('Panel', {}, 'Content'))),
  scene('tabs', (h) =>
    h(
      'Root',
      { defaultValue: 'a' },
      h('List', {}, h('Tab', { value: 'a' }, 'A'), h('Tab', { value: 'b' }, 'B'), h('Indicator')),
      h('Panel', { value: 'a' }, 'Panel A'),
      h('Panel', { value: 'b' }, 'Panel B'),
    ),
  ),
]

const fieldScenes = [
  scene('button', (h) => h('.', {}, 'Button')),
  scene('input', (h) => h('.', { 'aria-label': 'Input' })),
  scene('number-field', (h) =>
    h(
      'Root',
      { defaultValue: 5 },
      h('ScrubArea', {}, h('ScrubAreaCursor')),
      h('Group', {}, h('Decrement', {}, '-'), h('Input'), h('Increment', {}, '+')),
    ),
  ),
  scene('field', (h) =>
    h(
      'Root',
      { invalid: true },
      h('Label', {}, 'Label'),
      h('Control', {}),
      h('Description', {}, 'Description'),
      h('Error', { match: true }, 'Error'),
      h('Item', {}, 'Item'),
      h('Validity', {}, (() => null) as never),
    ),
  ),
  scene('fieldset', (h) => h('Root', {}, h('Legend', {}, 'Legend'))),
  scene('form', (h, other) => h('.', {}, other('input')('.', { 'aria-label': 'Input' }))),
]

const choiceScenes = [
  scene('checkbox', (h) => h('Root', { defaultChecked: true }, h('Indicator', {}, 'x'))),
  scene('checkbox-group', (h, other) =>
    h(
      '.',
      { defaultValue: ['a'] },
      other('checkbox')('Root', { value: 'a' }, other('checkbox')('Indicator', {}, 'x')),
      other('checkbox')('Root', { value: 'b' }),
    ),
  ),
  scene('radio', (h, other) =>
    other('radio-group')(
      '.',
      { defaultValue: 'a' },
      h('Root', { value: 'a' }, h('Indicator', {}, 'o')),
    ),
  ),
  scene('radio-group', (h, other) =>
    h(
      '.',
      { defaultValue: 'a' },
      other('radio')('Root', { value: 'a' }, other('radio')('Indicator', {}, 'o')),
      other('radio')('Root', { value: 'b' }),
    ),
  ),
  scene('switch', (h) => h('Root', { defaultChecked: true }, h('Thumb'))),
  scene('slider', (h) =>
    h(
      'Root',
      { defaultValue: 30 },
      h('Label', {}, 'Label'),
      h('Value'),
      h('Control', {}, h('Track', {}, h('Indicator')), h('Thumb', {})),
    ),
  ),
  scene('toggle', (h) => h('.', {}, 'Toggle')),
  scene('toggle-group', (h, other) =>
    h(
      '.',
      { defaultValue: ['a'] },
      other('toggle')('.', { value: 'a' }, 'A'),
      other('toggle')('.', { value: 'b' }, 'B'),
    ),
  ),
  scene('toolbar', (h) =>
    h(
      'Root',
      {},
      h('Button', {}, 'Button'),
      h('Link', { href: '#' }, 'Link'),
      h('Input', { 'aria-label': 'Input' }),
      h('Group', {}, h('Button', {}, 'One'), h('Button', {}, 'Two')),
      h('Separator'),
    ),
  ),
]

/**
The scenes, by subpath.
 */
export const scenes: Readonly<Record<string, Scene>> = Object.fromEntries(
  [
    dialogScene,
    popoverScene,
    menuScene,
    selectScene,
    tooltipScene,
    ...disclosureScenes,
    ...fieldScenes,
    ...choiceScenes,
  ].map((entry) => [entry.subpath, entry] as const),
)

/**
A part of a component the source provides, for a test that builds its own tree.
 */
export const partOf = (source: Source, subpath: string, part: string): ElementType => {
  const type = source(subpath)[part]
  if (type === undefined) {
    throw new Error(`${subpath} has no ${part}`)
  }
  return type as ElementType
}
