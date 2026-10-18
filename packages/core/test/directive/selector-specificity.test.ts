/**
 * AC-native-apply-order-13: which selectors of a nested list are compared (only those whose
 * subject compound sits on the `&` element) and what specificity each one has.
 * AC-native-apply-order-14: the specificity boundary cases (`:is`, `:where`, `:not`,
 * `nth-child of`, pseudo-elements, quotes and comments).
 */
import { describe, expect, it } from 'vitest'

import {
  addSpecificity,
  ampersandSpecificity,
  compareSpecificity,
  endsInPseudoElement,
  isPseudoElementOnlyList,
  maxSpecificity,
  nestedSpecificities,
  type Specificity,
} from '../../src/directive/selector-specificity.ts'

const CLASS_AMP: Specificity = [0, 1, 0]
const ID_AMP: Specificity = [1, 1, 0]

describe('AC-native-apply-order-13 - which nested selectors are compared, and at what specificity', () => {
  it.each<[string, Specificity, Specificity[]]>([
    ['&', CLASS_AMP, [[0, 1, 0]]],
    ['&:focus', CLASS_AMP, [[0, 2, 0]]],
    ['.dark &', CLASS_AMP, [[0, 2, 0]]],
    ['&.open', CLASS_AMP, [[0, 2, 0]]],
    [':is(&.open, & > span)', CLASS_AMP, [[0, 2, 0]]],
    ['&:focus, & > span', CLASS_AMP, [[0, 2, 0]]],
    ['& + &', CLASS_AMP, [[0, 2, 0]]],
    [':where(&).open', CLASS_AMP, [[0, 1, 0]]],
    ['& > span', CLASS_AMP, []],
    ['& :focus', CLASS_AMP, []],
    [':focus', CLASS_AMP, []],
    [':not(&)', CLASS_AMP, []],
    [':has(&)', CLASS_AMP, []],
    [':nth-child(1 of &)', CLASS_AMP, []],
    ['&::before', CLASS_AMP, []],
    [':is(& > span)', CLASS_AMP, []],
    ['&:focus-visible:hover', CLASS_AMP, [[0, 3, 0]]],
    ['.dark &:focus-visible', CLASS_AMP, [[0, 3, 0]]],
    ['&:focus:not(:focus-visible)', CLASS_AMP, [[0, 3, 0]]],
    ['#y &', CLASS_AMP, [[1, 1, 0]]],
    ['& + &', ID_AMP, [[2, 2, 0]]],
    ['#y &', ID_AMP, [[2, 1, 0]]],
  ])('nestedSpecificities(%j, %j) is %j', (selector, amp, expected) => {
    expect(nestedSpecificities(selector, amp)).toEqual(expected)
  })

  it('returns one entry per qualifying complex selector, in list order', () => {
    expect(nestedSpecificities('&:hover, &:focus-visible:hover, & > a, #x &', CLASS_AMP)).toEqual([
      [0, 2, 0],
      [0, 3, 0],
      [1, 1, 0],
    ])
  })

  it('does not read a & inside a string, an attribute value or a comment as a nesting selector', () => {
    expect(nestedSpecificities('[data-label="A & B"]', CLASS_AMP)).toEqual([])
    expect(nestedSpecificities(".a[title='&']", CLASS_AMP)).toEqual([])
    expect(nestedSpecificities('/* & */ :focus', CLASS_AMP)).toEqual([])
  })

  it('counts a & next to an attribute selector that holds an ampersand once', () => {
    expect(nestedSpecificities('&[data-label="A & B"]', CLASS_AMP)).toEqual([[0, 2, 0]])
  })
})

