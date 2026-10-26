import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The release that ships `action.secondary`'s hover and active fills: the tokens release notes
 * name exactly the two new custom properties, and the core release notes say why core moves.
 * Read from the pending changesets while they exist, and from each package's CHANGELOG once the
 * version pull request has consumed them, so the row holds on both sides of the release.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const NEW_NAMES = ['--nave-color-action-secondary-hover', '--nave-color-action-secondary-active']

interface ReleaseNote {
  readonly bump: string
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

const pendingChangesets = (): { releases: Record<string, string>; text: string }[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => readFileSync(path.join(ROOT, '.changeset', file), 'utf8'))
    .map((text) => ({
      releases: frontmatterOf(text),
      text: text.replace(/^---\n[\s\S]*?\n---\n/, ''),
    }))

/**
 * The CHANGELOG entries of a package, with the bump heading each sits under.
 */
function changelogEntries(dir: string): ReleaseNote[] {
  const text = readFileSync(path.join(ROOT, 'packages', dir, 'CHANGELOG.md'), 'utf8')
  const notes: ReleaseNote[] = []
  for (const section of text.split(/^### /m).slice(1)) {
    const [heading = '', ...body] = section.split('\n')
    const bump = /^(Major|Minor|Patch) Changes/.exec(heading)?.[1]?.toLowerCase() ?? ''
    for (const entry of body
      .join('\n')
      .split(/^- (?=[0-9a-f]{7}: )/m)
      .slice(1)) {
      notes.push({ bump, text: entry.split(/^## /m, 1)[0] ?? '' })
    }
  }
  return notes
}

/**
 * The release notes for `name` that match `about`: the pending changesets naming the package
 * if any match, otherwise its CHANGELOG entries.
 */
function releaseNotes(name: string, dir: string, about: RegExp): ReleaseNote[] {
  const pending = pendingChangesets()
    .filter(({ releases, text }) => Object.hasOwn(releases, name) && about.test(text))
    .map(({ releases, text }) => ({ bump: releases[name] ?? '', text }))
  return pending.length > 0 ? pending : changelogEntries(dir).filter(({ text }) => about.test(text))
}

const byText = (a: string, b: string): number => a.localeCompare(b)

const NAMES_A_NEW_STATE = /--nave-color-action-secondary-(?:hover|active)(?![\w-])/

describe('AC-secondary-action-states-24 covers: R12 (the tokens and core release notes)', () => {
  it('one tokens release note, a minor, names exactly the two new custom properties and no other --nave-* name, and says ColorPropertyName gains them and nothing that shipped changes', () => {
    const notes = releaseNotes('@navecss/tokens', 'tokens', NAMES_A_NEW_STATE)
    expect(notes).toHaveLength(1)
    const [note] = notes
    expect(note?.bump).toBe('minor')
    const named = new Set(note?.text.matchAll(/--nave-[\w-]+/g).map((match) => match[0]))
    expect([...named].toSorted(byText)).toEqual(NEW_NAMES.toSorted(byText))
    expect(note?.text).toContain('`ColorPropertyName` gains both')
    expect(note?.text).toContain('Nothing that shipped changes.')
  })

  it("one core release note, a patch, says core moves because SKILL.md's token list gains the two names and because core versions with tokens", () => {
    const notes = releaseNotes('@navecss/core', 'core', NAMES_A_NEW_STATE)
    expect(notes).toHaveLength(1)
    const [note] = notes
    expect(note?.bump).toBe('patch')
    expect(note?.text).toContain('`SKILL.md`')
    expect(note?.text).toMatch(/versions? together with `@navecss\/tokens`/)
  })

  it('no pending changeset names @navecss/base-ui together with @navecss/tokens', () => {
    for (const { releases } of pendingChangesets()) {
      expect(
        Object.hasOwn(releases, '@navecss/base-ui') && Object.hasOwn(releases, '@navecss/tokens'),
      ).toBe(false)
    }
  })
})
