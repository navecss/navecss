import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'
import { firstTokensVersionWithTheHighlight } from './support/w3-tokens-floor.ts'

const ROOT = path.join(PACKAGE_DIR, '../..')
const readJson = <T>(...segments: string[]): T =>
  JSON.parse(readFileSync(path.join(ROOT, ...segments), 'utf8')) as T

interface Manifest {
  dependencies?: Record<string, string>
  description: string
  devDependencies: Record<string, string>
  files: string[]
  license: string
  name: string
  optionalDependencies?: Record<string, string>
  peerDependencies: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  private?: boolean
  sideEffects: unknown
  type: string
  version: string
}

const manifest = readJson<Manifest>('packages/base-ui/package.json')
const changesetConfig = readJson<{ fixed: string[][]; ignore: string[]; linked: string[][] }>(
  '.changeset/config.json',
)

const byName = (a: string, b: string): number => a.localeCompare(b)

/**
The version the package's newest CHANGELOG section names, or undefined while it has never been
released: the version pull request writes that section and the version together.
 */
const releasedVersion = (): string | undefined => {
  const file = path.join(ROOT, 'packages/base-ui/CHANGELOG.md')
  if (!existsSync(file)) {
    return undefined
  }
  return /^## (\S+)$/m.exec(readFileSync(file, 'utf8'))?.[1] ?? ''
}

describe('AC-base-ui-bridge-38: the manifest', () => {
  it('is the published package, at its first version', () => {
    expect(manifest.name).toBe('@navecss/base-ui')
    expect(manifest.type).toBe('module')
    expect(manifest.version).toBe(releasedVersion() ?? '0.0.0')
    expect(manifest.license).toBe('MIT')
    expect(manifest.private).toBeUndefined()
  })

  it('ships dist and nothing else, and marks only stylesheets as having side effects', () => {
    expect(manifest.files).toEqual(['dist'])
    expect(manifest.sideEffects).toEqual(['*.css'])
  })

  it('has exactly the four peers, none optional', () => {
    expect(Object.keys(manifest.peerDependencies).toSorted(byName)).toEqual([
      '@base-ui/react',
      '@navecss/tokens',
      'react',
      'react-dom',
    ])
    expect(manifest.peerDependencies['@base-ui/react']).toBe('^1.3.0')
    expect(manifest.peerDependencies.react).toBe('^18 || ^19')
    expect(manifest.peerDependencies['react-dom']).toBe('^18 || ^19')
    const optional = Object.values(manifest.peerDependenciesMeta ?? {}).filter(
      (meta) => meta.optional === true,
    )
    expect(optional).toEqual([])
  })

  it('has core as a development dependency only, and no dependencies', () => {
    expect(manifest.devDependencies['@navecss/core']).toBeDefined()
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([])
    for (const field of [
      manifest.dependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ]) {
      expect(Object.keys(field ?? {})).not.toContain('@navecss/core')
    }
  })

  it('is in none of fixed, linked and ignore', () => {
    for (const list of [
      changesetConfig.fixed.flat(),
      changesetConfig.linked.flat(),
      changesetConfig.ignore,
    ]) {
      expect(list).not.toContain('@navecss/base-ui')
    }
  })
})

describe('AC-base-ui-overlay-completion-31: the manifest floors the tokens peer at the release that ships the highlight fill', () => {
  it('floors the tokens peer at the release that declares the highlight fill, below 1.0.0', () => {
    expect(manifest.peerDependencies['@navecss/tokens']).toBe(
      `>=${firstTokensVersionWithTheHighlight()} <1.0.0`,
    )
  })

  it('control: the previous floor, the release that declared the mark width, is not the expected range', () => {
    expect(`>=0.3.0 <1.0.0`).not.toBe(`>=${firstTokensVersionWithTheHighlight()} <1.0.0`)
  })
})
