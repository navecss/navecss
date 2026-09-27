/**
 * The pending changesets that name this package, as surfaces a copy scan reads. A changeset is
 * shipped text only until a release consumes it, and the release pull request deletes the file,
 * so a scan that read one file by name would fail on exactly that pull request. This returns
 * whatever is pending, which is nothing once the package has been released and nothing new is
 * queued for it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Surface } from './outcome-words.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const PACKAGE_NAME = '@navecss/stylelint-config'

/**
 * Whether a changeset's frontmatter names this package as a release.
 */
function isForThisPackage(text: string): boolean {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  return frontmatter
    .split('\n')
    .some((line) => /^\s*(['"]?)(.+)\1\s*:/.exec(line)?.[2] === PACKAGE_NAME)
}

/**
 * Every pending changeset naming this package, read from `rootDir/.changeset`, one surface each.
 */
export function pendingChangesetSurfaces(rootDir: string = ROOT): Surface[] {
  const dir = path.join(rootDir, '.changeset')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => readFileSync(path.join(dir, file), 'utf8'))
    .filter((text) => isForThisPackage(text))
    .map((text) => ({ name: 'changeset', text }))
}
