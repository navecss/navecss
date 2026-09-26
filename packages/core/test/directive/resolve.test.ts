import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { atoms } from '../../src/atoms.ts'
import { resolve } from '../../src/directive/resolve.ts'

describe('AC-directive-core-01 — resolve() returns the expansion as plain data', () => {
  const extend: Record<string, AtomDefinition | null> = {
    brandBox: {
      declarations: { color: 'red', padding: '1px' },
    },
    // eslint-disable-next-line unicorn/no-null -- `null` is `extend`'s own spelling for "no definition" (AtomDefinition | null), not a style choice
    ghost: null,
    deep: {
      declarations: { display: 'grid' },
      pseudos: { ':hover': { color: 'blue' } },
      media: { '(min-width: 1px)': { declarations: { display: 'flex' } } },
      container: { '(min-width: 2px)': { declarations: { display: 'block' } } },
    },
  }

  it('gives declarations in definition order and blocks pseudos, then media, then container', () => {
    const { resolved } = resolve(['focusRing', 'deep', 'nope', 'toString', 'ghost', 'brandBox'], {
      extend,
    })

    expect(resolved.focusRing?.declarations).toEqual([{ prop: 'outline', value: 'none' }])
    expect(resolved.brandBox?.declarations).toEqual([
      { prop: 'color', value: 'red' },
      { prop: 'padding', value: '1px' },
    ])

    expect(resolved.deep?.blocks.map((b) => b.kind)).toEqual(['pseudo', 'media', 'container'])
  })

  it("reads focusRing's pseudo block straight off atoms", () => {
    const { resolved } = resolve(['focusRing'])

    expect(resolved.focusRing?.blocks).toEqual([
      {
        kind: 'pseudo',
        selector: ':focus-visible',
        declarations: Object.entries(atoms.focusRing.pseudos?.[':focus-visible'] ?? {}).map(
          ([prop, value]) => ({ prop, value }),
        ),
      },
    ])
  })

  it('reports the unresolved names as exactly the own keys with no truthy definition', () => {
    const { unresolved } = resolve(['focusRing', 'deep', 'nope', 'toString', 'ghost', 'brandBox'], {
      extend,
    })

    expect(unresolved).toEqual(['nope', 'toString', 'ghost'])
  })

  it('survives structuredClone deep-equal: no functions, class instances or host nodes', () => {
    const result = resolve(['focusRing', 'deep', 'brandBox'], { extend })
    const cloned = structuredClone(result)

    expect(cloned).toEqual(result)
  })
})

describe('AC-directive-core-05 — an atom with no declarations object stays a throw', () => {
  const shapes = {
    bad: JSON.parse('{"pseudos":{":hover":{"color":"red"}}}') as unknown as AtomDefinition,
    arr: { declarations: [] } as unknown as AtomDefinition,
  }

  it('throws for every non-plain-object declarations spelling, never as a diagnostic', () => {
    for (const [name, atom] of Object.entries(shapes)) {
      expect(() => resolve([name], { extend: { [name]: atom } })).toThrow(
        new RegExp(`atom "${name}" is registered without a declarations object`),
      )
    }
  })

  it('resolves ghost (a null extend definition) as unresolved, never a throw', () => {
    // eslint-disable-next-line unicorn/no-null -- `null` is `extend`'s own spelling for "no definition", not a style choice
    const { resolved, unresolved } = resolve(['ghost'], { extend: { ghost: null } })

    expect(resolved.ghost).toBeUndefined()
    expect(unresolved).toEqual(['ghost'])
  })
})
