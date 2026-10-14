/**
 * AC-base-ui-feedback-navigation-32: the value bar's fill tells the value by its width, and its
 * thickness is clamped, in headless Chromium with the built tokens and stylesheet, through the built
 * wrappers, in light and in dark, in normal colours and with forced colours active.
 *
 * A Track whose content box is 296px wide (the Root is 300px; the Track's border and padding take
 * 2px each side) holds the Indicator: at 0, 40 and 100 (Meter also 60) its width is 0, 118.39 and
 * 296 (177.59) to 0.01px, its border box is 4px tall with a 0px interior, and its centre is within
 * 0.5px of the Track's content-box centre, whatever block size a reader gives the Track. An
 * indeterminate Progress shows its Track only. The control for the clamp is the round-1 rules.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import { afterEach, describe, expect, it } from 'vitest'

import { Meter } from '../../dist/meter/index.js'
import { Progress } from '../../dist/progress/index.js'
import { framesLater } from './support/frames.ts'
import { el as h, mount, type Page, stylesheet, tokens, useSheets } from './support/page.ts'
import { emulateForcedColors, SCHEMES, useScheme } from './support/w7-css.ts'
import {
  INDICATOR,
  INDICATOR_ROUND_1,
  measureControlRule,
  replaceRule,
  TRACK,
  TRACK_ROUND_1,
} from './support/w11-controls.ts'
import { parkPointer, required, TOLERANCE } from './support/w11-page.ts'

const TRACK_CONTENT = 296
const FILL = 4
const TROUGH = 8
const transparent = 'rgba(0, 0, 0, 0)'

type Kind = 'Meter' | 'Progress'

const KINDS: readonly Kind[] = ['Progress', 'Meter']

interface Row {
  readonly kinds: readonly Kind[]
  /**
  The reader's CSS on the Track, empty for none.
   */
  readonly reader: string
  readonly value: number
  /**
  The Indicator's width the spec gives, in px.
   */
  readonly width: number
}

const rows: readonly Row[] = [
  { kinds: KINDS, reader: '', value: 0, width: 0 },
  { kinds: KINDS, reader: '', value: 40, width: 118.39 },
  { kinds: KINDS, reader: '', value: 100, width: 296 },
  { kinds: ['Meter'], reader: '', value: 60, width: 177.59 },
  { kinds: KINDS, reader: 'block-size: 12px', value: 40, width: 118.39 },
  { kinds: KINDS, reader: 'height: 16px', value: 40, width: 118.39 },
  { kinds: KINDS, reader: 'min-block-size: 12px', value: 40, width: 118.39 },
]

const bar = (kind: Kind, value: number | null): ReturnType<typeof h> => {
  const Parts = kind === 'Meter' ? Meter : Progress
  return h(
    'div',
    { style: { width: 300 } },
    h(
      Parts.Root,
      { 'data-testid': 'root', value },
      h(Parts.Label, {}, 'Loading'),
      h(Parts.Value, {}),
      h(
        Parts.Track,
        { 'data-testid': 'track' },
        h(Parts.Indicator, { 'data-testid': 'indicator' }),
      ),
    ),
  )
}

const readerSheet = (reader: string): string =>
  reader === '' ? '' : `[data-testid="track"] { ${reader} }`

const length = (value: string): number => Number(value.replace('px', ''))

interface Reading {
  readonly centreOffset: number
  readonly height: number
  readonly interior: number
  readonly style: CSSStyleDeclaration
  readonly trackContentWidth: number
  readonly width: number
}

const read = (): Reading => {
  const track = required('track')
  const indicator = required('indicator')
  const trackStyle = getComputedStyle(track)
  const style = getComputedStyle(indicator)
  const trackBox = track.getBoundingClientRect()
  const box = indicator.getBoundingClientRect()
  const trackTop = length(trackStyle.borderTopWidth) + length(trackStyle.paddingTop)
  const trackBottom = length(trackStyle.borderBottomWidth) + length(trackStyle.paddingBottom)
  const trackSides =
    length(trackStyle.borderLeftWidth) +
    length(trackStyle.borderRightWidth) +
    length(trackStyle.paddingLeft) +
    length(trackStyle.paddingRight)
  const contentCentre = trackBox.top + trackTop + (trackBox.height - trackTop - trackBottom) / 2
  return {
    centreOffset: box.top + box.height / 2 - contentCentre,
    height: box.height,
    interior: box.height - length(style.borderTopWidth) - length(style.borderBottomWidth),
    style,
    trackContentWidth: trackBox.width - trackSides,
    width: box.width,
  }
}

