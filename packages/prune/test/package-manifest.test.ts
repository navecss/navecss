import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..')
const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')

type Manifest = Record<string, unknown> & {
  exports: Record<string, unknown>
  name: string
  peerDependencies: Record<string, string>
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
]

/**
 * A JSON file, parsed.
 */
function readJson<Shape>(file: string): Shape {
  return JSON.parse(readFileSync(file, 'utf8')) as Shape
}

const manifest = readJson<Manifest>(path.join(PACKAGE_DIR, 'package.json'))
const coreManifest = readJson<Manifest>(path.join(REPO_ROOT, 'packages/core/package.json'))

/**
 * The names of the dependency fields of a manifest that list `dependency`, sorted.
 */
function fieldsListing(source: Record<string, unknown>, dependency: string): string[] {
  return DEPENDENCY_FIELDS.filter((field) => {
    const value = source[field]
    if (Array.isArray(value)) return value.includes(dependency)
    return typeof value === 'object' && value !== null && Object.hasOwn(value, dependency)
  }).toSorted((a, b) => a.localeCompare(b))
}

/**
 * Whether `version` satisfies a `>=major.minor.patch` range, comparing the three numbers in turn.
 */
function isAtLeast(range: string, version: string): boolean {
  const floor = range.replace('>=', '').split('.').map(Number)
  const parts = version.split('.').map(Number)
  for (const [index, bound] of floor.entries()) {
    const part = parts[index] ?? 0
    if (part !== bound) return part > bound
  }
  return true
}

describe('AC-nextjs-used-atoms-11: the package carries the parser and the resolver, core carries neither', () => {
  it.each(['oxc-parser', 'oxc-resolver'])(
    'lists %s in dependencies and in no other field',
    (name) => {
      expect(fieldsListing(manifest, name)).toEqual(['dependencies'])
    },
  )

  it.each(['oxc-parser', 'oxc-resolver'])('lists %s in no dependency field of core', (name) => {
    expect(fieldsListing(coreManifest, name)).toEqual([])
  })

  it('control: the field scan finds a dependency that core does list', () => {
    expect(fieldsListing(coreManifest, '@navecss/tokens')).toEqual(['dependencies'])
    expect(fieldsListing(manifest, 'next')).toEqual(['peerDependencies'])
    expect(fieldsListing(manifest, 'postcss')).toEqual(['devDependencies', 'peerDependencies'])
  })

  it('is licensed MIT', () => {
    expect(manifest.license).toBe('MIT')
  })

  it('carries a LICENSE byte-identical to the repository root LICENSE', () => {
    const own = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'))
    const root = readFileSync(path.join(REPO_ROOT, 'LICENSE'))
    expect(root.length).toBeGreaterThan(0)
    expect(own.equals(root)).toBe(true)
  })

  it('lists LICENSE among the published files', () => {
    expect(manifest.files).toContain('LICENSE')
  })
})

describe('AC-nextjs-used-atoms-12: the export map, the peers and the version group', () => {
  it('has exactly the export keys ., ./postcss and ./package.json', () => {
    expect(Object.keys(manifest.exports).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '.',
      './package.json',
      './postcss',
    ])
  })

  it('offers both an import and a require route for . and ./postcss', () => {
    for (const key of ['.', './postcss']) {
      const entry = manifest.exports[key] as Record<string, unknown>
      expect(Object.keys(entry).toSorted((a, b) => a.localeCompare(b))).toEqual([
        'import',
        'require',
      ])
    }
  })

  it('has the peers next >=16.2.0, postcss ^8 and @navecss/core, and no other', () => {
    const { peerDependencies } = manifest
    expect(Object.keys(peerDependencies).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '@navecss/core',
      'next',
      'postcss',
    ])
    expect(peerDependencies.next).toBe('>=16.2.0')
    expect(peerDependencies.postcss).toBe('^8')
    expect(peerDependencies['@navecss/core']).toMatch(/^(workspace:)?\^/u)
  })

  it('has a next range that 15.5.0 does not satisfy and 16.2.0 and 16.3.8 do', () => {
    const range = manifest.peerDependencies.next ?? ''
    expect(isAtLeast(range, '16.2.0')).toBe(true)
    expect(isAtLeast(range, '16.3.8')).toBe(true)
    expect(isAtLeast(range, '16.1.9')).toBe(false)
    expect(isAtLeast(range, '15.5.0')).toBe(false)
  })

  // The package becomes publishable, and joins the tokens/core fixed group, in the release that
  // ships the build check its trimming relies on.
  it('is not published yet: private, ignored by Changesets and in no fixed group', () => {
    const config = readJson<{ fixed: string[][]; ignore: string[] }>(
      path.join(REPO_ROOT, '.changeset/config.json'),
    )
    expect(manifest.private).toBe(true)
    expect(config.ignore).toContain(manifest.name)
    expect(config.fixed.flat()).not.toContain(manifest.name)
    // Control: the group the package will join is there, holding tokens and core.
    expect(config.fixed).toContainEqual(['@navecss/tokens', '@navecss/core'])
  })
})

/**
 * The size in bytes and the first 16 hex digits of the SHA-256 of a text, as UTF-8.
 */
function fingerprintOf(text: string): { readonly bytes: number; readonly sha256: string } {
  const bytes = Buffer.from(text, 'utf8')
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
  }
}

describe('the package check and the words npm shows', () => {
  it('check:pack excludes no JavaScript entry point from the type check', () => {
    const script = (manifest.scripts as Record<string, string>)['check:pack'] ?? ''
    const words = script.split(/\s+/u)
    const flag = words.indexOf('--exclude-entrypoints')
    const excluded =
      flag === -1 ? [] : words.slice(flag + 1).filter((word) => !word.startsWith('-'))
    const javascriptEntries = Object.keys(manifest.exports).filter((key) => {
      const entry = manifest.exports[key]
      return typeof entry === 'object' && entry !== null && Object.hasOwn(entry, 'import')
    })
    // Control: the package has JavaScript entries the check must reach, and runs the check.
    expect(javascriptEntries).toEqual(['.', './postcss'])
    expect(script).toContain('attw --pack .')
    expect(excluded.filter((key) => javascriptEntries.includes(key))).toEqual([])
  })

  it('check:pack checks the require() route too: the node16 profile, which reads both', () => {
    const script = (manifest.scripts as Record<string, string>)['check:pack'] ?? ''
    expect(script).toMatch(/attw --pack \. --profile node16(\s|$)/u)
  })

  it("has the README's first paragraph, by its size and digest", () => {
    const paragraph =
      readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8').split('\n', 3)[2] ?? ''
    expect(fingerprintOf(paragraph)).toEqual({ bytes: 221, sha256: '164a9f39337b5f89' })
  })

  it('while the package is private, the README says under Installation that it is not on npm yet', () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    const installation = readme.slice(readme.indexOf('## Installation'), readme.indexOf('```sh'))
    // Control: the section is there, and the manifest is private.
    expect(installation).toMatch(/^## Installation/u)
    expect(manifest.private).toBe(true)
    expect(installation).toMatch(/\bnot on npm yet\b/u)
  })

  it('has the description npm shows, by its size and digest', () => {
    expect(fingerprintOf(String(manifest.description))).toEqual({
      bytes: 131,
      sha256: '2c81b26fe94f1836',
    })
  })

  it('has the keywords, NaveCSS first and nextjs the only Next.js form', () => {
    expect(manifest.keywords).toEqual([
      'navecss',
      'nextjs',
      'postcss-plugin',
      'css',
      'atomic-css',
      'css-layers',
      'design-system',
      'zero-runtime',
    ])
  })
})
