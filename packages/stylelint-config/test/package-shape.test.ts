/**
 * AC-consumer-constraints-25 covers: R16.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

  it('at the slice-2 head: version is 0.0.0, and one minor changeset bumps only this package to 0.1.0', () => {
    const m = manifest() as { name: string; version: string }
    expect(m.version).toBe('0.0.0')

    // Reads the committed `.changeset/*.md` frontmatter directly, never `changeset status`:
    // that command computes changed packages via `git merge-base` against `main`, which needs
    // a local `main` ref with history the current checkout can diverge-compute against — true
    // in this worktree, not guaranteed in CI's own checkout of a pull request head. Reading the
    // committed fragments is what the release step itself consumes, and it needs no git state
    // beyond the files already on disk.
    const changesetDir = path.join(ROOT, '.changeset')
    const matchingBumps = readdirSync(changesetDir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .flatMap((f) => {
        const content = readFileSync(path.join(changesetDir, f), 'utf8')
        const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? ''
        return frontmatter
          .matchAll(/^['"]?([^'":\n]+)['"]?:\s*(major|minor|patch)\s*$/gm)
          .filter((match) => match[1] === m.name)
          .map((match) => ({ file: f, type: match[2] }))
          .toArray()
      })

    expect(matchingBumps).toHaveLength(1)
    expect(matchingBumps[0]!.type).toBe('minor')
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
