/**
 * AC-nextjs-used-atoms-44, the first delivery's clause: the new `@navecss/core/collect` subpath
 * ships as a minor change of core, and its release note says the subpath is not meant for
 * application code. Reads the pending changeset while it exists and core's `CHANGELOG.md` entry
 * once a release has consumed it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { changelogEntries } from './helpers/released-changeset.ts'

const CORE_ROOT = path.join(import.meta.dirname, '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const NOTE_START = 'New subpath `@navecss/core/collect`'

const flat = (text: string): string => text.replaceAll(/\s+/gu, ' ')

/**
 * The release note that introduced the subpath, whitespace-flattened, and the bump it asked for:
 * the pending changeset while one exists, and the CHANGELOG entry the release wrote from it
 * afterwards.
 */
function collectReleaseNote(): { bump: string | undefined; text: string } {
  const dir = path.join(REPO_ROOT, '.changeset')
  const pending = readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => readFileSync(path.join(dir, name), 'utf8'))
    .find((text) =>
      flat(text.replace(/^---[\s\S]*?\n---\n/u, ''))
        .trimStart()
        .startsWith(NOTE_START),
    )
  if (pending !== undefined) {
    return { bump: /^'@navecss\/core':\s*(\w+)$/mu.exec(pending)?.[1], text: flat(pending) }
  }
  const released = changelogEntries(
    readFileSync(path.join(CORE_ROOT, 'CHANGELOG.md'), 'utf8'),
  ).find((entry) => flat(entry.text).startsWith(NOTE_START))
  expect(
    released,
    `no pending changeset, and no CHANGELOG entry, opens with "${NOTE_START}"`,
  ).toBeDefined()
  return { bump: released!.kind.split(' ', 1)[0]?.toLowerCase(), text: flat(released!.text) }
}

describe('AC-nextjs-used-atoms-44: the collect subpath ships as a minor change that says it is not for applications', () => {
  it('bumps @navecss/core at minor, names @navecss/core/collect and says it is not meant for application code', () => {
    const { bump, text } = collectReleaseNote()
    expect(bump).toBe('minor')
    expect(text).toContain('@navecss/core/collect')
    expect(text).toContain('not meant for application code')
  })
})
