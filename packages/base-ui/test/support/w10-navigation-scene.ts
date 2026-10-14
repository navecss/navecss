/**
 * A Navigation Menu built from the wrapped parts: a first item (a trigger holding an Icon and a
 * label, and a panel of two links), a second item with a disabled trigger when asked, a top-level
 * link, and, once, after the list, the Portal, Positioner and Popup holding an Arrow and the
 * Viewport. Every part carries a `data-part` marker; triggers and links also name themselves.
 */
import { createElement, type ReactElement } from 'react'

import { partsNamed } from './dom.ts'
import { render } from './react.ts'
import { type Feedback, type Ns, part, type Props } from './w10-feedback.ts'

export interface NavigationMenuSceneOptions {
  /**
  Which link is `active`: the first panel link, the top-level link, or none.
   */
  readonly activeLink?: 'panel' | 'top'
  /**
  Add a second item whose trigger is `disabled`.
   */
  readonly disabledTrigger?: boolean
  readonly popupProps?: Props
  readonly side?: string
  /**
  Wrap the first trigger's Icon in a span, so it is no longer the trigger's direct child.
   */
  readonly wrapIcon?: boolean
}

const link = (menu: Ns, name: string, isActive: boolean): ReactElement =>
  part(
    menu,
    'Link',
    {
      'data-link': name,
      'data-part': 'NavigationMenu.Link',
      href: `/${name}`,
      ...(isActive && { active: true }),
    },
    name,
  )

interface TriggerItem {
  readonly icon: ReactElement
  readonly kind: 'disabled' | 'enabled'
  readonly label: string
  readonly links: ReactElement[]
}

const itemWithTrigger = (menu: Ns, { icon, kind, label, links }: TriggerItem): ReactElement => {
  const trigger = part(
    menu,
    'Trigger',
    {
      'data-part': 'NavigationMenu.Trigger',
      'data-trigger': kind,
      ...(kind === 'disabled' && { disabled: true }),
    },
    label,
    icon,
  )
  const content = part(menu, 'Content', { 'data-part': 'NavigationMenu.Content' }, ...links)
  return part(menu, 'Item', { value: label }, trigger, content)
}

const popupOf = (menu: Ns, options: NavigationMenuSceneOptions): ReactElement => {
  const arrow = part(menu, 'Arrow', { 'data-part': 'NavigationMenu.Arrow' })
  const viewport = part(menu, 'Viewport', { 'data-part': 'NavigationMenu.Viewport' })
  const popup = part(
    menu,
    'Popup',
    { 'data-part': 'NavigationMenu.Popup', ...options.popupProps },
    arrow,
    viewport,
  )
  const positionerProps = {
    'data-part': 'NavigationMenu.Positioner',
    ...(options.side !== undefined && { side: options.side }),
  }
  return part(menu, 'Portal', {}, part(menu, 'Positioner', positionerProps, popup))
}

export const navigationMenuElement = (
  { NavigationMenu: menu }: Feedback,
  options: NavigationMenuSceneOptions = {},
): ReactElement => {
  const icon = part(menu, 'Icon', { 'data-part': 'NavigationMenu.Icon' }, 'v')
  const firstIcon =
    options.wrapIcon === true ? createElement('span', { 'data-part': 'IconWrapper' }, icon) : icon
  const guides = itemWithTrigger(menu, {
    icon: firstIcon,
    kind: 'enabled',
    label: 'Guides',
    links: [link(menu, 'panel-active', options.activeLink === 'panel'), link(menu, 'panel', false)],
  })
  const reference = itemWithTrigger(menu, {
    icon: part(menu, 'Icon', { 'data-part': 'NavigationMenu.Icon' }, 'v'),
    kind: 'disabled',
    label: 'Reference',
    links: [link(menu, 'reference', false)],
  })
  const top = part(menu, 'Item', {}, link(menu, 'top', options.activeLink === 'top'))
  const items = [guides, ...(options.disabledTrigger === true ? [reference] : []), top]
  const list = part(menu, 'List', { 'data-part': 'NavigationMenu.List' }, ...items)
  return part(menu, 'Root', { 'data-part': 'NavigationMenu.Root' }, list, popupOf(menu, options))
}

export const renderNavigationMenu = async (
  feedback: Feedback,
  options: NavigationMenuSceneOptions = {},
): Promise<void> => {
  await render(navigationMenuElement(feedback, options))
}

/**
The trigger of the enabled or the disabled item.
 */
export const triggerOf = (kind: 'disabled' | 'enabled' = 'enabled'): HTMLElement =>
  partsNamed('NavigationMenu.Trigger').find((element) => element.dataset.trigger === kind)!
