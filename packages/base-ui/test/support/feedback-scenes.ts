/**
 * The scenes of the seven feedback and navigation components: each renders every part of the
 * namespace that makes an element. Kept apart from `scenes.ts`, which turns every build into a
 * scene. The Toast needs a hook, so its build also gets the component's export and the config.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { createElement, Fragment, type ReactElement, type ReactNode, useEffect } from 'react'

import type { Make, Other, SceneContext } from './scenes.ts'

type Build = (h: Make, other: Other, context: SceneContext) => ReactNode

/**
 * The manager `Toast.useToastManager()` returns, as far as a scene uses it.
 */
interface ToastManagerLike {
  readonly add: (toast: Record<string, unknown>) => string
  readonly toasts: readonly { readonly id: string }[]
}

interface ToastListProps {
  readonly anchored: boolean
  readonly count: number
  readonly h: Make
  readonly side: string | undefined
  readonly useToastManager: () => ToastManagerLike
}

/**
 * A viewport that adds `count` toasts when it mounts (newest first, as Base UI renders them) and
 * renders each through the parts of the source. An anchored list renders each toast in a
 * `Positioner` with an `Arrow`, anchored to the document body, on the side the scene was given.
 */
const ToastList = ({ anchored, count, h, side, useToastManager }: ToastListProps): ReactElement => {
  const manager = useToastManager()
  useEffect(() => {
    for (let index = 1; index <= count; index += 1) {
      manager.add({
        description: `Description ${index}`,
        ...(anchored && { positionerProps: { anchor: document.body, ...(side && { side }) } }),
        // A toast that dismisses itself would leave a different document from one read a moment later.
        timeout: 0,
        title: `Toast ${index}`,
      })
    }
    // The toasts are added once, when the list mounts.
  }, [])
  const body = (toast: { id: string }, key?: string): ReactNode =>
    h(
      'Root',
      key === undefined ? { toast } : { key, toast },
      anchored ? h('Arrow') : undefined,
      h(
        'Content',
        {},
        h('Title'),
        h('Description'),
        anchored ? undefined : h('Action', {}, 'Undo'),
        h('Close', {}, 'Close'),
      ),
    )
  return h(
    'Portal',
    {},
    h(
      'Viewport',
      {},
      ...manager.toasts.map((toast) =>
        anchored ? h('Positioner', { key: toast.id, toast }, body(toast)) : body(toast, toast.id),
      ),
    ),
  ) as ReactElement
}

/**
 * The Toast scene: a stacked provider holding `Toast.Adder`'s `count` toasts (two by default) and
 * an anchored provider holding one anchored toast, so every part of the namespace that renders an
 * element renders. `Toast.Provider` takes both providers' props; `Toast.Anchored` takes the
 * anchored toast's `side`.
 */
const toast: Build = (h, _other, { config, ui }) => {
  const count = (config.props?.['Toast.Adder']?.count as number | undefined) ?? 2
  const side = config.props?.['Toast.Anchored']?.side as string | undefined
  const useToastManager = ui.useToastManager as () => ToastManagerLike
  return createElement(
    Fragment,
    undefined,
    h(
      'Provider',
      {},
      createElement(ToastList, { anchored: false, count, h, side: undefined, useToastManager }),
    ),
    h(
      'Provider',
      {},
      createElement(ToastList, { anchored: true, count: 1, h, side, useToastManager }),
    ),
  )
}

const valueBar: Build = (h) =>
  h('Root', { value: 40 }, h('Label', {}, 'Label'), h('Value'), h('Track', {}, h('Indicator')))

/**
The feedback and navigation scenes' builds, by subpath. The Navigation Menu's popup renders once
its item `a` is open (`navigationMenuOpenProps`), the Scroll Area's corner once its content
overflows both ways, and the Avatar's image once the image has loaded.
 */
export const feedbackBuilds: Readonly<Record<string, Build>> = {
  toast,
  'navigation-menu': (h) =>
    h(
      'Root',
      {},
      h(
        'List',
        {},
        h(
          'Item',
          { value: 'a' },
          h('Trigger', {}, 'Menu', h('Icon', {}, 'v')),
          h('Content', {}, h('Link', { href: '#inside' }, 'Inside')),
        ),
        h('Item', {}, h('Link', { active: true, href: '#current' }, 'Current')),
      ),
      h('Portal', {}, h('Positioner', {}, h('Popup', {}, h('Arrow'), h('Viewport')))),
    ),
  'scroll-area': (h) =>
    h(
      'Root',
      {},
      h('Viewport', {}, h('Content', {}, 'Content')),
      h('Scrollbar', { keepMounted: true, orientation: 'vertical' }, h('Thumb')),
      h('Scrollbar', { keepMounted: true, orientation: 'horizontal' }, h('Thumb')),
      h('Corner'),
    ),
  meter: valueBar,
  progress: valueBar,
  avatar: (h) => h('Root', {}, h('Image', { alt: '', src: 'avatar.png' }), h('Fallback', {}, 'AB')),
  separator: (h) => h('.'),
}
