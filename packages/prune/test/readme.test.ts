/**
 * AC-nextjs-used-atoms-42: the package README is the canonical home, in the planned structure, with
 * the two cleared passages byte for byte, every link resolving and every fence naming a real
 * subpath and export.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  PRODUCTION_CHECK,
  PRODUCTION_CHECK_BYTES,
  PRODUCTION_CHECK_SHA256,
  RESIDUAL_PARAGRAPH,
  RESIDUAL_PARAGRAPH_BYTES,
  RESIDUAL_PARAGRAPH_SHA256,
} from './support/readme-texts.ts'
import {
  brokenAnchors,
  fencesOf,
  headingsOf,
  PACKAGE_DIR,
  readmeOf,
  sectionOf,
  slugOf,
} from './support/readme.ts'

const readme = readmeOf(PACKAGE_DIR)
const headings = headingsOf(readme)
const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>
  name: string
}
const sourceIndex = readFileSync(path.join(PACKAGE_DIR, 'src/index.ts'), 'utf8')

const fingerprint = (text: string): { bytes: number; sha256: string } => ({
  bytes: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex').slice(0, 16),
})

const LINK = '[What it cannot see](#what-it-cannot-see)'
const PLACEHOLDER_LINK = '[<SECTION>](#<ANCHOR>)'
const FILLED_PRODUCTION_CHECK = PRODUCTION_CHECK.replace(PLACEHOLDER_LINK, () => LINK)

describe('the passages cleared as fixed text', () => {
  // Control: the support file holds what it says it holds, so the README comparison below cannot
  // pass on a pair of texts that both drifted.
  it('are held by their size and digest', () => {
    expect(fingerprint(PRODUCTION_CHECK)).toEqual({
      bytes: PRODUCTION_CHECK_BYTES,
      sha256: PRODUCTION_CHECK_SHA256,
    })
    expect(fingerprint(RESIDUAL_PARAGRAPH)).toEqual({
      bytes: RESIDUAL_PARAGRAPH_BYTES,
      sha256: RESIDUAL_PARAGRAPH_SHA256,
    })
    expect(PRODUCTION_CHECK).toContain(PLACEHOLDER_LINK)
  })
})

describe('the structure', () => {
  it('has the six sections, in order, under the package name', () => {
    expect(headings.filter((heading) => heading.level === 1).map((h) => h.title)).toEqual([
      '@navecss/prune',
    ])
    expect(headings.filter((heading) => heading.level === 2).map((h) => h.title)).toEqual([
      'Installation',
      'Requirements',
      'Setup',
      'Which atoms the build ships',
      'Options',
      'Migrating from @navecss/core/postcss',
    ])
  })

  it('has the heading Vite’s README has, so the anchor is the same', () => {
    expect(slugOf('Which atoms the build ships')).toBe('which-atoms-the-build-ships')
    expect(headings.map((heading) => slugOf(heading.title))).toContain(
      'which-atoms-the-build-ships',
    )
  })

  it('names, under Requirements, what it covers and what it does not, and holds the browser floor', () => {
    const section = sectionOf(readme, headings, 'Requirements')
    expect(section).toMatch(/Next\.js 16\.2 or later/u)
    expect(section).toMatch(/App Router and the Pages Router/u)
    expect(section).toMatch(/Turbopack or webpack/u)
    expect(section).toMatch(/Next\.js 15 is not covered/u)
    expect(section).toMatch(/Node(?:\.js)? 22\.18/u)
    expect(section).toContain('"browserslist"')
    expect(section).toContain('packages/core#nextjs')
  })

  it('has no link that points at a heading the README does not have', () => {
    expect(brokenAnchors(readme)).toEqual([])
  })

  it('has a link check that sees a heading renamed (control)', () => {
    const renamed = readme.replace('### What it cannot see', '### What it does not see')
    expect(brokenAnchors(renamed)).toContain('what-it-cannot-see')
  })
})

describe('Setup', () => {
  const setup = sectionOf(readme, headings, 'Setup')
  const fences = fencesOf(setup)

  it('holds the PostCSS fence and the next.config fence', () => {
    expect(fences[0]?.body).toContain("'@navecss/prune/postcss': {}")
    expect(fences[1]?.body).toContain("import { withNave } from '@navecss/prune'")
    expect(fences[1]?.body).toContain('withNave(nextConfig)')
  })

  it('puts the production check directly after those two fences, before anything about options', () => {
    const afterSecondFence = setup.slice(
      setup.indexOf('```', setup.indexOf('withNave(nextConfig)')) + 3,
    )
    expect(afterSecondFence.trimStart().startsWith(FILLED_PRODUCTION_CHECK)).toBe(true)
    const check = setup.indexOf(FILLED_PRODUCTION_CHECK)
    const options = setup.search(/every option|all go in `withNave\(\)`|goes in `withNave\(\)`/u)
    expect(check).toBeGreaterThan(-1)
    expect(options).toBeGreaterThan(check)
  })

  it('links the production check to the section that holds the residual paragraph (control: a renamed heading breaks it)', () => {
    expect(readme).toContain(LINK)
    const part = sectionOf(readme, headings, 'What it cannot see')
    expect(part.trimEnd().endsWith(RESIDUAL_PARAGRAPH)).toBe(true)
    expect(slugOf('What it cannot see')).toBe('what-it-cannot-see')
    expect(brokenAnchors(readme.replace('### What it cannot see', '### Not seen'))).toContain(
      'what-it-cannot-see',
    )
  })

  it('says every option goes in withNave(), names the line every build prints, and covers composing, the agent note and a wrapper with no plugin in dev', () => {
    expect(setup).toMatch(
      /`keep`, `keepFor`, `cxModules`, `extend` and `onUnknown`[^.]*`withNave\(\)`/u,
    )
    expect(setup).toContain('Running next.config.js provided runAfterProductionCompile')
    expect(setup).toMatch(/withNave\(withMDX\(nextConfig\)\)|other wrappers?/u)
    expect(setup).toContain('`AGENTS.md`')
    expect(setup).toMatch(/outside that block/u)
    expect(setup).toMatch(/`next dev`[^.]*(?:does not|doesn’t|not)[^.]*(?:plugin|reported)/u)
  })
})

describe('Which atoms the build ships', () => {
  const parts = headings
    .slice(headings.findIndex((heading) => heading.title === 'Which atoms the build ships') + 1)
    .filter((heading) => heading.level === 3)
    .slice(0, 8)
    .map((heading) => heading.title)

  it('has its parts, in order, as third-level headings', () => {
    expect(parts).toEqual([
      'What it does',
      'What the build reads',
      'Names chosen at run time',
      'Code you import',
      'In next dev',
      'What it cannot see',
      'Shipping every atom',
      'For package authors',
    ])
  })

  const section = sectionOf(readme, headings, 'Which atoms the build ships')

  it('quotes the message the report opens with, word for word', () => {
    expect(sectionOf(readme, headings, 'What it does')).toContain(REPORT_CAUSE)
  })

  it('says, in the part on what it cannot see, that a later Next.js convention is not read and where an @nave problem goes', () => {
    const part = sectionOf(readme, headings, 'What it cannot see')
    expect(part).toMatch(/file convention a later Next\.js release adds[^.]*not read/u)
    expect(part).toMatch(/`@nave` problem[^.]*report[^.]*`@navecss\/core\/postcss` throws/u)
  })

  it('states the three residuals of next dev', () => {
    const dev = sectionOf(readme, headings, 'In next dev')
    expect(dev).toMatch(/terminal[^.]*not[^.]*browser/u)
    expect(section).toMatch(/not (?:reported|noticed)[^.]*`next dev`|`next dev`[^.]*not report/u)
    expect(section).toContain('Next.js can still order, merge and minify CSS differently')
  })

  it('puts the way back to every atom after every part that fixes an error', () => {
    const order = ['What the build reads', 'Names chosen at run time', 'Code you import']
    const way = headings.find((heading) => heading.title === 'Shipping every atom')!.line
    for (const title of order) {
      expect(headings.find((heading) => heading.title === title)!.line).toBeLessThan(way)
    }
    expect(sectionOf(readme, headings, 'Shipping every atom')).toContain('@navecss/core/postcss')
  })
})

describe('Options and Migrating', () => {
  it('describes each option withNave() takes', () => {
    const options = sectionOf(readme, headings, 'Options')
    for (const name of ['keep', 'keepFor', 'cxModules', 'extend', 'onUnknown']) {
      expect(options).toContain(`\`${name}\``)
    }
  })

  it('says how to swap the key, move the options and wrap', () => {
    const migrating = sectionOf(readme, headings, 'Migrating from @navecss/core/postcss')
    expect(migrating).toContain("'@navecss/core/postcss'")
    expect(migrating).toContain("'@navecss/prune/postcss'")
    expect(migrating).toContain('withNave()')
  })
})

/**
 * The specifiers a fence names that open with this package's name, and the names it imports
 * from the root, each of which must exist.
 */
