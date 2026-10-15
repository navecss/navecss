/**
 * What core's README says about Astro (AC-astro-26, -35, -36), and the changeset that ships it
 * (AC-astro-41). The README's `#### Astro` subsection is read here as text: its order statement
 * against the one `@navecss/core/layers` ships, its versions against the lockfile, its pinned
 * sentences, and the sentence-level rule that nothing in the Vite plugin section puts "not
 * covered" after "Astro".
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { extractFences } from './doc-fences.ts'
import {
  astroConfigFence,
  astroNotCoveredSentences,
  astroParagraph,
  astroSection,
  fixtureVersions,
  layersStatement,
  layersStatementOf,
  orderStatementLine,
  readCoreReadme,
  readLockfile,
  readmeSection,
  versionsFromLockfile,
} from './helpers/astro-readme.ts'
import { changelogEntries } from './helpers/released-changeset.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const flat = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()

const sha16 = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

/**
 * The text between the `<style is:inline>` tag and its closing tag.
 */
const insideStyleTag = (line: string): string =>
  line.replace(/^<style is:inline>/, '').replace(/<\/style>$/, '')

/**
 * The Vite plugin section of core's README, from its heading.
 */
const vitePluginSetup = (): string => readmeSection('### Vite plugin setup')

/**
 * Whether some sentence of `text` tells the reader to import a layout or a component in an order.
 */
const hasImportOrderInstruction = (text: string): boolean =>
  flat(text)
    .split(/\.(?=\s|$)/)
    .some(
      (sentence) =>
        /\bimport/i.test(sentence) &&
        /\b(layout|component)/i.test(sentence.slice(sentence.search(/\bimport/i))),
    )

/**
 * Whether some sentence of `text` mentions `inlineStylesheets` together with `never`.
 */
const hasInlineStylesheetsAdvice = (text: string): boolean =>
  flat(text)
    .split(/\.(?=\s|$)/)
    .some((sentence) => /inlineStylesheets/i.test(sentence) && /never/i.test(sentence))

/**
 * The next patch version: `7.3.8` is `7.3.9`.
 */
const nextPatch = (version: string): string => {
  const [major, minor, patch] = version.split('.', 3)
  return `${major}.${minor}.${Number(patch) + 1}`
}

describe('AC-astro-26 — the README’s order statement is the one @navecss/core/layers ships', () => {
  it('equals layers.css with its comments removed and its surrounding whitespace trimmed', () => {
    const line = orderStatementLine()

    expect(line.startsWith('<style is:inline>')).toBe(true)
    expect(line.endsWith('</style>')).toBe(true)
    expect(insideStyleTag(line)).toBe(layersStatement())
  })

  it('is the first child element of <head> in the astro fence', () => {
    const fence = extractFences('README.md', astroSection()).find((f) => f.lang === 'astro')!
    const afterHead = fence.body.slice(fence.body.indexOf('<head>') + '<head>'.length)

    expect(fence.body).toContain('<head>')
    expect(afterHead.trimStart().startsWith(orderStatementLine())).toBe(true)
  })

  it('control: a copy of layers.css with two layer names swapped reports a difference', () => {
    const css = readFileSync(path.join(CORE_ROOT, 'src/layers.css'), 'utf8')
    // Two names of the statement are swapped, not the comment above it.
    const swapped = css.replace(
      'tokens.defaults, tokens.presets',
      'tokens.presets, tokens.defaults',
    )

    expect(swapped).not.toBe(css)
    expect(insideStyleTag(orderStatementLine())).not.toBe(layersStatementOf(swapped))
  })

  it('holds no instruction to import a layout before a component', () => {
    const prose = astroSection().replaceAll(/```[\s\S]*?```/g, '')

    expect(hasImportOrderInstruction(prose)).toBe(false)
    // The control: an import-order instruction would be caught.
    expect(
      hasImportOrderInstruction('Import your layout before any component that has a style.'),
    ).toBe(true)
  })
})

