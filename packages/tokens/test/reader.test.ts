/**
 * The first-party DTCG 2025.10 reader. Pins the name computation against the `name/kebab`
 * transform this package's build used to inherit from a third-party tool (verified empirically
 * against the shipped build before this test existed) and exercises the reader's hard-error
 * boundaries directly, since none of them are reachable through Nave's own migrated
 * `tokens.json` any more.
 *
 * **Every fixture here is written in the 2025.10 shape**, because that is the only shape the
 * reader reads. A fixture in the pre-stable draft shape no longer reaches the renderer at all:
 * the input contract refuses it first, which is `dtcg-2025-10-input.test.ts`'s subject. That
 * ordering is load-bearing for the refusal fixtures below — a shadow layer exercising ONE bad
 * sub-field has to be well-formed in its other four, or the shape pass refuses it before the
 * sub-field check it is written for ever runs.
 */
import { describe, expect, it } from 'vitest'

import { renderShadow } from '../src/composite-value.ts'
import { formatCssTokens } from '../src/formats.ts'
import { kebabName, readTokens } from '../src/reader.ts'

/**
A 2025.10 dimension value.
 */
const dim = (value: number, unit = 'px'): { unit: string; value: number } => ({ unit, value })

/**
A 2025.10 colour value.
 */
const col = (
  colorSpace: string,
  components: number[],
  alpha?: number,
): Record<string, unknown> => ({
  colorSpace,
  components,
  ...(alpha !== undefined && { alpha }),
})

/**
A well-formed shadow layer, with `overrides` replacing whichever sub-field a test is about.
 */
const layer = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  blur: dim(0),
  color: col('srgb', [1, 0, 0]),
  offsetX: dim(0),
  offsetY: dim(0),
  spread: dim(0),
  ...overrides,
})

const RED = 'color(srgb 1 0 0)'

/**
 * One of the shipped multi-layer shadow's layers: a rem offset and blur over a translucent
 * black. Named parameters rather than five positional ones, so a reader can tell which
 * dimension is which at the call site.
 */
const oklchLayer = (spec: {
  alpha: number
  blur: number
  offsetY: number
}): Record<string, unknown> =>
  layer({
    blur: dim(spec.blur, 'rem'),
    color: col('oklch', [0, 0, 0], spec.alpha),
    offsetY: dim(spec.offsetY, 'rem'),
  })

/**
 * The message `readTokens` refuses `source` with, or fails the test if it did not refuse it.
 * A malformed shadow sub-field, colour object or cubicBezier value is no longer an eager
 * per-node `TypeError` thrown from inside the renderer: the input contract now collects it
 * (`dtcg-2025-10-input.test.ts` owns that message's own contents in full); this file still
 * pins that each of these fixtures IS refused, and that the refusal names its node.
 */
