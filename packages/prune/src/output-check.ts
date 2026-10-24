/**
 * The CSS a build wrote against the atoms the build read: every `@layer atomic` block of every
 * stylesheet under `<distDir>/static`.
 */
import { inspectAtomicLayer, unprunedAtoms } from '@navecss/core/collect'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { relativeTo } from './source-files.ts'

export interface OutputFile {
  /**
   * Relative to the project directory, forward slashes.
   */
  readonly name: string
  readonly css: string
}

/**
 * Every CSS file under `<dir>/<distDir>/static`, in path order.
 */
export function builtStylesheets(dir: string, distDir: string): OutputFile[] {
  const root = path.join(dir, distDir, 'static')
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted((a, b) => a.localeCompare(b))
    .map((file) => ({ name: relativeTo(dir, file), css: readFileSync(file, 'utf8') }))
}

/**
 * Whether any of the files holds a rule for a built-in atom in an `@layer atomic` block.
 */
export function hasAtomRules(files: readonly OutputFile[]): boolean {
  return files.some((file) => inspectAtomicLayer(file.css).atoms.size > 0)
}

export interface Mismatch {
  /**
   * The first file with a rule for an atom outside the set, or the first file when an atom of the
   * set has no rule anywhere.
   */
  readonly file: string
  readonly missing: string[]
  readonly stray: string[]
}

/**
 * The atoms outside `emitted` that the files' rules still need, and the first file that holds
 * one.
 */
function strayAtoms(
  files: readonly OutputFile[],
  emitted: ReadonlySet<string>,
): { readonly atoms: string[]; readonly file: string | undefined } {
  const atoms = new Set<string>()
  let file: string | undefined
  for (const candidate of files) {
    const outside = unprunedAtoms(candidate.css, emitted)
    if (outside.length > 0) file ??= candidate.name
    for (const atom of outside) atoms.add(atom)
  }
  return { atoms: [...atoms].toSorted((a, b) => a.localeCompare(b)), file }
}

/**
 * What the output holds against the set: atoms with a rule that the set does not name, and atoms
 * the set names with no rule in any file. `undefined` when they agree.
 */
export function mismatchOf(
  files: readonly OutputFile[],
  atoms: readonly string[],
): Mismatch | undefined {
  const present = new Set(files.flatMap((file) => [...inspectAtomicLayer(file.css).atoms]))
  const stray = strayAtoms(files, new Set(atoms))
  const missing = atoms.filter((atom) => !present.has(atom))
  if (stray.atoms.length === 0 && missing.length === 0) return undefined
  return { file: stray.file ?? files[0]?.name ?? '', stray: stray.atoms, missing }
}
