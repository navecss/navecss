/**
 * AC-astro-40: Astro's packages are dev dependencies only, and no file a package ships imports
 * them. Every workspace package that is not private is read, both its manifest and the tarball
 * `npm pack` makes of it.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { tarballFilename } from './helpers/pack-core.ts'

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FORBIDDEN_FIELDS = [
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
] as const

/**
 * Whether `name` is a package of Astro's: `astro`, an `@astrojs/*` package, its parser, its lint
 * plugin, or `sharp`.
 */
function isAstroPackage(name: string): boolean {
  return (
    name === 'astro' ||
    name.startsWith('@astrojs/') ||
    name === 'astro-eslint-parser' ||
    name === 'eslint-plugin-astro' ||
    name === 'sharp'
  )
}

/**
 * The names a manifest lists in a field other than `devDependencies` that are Astro's.
 */
function forbiddenInManifest(manifest: Record<string, unknown>): string[] {
  return FORBIDDEN_FIELDS.flatMap((field) => {
    const value = manifest[field]
    const names = Array.isArray(value)
      ? (value as string[])
      : Object.keys((value as Record<string, unknown> | undefined) ?? {})
    return names.filter((name) => isAstroPackage(name)).map((name) => `${field}: ${name}`)
  })
}

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\brequire\s*\(\s*)(?:'([^'\n]+)'|"([^"\n]+)")/g

/**
 * The specifiers a JavaScript file imports, re-exports, dynamically imports or requires that
 * name Astro's packages.
 */
function forbiddenImports(text: string): string[] {
  return text
    .matchAll(SPECIFIER)
    .map((match) => match[1] ?? match[2]!)
    .filter((specifier) => {
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/', 1)[0]!
      return isAstroPackage(name)
    })
    .toArray()
}

/**
 * Every file under `directory`, as paths relative to it.
 */
function filesUnder(directory: string, relative = ''): string[] {
  return readdirSync(path.join(directory, relative)).flatMap((name) => {
    const next = path.join(relative, name)
    return statSync(path.join(directory, next)).isDirectory() ? filesUnder(directory, next) : [next]
  })
}

const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) rmSync(directory, { force: true, recursive: true })
})

/**
 * Packs the package in `directory` and extracts it, resolving to the extracted directory.
 */
function packed(directory: string): string {
  const out = mkdtempSync(path.join(tmpdir(), 'nave-pack-'))
  scratch.push(out)
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', out], {
    cwd: directory,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const extracted = path.join(out, 'x')
  execFileSync('mkdir', ['-p', extracted])
  execFileSync('tar', ['-xzf', path.join(out, tarballFilename(raw)), '-C', extracted])
  return extracted
}

const PUBLISHED = readdirSync(PACKAGES)
  .map((name) => path.join(PACKAGES, name))
  .filter((directory) => statSync(directory).isDirectory())
  .map((directory) => ({
    directory,
    manifest: JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >,
  }))
  .filter(({ manifest }) => manifest.private !== true)

describe('AC-astro-40 — Astro’s packages are dev dependencies only, and no shipped file imports them', () => {
  it('reads at least the packages that are published', () => {
    expect(PUBLISHED.map(({ manifest }) => manifest.name)).toEqual(
      expect.arrayContaining(['@navecss/core', '@navecss/eslint-plugin', '@navecss/tokens']),
    )
  })

  it.each(
    PUBLISHED.map(
      ({ directory, manifest }) => [manifest.name as string, directory, manifest] as const,
    ),
  )(
    '%s: no field but devDependencies names one, and no file of its tarball imports one',
    (_name, directory, manifest) => {
      expect(forbiddenInManifest(manifest)).toEqual([])
      const root = packed(directory)
      const scripts = filesUnder(root).filter((name) => /\.(?:c|m)?js$/.test(name))
      for (const file of scripts) {
        const text = readFileSync(path.join(root, file), 'utf8')
        expect(forbiddenImports(text), file).toEqual([])
      }
    },
  )

  it('control: a manifest with astro in core’s peerDependencies, and a file with a dynamic import of astro/config, are both seen', () => {
    const core = PUBLISHED.find(({ manifest }) => manifest.name === '@navecss/core')!.manifest
    expect(forbiddenInManifest({ ...core, peerDependencies: { astro: '*' } })).toEqual([
      'peerDependencies: astro',
    ])
    expect(forbiddenInManifest({ ...core, optionalDependencies: { sharp: '*' } })).toEqual([
      'optionalDependencies: sharp',
    ])
    expect(forbiddenImports("const c = await import('astro/config')")).toEqual(['astro/config'])
    expect(
      forbiddenImports("import x from '@astrojs/react'\nexport * from 'astro-eslint-parser'"),
    ).toEqual(['@astrojs/react', 'astro-eslint-parser'])
    expect(forbiddenImports("import x from '@navecss/tokens'")).toEqual([])
  })
})
