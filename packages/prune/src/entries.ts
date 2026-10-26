/**
 * Where the graph starts: every file Next.js renders or runs by convention, under `app/` or
 * `src/app/`, `pages/` or `src/pages/`, and the root files it loads (`proxy`, `instrumentation`,
 * `mdx-components`). A convention a later Next.js release adds is not read until this list
 * names it.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'

import { isMarkdownFile, isReadableExtension, isSourceFile } from './source-files.ts'

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

const ROOT_EXTENSIONS = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx']

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
  /**
   * The entries under `pages/` or `src/pages/`, which are in `files` too.
   */
  readonly pagesFiles: string[]
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
 * Whether a file name is a convention file (`page.tsx`), judged by the name before its extension,
 * or before one of the configured page extensions (`page.page.tsx` for `page.tsx`).
 */
function isConventionFile(
  name: string,
  conventions: ReadonlySet<string>,
  pageExtensions: readonly string[],
): boolean {
  const extension = path.extname(name)
  if (
    (isSourceFile(name) || isMarkdownFile(name)) &&
    conventions.has(name.slice(0, -extension.length))
  ) {
    return true
  }
  return pageExtensions.some(
    (configured) =>
      name.endsWith(`.${configured}`) && conventions.has(name.slice(0, -(configured.length + 1))),
  )
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
  const queue = [root]
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
  return { files, directories, pagesFiles: [] }
}

/**
 * The root conventions of `base`: only the files directly in it.
 */
function rootEntries(base: string, pageExtensions: readonly string[]): Entries {
  const names = listing(base)
    .filter(
      (entry) =>
        !entry.isDirectory && isConventionFile(entry.name, ROOT_CONVENTIONS, pageExtensions),
    )
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b))
  const extensions = `{${[...new Set([...ROOT_EXTENSIONS, ...pageExtensions])].join(',')}}`
  return {
    pagesFiles: [],
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
 * Every entry of the project in `dir`. `pageExtensions` are the config's, matched beside the
 * default extensions; one the package cannot read as code or Markdown is left out here, since
 * `withNave()` refuses it before a build gets this far.
 */
export function findEntries(dir: string, pageExtensions: readonly string[] = []): Entries {
  const extensions = pageExtensions.filter((extension) => isReadableExtension(extension))
  const parts: Entries[] = []
  const pagesFiles: string[] = []
  for (const base of [dir, path.join(dir, 'src')]) {
    const pages = walk(
      path.join(base, 'pages'),
      (name) => isSourceFile(name) || isMarkdownFile(name),
      false,
    )
    pagesFiles.push(...pages.files)
    parts.push(
      rootEntries(base, extensions),
      walk(
        path.join(base, 'app'),
        (name) => isConventionFile(name, APP_CONVENTIONS, extensions),
        true,
      ),
      pages,
    )
  }
  return {
    files: parts.flatMap((part) => part.files),
    directories: parts.flatMap((part) => part.directories),
    pagesFiles,
  }
}
