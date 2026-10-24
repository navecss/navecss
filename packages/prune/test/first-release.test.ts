/**
 * AC-nextjs-used-atoms-44 (this package's clause) and the flip to publishable: the package joins
 * the set the repository publishes, carries one `minor` changeset that says what it does, and is
 * named where the repository lists what it publishes.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PUBLISHABLE_SET } from '../../../scripts/check-publishable-set.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
const NAME = '@navecss/prune'

const read = (file: string): string => readFileSync(path.join(REPO_ROOT, file), 'utf8')

/**
 * The releases a changeset's frontmatter names, package name to bump.
 */
function releasesOf(text: string): Record<string, string> {
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1] ?? ''
  return Object.fromEntries(
    frontmatter
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const match = /^\s*(['"]?)(.+?)\1\s*:\s*(\S+)\s*$/u.exec(line)
        return [match?.[2] ?? line, match?.[3] ?? '']
      }),
  )
}

/**
 * The changesets that name this package, with their text.
 */
function changesetsNamingThePackage(): { releases: Record<string, string>; text: string }[] {
  return readdirSync(path.join(REPO_ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => read(`.changeset/${file}`))
    .map((text) => ({ releases: releasesOf(text), text }))
    .filter(({ releases }) => Object.hasOwn(releases, NAME))
}

describe('the flip to publishable', () => {
  it('is in the set the repository publishes, and the gate that compares the set agrees', () => {
    expect([...PUBLISHABLE_SET]).toContain(NAME)
    const gate = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts/check-publishable-set.mjs')],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
    expect(gate.stdout + gate.stderr).not.toMatch(/does not match/u)
    expect(gate.status).toBe(0)
  })

  it('has exactly one changeset: a minor on this package alone', () => {
    const changesets = changesetsNamingThePackage()
    expect(changesets.map(({ releases }) => releases)).toEqual([{ [NAME]: 'minor' }])
  })

  it('has a changeset that says what the package does and what stays as it was', () => {
    const [{ text } = { text: '' }] = changesetsNamingThePackage()
    const body = text.replace(/^---\n[\s\S]*?\n---\n/u, '')
    expect(body).toContain(
      'New package: `@navecss/prune` ships only the atoms a Next.js build can read a use for',
    )
    expect(body).toContain("'@navecss/prune/postcss': {}")
    expect(body).toContain('`withNave()`')
    expect(body).toContain('`@navecss/core/postcss` is unchanged and still ships every atom')
    // Public text: no tracker reference of any spelling.
    expect(body).not.toMatch(/#\d+|navecss-cowork/u)
  })

  it('is named under what the repository publishes, not under what it does not', () => {
    const docs = read('docs/index.md')
    const published = docs.slice(
      docs.indexOf('Published to npm'),
      docs.indexOf('(`private: true`)'),
    )
    const unpublished = docs.slice(docs.indexOf('(`private: true`)'))
    // Control: both lists are there.
    expect(published).toContain('@navecss/core')
    expect(unpublished).toContain('@navecss/cli')
    expect(published).toContain(NAME)
    expect(unpublished).not.toContain(NAME)
  })

  it('is described in the project guide as published, beside the packages it builds on', () => {
    const guide = read('CLAUDE.md')
    expect(guide).toMatch(/`prune` \(/u)
    expect(guide).toMatch(/not yet published, `cli`/u)
    expect(guide).not.toMatch(/not yet published[^;]*`prune`/u)
  })
})