describe('AC-astro-35 — Astro has a measured subsection, its versions come from the lockfile', () => {
  it('has no sentence in the Vite plugin section that puts "not covered" after "Astro"', () => {
    const text = vitePluginSetup()

    expect(flat(text)).not.toMatch(/Astro[^.]*not covered/i)
    expect(astroNotCoveredSentences(text)).toEqual([])
  })

  it('control: the sentence check reds on a sentence the regex alone misses', () => {
    const appended = `${vitePluginSetup()}\n\nVue islands inside Astro (set in \`astro.config\`) are not covered.\n`

    // The period inside the code span stops `[^.]*`, so the regex alone passes this text.
    expect(flat(appended)).not.toMatch(/Astro[^.]*not covered/i)
    expect(astroNotCoveredSentences(appended)).toEqual([
      'Vue islands inside Astro (set in `astro.config`) are not covered',
    ])
  })

  it('has a #### Astro heading inside that section, after the atoms section and before the PostCSS setup', () => {
    const readme = readCoreReadme()
    const astro = readme.indexOf('\n#### Astro\n')
    const atoms = readme.indexOf('\n#### Which atoms the build ships\n')
    const postcss = readme.indexOf('\n### PostCSS plugin setup\n')

    expect(astro).toBeGreaterThan(atoms)
    expect(postcss).toBeGreaterThan(astro)
    expect(vitePluginSetup()).toContain('\n#### Astro\n')
    // It is the last thing in the section: nothing but blank lines between it and the next heading.
    expect(readme.slice(astro + 1 + astroSection().length, postcss + 1).trim()).toBe('')
  })

  it('points from "Setting up @nave" and from the coverage list to the Astro subsection', () => {
    const readme = flat(readCoreReadme())

    expect(readme).toContain(
      'On Vite, use the Vite plugin: it is the one route this package teaches for Vite, and for Astro, which builds with Vite ([Astro](#astro) has its config). On',
    )
    expect(readme).toContain(
      "`css.transformer`. A `?raw` import returns the file's text as it is. Astro has its own setup and its own measured list: [Astro](#astro).",
    )
  })

  it('names the Astro and Vite versions the lockfile resolves', () => {
    const { astro, vite } = fixtureVersions()
    const text = flat(astroSection())

    expect(text).toContain(`Astro ${astro}`)
    expect(text).toContain(`Vite ${vite}`)
  })

  it('control: a lockfile that resolves astro one patch higher is not what the README names', () => {
    const { astro } = fixtureVersions()
    const bumped = nextPatch(astro)
    const lockfile = readLockfile().split(`${astro}(`).join(`${bumped}(`)

    expect(versionsFromLockfile(lockfile).astro).toBe(bumped)
    expect(flat(astroSection())).not.toContain(`Astro ${versionsFromLockfile(lockfile).astro}`)
  })

  it('has a js fence with cssTarget and no targets, and exactly one fence in the section holds both floor keys', () => {
    const fence = astroConfigFence()
    const both = extractFences('README.md', vitePluginSetup()).filter(
      (f) => f.body.includes('cssTarget') && f.body.includes('targets'),
    )

    expect(fence).toContain('cssTarget')
    expect(fence).not.toContain('targets')
    expect(both).toHaveLength(1)
  })
})

