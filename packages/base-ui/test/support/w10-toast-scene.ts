/**
 * A toast area built from the wrapped Toast parts: a Provider holding a Portal, a Viewport and the
 * list of toasts, with an anchor button beside it. The toasts are raised with `add`, which runs
 * in `act` and lets Base UI settle.
 */
import { createElement, Fragment, type ReactElement, type ReactNode } from 'react'

import { partsNamed } from './dom.ts'
import { act, render } from './react.ts'
import { type Feedback, type Ns, part, type Props, settle } from './w10-feedback.ts'

interface ToastObjectLike {
  readonly id: string
  readonly title?: ReactNode
  readonly type?: string
}

interface ToastListProps {
  readonly actionProps: Props | undefined
  readonly anchoredSide: string | undefined
  readonly closeProps: Props | undefined
  readonly rootProps: Props | undefined
  readonly toastNamespace: Ns
  readonly withAction: boolean
}

const contentOf = (toast: Ns, closeProps: Props, action: ReactElement[]): ReactElement => {
  const title = part(toast, 'Title', { 'data-part': 'Toast.Title' })
  const description = part(toast, 'Description', { 'data-part': 'Toast.Description' })
  const close = part(toast, 'Close', { 'data-part': 'Toast.Close', ...closeProps }, 'Close')
  return part(
    toast,
    'Content',
    { 'data-part': 'Toast.Content' },
    title,
    description,
    close,
    ...action,
  )
}

/**
One Toast.Root for each toast the manager holds, newest first (Base UI's order), each holding a
Content with a Title, a Description, a Close and (when the scene asks) an Action. Anchored
toasts sit inside a Toast.Positioner, with an Arrow in the Root.
 */
function ToastList({
  actionProps,
  anchoredSide,
  closeProps,
  rootProps,
  toastNamespace,
  withAction,
}: ToastListProps): ReactElement {
  const { toasts } = (toastNamespace.useToastManager as () => { toasts: ToastObjectLike[] })()
  const isAnchored = anchoredSide !== undefined
  const arrow = isAnchored ? [part(toastNamespace, 'Arrow', { 'data-part': 'Toast.Arrow' })] : []
  const action = withAction
    ? [part(toastNamespace, 'Action', { 'data-part': 'Toast.Action', ...actionProps }, 'Undo')]
    : []
  const content = contentOf(toastNamespace, closeProps ?? {}, action)
  const listed = toasts.map((toast) => {
    const rootAttributes = { 'data-part': 'Toast.Root', key: toast.id, toast, ...rootProps }
    const root = part(toastNamespace, 'Root', rootAttributes, ...arrow, content)
    const positionerAttributes = {
      'data-part': 'Toast.Positioner',
      key: toast.id,
      side: anchoredSide,
      toast,
    }
    return isAnchored ? part(toastNamespace, 'Positioner', positionerAttributes, root) : root
  })
  return createElement(Fragment, {}, ...listed)
}

export interface ToastSceneOptions {
  readonly actionProps?: Props
  /**
  Render the toasts as anchored ones, inside a Toast.Positioner on this side.
   */
  readonly anchoredSide?: string
  readonly closeProps?: Props
  readonly limit?: number
  readonly rootProps?: Props
  readonly viewportProps?: Props
  readonly withAction?: boolean
}

export interface AddOptions {
  readonly description?: string
  readonly onClose?: () => void
  readonly onRemove?: () => void
  readonly timeout?: number
  readonly title: string
  readonly type?: string
}

export interface ToastScene {
  readonly add: (options: AddOptions) => Promise<string>
}

interface Manager {
  readonly add: (options: Record<string, unknown>) => string
}

const anchorButton = (): HTMLElement => partsNamed('Anchor')[0]!

/**
Renders the toast area and returns the way to raise toasts into it.
 */
export const renderToasts = async (
  { Toast }: Feedback,
  options: ToastSceneOptions = {},
): Promise<ToastScene> => {
  const manager = (Toast.createToastManager as () => Manager)()
  const isAnchored = options.anchoredSide !== undefined
  const list = createElement(ToastList, {
    actionProps: options.actionProps,
    anchoredSide: options.anchoredSide,
    closeProps: options.closeProps,
    rootProps: options.rootProps,
    toastNamespace: Toast,
    withAction: options.withAction ?? false,
  })
  const viewport = part(
    Toast,
    'Viewport',
    { 'data-part': 'Toast.Viewport', ...options.viewportProps },
    list,
  )
  const portal = part(Toast, 'Portal', {}, viewport)
  const providerProps = {
    toastManager: manager,
    ...(options.limit !== undefined && { limit: options.limit }),
  }
  const provider = part(Toast, 'Provider', providerProps, portal)
  const anchor = createElement('button', { 'data-part': 'Anchor', type: 'button' }, 'Anchor')
  await render(createElement('div', {}, anchor, provider))
  return {
    add: async ({ onClose, onRemove, ...toast }) => {
      let id = ''
      await act(async () => {
        id = manager.add({
          ...toast,
          timeout: toast.timeout ?? 0,
          ...(onClose !== undefined && { onClose }),
          ...(onRemove !== undefined && { onRemove }),
          ...(isAnchored && { positionerProps: { anchor: anchorButton() } }),
        })
        await Promise.resolve()
      })
      await settle()
      return id
    },
  }
}

/**
The title of each Toast.Root, in the order the viewport lists them.
 */
export const rootTitles = (): string[] =>
  partsNamed('Toast.Root').map(
    (root) => root.querySelector('[data-part="Toast.Title"]')?.textContent ?? '',
  )
