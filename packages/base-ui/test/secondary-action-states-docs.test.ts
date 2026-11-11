/**
 * The consumer-facing text of the secondary action states: AC-secondary-action-states-18's README
 * clauses (R8(e)), -23 (R11) and the base-ui half of -24 (R12). The changeset is read while it is
 * pending and from the CHANGELOG once the version pull request has consumed it, so the rows hold on
 * both sides of the release.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'

const ROOT = path.join(PACKAGE_DIR, '../..')
const NEW_NAMES = ['--nave-color-action-secondary-hover', '--nave-color-action-secondary-active']
const NAMES_A_STATE = /--nave-color-action-secondary-(?:hover|active)(?![\w-])/

const collapse = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()

/**
A section of a README: from its heading to the next heading of the same or a higher level.
 */
const sectionOf = (markdown: string, heading: string): string => {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.startsWith(heading))
  const level = /^#+/.exec(lines[start] ?? '')?.[0].length ?? 0
  const end = lines.findIndex(
    (line, index) =>
      index > start && /^#+ /.test(line) && (/^#+/.exec(line)?.[0].length ?? 9) <= level,
  )
  return collapse(lines.slice(start, end === -1 ? undefined : end).join('\n'))
}

const rootReadme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const baseUiReadme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')

const RUNG_2_SENTENCE =
  "Override a fill together with its state slots: `--nave-color-action-primary` with `--nave-color-action-primary-hover` and `--nave-color-action-primary-active`, and `--nave-color-action-secondary` with `--nave-color-action-secondary-hover` and `--nave-color-action-secondary-active`. Overriding a fill alone keeps the states Nave generates, so under the pointer and while pressed the control takes Nave's colour, not yours."
const RERUN = /after upgrading\b[^.]*re-run `navecss-tokens build`[^.]*commit what it writes/i
const CONSEQUENCE =
  'renders the secondary button with a transparent fill under the pointer and while pressed'

describe("AC-secondary-action-states-18: the base-ui README says what a consumer's background-color replaces", () => {
  const step = collapse(
    baseUiReadme.split('\n').find((line) => line.startsWith('2. **`className`.**')) ?? '',
  )

  it('names the Button, the triggers and closes styled as a button, and the Toggle, in every variant and disabled', () => {
    expect(step).toContain(
      "set `background-color` on a Button, on a trigger or close that Nave styles as a button, or on a Toggle, and your colour replaces its hover and active colours in every variant and a disabled one's too",
    )
  })

  it("has no sentence left that says it replaces the primary variant's colours alone", () => {
    expect(collapse(baseUiReadme)).not.toContain(
      "replaces the `primary` variant's hover and active colours",
    )
  })
})

describe("AC-secondary-action-states-23: the three consumer sentences are where each rung's reader looks", () => {
  it('has the rung 2 section carry the override-with-its-states sentence byte for byte', () => {
    expect(sectionOf(rootReadme, '### Rung 2')).toContain(RUNG_2_SENTENCE)
  })

  it.each(['### Rung 1b', '### Rung 3'])(
    'has %s tell a consumer to re-run the build and commit what it writes',
    (heading) => {
      const section = sectionOf(rootReadme, heading)

      expect(section).toMatch(RERUN)
      expect(section).toContain(CONSEQUENCE)
    },
  )

  it('has rung 4 carry the instruction only in the conditional form', () => {
    const section = sectionOf(rootReadme, '### Rung 4')
    const conditional = 'if your build commits or caches what `navecss-tokens build` writes'
    const at = section.indexOf(conditional)

    expect(at).toBeGreaterThan(-1)
    expect(section).toMatch(RERUN)
    const instructions = section
      .matchAll(/re-run `navecss-tokens build`/gi)
      .map((match) => match.index)
      .toArray()
    expect(instructions.length).toBeGreaterThan(0)
    for (const index of instructions) {
      const sentence = section.slice(section.lastIndexOf('. ', index) + 2, index)
      expect(sentence, 'the sentence before the instruction').toContain(conditional)
    }
    expect(section.split(CONSEQUENCE)).toHaveLength(2)
    expect(section.slice(0, at)).not.toContain(CONSEQUENCE)
  })

  it('leaves the rung 1a section without any of these sentences', () => {
    const section = sectionOf(rootReadme, '### Rung 1a')

    expect(section).toContain('### Rung 1a')
    expect(section).not.toContain(CONSEQUENCE)
    expect(section).not.toContain('action-secondary')
  })
})

