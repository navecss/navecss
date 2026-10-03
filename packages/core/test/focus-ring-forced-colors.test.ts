/**
 * Built-output guard for the SC 1.4.11 obligation on `focusRing`: it is
 * carried here, over the shipped `dist/atomic.css`, rather than by a
 * source-level lint.
 *
 * focusRing is the one focus indicator the reset's no-author-styled-focus
 * ruling left author-styled, so it is the one that still carries an SC
 * 1.4.11 obligation. In forced-colors
 * mode `box-shadow` is not rendered while `outline` is, so an indicator built
 * from `box-shadow` alone disappears for exactly the users forced-colors
 * mode exists for.
 *
 * A source-level lint cannot guard this: focusRing's declarations are a
 * TypeScript object literal in `src/atoms.ts`, its CSS exists only in
 * generated `dist/atomic.css`, and `.stylelintrc.json` excludes `dist`.
 * This test reads the shipped artifact instead, so
 * it is indifferent to whether the declaration is authored in CSS, in
 * TypeScript, or by a generator — the reset-focus.test.ts shape (assertion
 * of a class, not of one instance), applied to the atomic layer.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const ATOMIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/atomic.css')

/** The class name `toClassName('focusRing')` produces (src/atoms.ts). */
const FOCUS_RING_CLASS = '.nave-focus-ring'

/** Matches a genuine outline declaration whose value is not `none`/`0` — i.e. one
 * that actually renders in forced-colors mode. The ring is written as longhands
 * (`outline-style: solid`) rather than the `outline` shorthand: a shorthand with an
 * unresolvable `var()` is invalid as a whole and collapses to `outline: none`. */
const RENDERS_OUTLINE = /^outline(-style)?$/i
const OUTLINE_IS_NONE = /^\s*(none|0)\b/i

/**
 * Properties that repaint or relayout the element's OWN box, as opposed to
 * decorating it from outside. `outline*` is deliberately absent: an outline is
 * painted outside the border box and takes no space, which is the whole reason
 * it is the safe way to mark focus. Deliberately a DENY-list and not an
 * allow-list, so it cannot red a lawful future edit - the test below this one
 * already contemplates a `box-shadow` shipping alongside the outline.
 */
const MUTATES_BOX_GEOMETRY =
  /^(border-radius|border-(top|bottom)-(left|right)-radius|border|border-(top|right|bottom|left)|border(-(top|right|bottom|left))?-(width|style)|padding(-(top|right|bottom|left))?|margin(-(top|right|bottom|left))?|(min-|max-)?(width|height)|inset|top|right|bottom|left|transform|translate|scale|rotate|font-size|box-sizing)$/i

/**
 * Collects every declaration inside a rule matching `selectorPattern`, including
 * declarations nested one level down (the `&:focus-visible { ... }` shape
 * scripts/build-css.ts emits for pseudo blocks).
 */
function collectDeclarations(
  root: postcss.Root,
  selectorPattern: RegExp,
): { prop: string; value: string }[] {
  const found: { prop: string; value: string }[] = []

  root.walkRules(selectorPattern, (rule) => {
    rule.walkDecls((decl) => {
      found.push({ prop: decl.prop, value: decl.value })
    })
  })

  return found
}

/** Every `--nave-border-width-focus` declaration in a tokens stylesheet, in px (NaN when the
 * value is not a px length). Walks every rule, not only the first match, so a later `:root`
 * block (e.g. under `@media (prefers-contrast: more)`) is not missed. `@property` descriptors
 * (`syntax`, `inherits`, `initial-value`) are declarations too, and `walkDecls` visits them;
 * they are excluded here only because their names never match `--nave-border-width-focus`, the
 * property name this walk filters on. */
function focusWidthsPx(css: string): number[] {
  const widths: number[] = []
  postcss.parse(css).walkDecls('--nave-border-width-focus', (decl) => {
    const px = /^([\d.]+)px$/.exec(decl.value.trim())
    widths.push(px ? Number.parseFloat(px[1]!) : Number.NaN)
  })
  return widths
}

