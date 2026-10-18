/**
 * Where the graph starts: every file Next.js renders or runs by convention, under `app/` or
 * `src/app/`, `pages/` or `src/pages/`, and the root files it loads (`proxy`, `instrumentation`,
 * `mdx-components`). A convention a later Next.js release adds is not read until this list
 * names it.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { isMarkdownFile, isSourceFile } from './source-files.ts'

const APP_CONVENTIONS = new Set([
  'default',
  'error',
  'forbidden',
  'global-error',
  'global-not-found',
  'layout',
  'loading',
  'not-found',
  'page',
  'route',
  'template',
  'unauthorized',
])

const ROOT_CONVENTIONS = new Set([
  'instrumentation',
  'instrumentation-client',
  'mdx-components',
  'proxy',
])

/**
 * A directory the entries were selected from.
 */
export interface SelectedDirectory {
  readonly path: string
  /**
   * The names in the directory that took part in the selection, sorted: the entry files and the
   * subdirectories walked. Other files do not change what is selected.
   */
  readonly names: readonly string[]
  /**
   * Whether the selection descends into subdirectories.
   */
  readonly isRecursive: boolean
  /**
   * The pattern of file names a bundler needs to watch in the directory.
   */
  readonly glob: string
}

export interface Entries {
  readonly files: string[]
  readonly directories: SelectedDirectory[]
}

/**
 * The directory entries of `dir`, or none when it cannot be read.
 */
function listing(dir: string): { isDirectory: boolean; name: string }[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }))
  } catch {
    return []
  }
}

/**
 * Whether a file name is a convention file (`page.tsx`), judged by the name before its extension.
 */
function isConventionFile(name: string, conventions: ReadonlySet<string>): boolean {
  const extension = path.extname(name)
  if (!isSourceFile(name) && !isMarkdownFile(name)) return false
  return conventions.has(name.slice(0, -extension.length))
}

/**
 * Whether a directory is walked: not a dot directory, `node_modules`, or a private folder.
 */
function isWalked(name: string, isPrivateSkipped: boolean): boolean {
  if (name === 'node_modules' || name.startsWith('.')) return false
  return !(isPrivateSkipped && name.startsWith('_'))
}

/**
 * Selects from the tree under `root`: files `isEntry` accepts, in every directory below it.
 */
function walk(
  root: string,
  isEntry: (name: string) => boolean,
  isPrivateSkipped: boolean,
): Entries {
  const files: string[] = []
  const directories: SelectedDirectory[] = []
  // A directory that is not there is not selected from, so it is never declared to the bundler.
  const queue = existsSync(root) ? [root] : []
  while (queue.length > 0) {
    const dir = queue.pop()!
    const names: string[] = []
    for (const entry of listing(dir)) {
      if (entry.isDirectory && isWalked(entry.name, isPrivateSkipped)) {
        queue.push(path.join(dir, entry.name))
        names.push(`${entry.name}/`)
      } else if (!entry.isDirectory && isEntry(entry.name)) {
        files.push(path.join(dir, entry.name))
        names.push(entry.name)
      }
    }
    directories.push({
      path: dir,
      names: names.toSorted((a, b) => a.localeCompare(b)),
      isRecursive: true,
      glob: '**/*',
    })
  }
  return { files, directories }
}

/**
 * The root conventions of `base`: only the files directly in it.
 */
function rootEntries(base: string): Entries {
  if (!existsSync(base)) return { files: [], directories: [] }
  const names = listing(base)
    .filter((entry) => !entry.isDirectory && isConventionFile(entry.name, ROOT_CONVENTIONS))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b))
  const extensions = '{cjs,cts,js,jsx,mjs,mts,ts,tsx}'
  return {
    files: names.map((name) => path.join(base, name)),
    directories: [
      {
        path: base,
        names,
        isRecursive: false,
        glob: `{${[...ROOT_CONVENTIONS].join(',')}}.${extensions}`,
      },
    ],
  }
}

/**
 * Every entry of the project in `dir`.
 */
export function findEntries(dir: string): Entries {
  const parts: Entries[] = []
  for (const base of [dir, path.join(dir, 'src')]) {
    parts.push(
      rootEntries(base),
      walk(path.join(base, 'app'), (name) => isConventionFile(name, APP_CONVENTIONS), true),
      walk(path.join(base, 'pages'), (name) => isSourceFile(name) || isMarkdownFile(name), false),
    )
  }
  return {
    files: parts.flatMap((part) => part.files),
    directories: parts.flatMap((part) => part.directories),
  }
}
