/**
 * AC-nextjs-used-atoms-44, the fourth delivery's clause: the package's first release is a `minor`
 * change of `@navecss/prune`, and its note says what the package does, that it versions with
 * `@navecss/core`, and corrects the earlier core note that said the PostCSS plugin ships every
 * atom on Next.js. Reads the pending changeset of the first release while it exists and the
 * package's oldest `CHANGELOG.md` section once a release has consumed it, so a later changeset or a
 * later release does not move what is read.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..')
const CHANGESET_DIR = path.resolve(PACKAGE_DIR, '../../.changeset')
const CHANGELOG = path.join(PACKAGE_DIR, 'CHANGELOG.md')
const FIRST_RELEASE_CHANGESET = 'prune-first-release.md'

const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  name: string
  peerDependencies: Record<string, string>
}

const flat = (text: string): string => text.replaceAll(/\s+/gu, ' ')

interface Note {
  readonly bump: string
  readonly text: string
}

/**
 * The bump a changeset's front matter asks for the package, whichever quotes the key has.
 */
function bumpOf(changeset: string, name: string): string {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`)
  const pattern = new RegExp(String.raw`^(['"])${escaped}\1:\s*(\w+)$`, 'mu')
  return pattern.exec(changeset)?.[2] ?? 'none'
}

/**
 * The first release's note, whitespace-flattened, and the bump it asked for: the first release's
 * own changeset while it is pending, and the `### Minor Changes` of the oldest `##` section of the
 * `CHANGELOG.md` the release wrote from it afterwards.
 */
function firstReleaseNote(changesetDir: string, changelogPath: string, name: string): Note {
  const pendingPath = path.join(changesetDir, FIRST_RELEASE_CHANGESET)
  if (existsSync(pendingPath)) {
    const pending = readFileSync(pendingPath, 'utf8')
    return { bump: bumpOf(pending, name), text: flat(pending.replace(/^---[\s\S]*?\n---\n/u, '')) }
  }
  expect(
    existsSync(changelogPath),
    `no ${FIRST_RELEASE_CHANGESET} is pending, and ${name} has no CHANGELOG.md`,
  ).toBe(true)
  const oldest = readFileSync(changelogPath, 'utf8').split(/^## /mu).at(-1) ?? ''
  const minor = /### Minor Changes\n([\s\S]*?)(?:\n### |$)/u.exec(oldest)?.[1]
  return { bump: minor === undefined ? 'none' : 'minor', text: flat(minor ?? '') }
}

/**
 * Whether the note names the floor the manifest asks of Next.js, as it writes it: `>=16.2.0` is
 * `Next.js 16.2.0`.
 */
const hasFloor = (text: string, peerDependencies: Record<string, string>): boolean =>
  text.includes(`Next.js ${(peerDependencies.next ?? '').replace('>=', '')}`)

/**
 * Whether the note says the package is released at the same version as core.
 */
const isVersionedWithCore = (text: string): boolean =>
  text.includes('It is released at the same version as `@navecss/core`: upgrade the two together.')

/**
 * Every spelling of the name of the framework that is not `Next.js`, as found.
 */
const misspellingsOfNextjs = (text: string): string[] =>
  text.match(/next[. ]?js/giu)?.filter((found) => found !== 'Next.js') ?? []

/**
 * Every directory `fixture()` made, so the last hook can remove each one.
 */
const fixtureDirectories: string[] = []

afterAll(() => {
  for (const directory of fixtureDirectories) {
    rmSync(directory, { recursive: true, force: true })
    assert.equal(existsSync(directory), false, `${directory} is removed`)
  }
})

/**
 * Writes the files under a fresh temporary directory and returns it.
 */
function fixture(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'release-note-'))
  fixtureDirectories.push(directory)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true })
    writeFileSync(path.join(directory, name), content)
  }
  return directory
}

const CHANGESET = (key: string, bump: string, body: string): string =>
  `---\n${key}: ${bump}\n---\n\n${body}\n`

const { name } = manifest
const real = (): Note => firstReleaseNote(CHANGESET_DIR, CHANGELOG, name)

/**
 * The note read from a fixture directory, with the whitespace around it trimmed.
 */
