import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { navePlugin } from '../src/postcss.ts'

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

describe('README.md Quick start compiles through the real navePlugin()', () => {
  it('inlines @nave and preserves the @layer components.consumer wrapper', async () => {
    const result = await postcss([navePlugin()]).process(extractQuickStartButtonFence(), {
      from: undefined,
    })
    expect(result.warnings()).toHaveLength(0)
    expect(result.css).not.toContain('@nave ')
    expect(result.css).toMatch(/^@layer components\.consumer\s*\{/m)
    expect(result.css).toContain('cursor: pointer')
    expect(result.css).toContain('&:focus-visible')
  })
})
