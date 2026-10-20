/**
 * The install fixtures: fixture V is a temp project directory WITH `src/`, fixture N one WITHOUT.
 * Each holds only a `package.json` that declares the package's peer names at exact versions: no
 * Tailwind, no `components.json`, no path alias. A fixture comes with a `home` directory the CLI is
 * given as `HOME`, outside the project, so what the CLI writes there never reads as a project file.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { manifestOf } from './styled-subpaths.ts'

/**
The exact versions the fixtures declare, by peer name. A peer the manifest gains must be added here:
the fixture would otherwise declare a dependency the CLI could be tempted to install.
 */
const EXACT_VERSIONS: Readonly<Record<string, string>> = {
  '@base-ui/react': '1.3.0',
  '@navecss/tokens': '0.4.0',
  react: '19.2.0',
  'react-dom': '19.2.0',
}

export interface Fixture {
  /**
  The directory the CLI is given as `HOME` (and for the XDG directories).
   */
  readonly home: string
  /**
  The project directory.
   */
  readonly project: string
  /**
  The parent of both, removed by `removeFixture`.
   */
  readonly root: string
}

const exactVersionOf = (name: string): string => {
  const version = EXACT_VERSIONS[name]
  if (version === undefined) throw new Error(`the fixtures declare no exact version for ${name}`)
  return version
}

export const peerDeclarations = (): Record<string, string> => {
  const names = Object.keys(manifestOf().peerDependencies)
  return Object.fromEntries(names.map((name) => [name, exactVersionOf(name)]))
}

const fixtureManifest = (): string => {
  const manifest = {
    dependencies: peerDeclarations(),
    name: 'fixture',
    private: true,
    version: '0.0.0',
  }
  return `${JSON.stringify(manifest, undefined, 2)}\n`
}

const createFixtureWithoutSrcDirectory = (): Fixture => {
  const root = mkdtempSync(path.join(tmpdir(), 'nave-registry-'))
  const project = path.join(root, 'project')
  const home = path.join(root, 'home')
  mkdirSync(project)
  mkdirSync(home)
  writeFileSync(path.join(project, 'package.json'), fixtureManifest())
  return { home: realpathSync(home), project: realpathSync(project), root: realpathSync(root) }
}

export const createFixtureWithSrc = (): Fixture => {
  const fixture = createFixtureWithoutSrcDirectory()
  mkdirSync(path.join(fixture.project, 'src'))
  return fixture
}

export const createFixtureWithoutSrc = (): Fixture => createFixtureWithoutSrcDirectory()

export const removeFixture = (fixture: Fixture): void => {
  rmSync(fixture.root, { force: true, recursive: true })
}

/**
 * Every file under a directory, by path relative to it with `/` separators, as bytes.
 */
export const readTree = (directory: string): Map<string, Buffer> => {
  const tree = new Map<string, Buffer>()
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const absolute = path.join(entry.parentPath, entry.name)
    const relative = path.relative(directory, absolute)
    tree.set(relative.split(path.sep).join('/'), readFileSync(absolute))
  }
  return tree
}

/**
 * Where a file lands, and in what, compared: the paths whose bytes differ from the expected text,
 * the expected paths that are absent, and the paths present that nothing expected.
 */
export const differences = (
  expected: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, Buffer>,
): string[] => {
  const problems: string[] = []
  for (const [file, content] of expected) {
    const found = actual.get(file)
    if (found === undefined) problems.push(`${file}: absent`)
    else if (!found.equals(Buffer.from(content, 'utf8'))) problems.push(`${file}: bytes differ`)
  }
  for (const file of actual.keys()) {
    if (!expected.has(file)) problems.push(`${file}: not expected`)
  }
  return problems
}

/**
 * Runs `work` once, on the first call, and hands every later call the same promise, so each test of a
 * scenario can read its outcome while the CLI runs once. A rejection reaches every caller, which is
 * what makes an absent registry fail each test rather than skip them.
 */
export const once = <T>(work: () => Promise<T>): (() => Promise<T>) => {
  let outcome: Promise<T> | undefined
  return () => (outcome ??= work())
}

const byCodeUnit = (a: string, b: string): number => {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * The strings, sorted by code unit, so a list compares equal whatever order it was built in.
 */
export const sorted = (names: Iterable<string>): string[] =>
  Iterator.from(names).toArray().toSorted(byCodeUnit)