describe('dist/atomic.css — focusRing forced-colors indicator', () => {
  const css = readFileSync(ATOMIC, 'utf8')
  const root = postcss.parse(css)

  it('declares a rendering outline somewhere in the focusRing rule', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))

    const renderingOutline = decls.some(
      (d) => RENDERS_OUTLINE.test(d.prop) && !OUTLINE_IS_NONE.test(d.value),
    )

    expect(
      renderingOutline,
      `${FOCUS_RING_CLASS} must declare a non-"none" outline: forced-colors mode does not ` +
        'render box-shadow, so an indicator built from box-shadow alone is invisible there',
    ).toBe(true)
  })

  it('is not built from box-shadow alone: if box-shadow is present, outline must be too', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))

    const usesBoxShadow = decls.some((d) => /^box-shadow$/i.test(d.prop))
    const renderingOutline = decls.some(
      (d) => RENDERS_OUTLINE.test(d.prop) && !OUTLINE_IS_NONE.test(d.value),
    )

    if (usesBoxShadow) {
      expect(
        renderingOutline,
        `${FOCUS_RING_CLASS} declares box-shadow without a rendering outline alongside it`,
      ).toBe(true)
    } else {
      expect(renderingOutline).toBe(true)
    }
  })

  // Pinning rows: this file's whole purpose is guarding the shipped focus indicator, so it is the
  // purpose-fit place to pin that the outline reads the focus-ring-specific tokens, not
  // general-purpose ones, and that each read carries a fallback so a missing token layer still
  // leaves a ring. The toHaveLength(1) guards keep first-match ambiguity from ever masking a
  // cascade winner.
  it('reads the focus-ring-specific width token, not a general-purpose one', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))
    const widthDecls = decls.filter((d) => /^outline-width$/i.test(d.prop))
    expect(
      widthDecls,
      'expected exactly one outline-width declaration so the cascade winner is unambiguous',
    ).toHaveLength(1)
    expect(widthDecls[0]?.value).toMatch(/^var\(--nave-border-width-focus,/)
  })

  it('reads the focus-ring-specific colour token, not a general-purpose one', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))
    const colorDecls = decls.filter((d) => /^outline-color$/i.test(d.prop))
    expect(
      colorDecls,
      'expected exactly one outline-color declaration so the cascade winner is unambiguous',
    ).toHaveLength(1)
    expect(colorDecls[0]?.value).toMatch(/^var\(--nave-color-border-focus,/)
  })

  // The ring must survive a missing, partial or wrong-typed token layer. A `var()` fallback covers
  // the first two; the longhand split covers the third, because an invalid longhand falls back to
  // its own initial value where an invalid `outline` shorthand falls back to `none` as a whole.
  // The fallbacks themselves are pinned so that the degraded ring cannot quietly become an
  // author-picked colour (it is the element's own text colour, which is never invisible against
  // the element's own background) or a hairline.
  it('draws a ring when the tokens are missing: longhands, never the outline shorthand', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))
    const shorthandRings = decls.filter(
      (d) => /^outline$/i.test(d.prop) && !OUTLINE_IS_NONE.test(d.value),
    )

    expect(
      shorthandRings.map((d) => `${d.prop}: ${d.value}`),
      `${FOCUS_RING_CLASS} must restore its ring through outline-style/-width/-color: a ` +
        'shorthand holding an unresolvable var() is invalid as a whole and computes to none',
    ).toEqual([])
    expect(decls.filter((d) => /^outline-style$/i.test(d.prop)).map((d) => d.value)).toEqual([
      'solid',
    ])
  })

  it('falls back to the element’s own text colour and a ring of at least 2px', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))
    const width = decls.find((d) => /^outline-width$/i.test(d.prop))?.value ?? ''
    const color = decls.find((d) => /^outline-color$/i.test(d.prop))?.value ?? ''

    expect(color).toMatch(/^var\(--nave-color-border-focus,\s*currentColor\)$/i)
    const fallbackPx = /^var\(--nave-border-width-focus,\s*([\d.]+)px\)$/.exec(width)
    expect(fallbackPx, 'the width fallback must be a px length').not.toBeNull()
    expect(Number.parseFloat(fallbackPx![1]!)).toBeGreaterThanOrEqual(2)
  })

  // Absence assertion, the class the instance test in test/browser/ cannot
  // reach: that one focuses a pill in one engine and proves that case, and a
  // rule can mutate geometry in ways no single fixture happens to focus.
  it('mutates no box geometry: the indicator decorates the element, never reshapes it', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))

    const offenders = decls
      .filter((d) => MUTATES_BOX_GEOMETRY.test(d.prop))
      .map((d) => `${d.prop}: ${d.value}`)

    expect(
      offenders,
      `${FOCUS_RING_CLASS} must not change the element's own box on focus: a focus ` +
        'indicator that resizes or reshapes the component it marks is a layout change, ' +
        'not an indicator',
    ).toEqual([])
  })

  // WCAG 2.2 SC 2.4.13 Focus Appearance (Level AAA) asks that an area of the focus indicator be
  // at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component,
  // and have a contrast ratio of at least 3:1 between the same pixels in the focused and
  // unfocused states. For focusRing's outline, two values in the shipped rule matter here, and
  // the tests above check neither by value: they pin which custom property the outline width
  // reads, not what it resolves to, and nothing above reads outline-offset at all.
  //
  // Thickness: at least 2px. A thinner ring's area grows more slowly with the component's size
  // than the 2px perimeter it is measured against, so its margin turns negative on larger
  // components.
  //
  // Offset: strictly positive. At zero the outline is drawn starting just outside the border
  // edge, so a 2px ring covers exactly a 2px band around the outside of the component: if that
  // perimeter is read as a band outside the component (its largest reading), the ring has no area
  // to spare, and at today's thickness the whole margin comes from the offset. Below zero the
  // outline moves into the border box, over the component's own paint: there, the unfocused
  // pixels show the component rather than whatever it sits on, so the contrast is no longer the
  // focus colour against the background.
  //
  // This file already parses focusRing's declarations from the shipped CSS, so it is the natural
  // place for the offset check. The thickness check also reads the built tokens, because the
  // shipped rule carries a var() reference rather than a literal.
  it("focusRing's outline-offset is strictly positive: at zero a 2px ring has no area to spare, and below zero the ring moves into the border box", () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))
    const offsetDecls = decls.filter((d) => /^outline-offset$/i.test(d.prop))

    expect(offsetDecls, `${FOCUS_RING_CLASS} must declare outline-offset`).toHaveLength(1)
    expect(Number.parseFloat(offsetDecls[0]!.value)).toBeGreaterThan(0)
  })

  it("--nave-border-width-focus resolves to at least 2px in the built tokens: below that, the ring's area margin over SC 2.4.13 turns negative as components grow", () => {
    const tokensCss = readFileSync(
      fileURLToPath(import.meta.resolve('@navecss/tokens/css')),
      'utf8',
    )
    const widths = focusWidthsPx(tokensCss)

    expect(
      widths,
      '--nave-border-width-focus must be declared in the tokens build output',
    ).not.toEqual([])
    expect(
      widths.filter((w) => !(w >= 2)),
      '--nave-border-width-focus must resolve to at least 2px in every declaration',
    ).toEqual([])
  })

  it('the focus-width reader sees every declaration in the tokens build, not only the first', () => {
    const fixture = `
      :root {
        --nave-border-width-focus: 2px;
      }
      @media (prefers-contrast: more) {
        :root {
          --nave-border-width-focus: 1px;
        }
      }
      @property --nave-border-width-focus {
        syntax: '<length>';
        inherits: true;
        initial-value: 2px;
      }
    `

    expect(focusWidthsPx(fixture)).toEqual([2, 1])
  })
})
