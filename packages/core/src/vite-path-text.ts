/**
 * The few operations on a forward-slash path that the read of the takes needs, written on the
 * text so that this code imports no Node module (`@navecss/core/collect` reaches none). They
 * behave as `node:path`'s POSIX forms do on the paths `fileOf` gives, which have no backslash.
 */

/**
 * The last segment of `file`, trailing slashes not counted.
 */
export function baseNameOf(file: string): string {
  let end = file.length
  while (end > 1 && file[end - 1] === '/') end -= 1
  const start = file.lastIndexOf('/', end - 1) + 1
  return file.slice(start, end)
}

/**
 * The extension of `file`'s last segment, with its dot: none for a segment that only starts with
 * one (`.env`), or is `..`.
 */
export function extensionOf(file: string): string {
  const segment = baseNameOf(file)
  const dot = segment.lastIndexOf('.')
  return segment === '..' || dot <= 0 ? '' : segment.slice(dot)
}

/**
 * The last segment of `file` without its extension.
 */
export function stemOf(file: string): string {
  const segment = baseNameOf(file)
  const extension = extensionOf(file)
  return extension === '' || extension === segment ? segment : segment.slice(0, -extension.length)
}

/**
 * The directory `file` is in: everything before its last segment, `/` for a file at the top and
 * `.` for a path with no directory.
 */
export function directoryOf(file: string): string {
  let end = file.length
  while (end > 1 && file[end - 1] === '/') end -= 1
  const slash = file.lastIndexOf('/', end - 1)
  if (slash === -1) return '.'
  let cut = slash
  while (cut > 1 && file[cut - 1] === '/') cut -= 1
  return file.slice(0, cut === 0 ? 1 : cut)
}

/**
 * `index.html` in the project root `root`: the importer a resolution from the root is asked from.
 */
export function rootEntryOf(root: string): string {
  let end = root.length
  while (end > 0 && (root[end - 1] === '/' || root[end - 1] === '\\')) end -= 1
  return `${root.slice(0, end)}/index.html`
}
