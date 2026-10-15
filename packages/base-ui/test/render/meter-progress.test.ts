import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { loadValueBarsOver } from '../support/feedback-minors-bars.ts'
import { INDETERMINATE, settle } from '../support/feedback-render.ts'
import { feedbackNave } from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { tableP } from '../support/table-p.ts'
import { isInstalled, type Minor, MINORS, runMinor } from '../support/w6-minors.ts'

afterEach(cleanup)

const C = 'nave-base-ui-'

/**
The minors this run looks at: the floor run reads the floor, the current run every other minor.
 */
const minorsOfRun = (): readonly Minor[] =>
  runMinor().version === '1.3.0'
    ? [runMinor()]
    : MINORS.filter(({ version }) => version !== '1.3.0')

/**
The wrappers over the minor: the run's own for its Base UI, the redirected load for the others.
 */
const sourceOver = (minor: Minor): Promise<Source> =>
  minor.version === runMinor().version ? feedbackNave() : loadValueBarsOver(minor.alias)

const PARTS = ['Root', 'Label', 'Value', 'Track', 'Indicator'] as const

const renderBar = async (
  source: Source,
  subpath: 'meter' | 'progress',
  props: Record<string, Props> = {},
): Promise<Record<(typeof PARTS)[number], HTMLElement | undefined>> => {
  const scene = scenes[subpath]
  if (scene === undefined) {
    throw new Error(`no scene for ${subpath}`)
  }
  await render(scene.render(source, { props }))
  await settle(10)
  const namespace = subpath === 'meter' ? 'Meter' : 'Progress'
  return Object.fromEntries(
    PARTS.map((part) => [part, partsNamed(`${namespace}.${part}`)[0]] as const),
  ) as Record<(typeof PARTS)[number], HTMLElement | undefined>
}

const inline = (element: HTMLElement | undefined, property: string): string =>
  element?.style.getPropertyValue(property) ?? ''

const naveClassesOf = (element: HTMLElement | undefined): string[] =>
  (element?.className ?? '').split(/\s+/).filter((name) => name.startsWith('nave-'))

const EXPECTED_CLASSES = {
  Indicator: [`${C}value-bar-indicator`],
  Label: [`${C}label`],
  Root: [`${C}value-bar`],
  Track: [`${C}value-bar-track`],
  Value: [`${C}slider-value`],
} as const

describe('AC-base-ui-feedback-navigation-31: one value bar; indeterminate shows only the trough (Tier A, the minor runs)', () => {
  it('has a minor of the run installed for each of the six, so none is skipped', () => {
    expect(MINORS.map(({ version }) => version)).toEqual([
      '1.3.0',
      '1.4.0',
      '1.5.0',
      '1.6.0',
      '1.7.0',
      '1.8.0',
    ])
    expect(minorsOfRun().every((minor) => isInstalled(minor))).toBe(true)
    expect(minorsOfRun().length).toBeGreaterThan(0)
  })

  describe.each(minorsOfRun())('Base UI $version', (minor) => {
    it('marks an indeterminate Progress on its Root, Label, Value, Track and Indicator, with no aria-valuenow and no inline width on the Indicator', async () => {
      const bar = await renderBar(await sourceOver(minor), 'progress', {
        'Progress.Root': { value: INDETERMINATE },
      })
      for (const part of PARTS) {
        expect(bar[part]?.hasAttribute('data-indeterminate'), part).toBe(true)
      }
      expect(bar.Root?.hasAttribute('aria-valuenow')).toBe(false)
      expect(bar.Root?.getAttribute('aria-valuetext')).toBe('indeterminate progress')
      expect(inline(bar.Indicator, 'width')).toBe('')
      expect(bar.Indicator?.getAttribute('style') ?? '').not.toContain('width')
    })

    it('gives the Indicator of a determinate Progress and of a Meter an inline width: 40% and height: inherit', async () => {
      const source = await sourceOver(minor)
      for (const subpath of ['progress', 'meter'] as const) {
        const bar = await renderBar(source, subpath)
        expect(inline(bar.Indicator, 'width'), subpath).toBe('40%')
        expect(inline(bar.Indicator, 'height'), subpath).toBe('inherit')
        expect(bar.Root?.getAttribute('aria-valuenow'), subpath).toBe('40')
      }
    })

    it('carries no data-indeterminate on any part of the Meter, nor of a determinate Progress', async () => {
      const source = await sourceOver(minor)
      for (const subpath of ['meter', 'progress'] as const) {
        const bar = await renderBar(source, subpath)
        for (const part of PARTS) {
          expect(bar[part]?.hasAttribute('data-indeterminate'), `${subpath} ${part}`).toBe(false)
        }
      }
    })

    it("gives the parts Table P's classes, the same for Meter and Progress", async () => {
      const source = await sourceOver(minor)
      for (const subpath of ['meter', 'progress'] as const) {
        const bar = await renderBar(source, subpath)
        for (const part of PARTS) {
          expect(naveClassesOf(bar[part]), `${subpath} ${part}`).toEqual(EXPECTED_CLASSES[part])
        }
      }
      const namespaces = ['Meter', 'Progress']
      for (const part of PARTS) {
        expect(namespaces.map((namespace) => tableP.get(`${namespace}.${part}`))).toEqual([
          EXPECTED_CLASSES[part],
          EXPECTED_CLASSES[part],
        ])
      }
    })

    it("control: an indeterminate Progress and a determinate one differ in exactly the marked attributes and the Indicator's width", async () => {
      const source = await sourceOver(minor)
      const determinate = await renderBar(source, 'progress')
      const determinateWidth = inline(determinate.Indicator, 'width')

      const indeterminate = await renderBar(source, 'progress', {
        'Progress.Root': { value: INDETERMINATE },
      })
      expect(determinateWidth).toBe('40%')
      expect(inline(indeterminate.Indicator, 'width')).toBe('')
      expect(determinate.Indicator?.hasAttribute('data-indeterminate')).toBe(false)
      expect(indeterminate.Indicator?.hasAttribute('data-indeterminate')).toBe(true)
    })
  })
})
