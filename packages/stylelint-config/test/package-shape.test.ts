/**
 * AC-consumer-constraints-25 covers: R16.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { PUBLISHABLE_SET } from '../../../scripts/check-publishable-set.mjs'
import { packTarball } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')
const ROOT = path.resolve(HERE, '../../..')

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
}

interface Changeset {
  readonly id: string
  readonly releases: readonly { readonly name: string; readonly type: string }[]
}

/**
 * The pending changesets under `rootDir/.changeset`, read with Changesets' own reader
 * (`@changesets/read`, resolved through the `@changesets/cli` this repository releases with), so
 * what counts as a changeset and how its frontmatter parses is what the release step itself
 * does. A malformed changeset throws here, as it would at release time.
 */
async function readPendingChangesets(rootDir: string): Promise<Changeset[]> {
  const fromRoot = createRequire(path.join(ROOT, 'package.json'))
  const fromCli = createRequire(fromRoot.resolve('@changesets/cli/package.json'))
  const reader = (await import(pathToFileURL(fromCli.resolve('@changesets/read')).href)) as {
    readChangesets: (cwd: string) => Promise<Changeset[]>
  }
  return reader.readChangesets(rootDir)
}

/**
 * The release-shape clauses that hold only until this package's first release: while the
 * manifest is still at `0.0.0`, exactly one changeset names the package, that changeset is a
 * `minor` naming no other package, and so the next version is `0.1.0`. Once a release has taken
 * the version past `0.0.0`, the clauses do not apply, whether or not a later changeset for the
 * package is pending. The changesets are read either way, so a malformed one still fails here.
 */
async function assertFirstReleaseShape(rootDir: string): Promise<void> {
  const { name, version } = JSON.parse(
    readFileSync(path.join(rootDir, 'packages/stylelint-config/package.json'), 'utf8'),
  ) as { name: string; version: string }
  const pending = await readPendingChangesets(rootDir)
  if (version !== '0.0.0') return

  const naming = pending.filter((changeset) =>
    changeset.releases.some((release) => release.name === name),
  )
  expect(naming).toHaveLength(1)
  expect(naming[0]!.releases).toEqual([{ name, type: 'minor' }])
  const [major, minor] = version.split('.').map(Number)
  expect(`${major}.${minor! + 1}.0`).toBe('0.1.0')
}

/**
 * A scratch root carrying this repository's `.changeset/` directory and this package's
 * manifest, the two inputs `assertFirstReleaseShape` reads, for the rows that change them.
 */
function scratchReleaseRoot(): string {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-release-shape-'))
  cpSync(path.join(ROOT, '.changeset'), path.join(scratch, '.changeset'), { recursive: true })
  cpSync(
    path.join(PACKAGE_DIR, 'package.json'),
    path.join(scratch, 'packages/stylelint-config/package.json'),
  )
  return scratch
}

function pluginsOf(config: { plugins?: unknown }): unknown[] {
  if (Array.isArray(config.plugins)) return config.plugins
  if (config.plugins) return [config.plugins]
  return []
}

