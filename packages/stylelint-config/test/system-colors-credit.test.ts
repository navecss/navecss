/**
 * AC-consumer-constraints-43 covers: R11b, R16.
 */
import { describe, expect, it } from 'vitest'

import { packTarball } from './helpers/pack.ts'

const FORBIDDEN_WORDS = [
  'accessib',
  'a11y',
  'WCAG',
  'contrast',
  'low vision',
  'users',
  'safe',
  'protect',
]

describe('AC-consumer-constraints-43 covers: R11b, R16', () => {
  const tarball = packTarball()

  it('the packed index.js credits CSS Color Module Level 4 (W3C) beside the system-colour list', () => {
    const packedIndex = tarball.read('package/index.js')
    expect(packedIndex).toMatch(/CSS Color Module Level 4 \(W3C\)/)
    // the credit sits beside the list it describes, not somewhere unrelated
    const creditIndex = packedIndex.indexOf('CSS Color Module Level 4 (W3C)')
    const listIndex = packedIndex.indexOf('SYSTEM_COLOR_KEYWORDS')
    expect(Math.abs(creditIndex - listIndex)).toBeLessThan(400)
  })

  it('LICENSE stays byte-identical to the root LICENSE (the credit is never there)', () => {
    const packedLicense = tarball.read('package/LICENSE')
    expect(packedLicense).not.toMatch(/CSS Color/)
  })

  it('no shipped surface mentioning system colours or forced-colors contains an outcome word', () => {
    const packedIndex = tarball.read('package/index.js')
    const packedReadme = tarball.read('package/README.md')
    const packageJson = JSON.parse(tarball.read('package/package.json')) as { description: string }

    const surfaces = [packedIndex, packedReadme, packageJson.description]
    for (const text of surfaces) {
      const sentences = text.split(/(?<=[.!?])\s+|\n/)
      const relevant = sentences.filter((s) => /system colou?r|forced-colors/i.test(s))
      for (const sentence of relevant) {
        for (const word of FORBIDDEN_WORDS) {
          expect(sentence.toLowerCase()).not.toContain(word.toLowerCase())
        }
      }
    }
  })

  it('the check reports a planted sentence describing the admission by outcome', () => {
    const planted = 'Admitted so forced-colors users keep a readable page.'
    const isHit = FORBIDDEN_WORDS.some((word) => planted.toLowerCase().includes(word.toLowerCase()))
    expect(isHit).toBe(true)
  })
})
