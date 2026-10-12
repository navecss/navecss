/**
 * The tokens release a stylesheet's `--nave-*` names must exist at, and the two places the names
 * are checked against: the workspace's built tokens and, once that release is out, the release
 * itself installed through a devDependency alias.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { expect } from 'vitest'

import { PACKAGE_DIR } from './stylesheet.ts'
import { declaredTokens } from './tokens.ts'

const byName = (a: string, b: string): number => a.localeCompare(b)

const ROOT = path.join(PACKAGE_DIR, '../..')

/**
The alias that installs the published tokens release the peer floor names.
 */
export const PUBLISHED_TOKENS_ALIAS = 'navecss-tokens-floor'

const TOKEN_NAME = '--nave-color-action-highlight'

/**
The version of `@navecss/tokens` the stylesheet's peer floor must be: the first release that
declares the highlight fill. Once a release has written its CHANGELOG section, that section names
it; until then the pending changeset that adds it names the bump, and the release is that bump of
the version the workspace carries now.
 */
export const firstTokensVersionWithTheHighlight = (): string => {
  const changelog = readFileSync(path.join(ROOT, 'packages/tokens/CHANGELOG.md'), 'utf8')
  const section = changelog
    .split(/^## /m)
    .slice(1)
    .find((candidate) => candidate.includes(TOKEN_NAME))
  if (section !== undefined) {
    return section.split('\n', 1)[0]?.trim() ?? ''
  }
  const pending = readdirSync(path.join(ROOT, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => readFileSync(path.join(ROOT, '.changeset', file), 'utf8'))
    .find((text) => text.includes(TOKEN_NAME) && text.includes("'@navecss/tokens': minor"))
  expect(pending, 'no release and no pending changeset adds the highlight token').toBeDefined()
  const { version } = JSON.parse(
    readFileSync(path.join(ROOT, 'packages/tokens/package.json'), 'utf8'),
  ) as { version: string }
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return `${major}.${minor + 1}.0`
}

/**
Every distinct `--nave-*` name a stylesheet names, declared or used.
 */
export const namedTokens = (css: string): Set<string> => new Set(css.match(/--nave-[a-z0-9-]+/g))

/**
The names a stylesheet uses that a token set does not declare.
 */
export const undeclaredIn = (css: string, declared: ReadonlySet<string>): string[] =>
  [...namedTokens(css)].filter((name) => !declared.has(name)).toSorted(byName)

/**
The published tokens release, as installed through the alias: its version and the names its
stylesheet declares. A `reason` instead means the alias is not installed yet. An alias that is
installed but is the workspace itself throws, so it can never stand in for a release.
 */
export type PublishedTokens =
  { readonly declared: ReadonlySet<string>; readonly version: string } | { readonly reason: string }

export const publishedTokens = (): PublishedTokens => {
  const dir = path.join(PACKAGE_DIR, 'node_modules', PUBLISHED_TOKENS_ALIAS)
  if (!existsSync(dir)) {
    const wanted = firstTokensVersionWithTheHighlight()
    return {
      reason: `@navecss/tokens@${wanted} is not published yet. It unskips once that release exists and "${PUBLISHED_TOKENS_ALIAS}": "npm:@navecss/tokens@${wanted}" is a devDependency of this package and installed`,
    }
  }
  if (realpathSync(dir) === realpathSync(path.join(ROOT, 'packages/tokens'))) {
    throw new Error(`"${PUBLISHED_TOKENS_ALIAS}" resolves to the workspace, not to a release`)
  }
  const { version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    version: string
  }
  const css = readFileSync(path.join(dir, 'dist/tokens.css'), 'utf8')
  return { declared: new Set(declaredTokens(css).keys()), version }
}
