/**
 * AC-nextjs-used-atoms-42: the package README is the canonical home, in the planned structure, with
 * the two cleared passages byte for byte, every link resolving and every fence naming a real
 * subpath and export.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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

const PARTS = [
  'What it does',
  'What the build reads',
  'Names chosen at run time',
  'Code you import',
  'In next dev',
  'What it cannot see',
  'Shipping every atom',
  'For package authors',
]

const LINK = '[What it cannot see](#what-it-cannot-see)'
const PLACEHOLDER_LINK = '[<SECTION>](#<ANCHOR>)'
const FILLED_PRODUCTION_CHECK = PRODUCTION_CHECK.replace(PLACEHOLDER_LINK, () => LINK)

/**
 * The titles of the third-level headings under "Which atoms the build ships", up to the next
 * heading of its level or higher.
 */
function partTitles(text: string): string[] {
  const all = headingsOf(text)
  const start = all.findIndex((heading) => heading.title === 'Which atoms the build ships')
  const end = all.findIndex((heading, index) => index > start && heading.level <= 2)
  return all
    .slice(start + 1, end === -1 ? all.length : end)
    .filter((heading) => heading.level === 3)
    .map((heading) => heading.title)
}

/**
 * Whether the first paragraph after Setup's two fences is the production check, whole.
 */
function isProductionCheckFirst(text: string): boolean {
  const setup = sectionOf(text, headingsOf(text), 'Setup')
  const afterSecondFence = setup.slice(
    setup.indexOf('```', setup.indexOf('withNave(nextConfig)')) + 3,
  )
  return afterSecondFence.trimStart().split('\n\n', 1)[0] === FILLED_PRODUCTION_CHECK
}

/**
 * Whether the last paragraph of "What it cannot see" is the residual paragraph, whole.
 */
