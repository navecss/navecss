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
    writeFileSync(
      changesetPath(),
      "---\n'@navecss/core': minor\n---\n\nSecond entry, still pending.\n",
    )
    expect(shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toContain(
      'still pending.',
    )
  })

  it('throws while the changeset is pending and its text does not open with the given text', () => {
    writeFileSync(
      changesetPath(),
      "---\n'@navecss/core': minor\n---\n\nA reworded opening, so the released entry would differ.\n",
    )
    expect(() => shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toThrow(
      new RegExp(`${changesetPath()} .* "Second entry"`, 'u'),
    )
  })

  it('reads the opening after the front matter, not the front matter itself', () => {
    writeFileSync(
      changesetPath(),
      "---\n'@navecss/core': minor\n---\nSecond entry, no blank line.\n",
    )
    expect(shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toContain(
      'no blank line.',
    )
  })

  it('treats a pending file with no front matter as all text', () => {
    writeFileSync(changesetPath(), 'Second entry, no front matter.\n')
    expect(shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toContain(
      'no front matter.',
    )
  })

  const FRONT_MATTER = "---\n'@navecss/core': minor\n---\n"
  const accepted: Record<string, string> = {
    'Windows line endings': `${FRONT_MATTER.replaceAll('\n', '\r\n')}\r\nSecond entry.\r\n`,
    'a byte order mark': `\u{FEFF}${FRONT_MATTER}\nSecond entry.\n`,
    'blank lines before the front matter': `\n\n${FRONT_MATTER}\nSecond entry.\n`,
    'empty front matter': '---\n---\n\nSecond entry.\n',
    'empty front matter and a later rule': '---\n---\n\nSecond entry.\n\n---\n\nMore.\n',
    'a rule later in the text': `${FRONT_MATTER}\nSecond entry.\n\n---\n\nMore.\n`,
  }
  for (const [shape, text] of Object.entries(accepted)) {
    it(`accepts a pending changeset with ${shape}`, () => {
      writeFileSync(changesetPath(), text)
      expect(shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry')).toBe(text)
    })
  }

  it('does not read a later rule as the end of empty front matter', () => {
    writeFileSync(changesetPath(), '---\n---\n\nSecond entry.\n\n---\n\nMore.\n')
    expect(() => shippedChangesetProse(changesetPath(), changelogPath(), 'More.')).toThrow(
      /does not open with "More\."/u,
    )
  })

  it('throws, naming the problem, when the entry start holds a line break', () => {
    writeFileSync(changesetPath(), `${FRONT_MATTER}\nSecond entry\ncontinues here.\n`)
    expect(() =>
      shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry\ncontinues'),
    ).toThrow(/holds a line break/u)
    expect(() =>
      shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry\r\ncontinues'),
    ).toThrow(/holds a line break/u)
  })

  it('throws for an entry start with a line break once the changeset is gone too', () => {
    expect(() =>
      shippedChangesetProse(changesetPath(), changelogPath(), 'Second entry\ncontinues'),
    ).toThrow(/holds a line break/u)
  })
})
