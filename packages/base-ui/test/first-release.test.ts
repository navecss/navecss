import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PUBLISHABLE_SET } from '../../../scripts/check-publishable-set.mjs'
import { PACKAGE_DIR } from './support/stylesheet.ts'

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

const pendingForThisPackage = (): Record<string, string>[] =>
  readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => releasesOf(readFileSync(path.join(ROOT, '.changeset', file), 'utf8')))
    .filter((releases) => Object.hasOwn(releases, NAME))

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
The CHANGELOG section of the release after the first, if there is one.
 */
const secondReleaseSection = (): string | undefined => {
  const sections = readFileSync(CHANGELOG, 'utf8').split(/^## /m).slice(1)
  return sections.length > 1 ? sections.at(-2) : undefined
}

describe('AC-base-ui-overlay-completion-38 (superseded by AC-base-ui-feedback-navigation-48 for the combined package): the release that adds the six components', () => {
  const pending = pendingForThisPackage()

  it.runIf(pending.length > 0)(
    'has every pending changeset naming @navecss/base-ui name it alone with bump minor',
    () => {
      // This release and the one after it can be pending together, so the count is not held here.
      expect(pending.filter((releases) => !isMinorAlone(releases))).toEqual([])
    },
  )

  it.runIf(pending.length === 0)(
    'was released as 0.2.0 from exactly one minor changeset, once the changeset is spent',
    () => {
      const section = secondReleaseSection()
      expect(
        section,
        'no changeset names @navecss/base-ui and no release follows 0.1.0',
      ).toBeDefined()
      expect(section?.split('\n', 1)[0]?.trim()).toBe('0.2.0')
      expect(section).toContain('### Minor Changes')
      expect(section).not.toContain('### Major Changes')
      expect(section?.match(/^- [\da-f]{7,}: /gm) ?? []).toHaveLength(1)
    },
  )

  it('has no changeset that names @navecss/base-ui together with @navecss/tokens', () => {
    const together = allChangesets().filter(
      (releases) => Object.hasOwn(releases, NAME) && Object.hasOwn(releases, TOKENS),
    )
    expect(together).toEqual([])
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
