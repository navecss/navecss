/**
 * The tokens floor: AC-secondary-action-states-19 (the floor is derived from every name the sheet
 * uses), -20 (the published-floor rows run, read every name and red on an absent one) and the Tier
 * A half of -21 (no fallback hides a stale tokens file).
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { ACTIVE_VALUE, HOVER_VALUE, secondaryStateRules } from './support/secondary-states.ts'
import { flatten, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import {
  namedTokens,
  PUBLISHED_TOKENS_ALIAS,
  publishedFloorOf,
  publishedTokens,
  tokensFloorOf,
  undeclaredIn,
} from './support/w3-tokens-floor.ts'

const css = readStylesheet()
const byText = (a: string, b: string): number => a.localeCompare(b)
const NEW_NAMES = ['--nave-color-action-secondary-hover', '--nave-color-action-secondary-active']
const FLOOR = '0.5.0'

const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
}

const withoutNewNames = (source: string): string => {
  const root = postcss.parse(source)
  root.walkDecls((decl) => {
    if (NEW_NAMES.some((name) => decl.value.includes(name))) decl.remove()
  })
  return root.toString()
}

const rule = (name: string): string => `.x { color: var(${name}) }`

const tokensChangelog = (): string =>
  readFileSync(path.join(PACKAGE_DIR, '../tokens/CHANGELOG.md'), 'utf8')

/**
A dating that matches names as substrings of a release section, which is what the helper must not do.
 */
const substringFloor = (name: string): string => {
  const sections = readFileSync(path.join(PACKAGE_DIR, '../tokens/CHANGELOG.md'), 'utf8')
    .split(/^## /m)
    .slice(1)
  const hit = sections.findLast((section) => section.includes(name))
  return hit?.split('\n', 1)[0]?.trim() ?? '0.1.0'
}

describe('AC-secondary-action-states-19: the floor follows the newest name the sheet uses', () => {
  it('is the release that ships the two new names for the shipped stylesheet', () => {
    expect(publishedFloorOf(css, publishedTokens())).toBe(FLOOR)
  })

  it('is the release that ships the highlight fill once the two new names are out of the sheet', () => {
    expect(publishedFloorOf(withoutNewNames(css), publishedTokens())).toBe('0.4.0')
  })

  it('is the release that ships the mark width for a sheet naming only that', () => {
    expect(publishedFloorOf(rule('--nave-border-width-mark'), publishedTokens())).toBe('0.3.0')
  })

  it('dates a name no release section names as a whole name to 0.1.0, and a prefix of a name is not that name (control)', () => {
    expect(publishedFloorOf(rule('--nave-color-action-secondary'), publishedTokens())).toBe('0.1.0')
    expect(substringFloor('--nave-color-action-secondary')).not.toBe('0.1.0')
  })

  it('is not raised by a later release note that mentions a name the release already declares (control)', () => {
    const mentioned = tokensChangelog().replace(
      /^## /m,
      '## 0.6.0\n\n### Patch Changes\n\n- 0000000: `--nave-color-border-control` moves one step darker in dark.\n\n## ',
    )
    const published = publishedTokens()

    expect(publishedFloorOf(css, published, mentioned)).toBe(FLOOR)
    expect(publishedFloorOf(withoutNewNames(css), published, mentioned)).toBe('0.4.0')
  })

  it('still drops below the release when its own note does not name the names it adds (control)', () => {
    const unnamed = tokensChangelog()
      .replace(
        '`--nave-color-action-secondary-hover` is neutral',
        '`action.secondary.hover` is neutral',
      )
      .replace(
        '`--nave-color-action-secondary-active` is neutral',
        '`action.secondary.active` is neutral',
      )

    expect(unnamed).not.toMatch(/--nave-color-action-secondary-(?:hover|active)/)
    expect(publishedFloorOf(css, publishedTokens(), unnamed)).toBe('0.4.0')
  })

  it('dates a name two sections name to the older one (control)', () => {
    const changelog = [
      '# @navecss/tokens',
      '## 0.6.0',
      '- a: `--nave-border-width-mark` is described again.',
      '## 0.3.0',
      '- b: Adds `--nave-border-width-mark`.',
      '',
    ].join('\n\n')

    expect(tokensFloorOf(rule('--nave-border-width-mark'), changelog)).toBe('0.3.0')
  })

  it('names no --nave-* token as a literal in the helper module', () => {
    const source = readFileSync(path.join(PACKAGE_DIR, 'test/support/w3-tokens-floor.ts'), 'utf8')

    expect(source.match(/--nave-[a-z0-9-]+/g)).toBeNull()
  })

  it('gives the tokens peer as ">=<V> <1.0.0" with V that floor, and not the range it had', () => {
    expect(manifest.peerDependencies['@navecss/tokens']).toBe(
      `>=${publishedFloorOf(css, publishedTokens())} <1.0.0`,
    )
    expect(manifest.peerDependencies['@navecss/tokens']).not.toBe('>=0.4.0 <1.0.0')
  })
})

describe('AC-secondary-action-states-20: the published-floor rows run, read every name, and red on an absent one', () => {
  it('installs the alias as a devDependency at the floor, and the installed release is that version', () => {
    expect(manifest.devDependencies[PUBLISHED_TOKENS_ALIAS]).toBe(`npm:@navecss/tokens@${FLOOR}`)
    const published = publishedTokens()
    expect(published.version).toBe(FLOOR)
  })

  it('declares in the alias every name the sheet uses, both new names included', () => {
    const published = publishedTokens()
    const declared = published.declared

    expect(undeclaredIn(css, declared)).toEqual([])
    expect(NEW_NAMES.filter((name) => !declared.has(name))).toEqual([])
    expect(NEW_NAMES.filter((name) => !namedTokens(css).has(name))).toEqual([])
  })

  it('reports a planted layer name no release declares, and a deleted new name (controls)', () => {
    const published = publishedTokens()
    const declared = published.declared
    const without = new Set(declared)
    without.delete(NEW_NAMES[0] ?? '')

    expect(undeclaredIn(rule('--nave-layer-notification'), declared)).toEqual([
      '--nave-layer-notification',
    ])
    expect(undeclaredIn(css, without)).toEqual([NEW_NAMES[0]])
  })

  it('fails naming the alias and the version to install when the alias is absent, and reports no skip', () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'nave-no-alias-'))

    expect(() => publishedTokens(scratch)).toThrow(PUBLISHED_TOKENS_ALIAS)
    expect(() => publishedTokens(scratch)).toThrow(`@navecss/tokens@${tokensFloorOf(css)}`)
  })

  it('tells knip the alias is read by path, in the base-ui workspace entry', () => {
    const knip = readFileSync(path.join(PACKAGE_DIR, '../../knip.jsonc'), 'utf8')

    expect(knip).toMatch(
      /"packages\/base-ui":\s*\{[\s\S]*?ignoreDependencies[^\]]*navecss-tokens-floor/,
    )
  })
})

describe('AC-secondary-action-states-21: no fallback hides a stale tokens file', () => {
  it('writes each of the four keys as the bare var() of its name', () => {
    const values = secondaryStateRules(css).flatMap((entry) => entry[2].nodes)
    const written = values.flatMap((node) => (node.type === 'decl' ? [node.value] : []))

    expect(written.toSorted(byText)).toEqual(
      [ACTIVE_VALUE, ACTIVE_VALUE, HOVER_VALUE, HOVER_VALUE].toSorted(byText),
    )
    expect(
      flatten(css).filter((item) => /action-secondary-(?:hover|active)/.test(item.value)),
    ).toHaveLength(4)
  })
})
