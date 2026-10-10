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
