import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { cleanup } from '../support/react.ts'
import { part, renderScene } from '../support/rows.ts'
import { loadNave } from '../support/sources.ts'

let nave: Source
beforeAll(async () => {
  nave = await loadNave()
})
afterEach(cleanup)

/**
 * A `data-*` key is used only where the element hasItem no ARIA counterpart (the counterpart table:
 * data-orientation to aria-orientation, data-disabled to aria-disabled, data-selected to
 * aria-selected, data-checked to aria-checked, data-open to aria-expanded, data-invalid to
 * aria-invalid, data-pressed to aria-pressed). Each row renders the parts the stylesheet keys on
 * through a `data-*` attribute in the state that sets it.
 */
const ROWS: readonly {
  counterpart: string
  parts: readonly string[]
  props: Record<string, Props>
  subpath: string
}[] = [
  {
    counterpart: 'aria-disabled',
    parts: ['NumberField.Group'],
    props: { 'NumberField.Root': { disabled: true } },
    subpath: 'number-field',
  },
  {
    counterpart: 'aria-disabled',
    parts: ['Slider.Thumb'],
    props: { 'Slider.Root': { disabled: true } },
    subpath: 'slider',
  },
  {
    counterpart: 'aria-orientation',
    parts: ['Slider.Control', 'Slider.Track', 'Slider.Thumb'],
    props: { 'Slider.Root': { orientation: 'vertical' } },
    subpath: 'slider',
  },
  {
    counterpart: 'aria-orientation',
    parts: ['Tabs.Indicator'],
    props: { 'Tabs.Root': { orientation: 'vertical' } },
    subpath: 'tabs',
  },
  {
    counterpart: 'aria-orientation',
    parts: ['ToggleGroup'],
    props: { ToggleGroup: { orientation: 'vertical' } },
    subpath: 'toggle-group',
  },
  {
    counterpart: 'aria-orientation',
    parts: ['Toolbar.Group'],
    props: { 'Toolbar.Root': { orientation: 'vertical' } },
    subpath: 'toolbar',
  },
]

describe('AC-base-ui-bridge-23: a data-* key only where the element hasItem no ARIA counterpart', () => {
  for (const { counterpart, parts, props, subpath } of ROWS) {
    for (const marker of parts) {
      it(`${marker} hasItem no ${counterpart}`, async () => {
        await renderScene(nave, subpath, props)
        const element = part(marker)
        expect(element, `${marker} rendered`).toBeDefined()
        expect(element?.hasAttribute(counterpart)).toBe(false)
      })
    }
  }
})
