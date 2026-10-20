/**
 * Running the registry generator, as a process, over a temporary copy of the package whose atoms
 * have been edited: what it exits with, what it prints, and which items it left behind.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PACKAGE_DIR } from '../stylesheet.ts'

const COPIED = ['LICENSE', 'package.json', 'scripts', 'src', 'styles']

export interface TempPackage {
  readonly directory: string
  remove(): void
}

/**
 * A copy of the package in the temp directory: its manifest, licence, sources, atoms, scripts and
 * tsconfig files, and a link to the real package's installed dependencies.
 */
export const copyPackage = (): TempPackage => {
  const directory = mkdtempSync(path.join(tmpdir(), 'base-ui-registry-'))
  const tsconfigs = readdirSync(PACKAGE_DIR).filter((name) => /^tsconfig.*\.json$/.test(name))
  for (const name of [...COPIED, ...tsconfigs]) {
    cpSync(path.join(PACKAGE_DIR, name), path.join(directory, name), { recursive: true })
  }
  symlinkSync(path.join(PACKAGE_DIR, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  return { directory, remove: () => rmSync(directory, { force: true, recursive: true }) }
}

/**
 * Adds a declaration to the named atom's own `declarations` in the copy's atom files.
 */
export const addDeclarationToAtom = (
  temp: TempPackage,
  atom: string,
  property: string,
  value: string,
): void => {
  const stylesDir = path.join(temp.directory, 'styles')
  const pattern = new RegExp(String.raw`(\b${atom}:\s*\{\s*declarations:\s*\{)`)
  const file = readdirSync(stylesDir)
    .map((name) => path.join(stylesDir, name))
    .find((candidate) => pattern.test(readFileSync(candidate, 'utf8')))
  if (file === undefined) throw new Error(`no atom file in the copy defines ${atom} inline`)
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      pattern,
      (_match, opening: string) => `${opening} '${property}': '${value}',`,
    ),
  )
}

export interface GeneratorRun {
  readonly itemFiles: string[]
  readonly output: string
  readonly status: number | null
}

/**
 * Runs the generator's entry point in the copy, over the copy, and reports what it wrote.
 */
export const runGenerator = (temp: TempPackage): GeneratorRun => {
  const run = spawnSync('node', ['scripts/generate-registry.ts', '--root', temp.directory], {
    cwd: temp.directory,
    encoding: 'utf8',
    timeout: 100_000,
  })
  const written = path.join(temp.directory, 'dist/registry')
  const itemFiles = existsSync(written)
    ? readdirSync(written).filter((name) => /^base-ui-.*\.json$/.test(name))
    : []
  return { itemFiles, output: `${run.stdout}\n${run.stderr}`, status: run.status }
}
