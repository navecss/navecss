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

/** Matches a genuine `outline` declaration whose value is not `none`/`0` — i.e. one
 * that actually renders in forced-colors mode. */
const RENDERS_OUTLINE = /^outline$/i
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

  // Pinning row: this file's whole purpose is guarding the
  // shipped focus indicator, so it is the purpose-fit place to pin that the outline
  // reads the focus-ring-specific width token, not a general-purpose one.
  // The toHaveLength(1) guard is what keeps first-match ambiguity from ever masking
  // a cascade winner, per the quality reviewer's terminal read on this case.
  it('reads the focus-ring-specific width token, not a general-purpose one', () => {
    const decls = collectDeclarations(root, new RegExp(`^${FOCUS_RING_CLASS.replace('.', '\\.')}`))
    const renderingDecls = decls.filter(
      (d) => RENDERS_OUTLINE.test(d.prop) && !OUTLINE_IS_NONE.test(d.value),
    )
    expect(
      renderingDecls,
      'expected exactly one rendering outline declaration so the cascade winner is unambiguous',
    ).toHaveLength(1)
    expect(renderingDecls[0]?.value).toMatch(/var\(--nave-border-width-focus\)/)
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
})
