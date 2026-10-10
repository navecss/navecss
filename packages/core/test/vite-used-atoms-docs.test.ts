import { execFileSync } from 'node:child_process'
/**
 * What the documentation says about the atoms the Vite plugin ships (AC-used-atoms-36, -56 and
 * -58): the README section, the Vite setup paragraphs, the pointer in the `cx()` section, the
 * docblocks, and the two pending changesets. The copy that names focus, screen readers or
 * accessibility was cleared one unit at a time; it is pinned here by digest, never by a second
 * copy of its words, so a changed word fails and a re-wrapped line does not.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { REPORT_CAUSE } from '../src/vite-used-report.ts'
import { extractFences, type Fence } from './doc-fences.ts'
import { VITE_APIS } from './helpers/vite-app.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const coreReadme = readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
const rootReadme = readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8')
const cxSource = readFileSync(path.join(CORE_ROOT, 'src/cx.ts'), 'utf8')
const optionsSource = readFileSync(path.join(CORE_ROOT, 'src/vite-options.ts'), 'utf8')
const usedChangeset = readFileSync(
  path.join(REPO_ROOT, '.changeset/vite-plugin-ships-only-read-atoms.md'),
  'utf8',
)
const pluginChangeset = readFileSync(
  path.join(REPO_ROOT, '.changeset/vite-plugin-for-nave-directive.md'),
  'utf8',
)

/**
 * A run of whitespace is one space: the README re-wraps its prose, and re-wrapping is not a
 * rewording.
 */
const fold = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()

/**
 * The prose of a source file's comments, with the comment markers dropped and folded.
 */
const commentProse = (source: string): string =>
  fold(source.replaceAll(/^\s*\/?\*+\/?[ \t]?/gm, ''))

/**
 * The anchor GitHub gives a heading.
 */