describe('AC-base-ui-feedback-navigation-32: the fill width tells the value, and its thickness is clamped', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  let removeScheme: (() => void) | undefined

  afterEach(async () => {
    await emulateForcedColors('none')
    page?.dispose()
    removeScheme?.()
    removeSheets?.()
    page = undefined
  })

  const show = async (
    scheme: 'dark' | 'light',
    kind: Kind,
    value: number | null,
    { reader = '', sheet = stylesheet } = {},
  ): Promise<void> => {
    removeScheme = useScheme(scheme)
    removeSheets = useSheets(tokens, sheet, reader)
    await parkPointer()
    page = mount(bar(kind, value))
    await framesLater(3)
  }

  describe.each(SCHEMES)('in %s', (scheme) => {
    describe.each(KINDS)('%s', (kind) => {
      it.each(rows.filter((row) => row.kinds.includes(kind)))(
        'AC-base-ui-feedback-navigation-32: at $value (reader CSS "$reader") the fill is $width px wide, 4px thick, hollow 0 and centred, also under forced colours',
        async ({ reader, value, width }) => {
          await show(scheme, kind, value, { reader: readerSheet(reader) })
          const normal = read()
          expect(normal.trackContentWidth, 'the Track content box').toBeCloseTo(TRACK_CONTENT, 2)
          expect(Math.abs(normal.width - width), 'the fill width').toBeLessThanOrEqual(TOLERANCE)
          expect(normal.height, 'the fill border-box height').toBeCloseTo(FILL, 2)
          expect(normal.interior, 'the fill interior').toBeCloseTo(0, 2)
          expect(
            Math.abs(normal.centreOffset),
            'the fill centre from the Track content centre',
          ).toBeLessThanOrEqual(0.5)
          await emulateForcedColors('active')
          const forced = read()
          expect(
            Math.abs(forced.width - width),
            'the fill width under forced colours',
          ).toBeLessThanOrEqual(TOLERANCE)
          expect(forced.height, 'the fill height under forced colours').toBeCloseTo(FILL, 2)
          expect(forced.interior, 'the fill interior under forced colours').toBeCloseTo(0, 2)
          for (const side of ['Top', 'Bottom'] as const) {
            expect(
              forced.style[`border${side}Style`],
              `${side} border style under forced colours`,
            ).toBe('solid')
            expect(
              forced.style[`border${side}Color`],
              `${side} border colour under forced colours`,
            ).not.toBe(transparent)
          }
        },
      )
    })
  })

  describe.each(SCHEMES)('indeterminate and the clamp control, in %s', (scheme) => {
    it('AC-base-ui-feedback-navigation-32: an indeterminate Progress hides its Indicator and its Track is 8px tall', async () => {
      // eslint-disable-next-line unicorn/no-null -- null is Progress's value when it is indeterminate
      await show(scheme, 'Progress', null)
      expect(getComputedStyle(required('indicator')).display, 'the Indicator').toBe('none')
      expect(required('track').getBoundingClientRect().height, 'the Track').toBeCloseTo(TROUGH, 2)
    })

    it.each(KINDS)(
      'AC-base-ui-feedback-navigation-32: the control, with the round-1 rules and block-size 12px on the Track a %s fill is 12px with an 8px hollow interior',
      async (kind) => {
        const sheet = replaceRule(
          replaceRule(stylesheet, TRACK, TRACK_ROUND_1.text),
          INDICATOR,
          INDICATOR_ROUND_1.text,
        )
        await show(scheme, kind, 40, { reader: readerSheet('block-size: 12px'), sheet })
        const { height, interior } = read()
        expect(height, 'the round-1 fill height, no clamp').toBeCloseTo(12, 2)
        expect(interior, 'the round-1 fill interior, hollow').toBeCloseTo(8, 2)
      },
    )
  })

  it('AC-base-ui-feedback-navigation-32: the control rules are the spec bytes', async () => {
    const figures = [
      { bytes: 351, hash: '7db6688a2ec5a619', rule: TRACK },
      { bytes: 307, hash: 'f4713d2f8a618f70', rule: INDICATOR },
      { bytes: 315, hash: 'af592fefde610c29', rule: TRACK_ROUND_1 },
      { bytes: 262, hash: '5b11f20810b366c7', rule: INDICATOR_ROUND_1 },
    ]
    for (const { bytes, hash, rule } of figures) {
      expect(await measureControlRule(rule), `rule ${hash}`).toEqual({ bytes, hash })
    }
    expect(
      [TRACK, INDICATOR].map((rule) => stylesheet.split(rule.text).length - 1),
      'copies of the shipped Track and Indicator rules in the built stylesheet',
    ).toEqual([1, 1])
  })
})
