/**
 * R10: resolves one `--source` entry into the files `check()` reads. A
 * file is read regardless of its extension (round-3 decision 8: "a file
 * named explicitly without a `.css` extension is read"); a directory is
 * read recursively for `.css` files only.
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export interface PathListing {
  readonly files: readonly string[]
}

/**
Every `.css` file under `dir`, recursively.
 */
async function listDirectory(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listDirectory(entryPath)))
    } else if (entry.isFile() && path.extname(entry.name) === '.css') {
      files.push(entryPath)
    }
  }
  return files
}

/**
`source`'s files: itself, if it names a file directly; every `.css` file beneath it, recursively, if it names a directory. Throws when `source` cannot be read at all.
 */
export async function listCssFiles(source: string): Promise<PathListing> {
  const stats = await stat(source)
  if (stats.isDirectory()) return { files: await listDirectory(source) }
  return { files: [source] }
}