describe('AC-astro-36 — the Astro subsection’s pinned paragraphs and sentences', () => {
  const PRODUCTION_CHECK = 'The build chooses which atoms ship'
  const DEV_PARAGRAPH = 'In `astro dev`, the first paint'

  it('holds the 239-byte production-check paragraph directly after the js fence, as it was cleared', () => {
    const section = astroSection()
    const paragraph = astroParagraph(PRODUCTION_CHECK)
    const afterFence = section.slice(
      section.indexOf(astroConfigFence()) + astroConfigFence().length,
    )

    expect(afterFence.startsWith(`\`\`\`\n\n${paragraph}\n\n`)).toBe(true)
    expect(Buffer.byteLength(paragraph)).toBe(239)
    expect(sha16(paragraph), 'the cleared copy changed: do not recompute this digest').toBe(
      '874ea5b01d748086',
    )
  })

  it('holds the 484-byte astro dev paragraph as it was cleared', () => {
    const paragraph = astroParagraph(DEV_PARAGRAPH)

    expect(Buffer.byteLength(paragraph)).toBe(484)
    expect(sha16(paragraph), 'the cleared copy changed: do not recompute this digest').toBe(
      'ef08582ef38f725b',
    )
  })

  it('pins the sentence of each paragraph a requirement names', () => {
    const text = flat(astroSection())

    // R3: a `client:only` component and `keep`; `resolve.noExternal`, and `ssr.noExternal` as not reaching.
    expect(text).toContain(
      "Astro writes its CSS in its server build, before the browser's build runs, so an atom named only by code the browser runs, such as a `client:only` component or a `<script>` in an `.astro` file, fails the build: list it in `keep`.",
    )
    expect(text).toContain(
      'A dependency the server build leaves external is read just as late: add it to `resolve.noExternal` under `vite`, which reaches every environment Astro builds, where `ssr.noExternal` does not.',
    )
    // R2(c): the shared stylesheet in server output with prerendered pages.
    expect(text).toContain(
      "And in `output: 'server'` with prerendered pages, the stylesheet the on-demand pages share ships every atom.",
    )
    // R5: the stylesheets Astro writes into the page, and the name a message gives them.
    expect(text).toContain(
      'also read the stylesheets Astro writes into the page instead of as files (those under 4 kB, by default).',
    )
    expect(text).toContain(
      'The file a message names for one of those is the name the stylesheet had before Astro inlined it, so no file of that name is in `dist`.',
    )
    // R13: where the line of a `@nave` error in a `<style>` block counts from.
    expect(text).toContain(
      "In an `.astro` file, the line of a `@nave` error counts from the start of the `<style>` block that holds it, not from the top of the file, and its column can differ from your file's, because Astro rewrites the block's whitespace.",
    )
    // R6: the first paint in `astro dev`.
    expect(text).toContain(
      "In `astro dev`, the first paint holds the stylesheet as Vite's own CSS step left it, every atom and every `@nave` unexpanded, until the page's scripts load; after that the dev server serves what the build would, as far as it has read.",
    )
  })

  it('gives no advice to set inlineStylesheets to never', () => {
    expect(hasInlineStylesheetsAdvice(readCoreReadme())).toBe(false)
    // The control: that advice would be caught.
    expect(
      hasInlineStylesheetsAdvice(
        "Set `build.inlineStylesheets` to `'never'` and the scan reads every file.",
      ),
    ).toBe(true)
  })
})

describe('AC-astro-41 — the changeset for @navecss/core', () => {
  const CHANGESET_PATH = path.join(REPO_ROOT, '.changeset/astro-pruning.md')
  const CHANGELOG_PATH = path.join(CORE_ROOT, 'CHANGELOG.md')
  const PENDING_FRONT_MATTER = "'@navecss/core': minor"
  const ENTRY_START = 'Astro: the Vite plugin now ships only the atoms it reads on Astro'

  /**
   * The release note and its bump: the pending changeset while one exists, and the CHANGELOG entry
   * the release wrote from it afterwards.
   */
  function astroReleaseNote(): {
    bump: string | undefined
    frontMatter?: string | undefined
    text: string
  } {
    if (existsSync(CHANGESET_PATH)) {
      const pending = readFileSync(CHANGESET_PATH, 'utf8')
      const frontMatter = /^---\n([\s\S]*?)\n---\n/.exec(pending)?.[1]
      return {
        bump: /^'@navecss\/core':\s*(\w+)$/m.exec(pending)?.[1],
        frontMatter,
        text: flat(pending.replace(/^---\n[\s\S]*?\n---\n/, '')),
      }
    }
    const released = changelogEntries(readFileSync(CHANGELOG_PATH, 'utf8')).find((entry) =>
      entry.text.startsWith(ENTRY_START),
    )
    expect(
      released,
      `no pending changeset, and no CHANGELOG entry, opens with "${ENTRY_START}"`,
    ).toBeDefined()
    return { bump: released!.kind.split(' ', 1)[0]?.toLowerCase(), text: flat(released!.text) }
  }

  it('is a minor bump of @navecss/core, opens as the release note does, and bumps nothing else', () => {
    const { bump, frontMatter, text } = astroReleaseNote()

    expect(bump).toBe('minor')
    expect(text.startsWith(ENTRY_START)).toBe(true)
    // A pending file's front matter names the one package; a released entry has none to read.
    expect(frontMatter?.trim() ?? PENDING_FRONT_MATTER).toBe(PENDING_FRONT_MATTER)
  })

  it('names the Astro and Vite versions the README names', () => {
    const { astro, vite } = fixtureVersions()
    const { text } = astroReleaseNote()

    expect(text).toContain(`Astro ${astro}, Vite ${vite}`)
  })

  it('leaves no interim "tried by hand" changeset pending', () => {
    expect(readdirSync(path.join(REPO_ROOT, '.changeset'))).not.toContain('astro-tried-by-hand.md')
  })
})
