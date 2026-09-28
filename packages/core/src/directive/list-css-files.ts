/**
 * Resolves one `--source` entry into the files `check()` reads. A file
 * named explicitly is read regardless of its extension; a directory is
 * read recursively for `.css` files only, following symlinks (a build
 * tool's output directory is often one), loop-safe against a symlink that
 * points back at an ancestor.
 */
import type { Dirent } from 'node:fs'

import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export interface PathListing {
  readonly files: readonly string[]
  /**
  A subdirectory (or a file) encountered while recursing that could not be read at all — a mode-000 entry, typically. Sibling entries are still listed.
   */
  readonly unreadablePaths: readonly string[]
}

interface WalkState {
  /**
  Every `.css` file's own canonical path already reported, across the whole walk: two different paths (a symlink and a walk back to its real location) can name the same real file, and it is counted once.
   */
  readonly reportedRealFiles: Set<string>
  readonly unreadablePaths: string[]
}

type EntryKind = 'css-file' | 'directory' | 'skip'

/**
 * ASCII case-insensitively `.css`: `entry.name`'s extension read the same
 * way a stylesheet named `.CSS` or `.Css` is read as one.
 */
function hasCssExtension(name: string): boolean {
  return path.extname(name).toLowerCase() === '.css'
}

/**
 * What `entryPath` names, following a symlink to find out. A symlink's own
 * Dirent never reports `isDirectory()`/`isFile()` true (it reflects the
 * link itself, not what it points at). A dangling symlink is reported into
 * `state.unreadablePaths` only when its own name would have been read as a
 * stylesheet (ASCII case-insensitively `.css`) — any other dangling link is
 * exactly as irrelevant to this walk as a dangling link to a `.txt` file
 * would be, and is skipped without a finding.
 */
async function entryKind(entry: Dirent, entryPath: string, state: WalkState): Promise<EntryKind> {
  if (entry.isDirectory()) return 'directory'
  if (entry.isFile()) return hasCssExtension(entry.name) ? 'css-file' : 'skip'
  if (!entry.isSymbolicLink()) return 'skip'

  let targetStats
  try {
    targetStats = await stat(entryPath)
  } catch {
    if (hasCssExtension(entry.name)) state.unreadablePaths.push(entryPath)
    return 'skip'
  }
  if (targetStats.isDirectory()) return 'directory'
  if (targetStats.isFile()) return hasCssExtension(entry.name) ? 'css-file' : 'skip'
  return 'skip'
}

/**
Recurses into `entryPath` unless its canonical path is already in `seenDirs` (an ancestor, directly or through another symlink — what keeps a loop, `ln -s .. up`, from recursing forever instead of terminating).
 */
async function listSubdirectory(
  entryPath: string,
  seenDirs: ReadonlySet<string>,
  state: WalkState,
): Promise<string[]> {
  let canonicalPath
  try {
    canonicalPath = await realpath(entryPath)
  } catch {
    state.unreadablePaths.push(entryPath)
    return []
  }
  if (seenDirs.has(canonicalPath)) return []
  return listDirectory(entryPath, new Set([...seenDirs, canonicalPath]), state)
}

/**
`entryPath` if this is the first time its real file is seen, else `undefined` — two different paths (a symlink and a walk back to its real location) can name the same real file, and it is counted once.
 */
async function cssFileIfNew(entryPath: string, state: WalkState): Promise<string | undefined> {
  let canonicalFile
  try {
    canonicalFile = await realpath(entryPath)
  } catch {
    state.unreadablePaths.push(entryPath)
    return undefined
  }
  if (state.reportedRealFiles.has(canonicalFile)) return undefined
  state.reportedRealFiles.add(canonicalFile)
  return entryPath
}

/**
Every `.css` file under `dir`, recursively, following symlinks.
 */
async function listDirectory(
  dir: string,
  seenDirs: ReadonlySet<string>,
  state: WalkState,
): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    state.unreadablePaths.push(dir)
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    const kind = await entryKind(entry, entryPath, state)
    if (kind === 'directory') {
      files.push(...(await listSubdirectory(entryPath, seenDirs, state)))
    } else if (kind === 'css-file') {
      const file = await cssFileIfNew(entryPath, state)
      if (file) files.push(file)
    }
  }
  return files
}

/**
`source`'s files: itself, if it names a file directly; every `.css` file beneath it, recursively, if it names a directory. Throws when `source` itself cannot be read at all; an unreadable entry found while recursing is collected into `unreadablePaths` instead, with its siblings still listed.
 */
export async function listCssFiles(source: string): Promise<PathListing> {
  const stats = await stat(source)
  if (!stats.isDirectory()) return { files: [source], unreadablePaths: [] }
  const state: WalkState = { reportedRealFiles: new Set(), unreadablePaths: [] }
  const canonicalRoot = await realpath(source)
  const files = await listDirectory(source, new Set([canonicalRoot]), state)
  return { files, unreadablePaths: state.unreadablePaths }
}
