/**
 * AC-nextjs-used-atoms-44: the agent guide's `cx()` paragraph names `withNave()` from
 * `@navecss/prune` as the home of `keep` on Next.js, and its never-list holds moving a Next.js
 * project back to `@navecss/core/postcss` and removing `withNave()`. Each phrase is a literal
 * substring of the committed guide and of the generator's output.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { OUTPUT_PATH, renderCxSection } from '../scripts/generate-skill.ts'

const committed = readFileSync(OUTPUT_PATH, 'utf8')

const PINS = [
  'or whose Next.js config is wrapped in `withNave()` from `@navecss/prune`',
  'with its atoms in `keep`, an option of `navePlugin()` on Vite and of `withNave()` on Next.js',
  'never move a Next.js project back to `@navecss/core/postcss` or remove `withNave()`',
] as const

/**
 * The `cx()` section of the committed guide.
 */
function committedCxSection(): string {
  const start = committed.indexOf('## `cx()`\n')
  return committed.slice(start, committed.indexOf('\n## ', start + 1))
}

describe('AC-nextjs-used-atoms-44: the guide’s cx() paragraph names the Next.js route', () => {
  it.each(PINS)('the committed guide’s cx() section holds %s', (pin) => {
    expect(committedCxSection()).toContain(pin)
  })

  it.each(PINS)('the generator’s cx() section holds %s', (pin) => {
    expect(renderCxSection().join('\n')).toContain(pin)
  })

  it.each(PINS)('control: the generator’s output without the paragraph lacks %s', (pin) => {
    const without = renderCxSection().filter((line) => !line.includes(pin))
    expect(without.length).toBeLessThan(renderCxSection().length)
    expect(without.join('\n')).not.toContain(pin)
  })

  it.each(PINS)('control: the committed section with the phrase removed lacks %s', (pin) => {
    expect(committedCxSection().replace(pin, '')).not.toContain(pin)
  })
})
