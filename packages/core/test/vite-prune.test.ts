/**
 * The pruning step on its own (AC-used-atoms-25, -26, -27, -28, -32): whole atoms leave the
 * `@layer atomic` block of a stylesheet, selector lists are pruned member by member, an at-rule
 * left empty goes, a selector naming a built-in atom class goes whatever else it holds, and
 * nothing outside `@layer atomic` is touched. The build-level fixtures run the same step inside
 * a real `vite build`, under both CSS transformers.
 */
import { describe, expect, it } from 'vitest'

import type { Node } from './helpers/css-layer.ts'

import { atoms } from '../src/atoms.ts'
import { inspectAtomicLayer, pruneAtomicLayer, unprunedAtoms } from '../src/vite-prune.ts'
import { classesOf, keepOnly, parseAtomicLayer } from './helpers/css-layer.ts'
import { assertScalesLinearly } from './helpers/perf-scaling.ts'

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
  return css
    .matchAll(/\.(nave-[\w-]+)/g)
    .map((match) => match[1]!)
    .toArray()
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
    const expected = `
@layer tokens, reset, atomic, overrides;
.outside .nave-hidden { color: red; }
@layer atomic {
  .nave-flex { display: flex; }
  .nave-grid { display: grid; }
  .brand-x { color: red; }
  .nave-grid > .child { color: red; }
}
@layer overrides { .menu .nave-hidden { color: red; } }
`

    expect(kept).toBe(expected)
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
    expect([...seen.atoms].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'flex',
      'focusRing',
      'grid',
      'hidePhoneOnly',
    ])
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
    expect([...seen.atoms].toSorted((a, b) => a.localeCompare(b))).toEqual(['flex', 'grid'])
  })

  it('finds the layer after a statement-form declaration of the same name', () => {
    const seen = inspectAtomicLayer(
      '@layer a, atomic, b; @layer atomic { .nave-flex { display: flex } }',
    )
    expect(seen.hasLayer).toBe(true)
    expect([...seen.atoms]).toEqual(['flex'])
  })
})

function layer(rule: string): string {
  return `@layer atomic { ${rule} }`
}

function singleRule(prelude: string): Node[] {
  return [{ body: 'x:y', prelude }]
}