function refusalMessage(source: unknown): string {
  try {
    readTokens(source)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected readTokens to refuse this source, and it did not')
}

describe('kebabName', () => {
  it('pins the three camelCase segments this package actually has', () => {
    expect(kebabName(['borderWidth', 'lg'])).toBe('border-width-lg')
    expect(kebabName(['lineHeight', 'base'])).toBe('line-height-base')
    expect(kebabName(['letterSpacing', 'tight'])).toBe('letter-spacing-tight')
  })

  it('pins the numeric and mixed segments (0, 12, 2xl)', () => {
    expect(kebabName(['_primitive', 'space', '0'])).toBe('primitive-space-0')
    expect(kebabName(['_primitive', 'space', '12'])).toBe('primitive-space-12')
    expect(kebabName(['font', 'size', '2xl'])).toBe('font-size-2xl')
  })

  it('leaves an already-kebab segment untouched', () => {
    expect(kebabName(['breakpoint', 'tablet-portrait'])).toBe('breakpoint-tablet-portrait')
  })
})

describe('readTokens — prefix invariance under a top-level `nave` wrapper (AC-token-build-32, R32)', () => {
  it('emits the identical --nave- custom property whether or not a source nests everything under a top-level `nave` group', () => {
    const plain = { color: { $type: 'color', surfaceBase: { $value: 'white' } } }
    const wrapped = { nave: { color: { $type: 'color', surfaceBase: { $value: 'white' } } } }

    const plainCss = formatCssTokens(readTokens(plain))
    const wrappedCss = formatCssTokens(readTokens(wrapped))

    expect(plainCss).toContain('--nave-color-surface-base: white;')
    expect(wrappedCss).not.toContain('--nave-nave-')
    expect(wrappedCss).toBe(plainCss)
  })

  it('strips a leading `nave` path segment for the emitted NAME even when `nave` is not the sole top-level key, and leaves an unrelated sibling untouched (AC-32 clause 2 has no "sole" qualifier)', () => {
    const tokens = readTokens({
      nave: { spacing: { $type: 'dimension', sm: { $value: dim(4) } } },
      brandx: { $type: 'dimension', gap: { $value: dim(8) } },
    })
    expect(tokens.find((t) => t.path.join('.') === 'nave.spacing.sm')?.name).toBe('spacing-sm')
    expect(tokens.find((t) => t.path.join('.') === 'brandx.gap')?.name).toBe('brandx-gap')
  })

  it('resolves a whole-value alias against the AUTHORED path (including its `nave` prefix), never against the name-stripped one', () => {
    const tokens = readTokens({
      nave: {
        color: { $type: 'color', brandbase: { $value: '#ff0000' } },
        semantic: { $type: 'color', accent: { $value: '{nave.color.brandbase}' } },
      },
    })
    const accent = tokens.find((t) => t.path.join('.') === 'nave.semantic.accent')
    expect(accent?.value).toBe('#ff0000')
    expect(accent?.name).toBe('semantic-accent')
  })
})

describe('readTokens — parse', () => {
  it('reads a $value node as a token, inheriting $type from the nearest ancestor group', () => {
    const tokens = readTokens({
      size: { $type: 'dimension', sm: { $value: dim(1, 'rem') } },
    })
    expect(tokens).toEqual([
      { path: ['size', 'sm'], name: 'size-sm', type: 'dimension', value: '1rem' },
    ])
  })

  it('never traverses a $-prefixed key as a group', () => {
    const tokens = readTokens({
      $extensions: { anything: { $value: 'not a token' } },
      color: { $value: 'red', $type: 'color' },
    })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.path).toEqual(['color'])
  })

  it('hard-errors on a legacy value/type node, naming the path', () => {
    expect(() => readTokens({ size: { sm: { value: '1rem', type: 'dimension' } } })).toThrow(
      /legacy token shape at "size\.sm"/,
    )
  })

  it('hard-errors when no $type is resolvable, own or inherited', () => {
    expect(() => readTokens({ size: { sm: { $value: dim(1, 'rem') } } })).toThrow(
      /no resolvable \$type for token "size\.sm"/,
    )
  })
})

