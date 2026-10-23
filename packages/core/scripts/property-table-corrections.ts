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
  'CSS Gaps Module Level 1',
  'CSS Fragmentation Module Level 4',
  'CSS Backgrounds and Borders Module Level 3',
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

/**
 * A legacy name alias: another name for `aliasOf`, which a cascade treats as the same property.
 * The table keeps the alias as the data it came from lists it; `aliasOf` is what it stands for.
 */
interface AliasOf {
  readonly property: string
  readonly aliasOf: string
  readonly reason: string
}

export type PropertyCorrection = AddedMembers | AliasOf | AllExcept

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
    property: 'border',
    adds: [
      'border-image-outset',
      'border-image-repeat',
      'border-image-slice',
      'border-image-source',
      'border-image-width',
    ],
    reason:
      'CSS Backgrounds and Borders Module Level 3 defines border as resetting border-image to its ' +
      'initial value, as font resets its reset-only sub-properties: the border syntax cannot set ' +
      'the border-image longhands, yet a border declaration overrides an earlier declaration of ' +
      'any of them, and mdn-data lists none of them under border.',
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
    property: 'grid-gap',
    aliasOf: 'gap',
    reason:
      'CSS Gaps Module Level 1 defines grid-gap as a legacy name alias of gap: the same ' +
      'property under an old name, so a declaration of one overrides the other. mdn-data lists ' +
      'it as a shorthand of grid-row-gap and grid-column-gap, which relate to nothing else.',
  },
  {
    property: 'grid-row-gap',
    aliasOf: 'row-gap',
    reason:
      'CSS Gaps Module Level 1 defines grid-row-gap as a legacy name alias of row-gap: the same ' +
      'property under an old name. mdn-data lists it as a property of its own.',
  },
  {
    property: 'grid-column-gap',
    aliasOf: 'column-gap',
    reason:
      'CSS Gaps Module Level 1 defines grid-column-gap as a legacy name alias of column-gap: the ' +
      'same property under an old name. mdn-data lists it as a property of its own.',
  },
  {
    property: 'word-wrap',
    aliasOf: 'overflow-wrap',
    reason:
      'CSS Text Module Level 4 defines word-wrap as a legacy name alias of overflow-wrap: the ' +
      'same property under an old name. mdn-data lists it as a property of its own.',
  },
  {
    property: 'page-break-before',
    adds: ['break-before'],
    reason:
      'CSS Fragmentation Module Level 4 defines page-break-before as a legacy shorthand of ' +
      'break-before, so a declaration of it sets break-before. The values it maps to are not ' +
      'part of the table, which holds names and relations. mdn-data lists it as a property of ' +
      'its own.',
  },
  {
    property: 'page-break-after',
    adds: ['break-after'],
    reason:
      'CSS Fragmentation Module Level 4 defines page-break-after as a legacy shorthand of ' +
      'break-after, so a declaration of it sets break-after. The values it maps to are not part ' +
      'of the table, which holds names and relations. mdn-data lists it as a property of its own.',
  },
  {
    property: 'page-break-inside',
    adds: ['break-inside'],
    reason:
      'CSS Fragmentation Module Level 4 defines page-break-inside as a legacy shorthand of ' +
      'break-inside, so a declaration of it sets break-inside. The values it maps to are not ' +
      'part of the table, which holds names and relations. mdn-data lists it as a property of ' +
      'its own.',
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

/**
 * What the legacy names leave out, as decisions and not as oversights: a name that looks like a
 * legacy alias and is not recorded above, with the reason.
 */
export const LEGACY_NAME_EXCLUSIONS: readonly {
  readonly names: readonly string[]
  readonly reason: string
}[] = [
  {
    names: ['vendor-prefixed aliases'],
    reason:
      'A vendor-prefixed name stays a property of its own that relates only to itself, because ' +
      'an engine can give it values or behaviour that differ from the standard property it ' +
      'resembles.',
  },
  {
    names: ['font-stretch', 'font-width'],
    reason:
      'CSS Fonts Module Level 4 names font-width as the new name of font-stretch, but ' +
      'mdn-data marks font-width experimental and it is not Baseline, so the two stay unrelated ' +
      'until it is.',
  },
  {
    names: ['app-region', 'window-drag'],
    reason:
      'window-drag, the proposed standard name of app-region, is not in the table, so there is ' +
      'nothing for app-region to relate to; revisit when it is.',
  },
]
