/**
 * The prose a changeset ships, for the copy scans that read it.
 *
 * A changeset exists only until the release that consumes it: `changeset version` deletes the
 * file and writes its text into the package's `CHANGELOG.md`. A scan that opens the file by path
 * therefore passes on the feature branch and fails, by construction, on the version commit. These
 * helpers read the pending file while it exists and the entry the release wrote afterwards, so
 * the same text stays under the same scan for as long as it is part of what the package ships.
 */
import { existsSync, readFileSync } from 'node:fs'

export interface ChangelogEntry {
  /** The `### ` heading the entry sits under, e.g. `Minor Changes` or `Patch Changes`. */
  readonly kind: string
  /** The entry's text, with the leading `<commit>: ` that `changeset version` adds removed. */
  readonly text: string
}

/**
 * Every bullet under a `### ` heading in a Changesets-written `CHANGELOG.md`, in file order. A
 * bullet runs from its `- ` line to the next bullet or heading, so a multi-paragraph entry stays
 * whole.
 */
export function changelogEntries(changelog: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let kind = ''
  let lines: string[] = []
  const flush = (): void => {
    if (lines.length > 0) {
      const text = lines.join('\n').replace(/^- (?:[0-9a-f]{7,}: )?/u, '')
      entries.push({ kind, text: text.trim() })
    }
    lines = []
  }
  for (const line of changelog.split('\n')) {
    if (line.startsWith('#')) {
      flush()
      if (line.startsWith('### ')) kind = line.slice(4).trim()
    } else if (line.startsWith('- ')) {
      flush()
      lines.push(line)
    } else if (lines.length > 0) {
      lines.push(line)
    }
  }
  flush()
  return entries
}

/**
 * The text of one shipped change: the pending changeset at `changesetPath` while it exists,
 * otherwise the `changelogPath` entry that begins with `entryStart`. Throws when neither is there,
 * so a scan over the result can never pass by reading nothing.
 */
export function shippedChangesetProse(
  changesetPath: string,
  changelogPath: string,
  entryStart: string,
): string {
  if (existsSync(changesetPath)) return readFileSync(changesetPath, 'utf8')
  const entry = changelogEntries(readFileSync(changelogPath, 'utf8')).find((candidate) =>
    candidate.text.startsWith(entryStart),
  )
  if (entry === undefined) {
    throw new Error(
      `${changesetPath} is consumed and ${changelogPath} has no entry starting "${entryStart}"`,
    )
  }
  return entry.text
}
