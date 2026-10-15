/**
 * AC-nextjs-used-atoms-08, extended: the subpath a host without Vite builds on also trims the
 * atomic layer, so a package that is not the Vite plugin keeps whole atoms the same way the
 * plugin does. Reads `dist/`, so it needs a build.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface Collect {
  inspectAtomicLayer: (css: string) => { atoms: Set<string>; hasLayer: boolean }
  pruneAtomicLayer: (css: string, emitted: ReadonlySet<string>) => string
  unprunedAtoms: (css: string, emitted: ReadonlySet<string>) => string[]
  withRestorers: (atoms: Set<string>) => Set<string>
}

const LAYER = `@layer atomic{.nave-flex{display:flex}.nave-grid{display:grid}.nave-focus-ring:focus-visible{outline:1px solid}}.keep{color:red}`

async function collect(): Promise<Collect> {
  const file = path.join(import.meta.dirname, '..', 'dist', 'collect.js')
  return (await import(pathToFileURL(file).href)) as Collect
}

describe('AC-nextjs-used-atoms-08 — the collect subpath trims the atomic layer', () => {
  it('prunes every rule of an atom outside the set and keeps every other byte', async () => {
    const { pruneAtomicLayer } = await collect()
    expect(pruneAtomicLayer(LAYER, new Set(['flex']))).toBe(
      '@layer atomic{.nave-flex{display:flex}}.keep{color:red}',
    )
  })

  it('keeps all the rules an emitted atom yields, its pseudo-class rule included', async () => {
    const { pruneAtomicLayer } = await collect()
    expect(pruneAtomicLayer(LAYER, new Set(['focusRing']))).toBe(
      '@layer atomic{.nave-focus-ring:focus-visible{outline:1px solid}}.keep{color:red}',
    )
  })

  it('reports the atoms the layer holds, and whether it holds one', async () => {
    const { inspectAtomicLayer } = await collect()
    const seen = inspectAtomicLayer(LAYER)
    expect(seen.hasLayer).toBe(true)
    expect([...seen.atoms].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'flex',
      'focusRing',
      'grid',
    ])
    expect(inspectAtomicLayer('.a{color:red}').hasLayer).toBe(false)
  })

  it('names the atoms a pruning to the set would still remove', async () => {
    const { unprunedAtoms } = await collect()
    expect(unprunedAtoms(LAYER, new Set(['flex']))).toEqual(['focusRing', 'grid'])
    expect(unprunedAtoms('@layer atomic{.nave-flex{display:flex}}', new Set(['flex']))).toEqual([])
  })

  it('closes a set holding srOnly under the pair, one way only', async () => {
    const { withRestorers } = await collect()
    expect([...withRestorers(new Set(['srOnly']))].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'srOnly',
      'srOnlyFocusable',
    ])
    expect([...withRestorers(new Set(['srOnlyFocusable']))]).toEqual(['srOnlyFocusable'])
  })
})
