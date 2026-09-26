/**
 * AC-consumer-constraints-44 covers: R16.
 *
 * The package name uses "Stylelint" for referential purposes only, cleared on two conditions
 * after the maintainer's review: no claim of endorsement or affiliation, and no Stylelint logo,
 * wordmark rendering or livery on any surface. Both are checked here.
 */
import { describe, expect, it } from 'vitest'

import { packTarball } from './helpers/pack.ts'

const FORBIDDEN_WORDS = [
  'official',
  'endorse',
  'affiliat',
  'partner',
  'sponsor',
  'certified',
  'by the stylelint team',
]

describe('AC-consumer-constraints-44 covers: R16', () => {
  const tarball = packTarball()

  it('no shipped sentence about the package implies endorsement or affiliation', () => {
    const readme = tarball.read('package/README.md')
    const packageJson = JSON.parse(tarball.read('package/package.json')) as {
      description: string
      name: string
    }
    expect(packageJson.name).toBe('@navecss/stylelint-config')

    const surfaces = [readme, packageJson.description]
    for (const text of surfaces) {
      for (const word of FORBIDDEN_WORDS) {
        expect(text.toLowerCase()).not.toContain(word.toLowerCase())
      }
    }
  })

  it('the tarball contains no image file and the README embeds no image', () => {
    const imageFiles = tarball.files.filter((f) => /\.(png|jpe?g|gif|svg|webp)$/i.test(f))
    expect(imageFiles).toEqual([])

    const readme = tarball.read('package/README.md')
    expect(readme).not.toMatch(/!\[/)
    expect(readme).not.toMatch(/<img/i)
  })
})
