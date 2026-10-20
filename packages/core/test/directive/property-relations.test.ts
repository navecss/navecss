/**
 * AC-native-apply-order-18: which CSS property names relate. Two properties relate when they are
 * the same property, one is a shorthand containing the other (transitively), they share a
 * longhand, one is `all`, or they are a logical and a physical member of one logical property
 * group. A custom property and a vendor-prefixed property relate only to themselves.
 */
import { describe, expect, it } from 'vitest'

import {
  isCssProperty,
  isLogicalPhysicalPair,
  logicalGroupOf,
  longhandsOf,
  propertiesRelate,
} from '../../src/directive/property-relations.ts'

/**
Both argument orders, because the relation is symmetric.
 */
function isRelatedBothWays(a: string, b: string): boolean {
  const isForward = propertiesRelate(a, b)
  expect(propertiesRelate(b, a)).toBe(isForward)
  return isForward
}

describe('AC-native-apply-order-18: propertiesRelate, shorthands and longhands', () => {
  it.each([
    ['display', 'display'],
    ['border-top-color', 'border'],
    ['border-top-color', 'border-color'],
    ['border-color', 'border-top'],
    ['border-width', 'border-top-width'],
    ['border-top', 'border-top-width'],
    ['gap', 'row-gap'],
    ['background', 'background-position-x'],
    ['inset', 'top'],
    ['overflow', 'overflow-x'],
    ['outline', 'outline-color'],
    ['outline', 'outline-width'],
    ['transition', 'transition-delay'],
  ])('%s relates to %s', (a, b) => {
    expect(isRelatedBothWays(a, b)).toBe(true)
  })

  it.each([
    ['outline', 'outline-offset'],
    ['overflow', 'overflow-wrap'],
    ['margin', 'padding'],
    ['margin-top', 'margin-left'],
    ['border-top-color', 'border-bottom-color'],
    ['color', 'background-color'],
    ['top', 'margin-top'],
    ['display', 'position'],
    ['border-top', 'border-bottom'],
  ])('%s does not relate to %s', (a, b) => {
    expect(isRelatedBothWays(a, b)).toBe(false)
  })

  it('stores the longhand set transitively: outline sets exactly its three longhands', () => {
    expect(longhandsOf('outline')).toEqual(['outline-color', 'outline-style', 'outline-width'])
  })

  it('border contains the longhands of the shorthands it contains', () => {
    const longhands = longhandsOf('border')
    expect(longhands).toContain('border-top-color')
    expect(longhands).toContain('border-left-width')
    expect(longhands).toContain('border-bottom-style')
    expect(longhands).not.toContain('border-width')
  })

  it('a longhand returns itself and an unknown name returns nothing', () => {
    expect(longhandsOf('display')).toEqual(['display'])
    expect(longhandsOf('dispaly')).toEqual([])
    expect(longhandsOf('')).toEqual([])
  })
})

describe('AC-native-apply-order-18: propertiesRelate, all', () => {
  it('relates to every property except custom properties, direction and unicode-bidi', () => {
    expect(isRelatedBothWays('display', 'all')).toBe(true)
    expect(isRelatedBothWays('margin-inline-start', 'all')).toBe(true)
    expect(isRelatedBothWays('border', 'all')).toBe(true)
    expect(isRelatedBothWays('all', 'all')).toBe(true)
    expect(isRelatedBothWays('--a', 'all')).toBe(false)
    expect(isRelatedBothWays('direction', 'all')).toBe(false)
    expect(isRelatedBothWays('unicode-bidi', 'all')).toBe(false)
  })

  it('does not relate a vendor-prefixed property to all', () => {
    expect(isRelatedBothWays('-webkit-user-select', 'all')).toBe(false)
  })

  it('direction and unicode-bidi still relate to themselves', () => {
    expect(isRelatedBothWays('direction', 'direction')).toBe(true)
    expect(isRelatedBothWays('unicode-bidi', 'unicode-bidi')).toBe(true)
  })
})

