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
    const imageFiles = tarball.files.filter((f) =>
      /\.(png|jpe?g|gif|svg|webp|ico|avif|bmp|tiff?|apng)$/i.test(f),
    )
    expect(imageFiles).toEqual([])

    const readme = tarball.read('package/README.md')
    expect(readme).not.toMatch(/!\[/)
    expect(readme).not.toMatch(/<img/i)
  })

  it('no shipped text file carries an inline data:image', () => {
    const textFiles = tarball.files.filter(
      (f) => /\.(js|ts|json|md)$/.test(f) || f.endsWith('/LICENSE'),
    )
    expect(textFiles).toEqual(expect.arrayContaining(['package/index.js', 'package/README.md']))
    for (const file of textFiles) {
      expect(tarball.read(file), `${file} carries data:image`).not.toMatch(/data:image/i)
    }
  })
})
