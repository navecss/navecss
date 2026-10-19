/**
 * AC-native-apply-order-20: two declaration values of one property are equal when their token
 * sequences match after dropping comments, collapsing whitespace and lowercasing function names
 * (never a dashed one). The case of an ident is never folded, a keyword's included.
 */
import { describe, expect, it } from 'vitest'

import {
  declarationValuesEqual,
  normalizeValueForCompare,
} from '../../src/directive/value-equality.ts'

describe('AC-native-apply-order-20 - declaration value equality', () => {
  it.each([
    ['0 auto', '0    auto'],
    ['0 auto', '0 /* c */ auto'],
    ['  0 auto  ', '0 auto'],
    ['0\n\tauto', '0 auto'],
    ['var(--w)', 'VAR(--w)'],
    ['calc(1px + 2px)', 'CALC(1px + 2px)'],
    ['calc(1px + 2px)', 'calc(1px  +\n2px)'],
    ['rgb(0 0 0 / 50%)', 'RGB(0 0 0 / 50%)'],
    ['', ''],
    ['', '/* only a comment */'],
  ])('%j equals %j', (first, second) => {
    expect(declarationValuesEqual(first, second)).toBe(true)
  })

  it.each([
    ['none', 'NONE'],
    ['red', 'Red'],
    ['red', 'RED'],
    ['Arial', 'arial'],
    ['1px solid red', '1px SOLID RED'],
    ['Foo', 'foo'],
    ['Main', 'main'],
    ['--Fn(1px)', '--fn(1px)'],
    ['var(--w)', 'var(--W)'],
    ['--a', '--A'],
    ['var(--w, 2px)', 'var(--w)'],
    ['0', '0px'],
    ['10px', '10PX'],
    ['#fff', '#FFF'],
    ['"a"', '"A"'],
    ["'a'", '"a"'],
    ['0 auto', '0auto'],
    ['0 auto', 'auto 0'],
    ['1px 2px', '1px, 2px'],
    ['red', 'red !important'],
    ['url(a.png)', 'url(A.png)'],
  ])('%j differs from %j', (first, second) => {
    expect(declarationValuesEqual(first, second)).toBe(false)
  })

  it('keeps a dashed ident inside a function argument as written', () => {
    expect(declarationValuesEqual('var(--Brand-Color)', 'VAR(--Brand-Color)')).toBe(true)
    expect(declarationValuesEqual('var(--Brand-Color)', 'var(--brand-color)')).toBe(false)
  })

  it('normalizes a value to a string that is equal exactly when the values are equal', () => {
    expect(normalizeValueForCompare('CALC(1px)')).toBe(normalizeValueForCompare('calc(1px)'))
    expect(normalizeValueForCompare('NONE')).not.toBe(normalizeValueForCompare('none'))
    expect(normalizeValueForCompare('0 /* c */ auto')).toBe(normalizeValueForCompare('0   auto'))
    expect(normalizeValueForCompare('0')).not.toBe(normalizeValueForCompare('0px'))
  })
})