describe('AC-native-apply-order-18: propertiesRelate, logical property groups', () => {
  it.each([
    ['width', 'inline-size'],
    ['height', 'block-size'],
    ['width', 'block-size'],
    ['min-width', 'min-inline-size'],
    ['max-height', 'max-block-size'],
    ['margin-top', 'margin-inline-start'],
    ['margin-left', 'margin-block-end'],
    ['padding-right', 'padding-inline-end'],
    ['left', 'inset-inline'],
    ['top', 'inset-inline-start'],
    ['inset', 'inset-block-end'],
    ['margin', 'margin-block'],
    ['border-top-width', 'border-block-start-width'],
    ['border-left-style', 'border-inline-style'],
    ['border-color', 'border-inline-end-color'],
    ['border-bottom-right-radius', 'border-start-end-radius'],
    ['border-radius', 'border-end-end-radius'],
    ['overflow-x', 'overflow-block'],
    ['overflow', 'overflow-inline'],
    ['overscroll-behavior-y', 'overscroll-behavior-inline'],
    ['scroll-padding-left', 'scroll-padding-inline-start'],
    ['scroll-margin-top', 'scroll-margin-block-start'],
    ['contain-intrinsic-width', 'contain-intrinsic-inline-size'],
  ])('%s relates to %s', (a, b) => {
    expect(isRelatedBothWays(a, b)).toBe(true)
  })

  it.each([
    ['margin-block-start', 'margin-inline-start'],
    ['inline-size', 'block-size'],
    ['width', 'min-inline-size'],
    ['width', 'margin-inline-start'],
    ['padding-left', 'margin-inline-start'],
    ['border-top-width', 'border-block-start-color'],
    ['min-width', 'inline-size'],
    ['overflow-x', 'overscroll-behavior-inline'],
  ])('%s does not relate to %s', (a, b) => {
    expect(isRelatedBothWays(a, b)).toBe(false)
  })
})

describe('AC-native-apply-order-18: propertiesRelate, hand-corrected shorthands', () => {
  it('white-space is a shorthand of white-space-collapse and text-wrap-mode', () => {
    expect(isRelatedBothWays('white-space', 'text-wrap-mode')).toBe(true)
    expect(isRelatedBothWays('white-space', 'white-space-collapse')).toBe(true)
    expect(isRelatedBothWays('white-space', 'text-wrap')).toBe(true)
    expect(isRelatedBothWays('white-space', 'text-wrap-style')).toBe(false)
  })

  it('font resets its reset-only sub-properties', () => {
    for (const reset of [
      'font-kerning',
      'font-variant-ligatures',
      'font-variant-caps',
      'font-variant',
      'font-size-adjust',
      'font-stretch',
      'font-feature-settings',
      'font-language-override',
      'font-optical-sizing',
      'font-variation-settings',
    ]) {
      expect(isRelatedBothWays('font', reset)).toBe(true)
    }
  })

  it('font does not reset the properties it leaves cascaded independently', () => {
    expect(isRelatedBothWays('font', 'font-palette')).toBe(false)
    expect(isRelatedBothWays('font', 'font-synthesis-weight')).toBe(false)
  })

  it('font-variant and font-synthesis are shorthands of their longhands', () => {
    expect(isRelatedBothWays('font-variant', 'font-variant-numeric')).toBe(true)
    expect(isRelatedBothWays('font-synthesis', 'font-synthesis-style')).toBe(true)
  })
})

