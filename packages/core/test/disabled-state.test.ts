/**
 * Regression guard: `disabledState` was the state-styling convention's only shipped
 * counter-instance. Its declarations were unconditional (no pseudo gate at all) and its doc
 * comment instructed consumers to "pair with [disabled] or [aria-disabled] attributes" by
 * hand — the two-things-to-keep-in-sync failure mode the convention exists to remove.
 *
 * The project's design lead settled the shape: key the atom off both `:disabled` and
 * `[aria-disabled="true"]`, same nesting shape `focusRing` already ships for
 * `:focus-visible` (a bare pseudo-selector-list key, not the two-attribute doc-comment
 * instruction). The project's accessibility steward then required that the replacement doc
 * comment also state the aria-disabled branch's activation-handler obligation:
 * `pointer-events: none` blocks pointer activation only, so a component's own handler must
 * check the attribute and no-op on Enter/Space, since CSS cannot prevent keyboard activation
 * on a still-focusable element.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'

const ATOM_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/atoms.ts')
const atomSrcText = readFileSync(ATOM_SRC, 'utf8')

const ATOMIC_CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/atomic.css')
const atomicCss = readFileSync(ATOMIC_CSS, 'utf8')

describe('disabledState', () => {
  it('does not apply its visual/behavioural treatment unconditionally (no top-level declarations)', () => {
    // The earlier shape declared opacity/pointer-events/cursor at the atom's base
    // selector, unconditionally — the class alone triggered the disabled visual with no
    // CSS tie to the disabled/aria-disabled attribute at all, which is exactly the
    // "two things to keep in sync by hand" failure the convention exists to remove.
    expect(Object.keys(atoms.disabledState.declarations)).toEqual([])
  })

  it('keys the treatment off both :disabled and [aria-disabled="true"], nested (not paired by hand)', () => {
    const pseudoKeys = Object.keys(atoms.disabledState.pseudos ?? {})
    expect(pseudoKeys).toHaveLength(1)
    const [selector] = pseudoKeys
    expect(selector).toContain(':disabled')
    expect(selector).toContain('[aria-disabled="true"]')

    // Built output: the class rule nests the gated selector natively (parity with
    // focusRing's `&:focus-visible` shape, C3/C8's class of bug), never a
    // naive `.nave-disabled-state:disabled` string concatenation.
    const block = atomicCss.slice(atomicCss.indexOf('.nave-disabled-state'))
    expect(block).toMatch(/&:disabled/)
    expect(block).toContain('[aria-disabled="true"]')
    expect(block).not.toContain('.nave-disabled-state:disabled')
  })

  it('the visual declarations (colour, border-colour, pointer-events) live under the gated pseudo, not the base rule', () => {
    const pseudos: Record<string, Record<string, string>> = atoms.disabledState.pseudos ?? {}
    const gated: Record<string, string> = Object.values(pseudos)[0] ?? {}
    // exit 4: the dedicated disabled colour tokens, not a blanket
    // opacity — a uniform dim composites everything the element paints, including a
    // focusRing outline on the aria-disabled branch.
    expect(gated.color).toBe('var(--nave-color-content-disabled)')
    expect(gated['border-color']).toBe('var(--nave-color-border-disabled)')
    expect(gated.opacity).toBeUndefined()
    expect(gated['pointer-events']).toBe('none')
    // No cursor here: pointer-events: none stops the element from ever being hit-tested, so
    // a cursor declared on it can never paint. reset.css's [disabled], [aria-disabled='true']
    // rule still declares cursor: not-allowed, but on an element carrying this atom no cursor
    // paints at all (the atom's own pointer-events: none applies to that element too) — the
    // reset rule serves the disabled elements that do NOT carry this atom.
    expect(gated.cursor).toBeUndefined()
  })

  it('the built CSS never sets the disabled visual outside the gated selector (no unconditional rule)', () => {
    const root = postcss.parse(atomicCss)
    let baseRuleDeclaresDisabledVisual = false
    root.walkRules('.nave-disabled-state', (rule) => {
      const ownDecls = rule.nodes.filter((n) => n.type === 'decl')
      if (ownDecls.some((d) => ['color', 'border-color', 'pointer-events'].includes(d.prop))) {
        baseRuleDeclaresDisabledVisual = true
      }
    })
    expect(baseRuleDeclaresDisabledVisual).toBe(false)
  })

  it('the built CSS forms no compositing group for this atom at all (exit 4)', () => {
    // Bounded by the next top-level `.nave-` selector (atoms are joined by a blank line,
    // §build-css.ts), never a bare `\n}\n` — the atom's own nested pseudo rule closes with
    // an indented `    }\n  }\n`, which does not match that literal and would otherwise
    // silently include every atom generated after this one.
    const start = atomicCss.indexOf('.nave-disabled-state')
    const nextAtomStart = atomicCss.indexOf('\n\n  .nave-', start)
    const block = atomicCss.slice(start, nextAtomStart === -1 ? undefined : nextAtomStart)
    expect(block).toContain('color: var(--nave-color-content-disabled)')

    // The subject of exit 4's remedy is the CLASS of group-forming properties, of which
    // `opacity` is only the instance that shipped: any of these turns the element into a
    // compositing group, so everything it paints — including the focusRing outline on the
    // still-focusable aria-disabled branch — is composited as one layer, which is the
    // defect. Guarding only `opacity` would let a later `filter: grayscale(1)` or
    // `mix-blend-mode` reintroduce exactly the same behaviour under a different name and
    // pass. `clip-path` is deliberately NOT in this set: it clips, it does not alpha-
    // composite what remains.
    const GROUP_FORMING_PROPERTIES = [
      'opacity',
      'filter',
      'backdrop-filter',
      'mix-blend-mode',
      'isolation',
      'mask',
      'will-change',
      'contain',
      'perspective',
      'transform',
    ]
    expect(block).not.toMatch(new RegExp(String.raw`\b(${GROUP_FORMING_PROPERTIES.join('|')})\b`))
  })

  it("the doc comment states what the atom deliberately does NOT cover (a filled control's disabled fill)", () => {
    const commentBlock = atomSrcText.slice(
      atomSrcText.indexOf('disabledState — visual'),
      atomSrcText.indexOf('disabledState:', atomSrcText.indexOf('disabledState — visual')),
    )
    // Content, not a marker: the comment must actually name the boundary
    // (a filled control's disabled fill is a component obligation), not merely mention
    // "background" in passing.
    expect(commentBlock.toLowerCase()).toMatch(/background-color/)
    expect(commentBlock.toLowerCase()).toMatch(/filled control/)
    expect(commentBlock.toLowerCase()).toMatch(/component/)
  })

  it('the doc comment no longer instructs consumers to pair the class with the attribute by hand', () => {
    const commentBlock = atomSrcText.slice(
      atomSrcText.indexOf('disabledState — visual'),
      atomSrcText.indexOf('disabledState:', atomSrcText.indexOf('disabledState — visual')),
    )
    expect(commentBlock).not.toMatch(/pair with/i)
  })

  it('the doc comment states the aria-disabled branch keyboard-activation obligation', () => {
    const commentBlock = atomSrcText.slice(
      atomSrcText.indexOf('disabledState — visual'),
      atomSrcText.indexOf('disabledState:', atomSrcText.indexOf('disabledState — visual')),
    )
    // Content, not a marker: the comment must actually say the handler has to check the
    // attribute and no-op, not merely mention "aria-disabled" in passing.
    expect(commentBlock.toLowerCase()).toMatch(/aria-disabled/)
    expect(commentBlock.toLowerCase()).toMatch(/focusable/)
    expect(commentBlock.toLowerCase()).toMatch(/handler/)
    expect(commentBlock.toLowerCase()).toMatch(/no-?op/)
  })
})
