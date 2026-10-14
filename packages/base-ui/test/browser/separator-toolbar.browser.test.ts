/**
 * AC-base-ui-feedback-navigation-34, the Tier B clause: `Separator` reuses v1's toolbar separator,
 * so in a real engine it computes the same box, border colour and orientation as a `Toolbar.Separator`
 * of the same orientation in the same page.
 *
 * A Toolbar's own orientation makes its `Toolbar.Separator` the opposite one, so a horizontal
 * toolbar holds the vertical pair and a vertical toolbar the horizontal pair. The `Separator` sits in
 * the same toolbar as a sibling, in the same layout context. The control is an unclassed
 * `role="separator"` element in that toolbar, which draws no line: the comparison is able to differ.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { Separator } from '../../dist/separator/index.js'
import { Toolbar } from '../../dist/toolbar/index.js'
import { framesLater } from './support/frames.ts'
import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { colorOf, SCHEMES, useScheme } from './support/w7-css.ts'
import { parkPointer, required } from './support/w11-page.ts'

type Orientation = 'horizontal' | 'vertical'

const cases: readonly { readonly orientation: Orientation; readonly toolbar: Orientation }[] = [
  { orientation: 'vertical', toolbar: 'horizontal' },
  { orientation: 'horizontal', toolbar: 'vertical' },
]

/**
The properties that make a separator's line and its box.
 */
const LINE = [
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
] as const

const scene = (toolbar: Orientation, orientation: Orientation): ReturnType<typeof h> =>
  h(
    'div',
    { style: { padding: 24, width: 280 } },
    h(
      Toolbar.Root,
      { orientation: toolbar },
      h(Toolbar.Button, {}, 'First'),
      h(Toolbar.Separator, { 'data-testid': 'toolbar-separator' }),
      h(Separator, { 'data-testid': 'separator', orientation }),
      h('div', { 'aria-orientation': orientation, 'data-testid': 'bare', role: 'separator' }),
      h(Toolbar.Button, {}, 'Second'),
    ),
  )

describe('AC-base-ui-feedback-navigation-34: Separator computes what Toolbar.Separator computes', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(() => {
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  describe.each(SCHEMES)('in %s', (scheme) => {
    describe.each(cases)('the $orientation pair', ({ orientation, toolbar }) => {
      const show = async (): Promise<void> => {
        removeScheme = useScheme(scheme)
        removeSheets = useSheets(tokens, stylesheet)
        await parkPointer()
        page = mount(scene(toolbar, orientation))
        await framesLater(3)
      }

      it(`AC-base-ui-feedback-navigation-34: a ${orientation} Separator has the box, line and orientation of a ${orientation} Toolbar.Separator`, async () => {
        await show()
        const own = required('separator')
        const theirs = required('toolbar-separator')
        expect(
          theirs.getAttribute('aria-orientation'),
          'the Toolbar.Separator of this toolbar',
        ).toBe(orientation)
        expect(own.getAttribute('aria-orientation'), 'the Separator orientation').toBe(orientation)
        const ownBox = own.getBoundingClientRect()
        const theirBox = theirs.getBoundingClientRect()
        expect(ownBox.width, 'box width').toBeCloseTo(theirBox.width, 2)
        expect(ownBox.height, 'box height').toBeCloseTo(theirBox.height, 2)
        const ownStyle = getComputedStyle(own)
        const theirStyle = getComputedStyle(theirs)
        for (const property of LINE) {
          expect(ownStyle[property], property).toBe(theirStyle[property])
        }
        const line = orientation === 'vertical' ? 'borderLeftColor' : 'borderTopColor'
        expect(ownStyle[line], 'the line colour').toBe(colorOf('var(--nave-color-border-default)'))
        expect(ownStyle.display, 'display').toBe(theirStyle.display)
      })

      it(`AC-base-ui-feedback-navigation-34: the control, a bare ${orientation} role=separator in the toolbar draws no line, so the comparison can differ`, async () => {
        await show()
        const line = orientation === 'vertical' ? 'borderLeftWidth' : 'borderTopWidth'
        expect(getComputedStyle(required('bare'))[line], 'the bare element line').toBe('0px')
        expect(getComputedStyle(required('separator'))[line], 'the Separator line').toBe('1px')
      })
    })
  })
})
