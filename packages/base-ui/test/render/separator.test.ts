import { afterEach, describe, expect, it } from 'vitest'

import type { Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { loadValueBarsOver } from '../support/feedback-minors-bars.ts'
import { settle } from '../support/feedback-render.ts'
import { feedbackNave } from '../support/feedback.ts'
import { cleanup, render } from '../support/react.ts'
import { scenes } from '../support/scenes.ts'
import { tableP } from '../support/table-p.ts'
import { type Minor, MINORS, runMinor } from '../support/w6-minors.ts'

afterEach(cleanup)

/**
The minors this run looks at: the floor run reads the floor, the current run every other minor.
 */
const minorsOfRun = (): readonly Minor[] =>
  runMinor().version === '1.3.0'
    ? [runMinor()]
    : MINORS.filter(({ version }) => version !== '1.3.0')

const sourceOver = (minor: Minor): Promise<Source> =>
  minor.version === runMinor().version ? feedbackNave() : loadValueBarsOver(minor.alias)

const naveClassesOf = (element: Element | undefined): string[] =>
  (element?.className ?? '').split(/\s+/).filter((name) => name.startsWith('nave-'))

describe('AC-base-ui-feedback-navigation-34: Separator reuses the toolbar separator, keyed on aria-orientation (Tier A, the minor runs)', () => {
  describe.each(minorsOfRun())('Base UI $version', (minor) => {
    for (const [label, props, orientation] of [
      ['horizontal (the default)', {}, 'horizontal'],
      ['orientation="vertical"', { orientation: 'vertical' }, 'vertical'],
    ] as const) {
      it(`${label} renders role="separator" with aria-orientation="${orientation}" and carries -toolbar-separator alone`, async () => {
        const scene = scenes.separator
        if (scene === undefined) {
          throw new Error('no scene for separator')
        }
        await render(scene.render(await sourceOver(minor), { props: { Separator: props } }))
        await settle(10)
        const [separator, ...rest] = partsNamed('Separator')
        expect(separator, 'Separator rendered').toBeDefined()
        expect(rest).toEqual([])
        expect(separator?.getAttribute('role')).toBe('separator')
        expect(separator?.getAttribute('aria-orientation')).toBe(orientation)
        expect(naveClassesOf(separator)).toEqual(['nave-base-ui-toolbar-separator'])
      })
    }
  })

  it('takes the class Table P gives Toolbar.Separator: the same one', () => {
    expect(tableP.get('Separator')).toEqual(['nave-base-ui-toolbar-separator'])
    expect(tableP.get('Separator')).toEqual(tableP.get('Toolbar.Separator'))
  })

  it('is a single component, not a namespace', async () => {
    const separator = (await feedbackNave())('separator')
    // A component is a function or an exotic object with `$$typeof`; a namespace is a plain object of parts.
    expect(Object.keys(separator).filter((key) => /^[A-Z]/.test(key))).toEqual([])
    expect((separator as unknown as { $$typeof?: symbol }).$$typeof).toBeTypeOf('symbol')
  })
})
