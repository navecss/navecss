/**
 * The changeset-prose reader the copy scans share: it reads a pending changeset while one exists
 * and the CHANGELOG entry the release wrote once the changeset is consumed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { changelogEntries, shippedChangesetProse } from './helpers/released-changeset.ts'

const CHANGELOG = `# @navecss/core

## 0.2.0

### Minor Changes

- d88fc5c: First entry, first paragraph.

  First entry, second paragraph.

  - a nested bullet

- f616c71: Second entry.

### Patch Changes

- cc4c78b: Third entry.
- Updated dependencies [314680e]
  - @navecss/tokens@0.2.0

## 0.1.1

### Patch Changes

- 0ab1c2d: Older entry.
`

describe('changelogEntries', () => {
  const entries = changelogEntries(CHANGELOG)

  it('reads every bullet under a heading, tagged with the heading it sits under', () => {
    expect(entries.map((entry) => entry.kind)).toEqual([
      'Minor Changes',
      'Minor Changes',
      'Patch Changes',
      'Patch Changes',
      'Patch Changes',
    ])
  })

  it('strips the leading commit hash and keeps a multi-paragraph entry whole', () => {
    expect(entries[0]!.text).toBe(
      'First entry, first paragraph.\n\n  First entry, second paragraph.\n\n  - a nested bullet',
    )
    expect(entries[1]!.text).toBe('Second entry.')
  })

  it('keeps a bullet that has no commit hash, nested lines included', () => {
    expect(entries[3]!.text).toBe('Updated dependencies [314680e]\n  - @navecss/tokens@0.2.0')
  })
})

describe('shippedChangesetProse', () => {
  let dir: string
  const changelogPath = (): string => path.join(dir, 'CHANGELOG.md')
  const changesetPath = (): string => path.join(dir, 'pending.md')

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'nave-released-changeset-'))
    writeFileSync(changelogPath(), CHANGELOG)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the pending changeset while its file exists, ignoring the changelog', () => {
    writeFileSync(changesetPath(), "---\n'@navecss/core': minor\n---\n\nPending text.\n")
    expect(shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toContain(
      'Pending text.',
    )
  })

  it('returns the changelog entry once the changeset file is gone', () => {
    expect(shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toBe(
      'Second entry.',
    )
  })

  it('throws when the changeset is gone and no entry starts with the given text', () => {
    expect(() => shippedChangesetProse(changesetPath(), changelogPath(), 'No such entry')).toThrow(
      /no entry starting "No such entry"/u,
    )
  })
})
