/**
 * AC-consumer-constraints-43 covers: R11b, R16.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import config from '../index.js'
import { pendingChangesetSurfaces } from './helpers/changesets.ts'
import { commentText, findOutcomeWords, type Surface } from './helpers/outcome-words.ts'
import { packTarball } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

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

const SYSTEM_COLOUR_SCAN = {
  mentions: /system[- ]colou?r|forced-colors/i,
  words: FORBIDDEN_WORDS,
  unit: 'sentence',
} as const

function configMessages(): string[] {
  return Object.values(config.rules ?? {}).flatMap((setting) => {
    const options = Array.isArray(setting)
      ? (setting[1] as { message?: unknown } | undefined)
      : undefined
    return typeof options?.message === 'string' ? [options.message] : []
  })
}

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
    expect(packedLicense).toBe(readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'))
    expect(packedLicense).not.toMatch(/CSS Color/)
  })

  function shippedSurfaces(packedIndex: string): Surface[] {
    const packageJson = JSON.parse(tarball.read('package/package.json')) as { description: string }
    return [
      { name: 'packed index.js comments', text: commentText(packedIndex) },
      { name: 'README.md', text: tarball.read('package/README.md') },
      { name: 'package.json description', text: packageJson.description },
      // Pending changesets only: a release consumes them.
      ...pendingChangesetSurfaces(),
      ...configMessages().map((text) => ({ name: 'config message', text })),
    ]
  }

  it('no shipped sentence mentioning system colours or forced-colors contains an outcome word', () => {
    const packedIndex = tarball.read('package/index.js')
    expect(commentText(packedIndex)).toMatch(/system-color/)
    expect(findOutcomeWords(shippedSurfaces(packedIndex), SYSTEM_COLOUR_SCAN)).toEqual([])
  })

  it('the same scan reports a planted comment beside the list', () => {
    const packedIndex = tarball.read('package/index.js')
    const planted = packedIndex.replace(
      'const SYSTEM_COLOR_KEYWORDS = [',
      '// Admitted so forced-colors users keep a readable page.\nconst SYSTEM_COLOR_KEYWORDS = [',
    )
    expect(planted).not.toBe(packedIndex)
    const hits = findOutcomeWords(shippedSurfaces(planted), SYSTEM_COLOUR_SCAN)
    expect(hits.map((hit) => hit.word)).toContain('users')
  })
})
