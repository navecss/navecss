/**
 * The pruning step on its own (AC-used-atoms-25, -26, -27, -28, -32): whole atoms leave the
 * `@layer atomic` block of a stylesheet, selector lists are pruned member by member, an at-rule
 * left empty goes, a selector naming a built-in atom class goes whatever else it holds, and
 * nothing outside `@layer atomic` is touched. The build-level fixtures run the same step inside
 * a real `vite build`, under both CSS transformers.
 */
import { describe, expect, it } from 'vitest'

import { atoms } from '../src/atoms.ts'

import { inspectAtomicLayer, pruneAtomicLayer } from '../src/vite-prune.ts'

const NESTED = `
@layer tokens, reset, atomic, overrides;
.outside .nave-hidden { color: red; }
@layer atomic {
  .nave-flex { display: flex; }
  .nave-grid { display: grid; }
  .nave-focus-ring {
    outline: none;
    &:focus-visible { outline: 2px solid; outline-offset: 2px; }
  }
  .nave-hide-phone-only {
    @media (width < 37.5em) { & { display: none; } }
  }
  .brand-x { color: red; }
  .nave-grid > .child { color: red; }
}
@layer overrides { .menu .nave-hidden { color: red; } }
`

const LOWERED = `
@layer atomic {
  .nave-sr-only, .nave-sr-only-focusable { position: absolute; width: 1px; }
  .nave-sr-only-focusable:focus-visible { position: static; }
  .nave-sr-only-focusable:focus-within { position: static; }
  .nave-flex { display: flex; }
  @media (width < 37.5em) { .nave-hide-phone-only { display: none; } }
  @media (width >= 37.5em) { .nave-flex { gap: 1px; } .nave-hide-desktop-up { display: none; } }
  .nave-disabled-state:disabled, .nave-disabled-state[aria-disabled="true"] { opacity: 0.5; }
}
`

/**
 * The class names (without the dot) a stylesheet's rules select, in order of appearance.
 */
function classesIn(css: string): string[] {
  return [...css.matchAll(/\.(nave-[\w-]+)/g)].map((match) => match[1]!)
}

describe('AC-used-atoms-27 — the emitted set, and nothing outside the layer changes', () => {
  const kept = pruneAtomicLayer(NESTED, new Set(['flex', 'grid']))

  it('removes the rule of every atom outside the set, whole, nested blocks included', () => {
    const inLayer = kept.slice(kept.indexOf('@layer atomic {'), kept.indexOf('@layer overrides'))
    expect(classesIn(inLayer)).toEqual(['nave-flex', 'nave-grid', 'nave-grid'])
    expect(inLayer).not.toContain('focus-visible')
    expect(inLayer).not.toContain('@media')
  })

  it('keeps a consumer rule in the layer byte for byte, and everything outside the layer', () => {
    expect(kept).toContain('.brand-x { color: red; }')
    expect(kept).toContain('.outside .nave-hidden { color: red; }')
    expect(kept).toContain('@layer overrides { .menu .nave-hidden { color: red; } }')
    expect(kept.slice(0, kept.indexOf('@layer atomic {'))).toBe(
      NESTED.slice(0, NESTED.indexOf('@layer atomic {')),
    )
  })

  it('removes a rule whose selector holds an unemitted atom class whatever else it holds', () => {
    expect(pruneAtomicLayer(NESTED, new Set(['flex']))).not.toContain('.nave-grid > .child')
    expect(pruneAtomicLayer(NESTED, new Set(['grid']))).toContain('.nave-grid > .child')
  })

  it('keeps an atom’s rule whole, nested pseudo-class block included', () => {
    const out = pruneAtomicLayer(NESTED, new Set(['focusRing']))
    expect(out).toContain('&:focus-visible { outline: 2px solid; outline-offset: 2px; }')
  })

  it('drops an at-rule left empty, and keeps one that still holds a rule', () => {
    const none = pruneAtomicLayer(LOWERED, new Set(['flex']))
    expect(none).not.toContain('37.5em) { .nave-hide-phone-only')
    expect(none).toContain('@media (width >= 37.5em) { .nave-flex { gap: 1px; } }')
    expect(none).not.toContain('nave-hide-desktop-up')
  })

  it('leaves the text byte-identical when every atom is emitted', () => {
    const every = new Set(Object.keys(atoms))
    expect(pruneAtomicLayer(NESTED, every)).toBe(NESTED)
    expect(pruneAtomicLayer(LOWERED, every)).toBe(LOWERED)
  })
})

describe('AC-used-atoms-26 — a selector list is pruned member by member', () => {
  it('keeps the member of the emitted atom and its own reveal rules', () => {
    const out = pruneAtomicLayer(LOWERED, new Set(['srOnlyFocusable']))
    expect(out).toContain('.nave-sr-only-focusable { position: absolute; width: 1px; }')
    expect(out).toContain('.nave-sr-only-focusable:focus-visible')
    expect(out).toContain('.nave-sr-only-focusable:focus-within')
    expect(out).not.toMatch(/\.nave-sr-only[,\s{]/)
  })

  it('keeps the other member when the other atom is emitted, and drops the reveal rules', () => {
    const out = pruneAtomicLayer(LOWERED, new Set(['srOnly']))
    expect(out).toContain('.nave-sr-only { position: absolute; width: 1px; }')
    expect(out).not.toContain('nave-sr-only-focusable')
  })

  it('keeps both members of a lowered selector list for one atom', () => {
    const out = pruneAtomicLayer(LOWERED, new Set(['disabledState']))
    expect(out).toContain(
      '.nave-disabled-state:disabled, .nave-disabled-state[aria-disabled="true"]',
    )
  })

  it('prunes a minified list with no space after the comma', () => {
    const css = '@layer atomic{.nave-sr-only,.nave-sr-only-focusable{position:absolute}}'
    expect(pruneAtomicLayer(css, new Set(['srOnlyFocusable']))).toBe(
      '@layer atomic{.nave-sr-only-focusable{position:absolute}}',
    )
  })
})

describe('inspecting a layer (AC-used-atoms-28)', () => {
  it('lists every built-in atom a rule in the layer selects, and says whether it holds a layer', () => {
    const seen = inspectAtomicLayer(NESTED)
    expect(seen.hasLayer).toBe(true)
    expect([...seen.atoms].toSorted()).toEqual(['flex', 'focusRing', 'grid', 'hidePhoneOnly'])
  })

  it('reads atoms only inside the atomic layer', () => {
    const seen = inspectAtomicLayer('@layer overrides { .nave-block { display: block } }')
    expect(seen.hasLayer).toBe(false)
    expect(seen.atoms.size).toBe(0)
  })

  it('reads a minified layer', () => {
    const seen = inspectAtomicLayer(
      '@layer atomic{.nave-flex{display:flex}@media (width>=1px){.nave-grid{display:grid}}}',
    )
    expect([...seen.atoms].toSorted()).toEqual(['flex', 'grid'])
  })

  it('finds the layer after a statement-form declaration of the same name', () => {
    const seen = inspectAtomicLayer(
      '@layer a, atomic, b; @layer atomic { .nave-flex { display: flex } }',
    )
    expect(seen.hasLayer).toBe(true)
    expect([...seen.atoms]).toEqual(['flex'])
  })
})
