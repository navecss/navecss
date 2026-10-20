import { describe, expect, it } from 'vitest'

import { focusRingAtoms } from '../styles/atoms.ts'
import { withoutAGuard } from './support/registry/css-lightning.ts'
import {
  accessibilityWords,
  focusableLocals,
  guardedAtoms,
  paintCounts,
  paintProblems,
  ringProblems,
  stringProblems,
  withOutlineShorthandInRing,
  withRingWidthWithoutFallback,
  wordHits,
} from './support/registry/css-paint.ts'
import { packageEntries, withModule } from './support/registry/css-rules.ts'
import { cloneRegistry, loadRegistry } from './support/registry/load.ts'

const CONTROL_SUBPATH = 'switch'

describe('AC-base-ui-registry-21: the ring and the motion guard ship as the package ships them, and no string claims more', () => {
  it('reads non-empty focusable and guarded sets, and the package stylesheet satisfies the ring predicate', () => {
    expect(focusRingAtoms.length).toBeGreaterThan(0)
    expect(guardedAtoms().size).toBeGreaterThan(0)
    expect(ringProblems('dist/styles.css', packageEntries(), focusableLocals())).toEqual([])
  })

  it('reds a ring whose width lost its fallback, a ring with the outline shorthand, and a dropped guard', () => {
    const registry = loadRegistry()
    const plant = (rewrite: (css: string) => string): string[] =>
      paintProblems(withModule(cloneRegistry(registry), CONTROL_SUBPATH, rewrite))
    expect(plant(withRingWidthWithoutFallback).join('\n')).toContain('not a var() with a fallback')
    expect(plant(withOutlineShorthandInRing).join('\n')).toContain('the outline shorthand')
    expect(plant(withoutAGuard).join('\n')).toContain('guard of')
  })

  it('every focusable atom an item uses keeps its ring, and every guarded atom its guard', () => {
    const registry = loadRegistry()
    const counts = paintCounts(registry)
    expect(counts.focusable).toBeGreaterThan(0)
    expect(counts.guarded).toBeGreaterThan(0)
    expect(paintProblems(registry)).toEqual([])
  })

  it('no item string, CLI line or README sentence outside the layer sentence has an accessibility word', () => {
    expect(stringProblems(loadRegistry())).toEqual([])
  })

  it('the word list catches each word the criterion names', () => {
    for (const word of ['accessible', 'accessibility', 'a11y', 'WCAG', 'ARIA', 'keyboard']) {
      expect(wordHits([{ text: `a copy that is ${word} here`, where: word }]), word).not.toEqual([])
    }
    expect(accessibilityWords().length).toBeGreaterThan(5)
  })

  it('reds "keeps the focus ring" planted in one description', () => {
    const registry = cloneRegistry(loadRegistry())
    const item = registry.items.get('base-ui-dialog')
    if (item === undefined) throw new Error('base-ui-dialog is absent')
    item.description = `${item.description} It keeps the focus ring.`
    const problems = stringProblems(registry)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain('base-ui-dialog.description')
  })
})
