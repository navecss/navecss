/**
 * AC-nextjs-used-atoms-43: core's README and the root README point to the package, and the browser
 * floor is stated once in each of two places, the same in both.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { headingsOf, PACKAGE_DIR, readmeOf, REPO_ROOT, sectionOf } from './support/readme.ts'

const core = readmeOf(path.join(REPO_ROOT, 'packages/core'))
const own = readmeOf(PACKAGE_DIR)
const root = readmeOf(REPO_ROOT)

const LINK =
  '[`@navecss/prune`](https://github.com/navecss/navecss/tree/main/packages/prune#readme)'

/**
 * The list a `browserslist` fence holds, or `undefined` when the README has none.
 */
function floorOf(readme: string): string[] | undefined {
  const list = /"browserslist":\s*(\[[^\]]*\])/u.exec(readme)?.[1]
  return list === undefined ? undefined : (JSON.parse(list) as string[])
}

describe('core’s README', () => {
  it('points to the package in the second sentence of Setting up @nave, and says the PostCSS setup keeps every atom', () => {
    const section = sectionOf(core, headingsOf(core), 'Setting up @nave')
    const paragraph = section.trim().split(/\n\n/u, 1)[0]!.replaceAll(/\s+/gu, ' ')
    const sentences = paragraph.split(/(?<=\.) (?=[A-Z])/u)
    expect(sentences[1]).toContain(LINK)
    expect(sentences[1]).toMatch(/only the atoms the build can read a use for/u)
    expect(sentences[1]).toMatch(/PostCSS plugin to keep every atom/u)
  })

  it('opens #### Next.js with the pointer, and leaves the rest of that section as it was', () => {
    const headings = headingsOf(core)
    const section = sectionOf(core, headings, 'Next.js')
    const [opening, ...rest] = section.trim().split(/\n\n/u)
    expect(opening!.replaceAll(/\s+/gu, ' ')).toBe(
      `To ship only the atoms the build can read a use for, use ${LINK} in place of this plugin. The setup below keeps every atom.`,
    )
    const remainder = rest.join('\n\n')
    expect(createHash('sha256').update(remainder).digest('hex').slice(0, 16)).toBe(
      NEXT_JS_REMAINDER_SHA256,
    )
  })

  it('says, where it names the stacks that keep every atom, what the package does on Next.js (byte for byte)', () => {
    expect(core).toContain(
      `A stack with no bundler, webpack, or Next.js on \`@navecss/core/postcss\` ships every atom; on Next.js, ${LINK} ships only the atoms its build can read a use for.`,
    )
  })
})

/**
 * The two lines every README that names Next.js closes with: the package's own non-affiliation
 * statement, and Vercel's attribution sentence as its brand page serves it.
 */
const NON_AFFILIATION =
  'This package is not affiliated with, endorsed by or sponsored by Vercel or the Next.js project.'
const REPOSITORY_NON_AFFILIATION =
  'NaveCSS is not affiliated with, endorsed by or sponsored by Vercel or the Next.js project.'
const ATTRIBUTION =
  'Vercel, the Vercel design, Next.js and related marks, designs and logos are trademarks or registered trademarks of Vercel, Inc. or its affiliates in the US and other countries.'

const fingerprint = (text: string): { bytes: number; sha256: string } => ({
  bytes: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex').slice(0, 16),
})

describe('the two closing lines', () => {
  it('are the cleared bytes (control for the rows below)', () => {
    expect(fingerprint(NON_AFFILIATION)).toEqual({ bytes: 95, sha256: '17a46ea5a2975184' })
    expect(fingerprint(REPOSITORY_NON_AFFILIATION)).toEqual({
      bytes: 90,
      sha256: 'e1c8f80df8f1f13a',
    })
    expect(fingerprint(ATTRIBUTION)).toEqual({ bytes: 176, sha256: '3866a99ef62f1845' })
  })

  it('close core’s README, as its last two paragraphs', () => {
    expect(core.trimEnd().split(/\n\n/u).slice(-2)).toEqual([NON_AFFILIATION, ATTRIBUTION])
  })

  it('follow the paragraph under Brand and name in the root README, which stays as it was', () => {
    const headings = headingsOf(root)
    const section = sectionOf(root, headings, 'Brand and name').trim().split(/\n\n/u)
    expect(section.slice(-2)).toEqual([REPOSITORY_NON_AFFILIATION, ATTRIBUTION])
    expect(section.length).toBeGreaterThanOrEqual(3)
  })
})

describe('the browser floor', () => {
  it('is the same list in core’s README and the package README', () => {
    const floor = floorOf(core)
    // Control: core's README has one, and so does the package's.
    expect(floor?.length).toBeGreaterThan(0)
    expect(floorOf(own)).toEqual(floor)
  })

  it('is read as different when one entry changes (control)', () => {
    const changed = own.replace('"chrome 125"', '"chrome 126"')
    expect(floorOf(changed)).not.toEqual(floorOf(core))
  })
})

describe('the root README', () => {
  it('has one more row in its package table, for the package', () => {
    expect(root).toMatch(/^\| \[`@navecss\/prune`\]\(packages\/prune#readme\) +\| Next\.js: /mu)
  })

  it('adds one clause after the PostCSS plugin does the same', () => {
    const flat = root.replaceAll(/\s+/gu, ' ')
    expect(flat).toContain(
      'does the same; on Next.js, [`@navecss/prune`](packages/prune#readme) does that and ships only the atoms its build can read a use for;',
    )
  })

  it('says the package is released with core and tokens', () => {
    expect(root.replaceAll(/\s+/gu, ' ')).toMatch(
      /`@navecss\/core`, `@navecss\/tokens` and `@navecss\/prune` are released together/u,
    )
  })
})

/**
 * What `#### Next.js` held before the package existed, by its digest: the pointer is added above
 * it and nothing in it changes.
 */
const NEXT_JS_REMAINDER_SHA256 = '18ffd3f9c2b88d82'