describe('AC-native-apply-order-19: propertiesRelate, legacy names and the border-image reset', () => {
  it.each([
    ['grid-gap', 'gap'],
    ['grid-gap', 'row-gap'],
    ['grid-gap', 'column-gap'],
    ['grid-gap', 'grid-row-gap'],
    ['grid-row-gap', 'row-gap'],
    ['grid-column-gap', 'column-gap'],
    ['word-wrap', 'overflow-wrap'],
    ['page-break-before', 'break-before'],
    ['page-break-after', 'break-after'],
    ['page-break-inside', 'break-inside'],
    ['border', 'border-image-source'],
    ['border', 'border-image-slice'],
    ['border', 'border-image-width'],
    ['border', 'border-image-outset'],
    ['border', 'border-image-repeat'],
  ])('%s relates to %s', (a, b) => {
    expect(isRelatedBothWays(a, b)).toBe(true)
  })

  it.each([
    ['grid-row-gap', 'column-gap'],
    ['grid-gap', 'grid-template-columns'],
    ['word-wrap', 'word-break'],
    ['word-wrap', 'overflow'],
    ['page-break-before', 'break-after'],
    ['border-image-source', 'border-color'],
    ['font-stretch', 'font-width'],
  ])('%s does not relate to %s', (a, b) => {
    expect(isRelatedBothWays(a, b)).toBe(false)
  })

  it.each([
    'grid-gap',
    'grid-row-gap',
    'grid-column-gap',
    'word-wrap',
    'page-break-before',
    'page-break-after',
    'page-break-inside',
  ])('%s is a property', (name) => {
    expect(isCssProperty(name)).toBe(true)
  })

  it('names the legacy name of a property as that property, in any ASCII case', () => {
    expect(isRelatedBothWays('GRID-GAP', 'Gap')).toBe(true)
    expect(isRelatedBothWays('Word-Wrap', 'OVERFLOW-WRAP')).toBe(true)
  })
})

describe('AC-native-apply-order-18: propertiesRelate, custom and vendor-prefixed properties', () => {
  it('a custom property relates only to itself, case-sensitively', () => {
    expect(isRelatedBothWays('--a', '--a')).toBe(true)
    expect(isRelatedBothWays('--a', '--A')).toBe(false)
    expect(isRelatedBothWays('--a', '--b')).toBe(false)
    expect(isRelatedBothWays('--a', 'color')).toBe(false)
    expect(isRelatedBothWays('--color', 'color')).toBe(false)
  })

  it('a vendor-prefixed property relates only to itself', () => {
    expect(isRelatedBothWays('-webkit-user-select', '-webkit-user-select')).toBe(true)
    expect(isRelatedBothWays('user-select', '-webkit-user-select')).toBe(false)
    expect(isRelatedBothWays('-webkit-user-select', '-moz-user-select')).toBe(false)
    expect(isRelatedBothWays('-webkit-box-flex', 'flex')).toBe(false)
    expect(isRelatedBothWays('-ms-flex', 'flex')).toBe(false)
  })

  it('user-select and -webkit-user-select do not relate', () => {
    expect(isRelatedBothWays('user-select', '-webkit-user-select')).toBe(false)
  })
})

describe('AC-native-apply-order-18: ASCII case-insensitivity', () => {
  it('property names compare without regard to ASCII case, custom properties excepted', () => {
    expect(isRelatedBothWays('DISPLAY', 'display')).toBe(true)
    expect(isRelatedBothWays('Margin-Top', 'margin-inline-start')).toBe(true)
    expect(isRelatedBothWays('BORDER', 'border-top-COLOR')).toBe(true)
    expect(isRelatedBothWays('-WEBKIT-user-select', '-webkit-user-select')).toBe(true)
    expect(isRelatedBothWays('ALL', 'display')).toBe(true)
  })

  it('folds ASCII only: the Kelvin sign is not a k', () => {
    const kelvinKerning = 'font-\u{212A}erning'
    expect(isCssProperty(kelvinKerning)).toBe(false)
    expect(propertiesRelate(kelvinKerning, 'font-kerning')).toBe(false)
  })

  it('longhandsOf lowercases a known or prefixed name and keeps a custom name as written', () => {
    expect(longhandsOf('OUTLINE')).toEqual(['outline-color', 'outline-style', 'outline-width'])
    expect(longhandsOf('-WebKit-User-Select')).toEqual(['-webkit-user-select'])
    expect(longhandsOf('--Mixed-Case')).toEqual(['--Mixed-Case'])
  })
})

