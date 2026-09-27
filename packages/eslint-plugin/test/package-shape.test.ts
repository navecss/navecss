/**
 * AC-eslint-plugin-01 covers: R1.
 * AC-eslint-plugin-02 covers: R1.
 * AC-eslint-plugin-04 covers: R1 (the ESLint trademark notice, cleared and signed off).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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

async function readPendingChangesets(rootDir: string): Promise<Changeset[]> {
  const fromRoot = createRequire(path.join(ROOT, 'package.json'))
  const fromCli = createRequire(fromRoot.resolve('@changesets/cli/package.json'))
  const reader = (await import(pathToFileURL(fromCli.resolve('@changesets/read')).href)) as {
    readChangesets: (cwd: string) => Promise<Changeset[]>
  }
  return reader.readChangesets(rootDir)
}

describe('AC-01: the package manifest', () => {
  it('type: module, license: MIT, no bin, build runs only tsc', () => {
    const m = manifest() as {
      bin?: unknown
      license: string
      scripts: Record<string, string>
      type: string
    }
    expect(m.type).toBe('module')
    expect(m.license).toBe('MIT')
    expect(m.bin).toBeUndefined()
    expect(m.scripts.build).toBe('tsc -p tsconfig.build.json')
  })

  it('peerDependencies is exactly eslint and @navecss/core, neither optional; dependencies is exactly postcss-value-parser', () => {
    const m = manifest() as {
      dependencies: Record<string, string>
      peerDependencies: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    expect(Object.keys(m.peerDependencies).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '@navecss/core',
      'eslint',
    ])
    expect(m.peerDependencies.eslint).toBe('^9.24.0 || ^10.0.0')
    expect(m.peerDependencies['@navecss/core']).toBe('>=0.1.0 <1.0.0')
    expect(m.peerDependenciesMeta?.eslint?.optional).not.toBe(true)
    expect(m.peerDependenciesMeta?.['@navecss/core']?.optional).not.toBe(true)
    expect(Object.keys(m.dependencies)).toEqual(['postcss-value-parser'])
  })

  it('@navecss/core appears in no field other than peerDependencies and devDependencies; no field names @navecss/tokens, stylelint, the stylelint config, @eslint/css or @typescript-eslint/parser', () => {
    const m = manifest() as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(m.dependencies).not.toHaveProperty('@navecss/core')
    const forbidden = [
      '@navecss/tokens',
      'stylelint',
      '@navecss/stylelint-config',
      '@eslint/css',
      '@typescript-eslint/parser',
    ]
    for (const field of [m.dependencies, m.peerDependencies, m.devDependencies]) {
      for (const name of forbidden) {
        expect(Object.keys(field ?? {})).not.toContain(name)
      }
    }
  })

  it('no peer range is a caret on a 0.x version', () => {
    const m = manifest() as { peerDependencies: Record<string, string> }
    for (const range of Object.values(m.peerDependencies)) {
      expect(range.startsWith('^0')).toBe(false)
    }
  })

  it('exports has no require condition', () => {
    const m = manifest() as { exports: Record<string, unknown> }
    const conditionKeys = Object.values(m.exports).flatMap((value) =>
      typeof value === 'object' && value !== null
        ? Object.keys(value as Record<string, unknown>)
        : [],
    )
    expect(conditionKeys).not.toContain('require')
  })

  it('no preinstall, install, postinstall or prepare script', () => {
    const m = manifest() as { scripts: Record<string, string> }
    for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(m.scripts[name]).toBeUndefined()
    }
  })

  it('check:pack and prepublishOnly exist in the siblings shape', () => {
    const m = manifest() as { scripts: Record<string, string> }
    expect(m.scripts['check:pack']).toContain('publint')
    expect(m.scripts['check:pack']).toContain('attw')
    expect(m.scripts.prepublishOnly).toContain('check-no-orphaned-chunks')
    expect(m.scripts.prepublishOnly).toContain('check:pack')
  })

  it('LICENSE is byte-identical to the root LICENSE', () => {
    const rootLicense = readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')
    const packageLicense = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8')
    expect(packageLicense).toBe(rootLicense)
  })

  it('PUBLISHABLE_SET contains @navecss/eslint-plugin, and check-publishable-set passes', () => {
    expect(PUBLISHABLE_SET.has('@navecss/eslint-plugin')).toBe(true)
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
    expect(config.fixed.flat()).not.toContain('@navecss/eslint-plugin')
    expect(config.linked.flat()).not.toContain('@navecss/eslint-plugin')
    expect(config.ignore).not.toContain('@navecss/eslint-plugin')
  })

  it('a minor changeset naming only this package is pending, and the next version is 0.1.0', async () => {
    const { version } = manifest() as { version: string }
    expect(version).toBe('0.0.0')
    const pending = await readPendingChangesets(ROOT)
    const naming = pending.filter((changeset) =>
      changeset.releases.some((release) => release.name === '@navecss/eslint-plugin'),
    )
    expect(naming).toHaveLength(1)
    expect(naming[0]!.releases).toEqual([{ name: '@navecss/eslint-plugin', type: 'minor' }])
  })
})

interface PluginShape {
  configs: { recommended: { plugins?: unknown; rules: Record<string, string> } }
  meta: { namespace: string; version: string }
  rules: Record<string, unknown>
}

async function loadPlugin(): Promise<PluginShape> {
  const imported = await import('../src/index.ts')
  return imported.default as unknown as PluginShape
}

describe('AC-02: the plugin object', () => {
  it('meta.version equals the manifest version', async () => {
    const plugin = await loadPlugin()
    expect(plugin.meta.version).toBe((manifest() as { version: string }).version)
  })

  it('meta.namespace is @navecss; rules and configs.recommended exist', async () => {
    const plugin = await loadPlugin()
    expect(plugin.meta.namespace).toBe('@navecss')
    expect(Object.keys(plugin.rules).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'class-channel',
      'count-escapes',
      'raw-reason',
      'style-values',
    ])
    expect(plugin.configs.recommended).toBeTruthy()
  })

  it('configs.recommended sets rules only — no languageOptions, files, settings or processor', async () => {
    const plugin = await loadPlugin()
    const keys = Object.keys(plugin.configs.recommended).toSorted((a, b) => a.localeCompare(b))
    expect(keys).toEqual(['plugins', 'rules'])
  })

  it('recommended sets the four rules to error, except count-escapes which is off', async () => {
    const plugin = await loadPlugin()
    const { rules } = plugin.configs.recommended
    expect(rules['@navecss/class-channel']).toBe('error')
    expect(rules['@navecss/raw-reason']).toBe('error')
    expect(rules['@navecss/style-values']).toBe('error')
    expect(rules['@navecss/count-escapes']).toBe('off')
  })
})

describe('AC-04: the ESLint trademark notice', () => {
  const NOTICE =
    'ESLint® is a registered trademark of the OpenJS Foundation. This package is not affiliated with or endorsed by the OpenJS Foundation or the ESLint project.'

  it('the README contains the notice, byte-exact, as one line', () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    const lines = readme.split('\n')
    expect(lines).toContain(NOTICE)
  })

  it("the first occurrence of ESLint in the README's prose is written ESLint®", () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    const withoutCode = readme.replaceAll(/```[\s\S]*?```/g, '').replaceAll(/`[^`]*`/g, '')
    const index = withoutCode.indexOf('ESLint')
    expect(index).toBeGreaterThan(-1)
    expect(withoutCode.slice(index, index + 7)).toBe('ESLint®')
  })

  it('no sentence puts the mark before Nave/NaveCSS', () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    expect(readme).not.toMatch(/ESLint®?\s+(Nave|NaveCSS)/)
  })

  it('the tarball contains no image file and the README embeds none', () => {
    const tarball = packTarball()
    for (const file of tarball.files) {
      expect(/\.(png|jpe?g|gif|svg|webp)$/i.test(file)).toBe(false)
    }
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    expect(readme).not.toMatch(/!\[|<img/)
  })
})

describe('the packed tarball itself', () => {
  it('carries package/LICENSE, package/README.md, package/dist/index.js, package/dist/index.d.ts', () => {
    const tarball = packTarball()
    for (const file of [
      'package/LICENSE',
      'package/README.md',
      'package/dist/index.js',
      'package/dist/index.d.ts',
    ]) {
      expect(tarball.files).toContain(file)
    }
  })
})
