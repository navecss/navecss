import { describe, expect, it } from 'vitest'

import { proseOf, readReadme } from './support/readme.ts'
import { hasSentenceWith } from './support/w9-readme-items.ts'

// A sentence that calls the package, or all its subpaths, a client module.
const CLIENT_MODULE_CLAIM = [
  /\b(?:every|each|all)\b.*\b(?:subpaths?|modules?|entry|entries)\b.*\bclient modules?\b/i,
]
const PACKAGE_CLAIM = [/\b(?:this package|the package)\b.*\bis a client module\b/i]

const hasClientModuleClaim = (text: string): boolean =>
  hasSentenceWith(text, CLIENT_MODULE_CLAIM) || hasSentenceWith(text, PACKAGE_CLAIM)

describe('AC-base-ui-bridge-54: the README no longer calls the subpaths client modules', () => {
  const readme = readReadme()
  const prose = proseOf(readme)

  it('has no sentence saying that every subpath, or the package, is a client module', () => {
    expect(hasClientModuleClaim(prose)).toBe(false)
  })

  it("keeps the Toast manager in a module that starts with 'use client'", () => {
    expect(
      hasSentenceWith(prose, [
        /Toast\.createToastManager\(\)/,
        /module that starts with `'use client'`/,
      ]),
    ).toBe(true)
  })

  it('says in one sentence that a Server Component can import a namespace and render its parts', () => {
    expect(hasSentenceWith(prose, [/Server Component/, /namespace/i, /`Dialog\.Root`/])).toBe(true)
  })

  it('still asks for a change of the import prefix and nothing else', () => {
    expect(prose).toContain('Change the prefix of an import, and nothing else:')
  })

  it("control: 0.2.0's sentence put back reds the first clause", () => {
    const sentence =
      "Call `Toast.createToastManager()` in a module that starts with `'use client'`, as in the example, and import the manager from that module: every subpath of this package is a client module."
    expect(hasClientModuleClaim(sentence)).toBe(true)
    expect(hasClientModuleClaim(`${prose}\n\n${sentence}`)).toBe(true)
  })
})
