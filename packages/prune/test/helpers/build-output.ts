/**
 * The CSS a build writes, for tests of the check that reads it: files under `<distDir>/static`,
 * as Next.js writes them.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Project } from './project.ts'

/**
 * Writes `css` as a file of the build output (`static/css/app.css` unless `file` says otherwise,
 * relative to `distDir`) and returns its absolute path.
 */
export function writeBuildCss(
  project: Project,
  css: string,
  options: { readonly distDir?: string; readonly file?: string } = {},
): string {
  const { distDir = '.next', file = 'static/css/app.css' } = options
  const target = path.join(project.dir, distDir, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, css)
  return target
}

/**
 * What Next.js hands the hook for the project: its directory and its absolute build directory.
 */
export function hookMetadata(
  project: Project,
  distDir = '.next',
): {
  readonly distDir: string
  readonly projectDir: string
} {
  return { projectDir: project.dir, distDir: path.join(project.dir, distDir) }
}
