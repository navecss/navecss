/**
 * The migration code names the release the order moved in, and it has to be removed in the release
 * after it. The check reds where someone has to act: when the constant is not the next minor while
 * the change's changeset is still pending, and when the changeset has been consumed, the migration
 * module is still there and the package has moved past the constant's minor.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { MIGRATION_VERSION } from '../src/directive/migration.ts'

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHANGESET = 'nave-expands-in-native-order.md'

/**
 * The `major.minor` of a version, as numbers.
 */
function minorOf(version: string): readonly [number, number] {
  const [major, minor] = version.split('.').map(Number)
  return [major!, minor!]
}

/**
 * The next minor after `version`.
 */
function nextMinor(version: string): string {
  const [major, minor] = minorOf(version)
  return `${major}.${minor + 1}.0`
}

interface Situation {
  readonly constant: string
  readonly hasChangeset: boolean
  readonly hasModule: boolean
  readonly packageVersion: string
}

/**
 * What someone has to do, if anything: `undefined` when nothing.
 */
function problemOf(situation: Situation): string | undefined {
  const { constant, hasChangeset, hasModule, packageVersion } = situation
  if (hasChangeset && constant !== nextMinor(packageVersion)) {
    return `MIGRATION_VERSION is ${constant}, not ${nextMinor(packageVersion)}, the next minor after ${packageVersion}`
  }
  const [, past] = minorOf(packageVersion)
  const [, current] = minorOf(constant)
  if (!hasChangeset && hasModule && past > current) {
    return `migration.ts is still here at ${packageVersion}, past ${constant}: remove it`
  }
  return undefined
}

describe('AC-native-apply-order-35 — the version test reds where someone has to act', () => {
  it('is green while the changeset is pending and the constant is the next minor', () => {
    expect(
      problemOf({
        constant: '0.5.0',
        packageVersion: '0.4.0',
        hasChangeset: true,
        hasModule: true,
      }),
    ).toBeUndefined()
  })

  it('reds, naming the constant, when a release landed first', () => {
    expect(
      problemOf({
        constant: '0.5.0',
        packageVersion: '0.5.0',
        hasChangeset: true,
        hasModule: true,
      }),
    ).toContain('MIGRATION_VERSION')
  })

  it('reds, naming the module, when the changeset is consumed and the package is past the constant', () => {
    expect(
      problemOf({
        constant: '0.5.0',
        packageVersion: '0.6.0',
        hasChangeset: false,
        hasModule: true,
      }),
    ).toContain('migration.ts')
  })

  it("is green consumed in the constant's minor, and green consumed past it with the module gone", () => {
    expect(
      problemOf({
        constant: '0.5.0',
        packageVersion: '0.5.0',
        hasChangeset: false,
        hasModule: true,
      }),
    ).toBeUndefined()
    expect(
      problemOf({
        constant: '0.5.0',
        packageVersion: '0.6.0',
        hasChangeset: false,
        hasModule: false,
      }),
    ).toBeUndefined()
  })

  it('is green for the repository as it is', () => {
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as {
      version: string
    }
    const changesets = readdirSync(path.join(PACKAGE, '../../.changeset'))
    const situation = {
      constant: MIGRATION_VERSION,
      packageVersion: manifest.version,
      hasChangeset: changesets.includes(CHANGESET),
      hasModule: existsSync(path.join(PACKAGE, 'src/directive/migration.ts')),
    }

    expect(problemOf(situation)).toBeUndefined()
  })
})