describe('readTokens — reference resolution', () => {
  it('resolves a whole-value {a.b.c} alias', () => {
    const tokens = readTokens({
      base: { $type: 'dimension', unit: { $value: dim(4) } },
      spacing: { $type: 'dimension', sm: { $value: '{base.unit}' } },
    })
    const spacing = tokens.find((t) => t.name === 'spacing-sm')
    expect(spacing?.value).toBe('4px')
  })

  it('resolves a reference chain transitively', () => {
    const tokens = readTokens({
      a: { $type: 'dimension', one: { $value: dim(4) } },
      b: { $type: 'dimension', two: { $value: '{a.one}' } },
      c: { $type: 'dimension', three: { $value: '{b.two}' } },
    })
    expect(tokens.find((t) => t.name === 'c-three')?.value).toBe('4px')
  })

  it('hard-errors on a reference cycle', () => {
    expect(() =>
      readTokens({
        a: { $type: 'dimension', one: { $value: '{b.two}' } },
        b: { $type: 'dimension', two: { $value: '{a.one}' } },
      }),
    ).toThrow(/reference cycle detected/)
  })

  it('hard-errors on a $ref-only reference cycle', () => {
    expect(() =>
      readTokens({
        a: { $type: 'dimension', one: { $ref: '#/b/two' } },
        b: { $type: 'dimension', two: { $ref: '#/a/one' } },
      }),
    ).toThrow(/reference cycle detected/)
  })

  it('hard-errors on a $ref that points at itself', () => {
    expect(() =>
      readTokens({
        a: { $type: 'dimension', one: { $ref: '#/a/one' } },
      }),
    ).toThrow(/reference cycle detected/)
  })

  it('hard-errors on a cycle mixing both reference forms ($ref -> {alias} -> $ref)', () => {
    expect(() =>
      readTokens({
        a: { $type: 'dimension', one: { $ref: '#/b/two' } },
        b: { $type: 'dimension', two: { $value: '{c.three}' } },
        c: { $type: 'dimension', three: { $ref: '#/a/one' } },
      }),
    ).toThrow(/reference cycle detected/)
  })

  it('hard-errors on an unresolved reference target', () => {
    expect(() =>
      readTokens({ a: { $type: 'dimension', one: { $value: '{nowhere.at.all}' } } }),
    ).toThrow(/references unresolved target "nowhere\.at\.all"/)
  })

  it('hard-errors on a reference embedded inside a larger string, never a partial substitution', () => {
    expect(() =>
      // `color`, not `dimension`: a bare string under `dimension` is the pre-stable draft shape
      // and the input contract refuses it one pass earlier, which would refuse this fixture for
      // a reason that has nothing to do with the embedded reference. A colour string is read as
      // the CSS value it is, so the embedded-reference check is what this fixture reaches.
      readTokens({
        base: { $type: 'color', brand: { $value: '#ff0000' } },
        mixed: { $type: 'color', tinted: { $value: 'color-mix(in oklch, {base.brand}, white)' } },
      }),
    ).toThrow(/embeds a reference inside a larger string/)
  })

  it('passes a non-reference literal straight through, including a number', () => {
    const tokens = readTokens({
      breakpoint: { $type: 'number', desktop: { $value: 1200 } },
    })
    expect(tokens[0]!.value).toBe(1200)
  })
})

