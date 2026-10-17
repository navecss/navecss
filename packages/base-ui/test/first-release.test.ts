import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PUBLISHABLE_SET } from '../../../scripts/check-publishable-set.mjs'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import { hasTheSix, SIX_SUBPATHS } from './support/w12-release.ts'

const ROOT = path.join(PACKAGE_DIR, '../..')
const NAME = '@navecss/base-ui'
const CHANGELOG = path.join(ROOT, 'packages/base-ui/CHANGELOG.md')

/**
The releases a changeset's frontmatter names, package name to bump, quoted or not.
 */
const releasesOf = (text: string): Record<string, string> => {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  return Object.fromEntries(
    frontmatter
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const match = /^\s*(['"]?)(.+?)\1\s*:\s*(\S+)\s*$/.exec(line)
        return [match?.[2] ?? line, match?.[3] ?? '']
      }),
  )
}

const isMinorAlone = (releases: Record<string, string>): boolean =>
  Object.keys(releases).length === 1 && releases[NAME] === 'minor'

const pendingChangesets = (): { releases: Record<string, string>; text: string }[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => {
      const text = readFileSync(path.join(ROOT, '.changeset', file), 'utf8')
      return { releases: releasesOf(text), text }
    })
    .filter(({ releases }) => Object.hasOwn(releases, NAME))

const pendingForThisPackage = (): Record<string, string>[] =>
  pendingChangesets().map(({ releases }) => releases)

/**
The pending changesets that are about the release of the six components, which hold the clauses of
that release; a later changeset, such as a fix, is outside them.
 */
const pendingAboutTheSix = (): Record<string, string>[] =>
  pendingChangesets()
    .filter(({ text }) => hasTheSix(text))
    .map(({ releases }) => releases)

/**
The oldest section of the package's CHANGELOG: the record of its first release.
 */
const firstReleaseSection = (): string =>
  readFileSync(CHANGELOG, 'utf8').split(/^## /m).slice(1).at(-1) ?? ''

describe('AC-base-ui-bridge-44: the first release', () => {
  it('enters PUBLISHABLE_SET', () => {
    expect([...PUBLISHABLE_SET]).toContain(NAME)
  })

  const wasReleased = existsSync(CHANGELOG)

  it.runIf(!wasReleased)(
    'is unreleased, with exactly one pending changeset: it alone, minor',
    () => {
      expect(pendingForThisPackage()).toEqual([{ [NAME]: 'minor' }])
    },
  )

  it.runIf(wasReleased)('was first released as 0.1.0, from exactly one minor changeset', () => {
    const section = firstReleaseSection()
    expect(section.split('\n', 1)[0]?.trim()).toBe('0.1.0')
    expect(section).toContain('### Minor Changes')
    expect(section).not.toContain('### Major Changes')
    // One entry per changeset, keyed by its commit; the "Updated dependencies" lines are not.
    expect(section.match(/^- [\da-f]{7,}: /gm) ?? []).toHaveLength(1)
  })

  it('control: a second changeset, a second package or another bump is not the first release', () => {
    expect(releasesOf("---\n'@navecss/base-ui': minor\n---\n\nx")).toEqual({ [NAME]: 'minor' })
    expect(releasesOf('---\n"@navecss/base-ui": minor\n---\n\nx')).toEqual({ [NAME]: 'minor' })
    expect(
      releasesOf("---\n'@navecss/base-ui': minor\n'@navecss/tokens': minor\n---\n\nx"),
    ).not.toEqual({ [NAME]: 'minor' })
    expect(releasesOf("---\n'@navecss/base-ui': patch\n---\n\nx")).not.toEqual({
      [NAME]: 'minor',
    })
  })
})

const TOKENS = '@navecss/tokens'

const allChangesets = (): Record<string, string>[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => releasesOf(readFileSync(path.join(ROOT, '.changeset', file), 'utf8')))

/**
The entries of a CHANGELOG section, one per changeset, keyed by its commit.
 */
const entriesOf = (section: string): string[] =>
  section.split(/^(?=- [\da-f]{7,}: )/m).filter((entry) => /^- [\da-f]{7,}: /.test(entry))

/**
The CHANGELOG section of the release after the first, if there is one.
 */
const secondReleaseSection = (): string | undefined => {
  const sections = readFileSync(CHANGELOG, 'utf8').split(/^## /m).slice(1)
  return sections.length > 1 ? sections.at(-2) : undefined
}

describe('AC-base-ui-overlay-completion-38 (superseded by AC-base-ui-feedback-navigation-48 for the combined package): the release that adds the six components', () => {
  const pending = pendingAboutTheSix()

  it.runIf(pending.length > 0)(
    'has every pending changeset about the six name @navecss/base-ui alone with bump minor',
    () => {
      // This release and the one after it can be pending together, so the count is not held here.
      expect(pending.filter((releases) => !isMinorAlone(releases))).toEqual([])
    },
  )

  it.runIf(pending.length === 0)(
    'was released as 0.2.0, with exactly one minor changeset that adds the six components among its entries, once the changeset is spent',
    () => {
      const section = secondReleaseSection()
      expect(
        section,
        'no changeset names @navecss/base-ui and no release follows 0.1.0',
      ).toBeDefined()
      expect(section?.split('\n', 1)[0]?.trim()).toBe('0.2.0')
      expect(section).toContain('### Minor Changes')
      expect(section).not.toContain('### Major Changes')
      // The next release's changeset can have merged before this release was cut, and is then in the
      // same section, so the entries are not counted: the one that adds the six is.
      expect(
        entriesOf(section ?? '').filter((entry) =>
          SIX_SUBPATHS.every((subpath) => entry.includes(subpath)),
        ),
      ).toHaveLength(1)
    },
  )

  it('has no changeset that names @navecss/base-ui together with @navecss/tokens', () => {
    const together = allChangesets().filter(
      (releases) => Object.hasOwn(releases, NAME) && Object.hasOwn(releases, TOKENS),
    )
    expect(together).toEqual([])
  })

  it('control: a changeset about the six is told from a later fix that names neither set', () => {
    expect(hasTheSix(SIX_SUBPATHS.join(', '))).toBe(true)
    expect(hasTheSix('A fix to the Dialog namespace.')).toBe(false)
    expect(hasTheSix('alert-dialog and combobox only')).toBe(false)
  })

  it('control: a changeset naming both packages, or the package with a patch or a major, is not the release', () => {
    const both = releasesOf("---\n'@navecss/base-ui': minor\n'@navecss/tokens': minor\n---\n\nx")
    expect(Object.hasOwn(both, NAME) && Object.hasOwn(both, TOKENS)).toBe(true)
    for (const bump of ['patch', 'major']) {
      expect(releasesOf(`---\n'@navecss/base-ui': ${bump}\n---\n\nx`)).not.toEqual({
        [NAME]: 'minor',
      })
    }
    expect(releasesOf("---\n'@navecss/tokens': minor\n---\n\nx")).not.toHaveProperty(NAME)
    expect(isMinorAlone({ [NAME]: 'minor' })).toBe(true)
    expect(isMinorAlone({ [NAME]: 'minor', [TOKENS]: 'minor' })).toBe(false)
    expect(isMinorAlone({ [NAME]: 'patch' })).toBe(false)
  })
})
