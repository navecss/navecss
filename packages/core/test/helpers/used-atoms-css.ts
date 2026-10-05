/**
 * What a used-atoms test reads out of a build and what it plants in one: the atoms the built
 * stylesheet's atomic layer names, a sorted list to compare them against, and a scratch plugin
 * that rewrites the built CSS. `used-atoms-app.ts` re-exports all three.
 */
import type { PluginOption } from 'vite'

import { atomClassMap } from '../../src/atoms.ts'

/**
 * The text of every `@layer atomic { ... }` block in `css`, found by counting braces.
 */
function atomicBlocks(css: string): string[] {
  const blocks: string[] = []
  const opener = /@layer\s+atomic\s*\{/g
  for (let match = opener.exec(css); match; match = opener.exec(css)) {
    let depth = 1
    let index = match.index + match[0].length
    const start = index
    while (depth > 0 && index < css.length) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') depth -= 1
      index += 1
    }
    blocks.push(css.slice(start, index - 1))
    opener.lastIndex = index
  }
  return blocks
}

const ATOM_OF_CLASS = new Map(Object.entries(atomClassMap).map(([atom, name]) => [name, atom]))

/**
 * The atoms whose class a rule selector in the atomic layer of `css` names, sorted.
 */
export function atomLayerAtoms(css: string): string[] {
  const names = new Set<string>()
  for (const block of atomicBlocks(css)) {
    for (const match of block.matchAll(/\.(nave-[\w-]+)/g)) {
      const atom = ATOM_OF_CLASS.get(match[1]!)
      if (atom) names.add(atom)
    }
  }
  return [...names].toSorted((a, b) => a.localeCompare(b))
}

/**
 * Sorted, for an `expect(...).toEqual([...])` over a list of atoms.
 */
export function atoms(...names: string[]): string[] {
  return names.toSorted((a, b) => a.localeCompare(b))
}

/**
 * A scratch plugin that rewrites the text of every CSS asset in `generateBundle`, ahead of Nave's
 * own check (which is ordered after every other plugin).
 */
export function tamperCss(rewrite: (css: string) => string): PluginOption {
  return {
    name: 'tamper-css',
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (entry.type === 'asset' && entry.fileName.endsWith('.css')) {
          entry.source = rewrite(
            typeof entry.source === 'string'
              ? entry.source
              : new TextDecoder().decode(entry.source),
          )
        }
      }
    },
  }
}
