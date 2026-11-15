/**
 * AC-nextjs-used-atoms-44, the fourth delivery's clause: the package's first release is a `minor`
 * change of `@navecss/prune`, and its note says what the package does, that it versions with
 * `@navecss/core`, and corrects the earlier core note that said the PostCSS plugin ships every
 * atom on Next.js. Reads the pending changeset while it exists and the package's `CHANGELOG.md`
 * once a release has consumed it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..')
const CHANGESET_DIR = path.resolve(PACKAGE_DIR, '../../.changeset')
const PACKAGE_NAME = '@navecss/prune'

const flat = (text: string): string => text.replaceAll(/\s+/gu, ' ')

/**
 * The first release's note, whitespace-flattened, and the bump it asked for: the pending
 * changeset that names the package while one exists, and the `### Minor Changes` of the
 * `CHANGELOG.md` the release wrote from it afterwards.
 */
function firstReleaseNote(): { bump: string; text: string } {
  const pending = readdirSync(CHANGESET_DIR)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => readFileSync(path.join(CHANGESET_DIR, name), 'utf8'))
    .find((text) => text.includes(`'${PACKAGE_NAME}':`))
  if (pending !== undefined) {
    const bump = new RegExp(String.raw`^'${PACKAGE_NAME}':\s*(\w+)$`, 'mu').exec(pending)?.[1]
    return { bump: bump ?? 'none', text: flat(pending.replace(/^---[\s\S]*?\n---\n/u, '')) }
  }
  const changelog = path.join(PACKAGE_DIR, 'CHANGELOG.md')
  expect(
    existsSync(changelog),
    `no pending changeset names ${PACKAGE_NAME}, and it has no CHANGELOG.md`,
  ).toBe(true)
  const minor = /### Minor Changes\n([\s\S]*?)(?:\n### |\n## |$)/u.exec(
    readFileSync(changelog, 'utf8'),
  )?.[1]
  return { bump: minor === undefined ? 'none' : 'minor', text: flat(minor ?? '') }
}

describe('AC-nextjs-used-atoms-44: the first release of the package is a minor change that names what it does', () => {
  it('bumps the package at minor', () => {
    expect(firstReleaseNote().bump).toBe('minor')
  })

  it('names withNave(), the PostCSS plugin and the Next.js floor', () => {
    const { text } = firstReleaseNote()
    expect(text).toContain('`withNave()`')
    expect(text).toContain('`@navecss/prune/postcss`')
    expect(text).toContain('Next.js 16.2.0')
  })

  it('says the package versions with @navecss/core', () => {
    expect(firstReleaseNote().text).toMatch(
      /same version as `@navecss\/core`|with `@navecss\/core`/u,
    )
  })

  it('corrects the earlier note: the core PostCSS plugin still ships every atom, and prune is the Next.js way to ship fewer', () => {
    const { text } = firstReleaseNote()
    expect(text).toContain('`@navecss/core/postcss` still ships every atom')
    expect(text).toContain('on Next.js, `@navecss/prune`')
  })

  it('spells Next.js as the project does, and carries no other form of the name', () => {
    const { text } = firstReleaseNote()
    expect(text).toContain('Next.js')
    expect(text).not.toMatch(/NextJS|Next JS|Nextjs/iu)
  })
})