describe('readTokens — composite values', () => {
  it('renders a single shadow layer object to the CSS box-shadow layer syntax', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        raised: {
          $value: layer({ blur: dim(0.1875, 'rem'), offsetY: dim(0.0625, 'rem') }),
        },
      },
    })
    expect(tokens[0]!.value).toBe(`0px 0.0625rem 0.1875rem 0px ${RED}`)
  })

  it('emits a zero spread rather than dropping it, since 2025.10 requires the sub-field', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        flat: { $value: layer({ blur: dim(2), offsetY: dim(1) }) },
      },
    })
    expect(tokens[0]!.value).toBe(`0px 1px 2px 0px ${RED}`)
  })

  it('joins an array of shadow layers with a comma, matching multi-layer CSS box-shadow', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        raised: {
          $value: [
            layer({
              blur: dim(0.1875, 'rem'),
              color: col('oklch', [0, 0, 0], 0.08),
              offsetY: dim(0.0625, 'rem'),
            }),
            layer({
              blur: dim(0.125, 'rem'),
              color: col('oklch', [0, 0, 0], 0.06),
              offsetY: dim(0.0625, 'rem'),
            }),
          ],
        },
      },
    })
    expect(tokens[0]!.value).toBe(
      '0px 0.0625rem 0.1875rem 0px oklch(0 0 0 / 0.08), 0px 0.0625rem 0.125rem 0px oklch(0 0 0 / 0.06)',
    )
  })

  it('renders an empty shadow array as "none"', () => {
    const tokens = readTokens({ shadow: { $type: 'shadow', none: { $value: [] } } })
    expect(tokens[0]!.value).toBe('none')
  })

  it('pins all four shipped shadow tokens byte-for-byte against the shipped CSS contract', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        none: { $value: [] },
        raised: {
          $value: [
            oklchLayer({ alpha: 0.08, blur: 0.1875, offsetY: 0.0625 }),
            oklchLayer({ alpha: 0.06, blur: 0.125, offsetY: 0.0625 }),
          ],
        },
        overlay: {
          $value: [
            oklchLayer({ alpha: 0.1, blur: 0.75, offsetY: 0.25 }),
            oklchLayer({ alpha: 0.08, blur: 0.375, offsetY: 0.125 }),
          ],
        },
        modal: {
          $value: [
            oklchLayer({ alpha: 0.15, blur: 2, offsetY: 1 }),
            oklchLayer({ alpha: 0.1, blur: 1, offsetY: 0.5 }),
          ],
        },
      },
    })
    const byName = Object.fromEntries(tokens.map((t) => [t.name, t.value]))
    expect(byName).toEqual({
      'shadow-none': 'none',
      'shadow-raised':
        '0px 0.0625rem 0.1875rem 0px oklch(0 0 0 / 0.08), 0px 0.0625rem 0.125rem 0px oklch(0 0 0 / 0.06)',
      'shadow-overlay':
        '0px 0.25rem 0.75rem 0px oklch(0 0 0 / 0.1), 0px 0.125rem 0.375rem 0px oklch(0 0 0 / 0.08)',
      'shadow-modal':
        '0px 1rem 2rem 0px oklch(0 0 0 / 0.15), 0px 0.5rem 1rem 0px oklch(0 0 0 / 0.1)',
    })
  })

  it('renders a 4-element cubicBezier array to the CSS cubic-bezier() function form', () => {
    const tokens = readTokens({
      motion: { easing: { $type: 'cubicBezier', standard: { $value: [0.4, 0, 0.2, 1] } } },
    })
    expect(tokens[0]!.value).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('pins all three shipped cubicBezier tokens byte-for-byte', () => {
    const tokens = readTokens({
      motion: {
        easing: {
          $type: 'cubicBezier',
          standard: { $value: [0.4, 0, 0.2, 1] },
          decelerate: { $value: [0, 0, 0.2, 1] },
          accelerate: { $value: [0.4, 0, 1, 1] },
        },
      },
    })
    const byName = Object.fromEntries(tokens.map((t) => [t.name, t.value]))
    expect(byName).toEqual({
      'motion-easing-standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
      'motion-easing-decelerate': 'cubic-bezier(0, 0, 0.2, 1)',
      'motion-easing-accelerate': 'cubic-bezier(0.4, 0, 1, 1)',
    })
  })

  it('hard-errors on a cubicBezier value that is not a 4-element array', () => {
    const message = refusalMessage({
      motion: { easing: { $type: 'cubicBezier', bad: { $value: [0.4, 0, 0.2] } } },
    })
    expect(message).toContain('motion.easing.bad')
    expect(message).toContain('[0.4,0,0.2]')
    expect(message).toMatch(/cubicBezier value must be a 4-element array/)
  })

  it('hard-errors on a cubicBezier value with a non-numeric element, rather than joining it in', () => {
    const message = refusalMessage({
      motion: { easing: { $type: 'cubicBezier', bad: { $value: [0.4, 0, '0.2', 1] } } },
    })
    expect(message).toContain('motion.easing.bad')
    expect(message).toContain('[0.4,0,"0.2",1]')
    expect(message).toMatch(/cubicBezier value must be a 4-element numeric array/)
  })

  it('hard-errors on a cubicBezier value with an out-of-range x-coordinate, rather than emitting invalid CSS', () => {
    const message = refusalMessage({
      motion: { easing: { $type: 'cubicBezier', bad: { $value: [5, 0, -3, 1] } } },
    })
    expect(message).toContain('motion.easing.bad')
    expect(message).toContain('[5,0,-3,1]')
    expect(message).toMatch(/x-coordinates \(x1, x2\) must be within \[0, 1\]/)
  })

  it('renders a 2025.10 shadow whose colour names a colour-function space through CSS color()', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        none: { $value: layer({ color: col('srgb', [0, 0, 0], 0.2) }) },
      },
    })
    expect(tokens[0]!.value).toBe('0px 0px 0px 0px color(srgb 0 0 0 / 0.2)')
  })

  it('omits the colour function alpha slot when the colour sub-field carries none', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        raised: {
          $value: layer({ blur: dim(2), color: col('display-p3', [0, 0, 0]), offsetY: dim(1) }),
        },
      },
    })
    expect(tokens[0]!.value).toBe('0px 1px 2px 0px color(display-p3 0 0 0)')
  })

  it('refuses a shadow dimension sub-field that is not a {value, unit} object, naming the field', () => {
    const message = refusalMessage({
      shadow: { $type: 'shadow', bad: { $value: layer({ offsetX: { value: 0 } }) } },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"offsetX":{"value":0}')
    expect(message).toMatch(/dimension "offsetX" must be a \{value, unit\} object/)
  })

  it('refuses a shadow colour sub-field naming a space the Colour Module does not define', () => {
    const message = refusalMessage({
      shadow: { $type: 'shadow', bad: { $value: layer({ color: col('cmyk', [50, 20, 30]) }) } },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"colorSpace":"cmyk"')
    expect(message).toMatch(/colorSpace "cmyk" is not one this reader renders/)
  })

  it('refuses a shadow colour sub-field that is not a well-formed colour object', () => {
    const message = refusalMessage({
      shadow: { $type: 'shadow', bad: { $value: layer({ color: { colorSpace: 'srgb' } }) } },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"color":{"colorSpace":"srgb"}')
    expect(message).toMatch(/"color" must be a \{colorSpace, components, alpha\?\} object/)
  })

  it('accepts each unit in the closed dimension set (px, rem, em)', () => {
    const tokens = readTokens({
      shadow: {
        $type: 'shadow',
        pxBlur: { $value: layer({ blur: dim(2, 'px') }) },
        remBlur: { $value: layer({ blur: dim(2, 'rem') }) },
        emBlur: { $value: layer({ blur: dim(2, 'em') }) },
      },
    })
    const byName = Object.fromEntries(tokens.map((t) => [t.name, t.value]))
    expect(byName['shadow-px-blur']).toBe(`0px 0px 2px 0px ${RED}`)
    expect(byName['shadow-rem-blur']).toBe(`0px 0px 2rem 0px ${RED}`)
    expect(byName['shadow-em-blur']).toBe(`0px 0px 2em 0px ${RED}`)
  })

  it('refuses a dimension unit outside the closed set, naming it', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ offsetX: { unit: 'banana', value: 1 } }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"unit":"banana"')
    expect(message).toMatch(/dimension "offsetX" unit "banana" is not one this reader renders/)
  })

  it('refuses a dimension unit spelled in the wrong case', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ offsetX: { unit: 'PX', value: 1 } }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"unit":"PX"')
    expect(message).toMatch(/dimension "offsetX" unit "PX" is not one this reader renders/)
  })

  it('refuses an empty-string dimension unit', () => {
    const message = refusalMessage({
      shadow: { $type: 'shadow', bad: { $value: layer({ offsetX: { unit: '', value: 1 } }) } },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"unit":""')
    expect(message).toMatch(/dimension "offsetX" unit "" is not one this reader renders/)
  })

  it('refuses a dimension unit that carries more than a unit, rather than rendering it verbatim', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ offsetX: { unit: 'px; color: red', value: 1 } }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('px; color: red')
    expect(message).toMatch(
      /dimension "offsetX" unit "px; color: red" is not one this reader renders/,
    )
  })

  it('refuses a shadow layer that is not a plain object, whether it is the whole value or an array element', () => {
    // `JSON.parse('null')`, not a literal `null`, stays within this file's own lint rules while
    // still exercising the isPlainObject(value !== null) branch for real.
    expect(() => renderShadow(JSON.parse('null'))).toThrow(/shadow layer must be a plain object/)
    const message = refusalMessage({
      shadow: { $type: 'shadow', bad: { $value: JSON.parse('[null]') as unknown } },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('[null]')
    expect(message).toMatch(/shadow layer must be a plain object/)
  })

  // `JSON.parse('1e400')`, not the numeric literal, both because the literal loses precision
  // under this file's own lint rules and because it is the exact way this value actually
  // reaches the reader: `JSON.parse('{"value":1e400}')` yields `Infinity`, so a real token
  // file can produce it, unlike a hand-typed `Infinity` a source file would never contain.
  const INFINITY_VIA_JSON = JSON.parse('1e400') as number

  it('refuses a dimension value that is not finite (an Infinity a token file can produce via numeric overflow)', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ offsetX: dim(INFINITY_VIA_JSON) }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"offsetX":{"unit":"px","value":null}')
    expect(message).toMatch(/dimension "offsetX" must be a \{value, unit\} object/)
  })

  it('refuses a shadow colour alpha that is not finite', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ color: col('srgb', [0, 0, 0], INFINITY_VIA_JSON) }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"alpha":null')
    expect(message).toMatch(/"color" must be a \{colorSpace, components, alpha\?\} object/)
  })

  it('refuses a shadow colour component that is not finite, at any of the three positions', () => {
    const badComponents = [
      [INFINITY_VIA_JSON, 0, 0],
      [0, INFINITY_VIA_JSON, 0],
      [0, 0, INFINITY_VIA_JSON],
    ]
    for (const components of badComponents) {
      const message = refusalMessage({
        shadow: {
          $type: 'shadow',
          bad: { $value: layer({ color: col('srgb', components) }) },
        },
      })
      expect(message).toContain('shadow.bad')
      expect(message).toContain(`"components":${JSON.stringify(components)}`)
      expect(message).toMatch(/"color" must be a \{colorSpace, components, alpha\?\} object/)
    }
  })

  it('refuses a cubicBezier value with a non-finite element, at any position including y1 and y2', () => {
    const badValues = [
      [INFINITY_VIA_JSON, 0, 0.2, 1],
      [0.4, INFINITY_VIA_JSON, 0.2, 1],
      [0.4, 0, INFINITY_VIA_JSON, 1],
      [0.4, 0, 0.2, INFINITY_VIA_JSON],
    ]
    for (const value of badValues) {
      const message = refusalMessage({
        motion: { easing: { $type: 'cubicBezier', bad: { $value: value } } },
      })
      expect(message).toContain('motion.easing.bad')
      expect(message).toContain(JSON.stringify(value))
      expect(message).toMatch(/cubicBezier value must be a 4-element numeric array/)
    }
  })

  it('renders every colorSpace CSS color() accepts, not just the two already exercised above', () => {
    const spaces = [
      'a98-rgb',
      'display-p3',
      'prophoto-rgb',
      'rec2020',
      'srgb',
      'srgb-linear',
      'xyz',
      'xyz-d50',
      'xyz-d65',
    ]
    for (const colorSpace of spaces) {
      const tokens = readTokens({
        shadow: {
          $type: 'shadow',
          bad: { $value: layer({ color: col(colorSpace, [1, 2, 3]) }) },
        },
      })
      expect(tokens[0]!.value).toBe(`0px 0px 0px 0px color(${colorSpace} 1 2 3)`)
    }
  })

  it('renders every colorSpace that has a CSS function of its own, percentages included', () => {
    const expected: Record<string, string> = {
      hsl: 'hsl(120 50% 60%)',
      hwb: 'hwb(120 50% 60%)',
      lab: 'lab(120 50 60)',
      lch: 'lch(120 50 60)',
      oklab: 'oklab(120 50 60)',
      oklch: 'oklch(120 50 60)',
    }
    for (const [colorSpace, rendered] of Object.entries(expected)) {
      const tokens = readTokens({
        shadow: {
          $type: 'shadow',
          one: { $value: layer({ color: col(colorSpace, [120, 50, 60]) }) },
        },
      })
      expect(tokens[0]!.value).toBe(`0px 0px 0px 0px ${rendered}`)
    }
  })

  it('refuses a shadow colour with 4 components, not just fewer than 3', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ color: col('srgb', [0, 0, 0, 0]) }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"components":[0,0,0,0]')
    expect(message).toMatch(/"color" must be a \{colorSpace, components, alpha\?\} object/)
  })

  it('hard-errors when only the cubicBezier x2 coordinate is out of range', () => {
    const message = refusalMessage({
      motion: { easing: { $type: 'cubicBezier', bad: { $value: [0.4, 0, 1.5, 1] } } },
    })
    expect(message).toContain('motion.easing.bad')
    expect(message).toContain('[0.4,0,1.5,1]')
    expect(message).toMatch(/x-coordinates \(x1, x2\) must be within \[0, 1\]/)
  })

  it('refuses a shadow colour colorSpace that is not a string', () => {
    const message = refusalMessage({
      shadow: {
        $type: 'shadow',
        bad: { $value: layer({ color: { colorSpace: 42, components: [0, 0, 0] } }) },
      },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"colorSpace":42')
    expect(message).toMatch(/"color" must be a \{colorSpace, components, alpha\?\} object/)
  })

  it('refuses a shadow dimension sub-field that is a bare number rather than an object', () => {
    const message = refusalMessage({
      shadow: { $type: 'shadow', bad: { $value: layer({ offsetX: 42 }) } },
    })
    expect(message).toContain('shadow.bad')
    expect(message).toContain('"offsetX":42')
    expect(message).toMatch(/dimension "offsetX" must be a \{value, unit\} object/)
  })
})
