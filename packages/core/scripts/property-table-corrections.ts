/**
 * What `generate-property-table.ts` adds to, or changes in, the property data it reads from
 * mdn-data: a few shorthands mdn-data does not list as shorthands, the sub-properties `font`
 * resets without being able to set, and the one shorthand (`all`) that is defined by what it
 * leaves out. Each entry carries the reason next to it.
 *
 * Every entry here comes from a specification in `SPECIFICATION_TITLES`, read in the
 * w3c/csswg-drafts repository at `SPECIFICATIONS_COMMIT`. `packages/core/LICENSE` names the same
 * specifications and the same commit; `test/directive/property-table.test.ts` checks that.
 */

/**
 * The csswg-drafts commit every specification named in this package's third-party credit was read
 * at.
 */
export const SPECIFICATIONS_COMMIT = '40527902c4d0840cdb7a808c8cd42302be1c3bc8'

/**
 * The specifications the corrections and the logical groups come from, named by each
 * specification's own title, in the order `packages/core/LICENSE` lists them.
 */
export const SPECIFICATION_TITLES: readonly string[] = [
  'CSS Logical Properties and Values Module Level 1',
  'CSS Overflow Module Level 3',
  'CSS Overscroll Behavior Module Level 1',
  'CSS Scroll Snap Module Level 1',
  'CSS Box Sizing Module Level 4',
  'CSS Fonts Module Level 4',
  'CSS Text Module Level 4',
  'CSS Cascading and Inheritance Module Level 5',
]

/**
 * A shorthand whose sub-properties are the ones mdn-data lists plus `adds`. A sub-property that
 * is not a property in mdn-data is added to the table as a longhand.
 */
interface AddedMembers {
  readonly property: string
  readonly adds: readonly string[]
  readonly reason: string
}

/**
 * The shorthand that sets every property except the ones named: all properties of the table,
 * minus `except`. Custom properties are not in the table, so it never reaches them.
 */
interface AllExcept {
  readonly property: 'all'
  readonly except: readonly string[]
  readonly reason: string
}

export type PropertyCorrection = AddedMembers | AllExcept

export const CORRECTIONS: readonly PropertyCorrection[] = [
  {
    property: 'white-space',
    adds: ['white-space-collapse', 'text-wrap-mode', 'white-space-trim'],
    reason:
      'CSS Text Module Level 4 defines white-space as a shorthand for white-space-collapse, ' +
      'text-wrap-mode and white-space-trim; mdn-data lists it as a property of its own with no ' +
      'sub-properties, and does not know white-space-trim.',
  },
  {
    property: 'font',
    adds: [
      'font-feature-settings',
      'font-kerning',
      'font-language-override',
      'font-optical-sizing',
      'font-size-adjust',
      'font-variation-settings',
      'font-width',
    ],
    reason:
      'CSS Fonts Module Level 4 lists these as reset-only sub-properties of font: the font syntax ' +
      'cannot set them, yet a font declaration resets each to its initial value, so it overrides ' +
      'an earlier declaration of any of them. font-width is the Level 4 name of font-stretch, ' +
      'which mdn-data lists. The reset-only font-variant-* longhands are reached through ' +
      'font-variant, which mdn-data lists as a sub-property of font.',
  },
  {
    property: 'font-variant',
    adds: [
      'font-variant-alternates',
      'font-variant-caps',
      'font-variant-east-asian',
      'font-variant-emoji',
      'font-variant-ligatures',
      'font-variant-numeric',
      'font-variant-position',
    ],
    reason:
      'CSS Fonts Module Level 4 defines font-variant as a shorthand that resets its unspecified ' +
      'sub-properties to their initial values; mdn-data lists it with no sub-properties, so font, ' +
      'which contains font-variant, would reach none of the font-variant-* longhands.',
  },
  {
    property: 'font-synthesis',
    adds: [
      'font-synthesis-position',
      'font-synthesis-small-caps',
      'font-synthesis-style',
      'font-synthesis-weight',
    ],
    reason:
      'CSS Fonts Module Level 4 names the four font-synthesis-* properties as the longhands of the ' +
      'font-synthesis shorthand; mdn-data lists it with no sub-properties.',
  },
  {
    property: 'all',
    except: ['direction', 'unicode-bidi'],
    reason:
      'CSS Cascading and Inheritance Module Level 5 defines all as the shorthand that resets every ' +
      'CSS property except direction and unicode-bidi, and not custom properties; mdn-data gives ' +
      'it no sub-properties, because it is defined by exclusion.',
  },
]
