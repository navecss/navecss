/**
 * The seed AS GIVEN (the accepted theming specification's R5 rider 1; the accepted
 * token-build specification's R20): the shape the
 * build record's `input` field carries, typed so it can express every form R5 accepts and
 * populated with the string as written for every form that arrives as one. R20's own test is
 * that the obligation must not be dischargeable by a type that cannot fail: a record whose
 * `input` can only ever say `oklch` records nothing about what the consumer actually gave.
 *
 * Two shapes, because seeds arrive two ways. Nave's own shipped defaults are authored as OKLCH
 * TRIPLES in code, so the triple is what was given and `{ form: 'oklch', value }` records
 * exactly that, with no `raw` (the shape the record has carried since it was introduced). A
 * consumer's seed arrives as a CSS colour STRING, so its record carries the string verbatim in
 * `raw`, the form it was read as, whatever distinguishes that form further (a hex seed's digit
 * width, a `color()` seed's colour space), and in `value` the OKLCH the conversion produced at
 * ingest, BEFORE gamut normalisation. `value` is R5's first act (form acceptance and
 * conversion); the record's sibling `resolved` field is the second (normalisation and any
 * substitution), so a reader can see what their string became and then what the build used.
 */

import type { Oklch } from './color-math.ts'

export type ColorFunctionSpace = 'display-p3' | 'srgb'

export type HexWidth = 3 | 4 | 6 | 8

export type SeedInput =
  | { form: 'color'; raw: string; space: ColorFunctionSpace; value: Oklch }
  | { form: 'hex'; raw: string; value: Oklch; width: HexWidth }
  | { form: 'hsl' | 'lab' | 'lch' | 'oklch' | 'rgb'; raw: string; value: Oklch }
  | { form: 'oklch'; value: Oklch }

export type SeedInputs = Partial<Record<'danger' | 'primary', SeedInput>>