describe('AC-native-apply-order-18: isCssProperty', () => {
  it.each(['display', 'outline', 'all', 'white-space-trim', '--x', '-webkit-box-flex', 'DISPLAY'])(
    '%s is a property',
    (name) => {
      expect(isCssProperty(name)).toBe(true)
    },
  )

  it.each([
    'dispaly',
    '',
    '--',
    'colour',
    '-webkit-',
    '-foo-bar',
    '-webkit',
    'margin_top',
    ' display',
  ])('%j is not a property', (name) => {
    expect(isCssProperty(name)).toBe(false)
  })

  it('does not take an Object.prototype member for a property', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isCssProperty(name)).toBe(false)
      expect(longhandsOf(name)).toEqual([])
    }
  })

  it('accepts all four vendor prefixes', () => {
    for (const prefix of ['-webkit-', '-moz-', '-ms-', '-o-']) {
      expect(isCssProperty(`${prefix}anything`)).toBe(true)
    }
  })

  it('returns [name] for a custom or prefixed property', () => {
    expect(longhandsOf('--x')).toEqual(['--x'])
    expect(longhandsOf('-moz-appearance')).toEqual(['-moz-appearance'])
  })
})

describe('AC-native-apply-order-18: logicalGroupOf and isLogicalPhysicalPair', () => {
  it('reports the group and the side of a longhand member', () => {
    expect(logicalGroupOf('inline-size')).toEqual({ logical: true, group: 'size' })
    expect(logicalGroupOf('width')).toEqual({ logical: false, group: 'size' })
    expect(logicalGroupOf('margin-inline-start')).toEqual({ logical: true, group: 'margin' })
    expect(logicalGroupOf('MARGIN-LEFT')).toEqual({ logical: false, group: 'margin' })
    expect(logicalGroupOf('overflow-block')).toEqual({ logical: true, group: 'overflow' })
    expect(logicalGroupOf('border-start-start-radius')).toEqual({
      logical: true,
      group: 'border-radius',
    })
  })

  it('reports nothing for a property outside every group', () => {
    expect(logicalGroupOf('display')).toBeUndefined()
    expect(logicalGroupOf('--x')).toBeUndefined()
    expect(logicalGroupOf('dispaly')).toBeUndefined()
  })

  it('pairs a logical and a physical property of one group, shorthands included', () => {
    expect(isLogicalPhysicalPair('width', 'inline-size')).toBe(true)
    expect(isLogicalPhysicalPair('inline-size', 'width')).toBe(true)
    expect(isLogicalPhysicalPair('margin-top', 'margin-inline-start')).toBe(true)
    expect(isLogicalPhysicalPair('left', 'inset-inline')).toBe(true)
    expect(isLogicalPhysicalPair('margin', 'margin-block-start')).toBe(true)
    expect(isLogicalPhysicalPair('border', 'border-inline-end-color')).toBe(true)
  })

  it('does not pair two properties of the same side, one property with itself, or different groups', () => {
    expect(isLogicalPhysicalPair('margin-left', 'margin-top')).toBe(false)
    expect(isLogicalPhysicalPair('margin-inline-start', 'margin-block-start')).toBe(false)
    expect(isLogicalPhysicalPair('width', 'width')).toBe(false)
    expect(isLogicalPhysicalPair('inline-size', 'inline-size')).toBe(false)
    expect(isLogicalPhysicalPair('width', 'margin-inline-start')).toBe(false)
    expect(isLogicalPhysicalPair('--a', 'inline-size')).toBe(false)
  })

  it('does not pair all with anything: it sets both sides', () => {
    expect(isLogicalPhysicalPair('all', 'width')).toBe(false)
    expect(isLogicalPhysicalPair('all', 'inline-size')).toBe(false)
  })
})
