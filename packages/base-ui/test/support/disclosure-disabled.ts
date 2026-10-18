/**
 * What a disabled Accordion or Collapsible trigger carries when it is a native button, at the run's
 * Base UI. Up to 1.8.0 it is `aria-disabled="true"`, and the button stays in the tab order; from
 * 1.9.0 it is the native `disabled` attribute instead, which takes the button out of the tab order.
 * A trigger rendered as another element carries `aria-disabled` at every minor.
 */
import { FLOOR_MINOR, runMinor } from './w6-minors.ts'

export const disclosureTriggerDisabled = (): {
  readonly aria: boolean
  readonly native: boolean
} =>
  runMinor().version === FLOOR_MINOR.version
    ? { aria: true, native: false }
    : { aria: false, native: true }
