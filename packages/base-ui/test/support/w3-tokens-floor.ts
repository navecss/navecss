/**
 * The tokens release a stylesheet's `--nave-*` names must exist at, and the two places the names
 * are checked against: the workspace's built tokens and the release itself, installed through a
 * devDependency alias.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR, readStylesheet } from './stylesheet.ts'
import { declaredTokens } from './tokens.ts'

const byName = (a: string, b: string): number => a.localeCompare(b)

const ROOT = path.join(PACKAGE_DIR, '../..')

/**
The alias that installs the published tokens release the peer floor names.
 */
export const PUBLISHED_TOKENS_ALIAS = 'navecss-tokens-floor'

/**
The release a name that no CHANGELOG section names (declared before the first one was written) dates to.
 */
const FIRST_RELEASE = '0.1.0'

const versionParts = (version: string): number[] => version.split('.').map(Number)

const compareVersions = (a: string, b: string): number => {
  const [left, right] = [versionParts(a), versionParts(b)]
  const at = left.findIndex((part, index) => part !== right[index])
  return at === -1 ? 0 : (left[at] ?? 0) - (right[at] ?? 0)
}

interface Section {
  readonly text: string
  readonly version: string
}

const changelogSections = (): Section[] =>
  readFileSync(path.join(ROOT, 'packages/tokens/CHANGELOG.md'), 'utf8')
    .split(/^## /m)
    .slice(1)
    .map((section) => ({ text: section, version: section.split('\n', 1)[0]?.trim() ?? '' }))

const escapeForRegExp = (text: string): string =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)

/**
The release that first ships a name: the oldest CHANGELOG section that names it as a whole name
(followed by no character of `[a-z0-9-]`, so a prefix of a longer name is not that name), or the
first release when no section does.
 */
const releaseOf = (name: string, sections: readonly Section[]): string => {
  const whole = new RegExp(`${escapeForRegExp(name)}(?![a-z0-9-])`)
  return (
    sections
      .filter(({ text }) => whole.test(text))
      .map(({ version }) => version)
      .toSorted(compareVersions)[0] ?? FIRST_RELEASE
  )
}

/**
The tokens release a stylesheet's names floor at: the newest release that ships any name it uses.
 */
export const tokensFloorOf = (css: string): string => {
  const sections = changelogSections()
  return [...namedTokens(css)]
    .map((name) => releaseOf(name, sections))
    .reduce(
      (newest, version) => (compareVersions(version, newest) > 0 ? version : newest),
      FIRST_RELEASE,
    )
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
stylesheet declares.
 */
export interface PublishedTokens {
  readonly declared: ReadonlySet<string>
  readonly version: string
}

/**
The release installed under the alias in a package directory. An alias that is not installed
throws, naming the alias and the version to install, so a row that needs the release fails instead
of skipping. An alias that is installed but is the workspace itself throws too, so it can never
stand in for a release.
 */
export const publishedTokens = (packageDir: string = PACKAGE_DIR): PublishedTokens => {
  const dir = path.join(packageDir, 'node_modules', PUBLISHED_TOKENS_ALIAS)
  if (!existsSync(dir)) {
    throw new Error(
      `"${PUBLISHED_TOKENS_ALIAS}" is not installed in ${packageDir}: add "${PUBLISHED_TOKENS_ALIAS}": "npm:@navecss/tokens@${tokensFloorOf(readStylesheet())}" to its devDependencies and install`,
    )
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
