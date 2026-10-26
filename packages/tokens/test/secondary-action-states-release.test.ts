import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The release that ships `action.secondary`'s hover and active fills: the tokens release notes
 * name exactly the two new custom properties, and the core release notes say why core moves.
 * Read from the pending changesets while they exist, and from each package's CHANGELOG once the
 * version pull request has consumed them, so the row holds on both sides of the release, and a
 * later note naming the same property does not move it.
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

interface PendingChangeset {
  readonly releases: Record<string, string>
  readonly text: string
}

const pendingChangesets = (): PendingChangeset[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => readFileSync(path.join(ROOT, '.changeset', file), 'utf8'))
    .map((text) => ({
      releases: frontmatterOf(text),
      text: text.replace(/^---\n[\s\S]*?\n---\n/, ''),
    }))

/**
 * The CHANGELOG entries of a package, newest release first as the file lists them, each with
 * the version it sits under and the bump heading it sits beneath.
 */
function changelogEntries(changelog: string): (ReleaseNote & { readonly version: string })[] {
  const notes: (ReleaseNote & { readonly version: string })[] = []
  for (const release of changelog.split(/^## /m).slice(1)) {
    const version = release.split('\n', 1)[0]?.trim() ?? ''
    for (const section of release.split(/^### /m).slice(1)) {
      const [heading = '', ...body] = section.split('\n')
      const bump = /^(Major|Minor|Patch) Changes/.exec(heading)?.[1]?.toLowerCase() ?? ''
      for (const entry of body
        .join('\n')
        .split(/^- (?=[0-9a-f]{7}: )/m)
        .slice(1)) {
        notes.push({ bump, text: entry, version })
      }
    }
  }
  return notes
}

/**
 * The notes of the release that introduced what `about` matches, for the package `name`: the
 * entries of the oldest CHANGELOG release naming it, or, when the CHANGELOG has none, the
 * pending changesets naming the package. A later note naming the same property, in either
 * place, is not that release.
 */
function releaseNotesFrom(
  name: string,
  about: RegExp,
  pendingSets: readonly PendingChangeset[],
  changelog: string,
): ReleaseNote[] {
  const logged = changelogEntries(changelog).filter(({ text }) => about.test(text))
  const introducing = logged.at(-1)?.version
  if (introducing !== undefined) {
    return logged
      .filter(({ version }) => version === introducing)
      .map(({ bump, text }) => ({ bump, text }))
  }
  return pendingSets
    .filter(({ releases, text }) => Object.hasOwn(releases, name) && about.test(text))
    .map(({ releases, text }) => ({ bump: releases[name] ?? '', text }))
}

const releaseNotes = (name: string, dir: string, about: RegExp): ReleaseNote[] =>
  releaseNotesFrom(
    name,
    about,
    pendingChangesets(),
    readFileSync(path.join(ROOT, 'packages', dir, 'CHANGELOG.md'), 'utf8'),
  )

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

describe('AC-secondary-action-states-24 covers: R12 (which release the rows read)', () => {
  const INTRODUCING = [
    '## 0.5.0',
    '',
    '### Minor Changes',
    '',
    '- def5678: Adds `--nave-color-action-secondary-hover` and `--nave-color-action-secondary-active`.',
    '',
  ].join('\n')
  const LATER = [
    '## 0.6.0',
    '',
    '### Patch Changes',
    '',
    '- abc1234: Retunes `--nave-color-action-secondary-hover` in dark.',
    '',
  ].join('\n')
  const PENDING_LATER: PendingChangeset = {
    releases: { '@navecss/tokens': 'patch' },
    text: 'Retunes `--nave-color-action-secondary-hover` in dark.\n',
  }
  const select = (pendingSets: PendingChangeset[], changelog: string): ReleaseNote[] =>
    releaseNotesFrom('@navecss/tokens', NAMES_A_NEW_STATE, pendingSets, changelog)

  it('a CHANGELOG holding the introducing entry and a later one naming the property selects the introducing one', () => {
    const notes = select([], `${LATER}\n${INTRODUCING}`)
    expect(notes.map(({ bump }) => bump)).toEqual(['minor'])
    expect(notes[0]?.text).toContain('Adds `--nave-color-action-secondary-hover`')
  })

  it('a CHANGELOG holding the introducing entry and a pending changeset naming the property selects the CHANGELOG entry', () => {
    const notes = select([PENDING_LATER], INTRODUCING)
    expect(notes.map(({ bump }) => bump)).toEqual(['minor'])
    expect(notes[0]?.text).toContain('Adds `--nave-color-action-secondary-hover`')
  })

  it('a CHANGELOG with no entry naming the property selects the pending changeset', () => {
    const notes = select(
      [PENDING_LATER],
      '## 0.4.0\n\n### Minor Changes\n\n- 1234abc: Something else.\n',
    )
    expect(notes).toEqual([{ bump: 'patch', text: PENDING_LATER.text }])
  })
})