describe('AC-consumer-constraints-25 covers: R16', () => {
  it('type: module, license: MIT, no build script, no bin (standing)', () => {
    const m = manifest() as {
      bin?: unknown
      license: string
      scripts?: Record<string, string>
      type: string
    }
    expect(m.type).toBe('module')
    expect(m.license).toBe('MIT')
    expect(m.scripts?.build).toBeUndefined()
    expect(m.bin).toBeUndefined()
  })

  it('peerDependencies.stylelint is ^17.0.0, not optional (standing)', () => {
    const m = manifest() as {
      peerDependencies: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    expect(m.peerDependencies.stylelint).toBe('^17.0.0')
    expect(m.peerDependenciesMeta?.stylelint?.optional).not.toBe(true)
  })

  it('dependencies contains stylelint-declaration-strict-value, and no field names @navecss/core (standing)', () => {
    const m = manifest() as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(m.dependencies).toHaveProperty('stylelint-declaration-strict-value')
    for (const field of [m.dependencies, m.peerDependencies, m.devDependencies]) {
      expect(Object.keys(field ?? {})).not.toContain('@navecss/core')
    }
  })

  it('no dependency field names @navecss/tokens before the rule-3 head (standing, for now)', () => {
    const m = manifest() as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    for (const field of [m.dependencies, m.peerDependencies, m.devDependencies]) {
      expect(Object.keys(field ?? {})).not.toContain('@navecss/tokens')
    }
  })

  it('every plugins entry the exported config carries is an object, not a string (standing)', async () => {
    const imported = await import('../index.js')
    const plugins = pluginsOf(imported.default)
    for (const plugin of plugins) {
      expect(typeof plugin).not.toBe('string')
      expect(typeof plugin).toBe('object')
    }
  })

  it('a variable typed Config from stylelint compiles against the default export under tsc', () => {
    expect(() =>
      execFileSync(
        path.join(ROOT, 'node_modules/.bin/tsc'),
        ['--noEmit', '-p', path.join(PACKAGE_DIR, 'tsconfig.json')],
        { cwd: PACKAGE_DIR, encoding: 'utf8' },
      ),
    ).not.toThrow()
  })

  it('LICENSE is byte-identical to the root LICENSE', () => {
    const rootLicense = readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')
    const packageLicense = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8')
    expect(packageLicense).toBe(rootLicense)
  })

  it('test/no-inlined-dependency.test.ts exists and check-bundling-guard-coverage is green', () => {
    expect(() =>
      execFileSync('node', [path.join(ROOT, 'scripts/check-bundling-guard-coverage.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })

  it('check:pack and prepublishOnly exist in the siblings shape', () => {
    const m = manifest() as { scripts: Record<string, string> }
    expect(m.scripts['check:pack']).toContain('publint')
    expect(m.scripts['check:pack']).toContain('attw')
    expect(m.scripts.prepublishOnly).toContain('check-no-orphaned-chunks')
    expect(m.scripts.prepublishOnly).toContain('check:pack')
  })

  it('PUBLISHABLE_SET contains @navecss/stylelint-config, and check-publishable-set passes', () => {
    expect(PUBLISHABLE_SET.has('@navecss/stylelint-config')).toBe(true)
    expect(() =>
      execFileSync('node', [path.join(ROOT, 'scripts/check-publishable-set.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })

  it('.changeset/config.json names the package in none of fixed, linked and ignore (standing)', () => {
    const config = JSON.parse(readFileSync(path.join(ROOT, '.changeset/config.json'), 'utf8')) as {
      fixed: string[][]
      ignore: string[]
      linked: string[][]
    }
    expect(config.fixed.flat()).not.toContain('@navecss/stylelint-config')
    expect(config.linked.flat()).not.toContain('@navecss/stylelint-config')
    expect(config.ignore).not.toContain('@navecss/stylelint-config')
  })

  it('until its first release: version 0.0.0, one minor changeset naming only this package, next version 0.1.0', async () => {
    await expect(assertFirstReleaseShape(ROOT)).resolves.toBeUndefined()
  })

  it('at version 0.0.0 with no changeset naming the package, the first-release clauses fail', async () => {
    const scratch = scratchReleaseRoot()
    try {
      rmSync(path.join(scratch, '.changeset/ship-stylelint-config.md'), { force: true })
      writeFileSync(
        path.join(scratch, 'packages/stylelint-config/package.json'),
        JSON.stringify({ ...manifest(), version: '0.0.0' }, undefined, 2),
      )
      await expect(assertFirstReleaseShape(scratch)).rejects.toThrow()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('once that changeset has been released (removed, version 0.1.0), the first-release clauses no longer apply, even with a later changeset for the package pending', async () => {
    const scratch = scratchReleaseRoot()
    try {
      rmSync(path.join(scratch, '.changeset/ship-stylelint-config.md'), { force: true })
      const manifestPath = path.join(scratch, 'packages/stylelint-config/package.json')
      const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
        string,
        unknown
      >
      const released = { ...manifestBefore, version: '0.1.0' }
      writeFileSync(manifestPath, JSON.stringify(released, undefined, 2))
      await expect(assertFirstReleaseShape(scratch)).resolves.toBeUndefined()
      writeFileSync(
        path.join(scratch, '.changeset/a-later-fix.md'),
        "---\n'@navecss/stylelint-config': patch\n---\n\nA later fix.\n",
      )
      await expect(assertFirstReleaseShape(scratch)).resolves.toBeUndefined()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('a malformed changeset beside it fails the read, as it would fail the release', async () => {
    const scratch = scratchReleaseRoot()
    try {
      writeFileSync(path.join(scratch, '.changeset/broken.md'), '---\n: [\n---\n\nBroken.\n')
      await expect(assertFirstReleaseShape(scratch)).rejects.toThrow(/could not parse changeset/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

const tarball = packTarball()
describe('the packed tarball itself', () => {
  it('carries package/LICENSE, package/README.md, package/index.js, package/index.d.ts', () => {
    for (const file of [
      'package/LICENSE',
      'package/README.md',
      'package/index.js',
      'package/index.d.ts',
    ]) {
      expect(tarball.files).toContain(file)
    }
  })
})
