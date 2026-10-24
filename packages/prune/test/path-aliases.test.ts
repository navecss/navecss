/**
 * What a `paths` pattern captures from a specifier, and where it puts the capture in each target:
 * the capture goes in as written, whatever characters it holds.
 */
import { describe, expect, it } from 'vitest'

import type { PathAlias } from '../src/path-aliases.ts'

import { aliasCandidates } from '../src/path-aliases.ts'

const alias = (pattern: string, ...targets: string[]): PathAlias => ({ pattern, targets })

describe('the targets an alias sends a specifier to', () => {
  it('puts what the star captured where the target has its star', () => {
    expect(aliasCandidates([alias('@/*', '/app/*', '/lib/*/index')], '@/ui/Card')).toEqual([
      '/app/ui/Card',
      '/lib/ui/Card/index',
    ])
  })

  it('captures between a prefix and a suffix', () => {
    expect(aliasCandidates([alias('~/*.js', '/src/*')], '~/ui/Card.js')).toEqual(['/src/ui/Card'])
  })

  it('leaves a target with no star as it is', () => {
    expect(aliasCandidates([alias('card', '/app/ui/Card')], 'card')).toEqual(['/app/ui/Card'])
  })

  it('puts a capture that looks like a replacement pattern in as written', () => {
    expect(aliasCandidates([alias('@/*', '/app/*')], "@/a$&b$1c$'d$`e$$f")).toEqual([
      "/app/a$&b$1c$'d$`e$$f",
    ])
  })

  it('replaces only the first star of a target', () => {
    expect(aliasCandidates([alias('@/*', '/a/*/b/*')], '@/x')).toEqual(['/a/x/b/*'])
  })

  it('gives nothing for a specifier the pattern does not match', () => {
    expect(aliasCandidates([alias('@/*', '/app/*')], 'other/ui')).toEqual([])
  })

  it('gives the target as it is, whole, for a specifier equal to the prefix', () => {
    expect(aliasCandidates([alias('@/*', '/app/*')], '@/')).toEqual(['/app/'])
  })
})
