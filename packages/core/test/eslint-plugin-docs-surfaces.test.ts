/**
 * AC-eslint-plugin-23 covers: R13.
 *
 * core's `cx()` documentation, in its README, `cx.ts` and the packed `dist/cx.d.ts`, no longer
 * overclaims what `@navecss/eslint-plugin` checks or omits it; the root README, `CLAUDE.md` and
 * the changesets carry the same correction and the release it needs.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { packCoreTarball } from './helpers/pack-core.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')
const coreReadme = readFileSync(path.resolve(HERE, '../README.md'), 'utf8')
const cxSource = readFileSync(path.resolve(HERE, '../src/cx.ts'), 'utf8')
const rootReadme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const claudeMd = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')

const foldWhitespace = (text: string): string => text.replaceAll(/\s+/gu, ' ')

/**
 * The block from `**ESLint®.**` through the closing fence of the code sample right after it
 * (the SECOND ``` from that point: the first opens the fence, the second closes it).
 */
function eslintBlock(markdown: string): string {
  const start = markdown.indexOf('**ESLint®.**')
  if (start === -1) throw new Error('no **ESLint®.** bullet found')
  const fenceOpen = markdown.indexOf('```', start)
  const fenceClose = markdown.indexOf('```', fenceOpen + 3)
  if (fenceOpen === -1 || fenceClose === -1) throw new Error('no fenced code block found after it')
  return markdown.slice(start, fenceClose + 3)
}

const RETIRED_STRINGS = [
  'A lint that closes the attribute itself is not part of this release.',
  'Nothing checks the rest of the `className` attribute',
  'is seen by nothing',
]

describe('AC-eslint-plugin-23: core’s cx() docs, the root README, CLAUDE.md and the release (23a-c)', () => {
  it('core’s README no longer contains any retired claim (whitespace collapsed)', () => {
    const folded = foldWhitespace(coreReadme)
    for (const retired of RETIRED_STRINGS) expect(folded).not.toContain(retired)
  })

  it('the bullet that replaces them names @navecss/eslint-plugin', () => {
    expect(coreReadme).toContain(
      '[`@navecss/eslint-plugin`](https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#readme)',
    )
  })

  it('the "What is NOT checked" paragraph in cx.ts names @navecss/eslint-plugin and drops the old bare-string claim', () => {
    const start = cxSource.indexOf('What is NOT checked:')
    expect(start).toBeGreaterThan(-1)
    const end = cxSource.indexOf('Note on consumer atoms:', start)
    expect(end).toBeGreaterThan(start)
    const paragraph = cxSource.slice(start, end)
    expect(paragraph).toContain('@navecss/eslint-plugin')
    expect(paragraph).not.toContain('is not seen by anything')
  })

  it('the packed dist/cx.d.ts carries the same paragraph, naming @navecss/eslint-plugin, with the built package’s current bytes', () => {
    const dts = packCoreTarball().read('package/dist/cx.d.ts')
    const start = dts.indexOf('What is NOT checked:')
    expect(start).toBeGreaterThan(-1)
    const end = dts.indexOf('Note on consumer atoms:', start)
    expect(end).toBeGreaterThan(start)
    const paragraph = dts.slice(start, end)
    expect(paragraph).toContain('@navecss/eslint-plugin')
    expect(paragraph).not.toContain('is not seen by anything')
  })
})

describe('AC-eslint-plugin-23: a pending changeset releases @navecss/core at patch (23d)', () => {
  it('at least one .changeset/*.md frontmatter entry bumps @navecss/core at patch', () => {
    const changesetDir = path.join(ROOT, '.changeset')
    const files = readdirSync(changesetDir).filter(
      (name) => name.endsWith('.md') && name !== 'README.md',
    )
    const isBumpsCorePatch = files.some((name) => {
      const body = readFileSync(path.join(changesetDir, name), 'utf8')
      return /^---\n[\s\S]*?'@navecss\/core':\s*patch[\s\S]*?\n---/mu.test(body)
    })
    expect(isBumpsCorePatch).toBe(true)
  })
})

describe('AC-eslint-plugin-23: the ESLint® block is byte-identical between core’s README and the root README (23e)', () => {
  it('the two blocks are equal, byte for byte', () => {
    expect(eslintBlock(rootReadme)).toBe(eslintBlock(coreReadme))
  })
})

describe('AC-eslint-plugin-23: the Packages table and CLAUDE.md name the new package (23f)', () => {
  it('the root README’s Packages table has a row linking packages/eslint-plugin', () => {
    expect(rootReadme).toMatch(/\[`@navecss\/eslint-plugin`\]\(packages\/eslint-plugin/)
  })

  it('CLAUDE.md’s Architecture block has a line starting packages/eslint-plugin/', () => {
    expect(claudeMd.split('\n').some((line) => line.startsWith('packages/eslint-plugin/'))).toBe(
      true,
    )
  })
})