describe('AC-native-apply-order-14 - specificity boundary cases', () => {
  it.each<[string, Specificity]>([
    ['.a', [0, 1, 0]],
    ['.a, .b.c', [0, 2, 0]],
    ['#x .a', [1, 1, 0]],
    ['.a, #x', [1, 0, 0]],
    ['div.a', [0, 1, 1]],
    ['.a:hover', [0, 2, 0]],
    ['.a[data-x="1"]', [0, 2, 0]],
    [':where(.a, #x)', [0, 0, 0]],
    [':is(.a, #x)', [1, 0, 0]],
    ['.p:is(.a, .b.c)', [0, 3, 0]],
    ['.p:not(#x, .y)', [1, 1, 0]],
    ['.p:has(> .a.b)', [0, 3, 0]],
    ['.p:nth-child(2n)', [0, 2, 0]],
    ['.p:nth-child(2n+1 of .a.b)', [0, 4, 0]],
    ['.p:nth-last-child(odd of #x)', [1, 2, 0]],
    ['*', [0, 0, 0]],
    ['* > .a', [0, 1, 0]],
    ['ul > li', [0, 0, 2]],
    ['.a:lang(en)', [0, 2, 0]],
    ['.a .b + .c ~ .d', [0, 4, 0]],
  ])('ampersandSpecificity(%j) is %j', (list, expected) => {
    expect(ampersandSpecificity(list)).toEqual(expected)
  })

  it('takes the maximum over the selectors that do not end in a pseudo-element', () => {
    expect(ampersandSpecificity('.a::before, .b, #c::after')).toEqual([0, 1, 0])
  })

  it('is [0,0,0] when every selector ends in a pseudo-element', () => {
    expect(ampersandSpecificity('.a::before, #b::after')).toEqual([0, 0, 0])
  })

  it('ignores a comma and a hash inside a string or an attribute value', () => {
    expect(ampersandSpecificity('[data-x="a, #b"]')).toEqual([0, 1, 0])
  })

  it.each([
    ['.a::before', true],
    ['.a::after', true],
    ['.a:before', true],
    ['.a:AFTER', true],
    ['.a:first-line', true],
    ['.a:first-letter', true],
    ['.a::first-line', true],
    ['.p::part(x)', true],
    ['.p::part(x):hover', true],
    ['.p::slotted(span)', true],
    ['.p::-webkit-scrollbar', true],
    ['.a::before:hover', true],
    ['.a:hover', false],
    ['.a', false],
    ['.a::before .b', false],
    ['.a::before > .b:hover', false],
    ['.b:is(.a::before)', false],
    ['[data-x="::before"]', false],
    ['.a:before-not', false],
  ])('endsInPseudoElement(%j) is %j', (selector, expected) => {
    expect(endsInPseudoElement(selector)).toBe(expected)
  })

  it.each([
    ['.a::before', true],
    ['.a::before, .b:after', true],
    ['.a::before, .b', false],
    ['.a, .b', false],
    ['.p::part(x):hover, .q::before', true],
  ])('isPseudoElementOnlyList(%j) is %j', (list, expected) => {
    expect(isPseudoElementOnlyList(list)).toBe(expected)
  })

  it('compares specificity triples id first, then class, then type', () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 0, 1], [0, 0, 2])).toBeLessThan(0)
    expect(compareSpecificity([0, 2, 1], [0, 2, 1])).toBe(0)
  })

  it('adds triples component-wise and takes the maximum under the same ordering', () => {
    expect(addSpecificity([1, 2, 3], [0, 1, 1])).toEqual([1, 3, 4])
    expect(
      maxSpecificity([
        [0, 9, 9],
        [1, 0, 0],
        [0, 1, 0],
      ]),
    ).toEqual([1, 0, 0])
    expect(maxSpecificity([])).toEqual([0, 0, 0])
  })

  it('reads a hex escape and an escaped character inside a class name as one class', () => {
    expect(ampersandSpecificity(String.raw`.a\31 b, .md\:flex`)).toEqual([0, 1, 0])
  })

  it('counts a & twice in a selector that holds it twice', () => {
    expect(nestedSpecificities('& + &:hover', [0, 2, 0])).toEqual([[0, 5, 0]])
  })

  it('reaches a & through a nested :is inside :is, taking the maximum over every arm', () => {
    expect(nestedSpecificities(':is(:is(&.x, .y) > b, &)', CLASS_AMP)).toEqual([[0, 2, 1]])
  })

  it('does not count a pseudo-element inside the subject compound', () => {
    expect(nestedSpecificities('&::part(x):hover', CLASS_AMP)).toEqual([])
    expect(nestedSpecificities('&:before', CLASS_AMP)).toEqual([])
  })

  it('reads a leading combinator as relative to the nesting parent', () => {
    expect(nestedSpecificities('> &', CLASS_AMP)).toEqual([[0, 1, 0]])
    expect(nestedSpecificities('+ .x', CLASS_AMP)).toEqual([])
  })
})
