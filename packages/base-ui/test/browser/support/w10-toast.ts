/**
 * The Toast scenes of the browser files, built through the wrappers the way the README builds
 * one: a Provider around the page, a Portal with a Viewport in it, and a list that renders one
 * `Toast.Root` for each toast the manager holds. Every toast is found by test id: the root as
 * `toast-<name>`, its close button as `close-<name>`, and the viewport as `viewport`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode, RefObject } from 'react'

import { Fragment } from 'react'

import { Toast } from '../../../dist/toast/index.js'
import { el as h } from './page.ts'
import { required } from './w8-actions.ts'

export type ToastManager = ReturnType<typeof Toast.createToastManager>

export const createManager = (): ToastManager => Toast.createToastManager()

interface ListProps {
  /**
  Props of the `Toast.Action` and `Toast.Close` of every toast: the Button family's `size` and `variant`.
   */
  readonly buttonProps: Readonly<Record<string, unknown>>
  /**
  Renders a `Toast.Action` in each toast.
   */
  readonly hasAction: boolean
  /**
  More content in each toast, after its description and before its buttons.
   */
  readonly extra: ((name: string) => ReactNode) | undefined
  /**
  Props of every `Toast.Root`.
   */
  readonly rootProps: Readonly<Record<string, unknown>>
}

/**
The name a toast is raised under, which its test ids are made of; the title is the reader's to change.
 */
const nameOf = (toast: { readonly data?: unknown; readonly id: string }): string =>
  (toast.data as { readonly name?: string } | undefined)?.name ?? toast.id

/**
 * One `Toast.Root` for each toast; an anchored toast, one given `positionerProps` with an anchor,
 * is inside a `Toast.Positioner`, as Base UI's anatomy has it.
 */
const ToastList = ({ buttonProps, extra, hasAction, rootProps }: ListProps): ReactNode => {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => {
    const name = nameOf(toast)
    const root = h(
      Toast.Root,
      { toast, 'data-testid': `toast-${name}`, ...rootProps },
      h(Toast.Title, { 'data-testid': `title-${name}` }),
      h(Toast.Description, { 'data-testid': `description-${name}` }),
      extra?.(name),
      hasAction
        ? h(Toast.Action, { 'data-testid': `action-${name}`, ...buttonProps }, 'Undo')
        : undefined,
      h(Toast.Close, { 'data-testid': `close-${name}`, ...buttonProps }, 'Dismiss'),
    )
    return toast.positionerProps?.anchor === undefined
      ? h(Fragment, { key: toast.id }, root)
      : h(Toast.Positioner, { key: toast.id, toast, 'data-testid': `positioner-${name}` }, root)
  })
}

export interface ToastSceneOptions {
  readonly buttonProps?: Readonly<Record<string, unknown>>
  /**
  Content inside the Provider, beside the Portal: what raises toasts, or what they appear over.
   */
  readonly children?: ReactNode
  readonly extra?: (name: string) => ReactNode
  readonly hasAction?: boolean
  /**
  The Provider's `limit`; Base UI's default of 3 if it is not given.
   */
  readonly limit?: number
  readonly manager: ToastManager
  readonly rootProps?: Readonly<Record<string, unknown>>
  /**
  A ref to the Viewport element, for a popup that is portalled into it.
   */
  readonly viewportRef?: RefObject<HTMLElement | null>
}

export const toastScene = ({
  buttonProps = {},
  children,
  extra,
  hasAction = false,
  limit,
  manager,
  rootProps = {},
  viewportRef,
}: ToastSceneOptions): ReactNode =>
  h(
    Toast.Provider,
    { toastManager: manager, ...(limit !== undefined && { limit }) },
    children,
    h(
      Toast.Portal,
      {},
      h(
        Toast.Viewport,
        { 'data-testid': 'viewport', ...(viewportRef !== undefined && { ref: viewportRef }) },
        h(ToastList, { buttonProps, extra, hasAction, rootProps }),
      ),
    ),
  )

/**
Raises a toast that stays until it is closed, unless the options say otherwise, under a name its test ids carry.
 */
export const raise = (
  manager: ToastManager,
  name: string,
  options: Readonly<Record<string, unknown>> = {},
): string =>
  manager.add({
    data: { name },
    description: `${name} description`,
    timeout: 0,
    title: name,
    ...options,
  })

export const toastRoot = (name: string): HTMLElement => required(`toast-${name}`)
export const closeOf = (name: string): HTMLElement => required(`close-${name}`)
