/**
 * The two lists the DOM parity rows share: the parts of the Button family, which take `variant` and
 * `size` in the comparison, and the states each of the seven feedback and navigation components is
 * rendered in. The package rows compare a wrapper with the bare part; the copy rows compare a copy
 * with the package. Both read these lists, so a part or a state added here is compared by both.
 */
import type { Props } from './scenes.ts'

import { INDETERMINATE } from './feedback-render.ts'
import { navigationMenuOpenProps } from './states.ts'

export const VARIANT_PARTS = [
  'Button',
  'Toolbar.Button',
  'Dialog.Trigger',
  'Dialog.Close',
  'Popover.Trigger',
  'Popover.Close',
  'Menu.Trigger',
  'Tooltip.Trigger',
  'AlertDialog.Trigger',
  'AlertDialog.Close',
]

export interface FeedbackParityState {
  /**
  What the wrapper alone is given: the props the bare part has no use for.
   */
  readonly extra?: Record<string, Props>
  readonly label: string
  readonly props: Record<string, Props>
}

export const FEEDBACK_PARITY_STATES: Readonly<Record<string, readonly FeedbackParityState[]>> = {
  avatar: [
    { label: 'rendered', props: {} },
    { extra: { 'Avatar.Root': { size: 'lg' } }, label: 'rendered, with size="lg"', props: {} },
    { extra: { 'Avatar.Root': { size: 'sm' } }, label: 'rendered, with size="sm"', props: {} },
  ],
  meter: [{ label: 'rendered', props: {} }],
  'navigation-menu': [
    { label: 'closed', props: {} },
    { label: 'open', props: navigationMenuOpenProps() },
  ],
  progress: [
    { label: 'rendered', props: {} },
    { label: 'indeterminate', props: { 'Progress.Root': { value: INDETERMINATE } } },
  ],
  'scroll-area': [{ label: 'rendered', props: {} }],
  separator: [
    { label: 'horizontal', props: {} },
    { label: 'vertical', props: { Separator: { orientation: 'vertical' } } },
  ],
  toast: [
    { label: 'two toasts', props: {} },
    { label: 'four toasts open', props: { 'Toast.Adder': { count: 4 } } },
    {
      label: 'four toasts open, one over the limit',
      props: { 'Toast.Adder': { count: 4 }, 'Toast.Provider': { limit: 3 } },
    },
  ],
}