function isResidualParagraphLast(text: string): boolean {
  const part = sectionOf(text, headingsOf(text), 'What it cannot see')
  return part.trimEnd().split('\n\n').at(-1) === RESIDUAL_PARAGRAPH
}

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
    expect(isProductionCheckFirst(readme)).toBe(true)
    const check = setup.indexOf(FILLED_PRODUCTION_CHECK)
    const options = setup.search(/every option|all go in `withNave\(\)`|goes in `withNave\(\)`/u)
    expect(check).toBeGreaterThan(-1)
    expect(options).toBeGreaterThan(check)
  })

  it('links the production check to the section that holds the residual paragraph (control: a renamed heading breaks it)', () => {
    expect(readme).toContain(LINK)
    expect(isResidualParagraphLast(readme)).toBe(true)
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
  it('has its parts, in order, as third-level headings', () => {
    expect(partTitles(readme)).toEqual(PARTS)
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

  it('states the four residuals of next dev', () => {
    const dev = sectionOf(readme, headings, 'In next dev')
    expect(dev).toMatch(/terminal[^.]*not[^.]*browser/u)
    expect(section).toMatch(/not (?:reported|noticed)[^.]*`next dev`|`next dev`[^.]*not report/u)
    expect(section).toContain('Next.js can still order, merge and minify CSS differently')
  })

  it('says, under in next dev, that the plugin asks neither bundler to run it again when a file outside Next.js’s workspace root changes, and that such a file is checked by the build', () => {
    const dev = sectionOf(readme, headings, 'In next dev')
    expect(dev).toMatch(/outside[^.]*root[^.]*asks neither one to run it again/u)
    expect(dev).toMatch(/`next build`[^.]*(?:checks|catches|fails)/u)
    expect(dev).toMatch(/reads that no bundler compiles/u)
    expect(dev).toMatch(/on webpack, a module your app imports/u)
  })

  it('limits the unresolved-import error to your code and the packages that reach cx', () => {
    const reads = sectionOf(readme, headings, 'What the build reads')
    expect(reads).toMatch(
      /In your own code, and in a package that reaches `cx`, an import it cannot resolve is an error/u,
    )
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
 * The name an import item brings in: `type` and the local name after `as` left out.
 */
function importedName(item: string): string {
  const trimmed = item.trim().replace(/^type /u, '')
  const renamed = trimmed.indexOf(' as ')
  return renamed === -1 ? trimmed : trimmed.slice(0, renamed).trim()
}

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
    const names = match[2]!.split(',').map((item) => importedName(item))
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

  it('reads an import renamed with as by the name it imports (control)', () => {
    expect(problemsIn("import { withNave as wrap } from '@navecss/prune'")).toEqual([])
    expect(problemsIn("import { type NaveOptions as Options } from '@navecss/prune'")).toEqual([])
    expect(problemsIn("import { withEverything as w } from '@navecss/prune'")).toEqual([
      'no name withEverything',
    ])
  })
})

/**
 * The README with `from` replaced by `to`; throws unless `from` is there exactly once and the
 * text changes, so a change to the README cannot turn a control into one that changes nothing.
 */
function mutated(from: string, to: string): string {
  expect(readme.split(from), `${from.slice(0, 40)} is in the README once`).toHaveLength(2)
  const result = readme.replace(from, () => to)
  expect(result).not.toBe(readme)
  return result
}

/**
 * The README with the part "For package authors" and its text moved under "Options".
 */
function movedUnderOptions(): string {
  const lines = readme.split('\n')
  const from = headings.find((heading) => heading.title === 'For package authors')!
  const next = headings.find((heading) => heading.line > from.line && heading.level <= 3)!
  const cut = lines.splice(from.line, next.line - from.line)
  const migrating = headingsOf(lines.join('\n')).find((heading) =>
    heading.title.startsWith('Migrating from'),
  )!
  lines.splice(migrating.line, 0, ...cut)
  return lines.join('\n')
}

describe('the checks on the README see what they are for (controls)', () => {
  it('see a part moved out of the section that holds it', () => {
    expect(partTitles(movedUnderOptions())).not.toEqual(PARTS)
  })

  it('see a part added after the eighth', () => {
    expect(
      partTitles(mutated('\n## Options\n', '\n### An extra part\n\nWords.\n\n## Options\n')),
    ).not.toEqual(PARTS)
  })

  it('see a sentence added to the end of the production check', () => {
    const added = mutated(
      FILLED_PRODUCTION_CHECK,
      `${FILLED_PRODUCTION_CHECK} Dev and build never differ.`,
    )
    expect(isProductionCheckFirst(added)).toBe(false)
  })

  it('see a sentence added to the start of the production check', () => {
    const added = mutated(
      FILLED_PRODUCTION_CHECK,
      `Ignore the following. ${FILLED_PRODUCTION_CHECK}`,
    )
    expect(isProductionCheckFirst(added)).toBe(false)
  })

  it('see a sentence added to the start of the residual paragraph', () => {
    const added = mutated(RESIDUAL_PARAGRAPH, `Ignore the following. ${RESIDUAL_PARAGRAPH}`)
    expect(isResidualParagraphLast(added)).toBe(false)
  })

  it('see a sentence added to the end of the residual paragraph', () => {
    const added = mutated(RESIDUAL_PARAGRAPH, `${RESIDUAL_PARAGRAPH} Dev and build never differ.`)
    expect(isResidualParagraphLast(added)).toBe(false)
  })

  it('read the unaltered README as holding both passages', () => {
    expect(isProductionCheckFirst(readme)).toBe(true)
    expect(isResidualParagraphLast(readme)).toBe(true)
    expect(partTitles(readme)).toEqual(PARTS)
  })
})

/**
 * The fences `fencesOf` finds in `text`, read in a process of its own that is stopped after ten
 * seconds: a reader that never ends would otherwise stop the worker, and no timeout can.
 */
function fencesInOwnProcess(text: string): { fences: unknown; status: number | null } {
  const reader = pathToFileURL(path.join(PACKAGE_DIR, 'test/support/readme.ts')).href
  const run = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=200',
      '--input-type=module',
      '--eval',
      'const { fencesOf } = await import(process.argv[1])\nconsole.log(JSON.stringify(fencesOf(process.argv[2])))',
      reader,
      text,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  )
  return { status: run.status, fences: run.status === 0 ? JSON.parse(run.stdout) : run.stderr }
}

describe('the fence reader', () => {
  it('reads a fence that is never closed as running to the end of the text', () => {
    const { status, fences } = fencesInOwnProcess('one\n```ts\nconst a = 1\n')

    expect(status).toBe(0)
    expect(fences).toEqual([{ language: 'ts', body: 'const a = 1\n', line: 1 }])
  })

  it('reads the closed fence before one that is never closed, and each once', () => {
    const { status, fences } = fencesInOwnProcess('a\n```ts\nx\n```\nb\n```js\ny\n')

    expect(status).toBe(0)
    expect(fences).toEqual([
      { language: 'ts', body: 'x', line: 1 },
      { language: 'js', body: 'y\n', line: 5 },
    ])
  })

  it('reads two closed fences as two', () => {
    const { fences } = fencesInOwnProcess('```ts\nx\n```\n\n```js\ny\n```\n')

    expect(fences).toEqual([
      { language: 'ts', body: 'x', line: 0 },
      { language: 'js', body: 'y', line: 4 },
    ])
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
