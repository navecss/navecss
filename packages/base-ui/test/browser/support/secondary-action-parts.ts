/**
 * The parts that paint `action.secondary` (the twelve the roster maps to `baseUiButton`, in their
 * default variant, and the Toggle), each as a scene of its own: the part under test carries a test
 * id, a control `away` from it is the place the pointer rests, and the parts Base UI renders only
 * inside an open root are rendered inside one. A scene is mounted through the built wrappers and
 * given props that reach the part under test.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { userEvent } from 'vitest/browser'

import { AlertDialog } from '../../../dist/alert-dialog/index.js'
import { Button } from '../../../dist/button/index.js'
import { Dialog } from '../../../dist/dialog/index.js'
import { Menu } from '../../../dist/menu/index.js'
import { Popover } from '../../../dist/popover/index.js'
import { Toggle } from '../../../dist/toggle/index.js'
import { Toolbar } from '../../../dist/toolbar/index.js'
import { Tooltip } from '../../../dist/tooltip/index.js'
import { byTestId, el as h, mount, type Page, settled } from './page.ts'
import { required } from './w7-lists.ts'
import { createManager, raise, toastScene } from './w10-toast.ts'

export type Props = Readonly<Record<string, unknown>>

export interface PartCase {
  readonly name: string
  /**
  The props that disable the part with the `disabled` attribute.
   */
  readonly nativeProps: Props
  /**
  Whether pressing the part opens a popup.
   */
  readonly isPopupOpener: boolean
  readonly render: (props: Props) => RenderedPart
}

interface RenderedPart {
  /**
  What the scene needs after it is mounted: a toast raised.
   */
  readonly prepare?: () => Promise<void>
  readonly scene: ReactNode
  readonly subjectId: string
}

export interface MountedPart {
  readonly page: Page
  readonly subject: HTMLElement
}

const ARIA_DISABLED_PROPS: Props = { 'aria-disabled': true }

/**
The props that disable a part by `aria-disabled="true"`, written on the element.
 */
export const ariaDisabledProps = (): Props => ARIA_DISABLED_PROPS

const subjectProps = (props: Props): Props => ({ 'data-testid': 'subject', ...props })

/**
A control in the top-left corner, clear of every scene, where the pointer rests.
 */
const away = (): ReactNode =>
  h('div', {
    'data-testid': 'away',
    style: { height: 40, left: 0, position: 'fixed', top: 0, width: 40 },
  })

const inPage = (...children: ReactNode[]): ReactNode =>
  h('div', { style: { padding: 48 } }, ...children, away())

const ofSubject =
  (build: (subject: Props) => ReactNode): PartCase['render'] =>
  (props) => ({ scene: inPage(build(subjectProps(props))), subjectId: 'subject' })

const popupOf = (Namespace: typeof AlertDialog | typeof Dialog, subject: Props): ReactNode =>
  h(
    Namespace.Root,
    {},
    h(Namespace.Trigger, subject, 'Open'),
    h(Namespace.Portal, {}, h(Namespace.Popup, {}, h(Namespace.Title, {}, 'Title'), 'Content')),
  )

const closeOf = (Namespace: typeof AlertDialog | typeof Dialog, subject: Props): ReactNode =>
  h(
    Namespace.Root,
    { defaultOpen: true },
    h(Namespace.Portal, {}, h(Namespace.Popup, {}, h(Namespace.Close, subject, 'Close'))),
  )

const toastOf =
  (part: 'Action' | 'Close'): PartCase['render'] =>
  (props) => {
    const manager = createManager()
    return {
      prepare: async () => {
        raise(manager, 'one')
        await settled(() => byTestId('toast-one'))
      },
      scene: toastScene({ buttonProps: props, children: away(), hasAction: true, manager }),
      subjectId: `${part === 'Action' ? 'action' : 'close'}-one`,
    }
  }

const withNative = (name: string, render: PartCase['render'], isPopupOpener = false): PartCase => ({
  name,
  nativeProps: { disabled: true },
  isPopupOpener,
  render,
})

/**
The twelve parts the roster maps to `baseUiButton`, in this order.
 */
export const BUTTON_PARTS: readonly PartCase[] = [
  withNative(
    'Button',
    ofSubject((subject) => h(Button, subject, 'Save')),
  ),
  {
    ...withNative(
      'Toolbar.Button',
      ofSubject((subject) => h(Toolbar.Root, {}, h(Toolbar.Button, subject, 'Save'))),
    ),
    nativeProps: { disabled: true, focusableWhenDisabled: false },
  },
  withNative(
    'Dialog.Trigger',
    ofSubject((subject) => popupOf(Dialog, subject)),
    true,
  ),
  withNative(
    'Dialog.Close',
    ofSubject((subject) => closeOf(Dialog, subject)),
  ),
  withNative(
    'AlertDialog.Trigger',
    ofSubject((subject) => popupOf(AlertDialog, subject)),
    true,
  ),
  withNative(
    'AlertDialog.Close',
    ofSubject((subject) => closeOf(AlertDialog, subject)),
  ),
  withNative(
    'Popover.Trigger',
    ofSubject((subject) =>
      h(
        Popover.Root,
        {},
        h(Popover.Trigger, subject, 'Open'),
        h(Popover.Portal, {}, h(Popover.Positioner, {}, h(Popover.Popup, {}, 'Content'))),
      ),
    ),
    true,
  ),
  withNative(
    'Popover.Close',
    ofSubject((subject) =>
      h(
        Popover.Root,
        { defaultOpen: true },
        h(Popover.Trigger, {}, 'Open'),
        h(
          Popover.Portal,
          {},
          h(Popover.Positioner, {}, h(Popover.Popup, {}, h(Popover.Close, subject, 'Close'))),
        ),
      ),
    ),
  ),
  withNative(
    'Menu.Trigger',
    ofSubject((subject) =>
      h(
        Menu.Root,
        {},
        h(Menu.Trigger, subject, 'Open'),
        h(Menu.Portal, {}, h(Menu.Positioner, {}, h(Menu.Popup, {}, h(Menu.Item, {}, 'First')))),
      ),
    ),
    true,
  ),
  {
    ...withNative(
      'Tooltip.Trigger',
      ofSubject((subject) =>
        h(Tooltip.Provider, {}, h(Tooltip.Root, {}, h(Tooltip.Trigger, subject, 'Hover'))),
      ),
    ),
    nativeProps: { render: h('button', { disabled: true }) },
  },
  withNative('Toast.Action', toastOf('Action')),
  withNative('Toast.Close', toastOf('Close')),
]

/**
The Toggle, which paints the same fill without being a button part.
 */
export const TOGGLE_PART: PartCase = withNative(
  'Toggle',
  ofSubject((subject) => h(Toggle, subject, 'Bold')),
)

/**
Mounts the part with the props on the element under test, rests the pointer away from it and
waits for it to exist and stop moving.
 */
export const mountPart = async (part: PartCase, props: Props = {}): Promise<MountedPart> => {
  const { prepare, scene, subjectId } = part.render(props)
  const page = mount(scene)
  try {
    await prepare?.()
    const subject = (await settled(() => byTestId(subjectId))) as HTMLElement
    await parkPointer()
    return { page, subject }
  } catch (error) {
    page.dispose()
    throw error
  }
}

/**
Moves the pointer onto the control away from every scene, through whatever covers it: an open modal
puts an inert layer over the page, and the pointer lands on that layer as a person's would.
 */
export const parkPointer = async (): Promise<void> => {
  await userEvent.hover(required('away'), { force: true })
}