interface PendingChangeset {
  readonly releases: Record<string, string>
  readonly text: string
}

const frontmatterOf = (text: string): Record<string, string> =>
  Object.fromEntries(
    (/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '')
      .split('\n')
      .map((line) => /^\s*(['"]?)(.+?)\1\s*:\s*(\S+)\s*$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[2] ?? '', match[3] ?? '']),
  )

const pendingChangesets = (): PendingChangeset[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => readFileSync(path.join(ROOT, '.changeset', file), 'utf8'))
    .map((text) => ({
      releases: frontmatterOf(text),
      text: text.replace(/^---\n[\s\S]*?\n---\n/, ''),
    }))

/**
The note that introduced the paint, as a bump and its text: the pending changeset naming base-ui
and the new names, or, once consumed, the oldest CHANGELOG entry naming them.
 */
const introducingNote = (): { bump: string; pendingReleases?: string[]; text: string } => {
  const pending = pendingChangesets().find(
    ({ releases, text }) => '@navecss/base-ui' in releases && NAMES_A_STATE.test(text),
  )
  if (pending !== undefined) {
    return {
      bump: pending.releases['@navecss/base-ui'] ?? '',
      pendingReleases: Object.keys(pending.releases),
      text: pending.text,
    }
  }
  const changelog = readFileSync(path.join(PACKAGE_DIR, 'CHANGELOG.md'), 'utf8')
  const release =
    changelog
      .split(/^## /m)
      .slice(1)
      .findLast((section) => NAMES_A_STATE.test(section)) ?? ''
  const heading = /^### (Major|Minor|Patch) Changes$/m
  const bump = release
    .split(/^### /m)
    .slice(1)
    .find((part) => NAMES_A_STATE.test(part))
  return {
    bump: heading.exec(`### ${bump ?? ''}`)?.[1]?.toLowerCase() ?? '',
    text: release,
  }
}

describe('AC-secondary-action-states-24: the base-ui changeset', () => {
  const note = introducingNote()
  const text = collapse(note.text)

  it('is a minor, and while it is pending it names @navecss/base-ui alone', () => {
    expect(note.bump).toBe('minor')
    // Once the version pull request has consumed the changeset the release notes carry no list of
    // the packages it named, so only the pending form can be asked.
    expect(note.pendingReleases ?? ['@navecss/base-ui']).toEqual(['@navecss/base-ui'])
    for (const { releases } of pendingChangesets()) {
      expect('@navecss/base-ui' in releases && '@navecss/tokens' in releases).toBe(false)
    }
  })

  it('names the new paint on the default variant of the twelve parts and on the Toggle, and the raised tokens floor', () => {
    expect(text).toMatch(/hover and (?:press|active)/i)
    expect(text).toContain('twelve')
    expect(text).toContain('Toggle')
    expect(text).toMatch(/`@navecss\/tokens` 0\.5\.0/)
  })

  it('carries the re-run sentence and names the two names a rung 5 token set now supplies', () => {
    expect(text).toMatch(RERUN)
    expect(text).toContain(CONSEQUENCE)
    for (const name of NEW_NAMES) expect(text).toContain(`\`${name}\``)
  })

  it('names exactly the two state names as what a rung 5 colour set must now supply', () => {
    const rung5 = text
      .split(/(?<=\.) /)
      .filter((sentence) => /fifth rung|rung 5|full colou?r set/i.test(sentence))

    expect(rung5, 'the rung 5 sentence').toHaveLength(1)
    expect(rung5[0]?.match(/--nave-[a-z0-9-]+/g)).toEqual(NEW_NAMES)
  })
})