function readFixture(directory: string, changelog = 'none.md'): Note {
  const note = firstReleaseNote(directory, path.join(directory, changelog), '@navecss/prune')
  return { bump: note.bump, text: note.text.trim() }
}

describe('AC-nextjs-used-atoms-44: the first release of the package is a minor change that names what it does', () => {
  it('bumps the package at minor', () => {
    expect(real().bump).toBe('minor')
  })

  it('names withNave(), the PostCSS plugin and the Next.js floor the manifest asks', () => {
    const { text } = real()
    expect(text).toContain('`withNave()`')
    expect(text).toContain(`\`${name}/postcss\``)
    expect(hasFloor(text, manifest.peerDependencies)).toBe(true)
  })

  it('says the package is released at the same version as @navecss/core', () => {
    expect(isVersionedWithCore(real().text)).toBe(true)
  })

  it('corrects the earlier note: the core PostCSS plugin still ships every atom, and prune is the Next.js way to ship fewer', () => {
    const { text } = real()
    expect(text).toContain('`@navecss/core/postcss` still ships every atom')
    expect(text).toContain(`on Next.js, \`${name}\``)
  })

  it('spells Next.js as the project does, and carries no other form of the name', () => {
    const { text } = real()
    expect(text).toContain('Next.js')
    expect(misspellingsOfNextjs(text)).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-44: which note is read', () => {
  it('reads the first release’s changeset when a later one for the package sorts before it', () => {
    const directory = fixture({
      'a-later-fix.md': CHANGESET("'@navecss/prune'", 'patch', 'A later fix.'),
      [FIRST_RELEASE_CHANGESET]: CHANGESET("'@navecss/prune'", 'minor', 'First release.'),
    })
    expect(readFixture(directory)).toEqual({ bump: 'minor', text: 'First release.' })
  })

  it('reads a changeset whose key has double quotes', () => {
    const directory = fixture({
      [FIRST_RELEASE_CHANGESET]: CHANGESET('"@navecss/prune"', 'minor', 'First release.'),
    })
    expect(readFixture(directory).bump).toBe('minor')
  })

  it('control: a changeset that does not name the package asks for none', () => {
    expect(bumpOf(CHANGESET("'@navecss/core'", 'minor', 'Other.'), '@navecss/prune')).toBe('none')
  })

  it('reads the oldest release in the changelog once the changeset is gone', () => {
    const directory = fixture({
      'CHANGELOG.md':
        '# @navecss/prune\n\n## 0.7.0\n\n### Minor Changes\n\nA later feature.\n\n### Patch Changes\n\nA fix.\n\n' +
        '## 0.6.0\n\n### Minor Changes\n\nFirst release.\n',
      '.changeset/README.md': '# Changesets\n',
    })
    expect(readFixture(path.join(directory, '.changeset'), '../CHANGELOG.md')).toEqual({
      bump: 'minor',
      text: 'First release.',
    })
  })
})

describe('AC-nextjs-used-atoms-44: what the note is checked for', () => {
  it('says the same version only when it says so', () => {
    expect(
      isVersionedWithCore(
        'It is released at the same version as `@navecss/core`: upgrade the two together.',
      ),
    ).toBe(true)
    expect(isVersionedWithCore('It is not released with `@navecss/core`.')).toBe(false)
    expect(
      isVersionedWithCore(
        'It is not released at the same version as `@navecss/core`: upgrade the two together.',
      ),
    ).toBe(false)
  })

  it('asks the floor of the manifest’s next peer', () => {
    const { text } = real()
    expect(hasFloor(text, { next: '>=16.2.0' })).toBe(true)
    expect(hasFloor(text, { next: '>=16.3.0' })).toBe(false)
  })

  it.each(['Next.JS', 'NEXT.js', 'next.js', 'NextJS', 'Next JS', 'Nextjs'])(
    'reads %s as a misspelling of Next.js',
    (spelling) => {
      expect(misspellingsOfNextjs(`It needs ${spelling} 16.`)).toEqual([spelling])
    },
  )

  it('reads Next.js as correct', () => {
    expect(misspellingsOfNextjs('It needs Next.js 16.')).toEqual([])
  })
})
