/**
 * AC-directive-core-39: the root README's Quick start fence runs through the expander (the core
 * every host is an adapter over), not through one host's plugin, and a fence holding an unknown
 * atom reds it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { expandText } from '../src/directive/expand-text.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(path.resolve(HERE, '../../../README.md'), 'utf8')

function extractQuickStartButtonFence(): string {
  const qsStart = readme.indexOf('## Quick start')
  const gsStart = readme.indexOf('## Getting started')
  const section = readme.slice(qsStart, gsStart)
  const fenceRe = /```css\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let fence: string | undefined
  while ((match = fenceRe.exec(section))) if (match[1]!.includes('.root {')) fence = match[1]
  expect(fence, 'expected a button.module.css fence in Quick start').toBeDefined()
  return fence!
}

describe('README.md Quick start compiles through the real expander', () => {
  it('inlines @nave and preserves the @layer components.consumer wrapper', () => {
    const result = expandText(extractQuickStartButtonFence(), { onUnknown: 'warn' })

    expect(result.diagnostics).toEqual([])
    expect(result.css).not.toContain('@nave ')
    expect(result.css).toMatch(/^@layer components\.consumer\s*\{/m)
    expect(result.css).toContain('cursor: pointer')
    expect(result.css).toContain('&:focus-visible')
  })

  it('a fence holding an unknown atom reds it (control)', () => {
    const typo = extractQuickStartButtonFence().replace('interactive', 'interactve')
    const result = expandText(typo, { onUnknown: 'warn' })

    expect(result.diagnostics.map((d) => d.code)).toEqual(['unknown-atom'])
  })
})