describe('AC-used-atoms-27 - a selector is removed only when it needs an element of an unemitted atom', () => {
  it('keeps a member that an emitted atom’s element can match, inside :is() or :where()', () => {
    const is = layer(':is(.nave-flex, .nave-grid):hover { color: red }')
    const where = layer(':where(.nave-grid, .nave-flex) > .child { color: red }')
    const compound = layer(':is(.nave-grid, .card):hover { color: red }')

    expect(pruneAtomicLayer(is, new Set(['flex']))).toBe(is)
    expect(pruneAtomicLayer(where, new Set(['flex']))).toBe(where)
    expect(pruneAtomicLayer(compound, new Set())).toBe(compound)
  })

  it('removes a member whose every :is() or :where() alternative needs an unemitted atom', () => {
    const is = layer(':is(.nave-grid, .nave-block) { color: red }')
    const where = layer(':where(.nave-grid .x, .nave-block.y) > .child { color: red }')
    const mixed = layer(':is(.nave-grid.nave-flex, .nave-block):hover { color: red }')

    expect(pruneAtomicLayer(is, new Set(['flex']))).toBe('@layer atomic { }')
    expect(pruneAtomicLayer(where, new Set(['flex']))).toBe('@layer atomic { }')
    expect(pruneAtomicLayer(mixed, new Set(['flex']))).toBe('@layer atomic { }')
    expect(pruneAtomicLayer(mixed, new Set(['flex', 'grid']))).toBe(
      layer(':is(.nave-grid.nave-flex, .nave-block):hover { color: red }'),
    )
  })

  it('never removes a member for a class inside :not(), :has() or any other argument', () => {
    const rules = [
      '.card:not(.nave-grid) { color: blue }',
      ':not(:is(.nave-grid)) { color: blue }',
      '.card:has(.nave-grid) { color: blue }',
      '.card:nth-child(2 of .nave-grid) { color: blue }',
      '.card:host(.nave-grid) { color: blue }',
    ]
    for (const rule of rules) {
      expect(pruneAtomicLayer(layer(rule), new Set(['flex'])), rule).toBe(layer(rule))
    }
  })

  it('removes a member that holds an unemitted class in a compound of its own, whatever surrounds it', () => {
    const rules = [
      '.nave-grid > .child { color: red }',
      '.card .nave-grid.x:hover { color: red }',
      '.nave-grid:not(.nave-flex) { color: red }',
      '.card:not(.nave-flex):is(.nave-grid) { color: red }',
    ]
    for (const rule of rules) {
      expect(pruneAtomicLayer(layer(rule), new Set(['flex'])), rule).toBe('@layer atomic { }')
    }
  })

  it('prunes a list member by member under the same rule', () => {
    const list = layer(
      ':is(.nave-flex, .nave-grid):hover, .nave-grid, .card:not(.nave-grid) { x: y }',
    )

    expect(pruneAtomicLayer(list, new Set(['flex']))).toBe(
      layer(':is(.nave-flex, .nave-grid):hover, .card:not(.nave-grid) { x: y }'),
    )
  })

  it('names, in a layer, the unemitted atoms a remaining rule still needs, and no others', () => {
    const css = layer(
      '.nave-grid { x: y } :is(.nave-flex, .nave-grid):hover { x: y } .card:not(.nave-block) { x: y }',
    )

    expect(unprunedAtoms(css, new Set(['flex']))).toEqual(['grid'])
    expect(unprunedAtoms(css, new Set(['flex', 'grid']))).toEqual([])
    const pruned = pruneAtomicLayer(css, new Set(['flex']))
    expect(unprunedAtoms(pruned, new Set(['flex']))).toEqual([])
  })

  it('has a reader in the tests that removes the same members', () => {
    const kept = classesOf('flex')

    expect(keepOnly(singleRule(':is(.nave-flex,.nave-grid):hover'), kept)).toHaveLength(1)
    expect(keepOnly(singleRule('.card:not(.nave-grid)'), kept)).toHaveLength(1)
    expect(keepOnly(singleRule(':is(.nave-grid,.nave-block)'), kept)).toHaveLength(0)
    expect(keepOnly(singleRule('.nave-grid>.child'), kept)).toHaveLength(0)
    expect(parseAtomicLayer('@layer atomic{.a{x:y}}')).toHaveLength(1)
  })
})

// One unemitted atom at each level, so every level has something to pass on to the one above.
function nested(depth: number): string {
  const open = ':is(.nave-flex'.repeat(depth)
  return `@layer atomic { ${open}${')'.repeat(depth)} { color: red } .nave-block { display: block } }`
}

describe('AC-used-atoms-27 - a selector nested in :is() is read in time proportional to its depth', () => {
  const emitted = new Set(['block'])

  it('prunes and checks :is(.nave-flex:is(.nave-flex:is(...))) at any depth', async () => {
    await assertScalesLinearly((depth) => {
      const css = nested(depth)
      const start = performance.now()
      const pruned = pruneAtomicLayer(css, emitted)
      const needs = unprunedAtoms(css, emitted)
      const spent = performance.now() - start
      expect(pruned).not.toContain('nave-flex')
      expect(needs).toEqual(['flex'])
      return spent
    }, 800)
  }, 120_000)

  it('inspects the same layer, and names its atoms, at any depth', async () => {
    await assertScalesLinearly((depth) => {
      const css = nested(depth)
      const start = performance.now()
      const seen = inspectAtomicLayer(css)
      const spent = performance.now() - start
      expect([...seen.atoms].toSorted((a, b) => a.localeCompare(b))).toEqual(['block', 'flex'])
      return spent
    }, 800)
  }, 120_000)

  it('prunes and inspects :is(:is(:is(...))) with nothing to pass on', async () => {
    await assertScalesLinearly((depth) => {
      const selector = `${':is('.repeat(depth)}.nave-grid${')'.repeat(depth)}`
      const css = `@layer atomic { ${selector} { color: red } .nave-flex { display: flex } }`
      const only = new Set(['flex'])
      const start = performance.now()
      const pruned = pruneAtomicLayer(css, only)
      const left = unprunedAtoms(pruned, only)
      const spent = performance.now() - start
      expect(pruned).not.toContain('nave-grid')
      expect(left).toEqual([])
      return spent
    }, 400)
  }, 120_000)
})
