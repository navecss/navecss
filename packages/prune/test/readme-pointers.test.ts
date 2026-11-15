/**
 * AC-nextjs-used-atoms-43: the READMEs point a Next.js reader at this package. Core's README names
 * it in the first paragraph of "Setting up @nave", opens its Next.js section with it and ends its
 * account of what ships every atom with it; the root README has a row for it in the package table
 * and a clause after the PostCSS plugin's line. Each text is held byte for byte.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { readmeOf, REPO_ROOT } from './support/readme.ts'

const core = readmeOf(path.join(REPO_ROOT, 'packages/core'))
const root = readmeOf(REPO_ROOT)

/**
 * The second sentence of core's "Setting up @nave", from "Next.js, use" to the line before the
 * host sentence; the line before it ends "has its config). On".
 */
const SETUP =
  'Next.js, use [`@navecss/prune`](https://github.com/navecss/navecss/tree/main/packages/prune#readme)\nto ship only the atoms the build can read a use for, or the PostCSS plugin to keep every atom. On\nwebpack, or any other pipeline that runs PostCSS plugins, use the PostCSS plugin. A host'

/**
 * The opening of core's Next.js section: the heading and the paragraph pointing here, then the
 * first line of the paragraph that was there before.
 */
const NEXTJS_OPENING =
  '#### Next.js\n\nTo ship only the atoms the build can read a use for, use\n[`@navecss/prune`](https://github.com/navecss/navecss/tree/main/packages/prune#readme) in place of\nthis plugin. The setup below keeps every atom.\n\nNext.js reads a PostCSS plugin by its package name, so give it the name as a key and do not'

/**
 * The sentence core's account of what ships every atom ends with, line breaks included.
 */
const SENTENCE =
  'On Next.js,\n[`@navecss/prune`](https://github.com/navecss/navecss/tree/main/packages/prune#readme) ships only\nthe atoms its build can read a use for.'

const TABLE_ROW =
  '| [`@navecss/prune`](packages/prune#readme)                       | Next.js: a PostCSS plugin and a `next.config` wrapper that ship only the atoms the build can read a use for                                              |'

const CLAUSE =
  'does the same; on Next.js, [`@navecss/prune`](packages/prune#readme) does that and ships\nonly the atoms its build can read a use for; a host that runs Lightning CSS directly uses'

const fingerprint = (text: string): { bytes: number; sha256: string } => ({
  bytes: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex').slice(0, 16),
})

const countOf = (text: string, part: string): number => text.split(part).length - 1

/**
 * Core's README holds the setup sentence once, straight after the Astro clause.
 */
const hasSetup = (text: string): boolean => countOf(text, `has its config). On\n${SETUP}`) === 1

/**
 * Core's README opens its Next.js section with the paragraph, before the older one.
 */
const hasNextjsOpening = (text: string): boolean => countOf(text, NEXTJS_OPENING) === 1

/**
 * Core's README appends the sentence to the landed sentence, on its last line.
 */
const hasSentence = (text: string): boolean =>
  countOf(
    text,
    `so does a page with no bundler, which links the standalone\nstylesheet. ${SENTENCE}\n\nA server build leaves`,
  ) === 1

/**
 * The root README's table has the row straight after core's.
 */
const hasRow = (text: string): boolean => {
  const lines = text.split('\n')
  const core = lines.findIndex((line) => line.startsWith('| `@navecss/core` '))
  return core !== -1 && countOf(text, `${TABLE_ROW}\n`) === 1 && lines[core + 1] === TABLE_ROW
}

/**
 * The root README names the package in the clause after "the PostCSS plugin"'s line.
 */
const hasClause = (text: string): boolean => countOf(text, `${CLAUSE}\n`) === 1

describe('AC-nextjs-used-atoms-43: core README points at the package', () => {
  it('holds the setup sentence byte for byte', () => {
    expect(hasSetup(core)).toBe(true)
  })

  it('control: a README without the pointer in the setup sentence fails', () => {
    expect(hasSetup(core.replace(SETUP, ''))).toBe(false)
  })

  it('opens the Next.js section with the paragraph, byte for byte', () => {
    expect(hasNextjsOpening(core)).toBe(true)
  })

  it('control: a README without the opening paragraph fails', () => {
    expect(hasNextjsOpening(core.replace(NEXTJS_OPENING, '#### Next.js'))).toBe(false)
  })

  it('ends the account of what ships every atom with the sentence naming the package, 149 bytes', () => {
    expect(fingerprint(SENTENCE)).toEqual({ bytes: 149, sha256: '7c48b51946a6733d' })
    expect(hasSentence(core)).toBe(true)
  })

  it('control: a README with the sentence removed fails', () => {
    expect(hasSentence(core.replace(SENTENCE, ''))).toBe(false)
  })
})

describe('AC-nextjs-used-atoms-43: the root README points at the package', () => {
  it('has the table row straight after core’s', () => {
    expect(hasRow(root)).toBe(true)
  })

  it('control: a README without the row fails', () => {
    expect(hasRow(root.replace(`${TABLE_ROW}\n`, ''))).toBe(false)
  })

  it('has the clause naming the package after the PostCSS plugin’s line', () => {
    expect(hasClause(root)).toBe(true)
  })

  it('control: a README with the clause removed fails', () => {
    expect(
      hasClause(
        root.replace(CLAUSE, 'does the same; a host that runs Lightning CSS directly uses'),
      ),
    ).toBe(false)
  })
})