function problemsIn(body: string): string[] {
  const exportKeys = new Set(Object.keys(manifest.exports))
  const exportedNames = new Set(
    sourceIndex
      .matchAll(/export (?:type )?\{([^}]*)\}/gu)
      .flatMap((match) => match[1]!.split(',').map((name) => name.trim().replace(/^type /u, ''))),
  )
  const problems: string[] = []
  for (const match of body.matchAll(/@navecss\/prune(\/[\w./-]+)?/gu)) {
    const key = match[1] === undefined ? '.' : `.${match[1]}`
    if (!exportKeys.has(key)) problems.push(`no export ${key}`)
  }
  for (const match of body.matchAll(/import (type )?\{([^}]*)\} from '@navecss\/prune'/gu)) {
    const names = match[2]!.split(',').map((item) => item.trim().replace(/^type /u, ''))
    for (const name of names) {
      if (name !== '' && !exportedNames.has(name)) problems.push(`no name ${name}`)
    }
  }
  return problems
}

describe('the fences', () => {
  it('import a real subpath and name a real export', () => {
    const fences = fencesOf(readme).filter((fence) => fence.body.includes('@navecss/prune'))
    // Control: the README has fences that name the package.
    expect(fences.length).toBeGreaterThanOrEqual(3)
    for (const fence of fences) expect(problemsIn(fence.body), fence.body).toEqual([])
  })

  it('are checked by a guard that refuses a subpath or a name that does not exist (control)', () => {
    expect(problemsIn("import { withNave } from '@navecss/prune/nope'")).toEqual([
      'no export ./nope',
    ])
    expect(problemsIn("import { withEverything } from '@navecss/prune'")).toEqual([
      'no name withEverything',
    ])
    expect(problemsIn("import { withNave } from '@navecss/prune'")).toEqual([])
  })
})

describe('the words a stranger meets first', () => {
  it('opens with NaveCSS, spells Next.js exactly, shows no logo, and closes with the two lines', () => {
    expect(readme.split('\n', 3)[2]).toMatch(/^NaveCSS /u)
    expect(readme).not.toMatch(/<img|!\[|<picture/u)
    expect(readme).not.toMatch(/\bNextJS\b|\bNext JS\b|\bnext\.js\b/u)
    const lines = readme.trimEnd().split('\n')
    expect(lines.at(-3)).toBe(
      'This package is not affiliated with, endorsed by or sponsored by Vercel or the Next.js project.',
    )
    expect(lines.at(-1)).toMatch(/^Vercel, the Vercel design, Next\.js and related marks/u)
  })
})