const slug = (heading: string): string =>
  heading
    .replace(/^#+\s*/, '')
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')

const SECTION_HEADING = '#### Which atoms the build ships'

/**
 * The text from `heading` to the next heading of the same or a shallower level.
 */
function section(markdown: string, heading: string): string {
  const level = /^#+/.exec(heading)![0].length
  const start = markdown.indexOf(`\n${heading}\n`)
  expect(start, `no "${heading}" heading`).toBeGreaterThanOrEqual(0)
  const rest = markdown.slice(start + heading.length + 2)
  const next = new RegExp(String.raw`\n#{1,${level}} `).exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

/**
 * The paragraph of `markdown` that starts with `opening`, folded.
 */
function paragraphStarting(markdown: string, opening: string): string {
  const start = markdown.indexOf(opening)
  expect(start, `no paragraph starts "${opening.slice(0, 50)}"`).toBeGreaterThanOrEqual(0)
  const end = markdown.indexOf('\n\n', start)
  return fold(markdown.slice(start, end === -1 ? undefined : end))
}

// An absent section reads as empty, so each test below fails on its own instead of the file failing
// to load.
const atoms = coreReadme.includes(`\n${SECTION_HEADING}\n`)
  ? section(coreReadme, SECTION_HEADING)
  : ''
const fences = extractFences('README.md', atoms)

/**
 * Where, in the section's text, each part opens, in the order the criterion fixes. A part that is
 * missing is `-1`.
 */
const PART_MARKERS = [
  "The Vite plugin also chooses which of Nave's atoms reach your stylesheet",
  '**What the build can read.**',
  '**Names chosen at run time.**',
  '**Code you import.**',
  '**What the build cannot see.**',
  '**Shipping every atom.**',
  '**If you publish components that call `cx()`.**',
]

/**
 * The fence of the section that holds `needle`.
 */
function fenceHolding(needle: string): Fence {
  const found = fences.find((fence) => fence.body.includes(needle))
  expect(found, `no fence in the section holds ${needle}`).toBeDefined()
  return found!
}

describe('AC-used-atoms-36 — the section, the cx() section and the docblocks', () => {
  it('sits under the Vite plugin setup, and no heading or fence names the retired option form', () => {
    const setup = coreReadme.indexOf('\n### Vite plugin setup\n')
    const heading = coreReadme.indexOf(`\n${SECTION_HEADING}\n`)
    const nextH3 = coreReadme.indexOf('\n### ', setup + 1)

    expect(setup).toBeGreaterThanOrEqual(0)
    expect(heading).toBeGreaterThan(setup)
    expect(heading).toBeLessThan(nextH3)
    expect(coreReadme).not.toContain('Ship only the atoms you use')
    expect(coreReadme).not.toContain("atomic: 'used'")
  })

  it('has the parts in the order the criterion fixes', () => {
    const positions = PART_MARKERS.map((marker) => atoms.indexOf(marker))

    expect(positions).not.toContain(-1)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
  })

  it('quotes the report’s first-line cause word for word', () => {
    expect(fold(atoms)).toContain(REPORT_CAUSE)
  })

  it('teaches the choose-between-results pattern', () => {
    expect(fenceHolding('layouts[variant]').body).toContain("{ row: cx('flex'), grid: cx('grid') }")
    expect(fold(atoms)).toContain('call `cx()` once per case and pick between the results')
  })

  it('shows cx.dynamic() and keep in one fence, and says what a name outside keep does', () => {
    const fence = fenceHolding('cx.dynamic(layout)')

    expect(fence.body).toContain("keep: ['flex', 'grid']")
    expect(fold(atoms)).toContain("any other value gets none (`''`)")
  })

  it('has a cxModules fence, the lint’s same-setting sentence and the monorepo advice', () => {
    const text = fold(atoms)

    expect(fenceHolding('cxModules:').body).toContain("from '@navecss/core/vite'")
    expect(text).toContain(
      '`@navecss/eslint-plugin` has a `cxModules` setting with the same name and the same entries',
    )
    expect(text).toContain('write the entries as aliases or package names')
  })

  it('has a keepFor fence and says a value outside a package’s list has no rule in dev or in the build', () => {
    expect(fenceHolding('keepFor:').body).toContain("'@acme/ui'")
    expect(fold(atoms)).toMatch(
      /has no rule, in dev as in the build, unless the atom ships for another reason/,
    )
  })

  it('names the cases the build cannot see: a class taken from the atoms subpath, a backend’s templates, no bundler, Next.js and webpack, the server-first order and the cache file', () => {
    const text = fold(atoms)

    expect(text).toContain("`@navecss/core/atoms` (`atomClassMap[variant]`, `toClassName('grid')`)")
    expect(text).toContain('list its atom in `keep`')
    expect(text).toContain('by a backend that serves its own templates')
    expect(text).toContain('on Next.js and webpack alike')
    expect(text).toContain('a page with no bundler')
    expect(text).toContain('build the server first: `vite build --ssr`, then `vite build`')
    expect(text).not.toContain('build the client first')
    expect(text).toContain('`nave-used-atoms.json`')
    expect(text).toMatch(/atoms there, sorted/)
    expect(text).toContain('`ssr.noExternal`')
  })

  it('keeps atomic: all to the shipping-every-atom part, after every part that fixes an error', () => {
    const [before, after] = atoms.split('**Shipping every atom.**', 2)
    const rest = after!.split('**If you publish components that call `cx()`.**', 1)[0]!

    expect(before).not.toMatch(/atomic: 'all'|'all'/)
    expect(rest).toContain("`navePlugin({ atomic: 'all' })`")
    expect(atoms.split('**If you publish components that call `cx()`.**', 2)[1]).not.toMatch(
      /'all'/,
    )
    expect(atoms).not.toMatch(/if the build fails/i)
    expect(fenceHolding(REPORT_CAUSE).body).not.toContain("'all'")
  })

  it('has the author part: a list exported as const satisfies, passed to keepFor, and to keep for a workspace package', () => {
    const fence = fenceHolding('as const satisfies readonly AtomName[]')

    expect(fence.body).toContain("// navePlugin({ keepFor: { '@acme/ui': naveAtoms } })")
    expect(fold(atoms)).toContain(
      'passes the list to `keep` instead (`navePlugin({ keep: naveAtoms })`)',
    )
  })

  it('makes no claim that a cx() call becomes its class string, and none that Nave ships only what the app uses', () => {
    const text = fold(atoms)

    expect(text).not.toMatch(/becomes (?:its|the) class string|replaced by (?:its|the) class/i)
    expect(text).not.toMatch(/Nave ships only/i)
  })

  it('points to the section from the cx() section, and names the Vite plugin in the build-level-check sentence', () => {
    const cx = section(coreReadme, '### Escape hatch — cx() utility')

    expect(cx).toContain('(#which-atoms-the-build-ships)')
    expect(fold(cx)).toContain(
      'use the Vite plugin, which by default fails the build on an unknown atom in a `cx()` call, or the `@nave` directive',
    )
  })

  it('has the docblock sentence on cx() in src/cx.ts', () => {
    const text = commentProse(cxSource)

    expect(text).toContain('Under the Vite plugin the build reads the value as well as the type')
    expect(text).toContain(
      'To choose by a value, call cx() once per case and pick between the results',
    )
  })

  it('has a docblock on each of atomic, keep, keepFor and cxModules, saying what ships in dev as in the build', () => {
    const text = commentProse(optionsSource)

    const lines = optionsSource.split('\n')
    for (const option of ['atomic?:', 'keep?:', 'keepFor?:', 'cxModules?:']) {
      const at = lines.findIndex((line) => line.trim().startsWith(option))
      expect(at, option).toBeGreaterThan(0)
      expect(lines[at - 1]?.trim(), `${option} has a docblock`).toBe('*/')
    }
    expect(text).toContain("`'used'` (the default)")
    expect(text).toContain('plus those in `keep` and `keepFor`')
    expect(text).toContain('the dev server serves the same set')
  })

  it('repeats the Vite range the fixtures run on', () => {
    expect(Object.keys(VITE_APIS)).toEqual(['8.2.1', 'newest 8.x'])
    expect(fold(coreReadme)).toContain(
      'measured on Vite 8.2.1 and the newest 8.x at the time of each release',
    )
  })
})

describe('AC-used-atoms-36 — the cleared copy is the cleared copy', () => {
  /*
   * Each unit below was supplied or cleared as one piece. The digests are of the whitespace-folded
   * text, so they hold across a re-wrap and fail on a changed word. A red run means the text moved:
   * the change needs the same clearance the words had, not a recomputed digest.
   */
  const PINS = {
    authorLine: 'ed1b7e88772be4d4a116c7865626dc2ead1acb49748cb7a8985b93a541fd9322',
    fenceSentence: '28c072757fccb68124eccf2143bd2a0aa760adc10b81b4fdcd59b4976644b301',
    paragraphEnd: '3c94dee076485c956545692840e1880b7ea803eb518f5b2b9a0ce7ea4c92d1a2',
    paragraphStart: '965c86701e919f9c1d521cdc3343e2ef7141d6189b70de7c9c7926fd317994fb',
    renderedByServer: '887072a7299af5ada480ca2a52a52eebcbfadd6cfb37d0e0089131be22e5f845',
  } as const

  const PRODUCTION_CHECK = 'Before you ship, run your checks'
  const PARAGRAPH_OPENING = 'A class the build does not read ('

  it('holds the paragraph on what the build cannot see: its two cleared ends and a middle that keeps a dev and build difference', () => {
    const paragraph = paragraphStarting(atoms, PARAGRAPH_OPENING)
    const middleStart = paragraph.indexOf(' The dev server serves the atoms the build would ship')
    const endStart = paragraph.indexOf(` ${PRODUCTION_CHECK}`)
    const middle = paragraph.slice(middleStart + 1, endStart)

    expect(middleStart).toBeGreaterThan(0)
    expect(createHash('sha256').update(paragraph.slice(0, middleStart)).digest('hex')).toBe(
      PINS.paragraphStart,
    )
    expect(
      createHash('sha256')
        .update(paragraph.slice(endStart + 1))
        .digest('hex'),
    ).toBe(PINS.paragraphEnd)
    // The middle is the one part written apart from the cleared ends. It claims dev parity, keeps
    // a difference standing, ends on the sentence the production check depends on, and names
    // neither focus, keyboard, screen readers nor accessibility.
    expect(middle).toContain('The dev server serves the atoms the build would ship')
    expect(middle).toMatch(/can still keep a rule the build drops/)
    expect(middle).toMatch(/and lack one the build keeps/)
    expect(
      middle.endsWith('so a page can still look and behave differently in dev than in the build.'),
    ).toBe(true)
    expect(middle).not.toMatch(/focus|keyboard|screen.?reader|accessib/i)
  })

  it('holds the sentence beside the setup’s first fence, the author line and the server-rendered clause as cleared', () => {
    const fenceParagraph = paragraphStarting(coreReadme, '**It also chooses which atoms ship.**')
    const fenceSentence = fenceParagraph.slice(
      fenceParagraph.indexOf('By default only the atoms Nave can read'),
    )
    const authorLine = paragraphStarting(
      atoms,
      'List every atom your components can apply at run time',
    )
    const rendered = fold(atoms)
    const clauseStart = rendered.indexOf(
      'where another use put that atom in the emitted set, the server-rendered element',
    )
    const clause = rendered.slice(
      clauseStart,
      rendered.indexOf("client's render.", clauseStart) + "client's render.".length,
    )

    expect(createHash('sha256').update(fenceSentence).digest('hex')).toBe(PINS.fenceSentence)
    expect(createHash('sha256').update(authorLine).digest('hex')).toBe(PINS.authorLine)
    expect(clauseStart).toBeGreaterThan(0)
    expect(createHash('sha256').update(clause).digest('hex')).toBe(PINS.renderedByServer)
  })

  it('names focus, screen readers or accessibility in the setup and the section only inside those units', () => {
    const cleared = [
      paragraphStarting(coreReadme, '**It also chooses which atoms ship.**'),
      paragraphStarting(atoms, PARAGRAPH_OPENING),
      paragraphStarting(atoms, 'List every atom your components can apply at run time'),
    ]
    const leftover = cleared.reduce(
      (text, unit) => text.replace(unit, ''),
      fold(section(coreReadme, '### Vite plugin setup')),
    )

    // Atom names in code spans (`srOnlyFocusable`) are names, not claims about focus.
    expect(leftover.replaceAll(/`[^`]*`/g, '')).not.toMatch(
      /screen.?reader|accessib|keyboard|focus/i,
    )
  })
})

describe('AC-used-atoms-56 — the Vite setup and the root README carry the default', () => {
  const setup = section(coreReadme, '### Vite plugin setup')
  const flat = fold(setup)

  it('says navePlugin() returns two Vite plugins in an array, and no longer says it is a plain plugin object', () => {
    expect(flat).toContain(
      'returns two Vite plugins in an array, which `plugins` takes as one entry',
    )
    expect(flat).not.toContain('plain Vite plugin object')
  })

  it('has the production-check paragraph between the first fence and the build.cssTarget paragraph', () => {
    const firstFence = setup.indexOf('```', setup.indexOf('```') + 3) + 3
    const paragraph = setup.indexOf('**It also chooses which atoms ship.**')
    const floor = setup.indexOf('`build.cssTarget` is the browser floor')

    expect(paragraph).toBeGreaterThan(firstFence)
    expect(paragraph).toBeLessThan(floor)
    const text = paragraphStarting(setup, '**It also chooses which atoms ship.**')
    expect(text).toContain('is an error in the dev server and fails `vite build`')
    expect(text).toContain('listed in `keep` or in a `keepFor` entry')
  })

  it('links the section by an anchor that is the slug of exactly one heading, under the setup', () => {
    const headings = coreReadme
      .matchAll(/^#{1,6} .+$/gm)
      .map((match) => match[0])
      .toArray()

    expect(headings.filter((heading) => slug(heading) === 'which-atoms-the-build-ships')).toEqual([
      SECTION_HEADING,
    ])
    // The control: a heading renamed away from the slug leaves nothing to land on.
    expect(
      headings
        .map((heading) => (heading === SECTION_HEADING ? '#### Shipped atoms' : heading))
        .filter((heading) => slug(heading) === 'which-atoms-the-build-ships'),
    ).toEqual([])
    expect(flat).toContain('(#which-atoms-the-build-ships)')
  })

  it('keeps "Leaving both is harmless" and adds that moving also changes which atoms ship', () => {
    expect(flat).toContain('Leaving both is harmless')
    expect(flat).toMatch(/Moving also changes which atoms ship/)
    expect(flat).toContain('after the move a `cx()` call it cannot read fails the build')
  })

  it('has one sentence in the root README’s Quick start, linking the section', () => {
    const quickStart = rootReadme.slice(
      rootReadme.indexOf('## Quick start'),
      rootReadme.indexOf('## Getting started'),
    )

    expect(
      quickStart.match(/packages\/core\/README\.md#which-atoms-the-build-ships/g),
    ).toHaveLength(1)
    expect(rootReadme.match(/which-atoms-the-build-ships/g)).toHaveLength(1)
  })

  it('states the Vite range the fixtures run on, equal to the fixtures’ own', () => {
    const [floor] = Object.keys(VITE_APIS)

    expect(flat).toContain(`the fixtures run on Vite ${floor} and on the newest 8.x`)
  })

  const SURFACES: Readonly<Record<string, string>> = {
    'the Vite setup': setup,
    'the section': atoms,
    'the usedAtoms changeset': usedChangeset,
    'the plugin changeset': pluginChangeset,
    'the root README sentence': rootReadme.slice(
      rootReadme.indexOf('The plugin also chooses which of Nave'),
      rootReadme.indexOf('The plugin also chooses which of Nave') + 300,
    ),
  }
  const RETIRED = /now defaults to|opt[- ]in|previously/i

  for (const [name, text] of Object.entries(SURFACES)) {
    it(`does not say "now defaults to", "opt in" or "previously" in ${name}`, () => {
      expect(text).not.toMatch(RETIRED)
    })
  }

  it('control: the scan catches the words', () => {
    expect('moving previously meant').toMatch(RETIRED)
  })
})

/**
 * The version a `package.json` text declares.
 */
const versionOf = (text: string): string => (JSON.parse(text) as { version: string }).version

/**
 * `packages/core/package.json` at the commit that merged the Vite plugin, or `undefined` in a
 * checkout without that commit (a shallow clone).
 */
function manifestAtPluginMerge(): string | undefined {
  try {
    return execFileSync('git', ['show', '304eee4:packages/core/package.json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

describe('AC-used-atoms-58 — the two pending changesets read as one release', () => {
  const flatUsed = fold(usedChangeset)
  const flatPlugin = fold(pluginChangeset)

  it('has a minor on @navecss/core that opens with the scoped headline', () => {
    expect(usedChangeset).toMatch(/^---\n'@navecss\/core': minor\n---\n/)
    expect(flatUsed).toContain('The Vite plugin ships only the atoms its build can read a use for')
  })

  it('says what fails, what the dev server serves, what is new, and what the plugin sets in the reader’s config', () => {
    expect(flatUsed).toContain('A `cx()` call whose atoms the build cannot read fails the build')
    expect(flatUsed).toContain(
      "A Nave class built from pieces (`'nave-' + tone`) fails the build the same way",
    )
    expect(flatUsed).toContain('The dev server serves the same set')
    expect(flatUsed).toContain('New: `cx.dynamic(name)`')
    expect(flatUsed).toContain("returns `''` where `cx()` returns it unchanged")
    for (const option of ['`keep`', '`keepFor`', '`cxModules`', "`atomic: 'all'`"]) {
      expect(flatUsed).toContain(option)
    }
    expect(flatUsed).toContain('`optimizeDeps.exclude`')
    expect(flatUsed).toContain('`resolve.noExternal`')
  })

  it('leaves the plugin changeset pending, with two plugins in an array, no code added to the bundle, and the atoms sentence', () => {
    expect(pluginChangeset).toMatch(/^---\n'@navecss\/core': minor\n---\n/)
    expect(flatPlugin).not.toContain('plain Vite plugin')
    expect(flatPlugin).not.toContain('adds nothing to the browser bundle')
    expect(flatPlugin).toContain('returns two Vite plugins in an array')
    expect(flatPlugin).toContain('adds no code to the browser bundle')
    expect(flatPlugin).toMatch(
      /Leaving both is harmless[^.]*\. Moving also changes which atoms ship/,
    )
  })

  it('says neither "now defaults to", "opt in" nor "previously"', () => {
    expect(`${usedChangeset}\n${pluginChangeset}`).not.toMatch(
      /now defaults to|opt[- ]in|previously/i,
    )
  })

  it('does not move the core version between the plugin’s merge and this delivery', () => {
    const atMerge = manifestAtPluginMerge()
    // A checkout without that commit cannot say; review checks it then.
    if (atMerge === undefined) return

    const now = versionOf(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8'))

    expect(now).toBe(versionOf(atMerge))
  })
})
