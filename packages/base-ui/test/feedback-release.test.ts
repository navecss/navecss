import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'

import { withoutRules } from './support/draft-states.ts'
import { PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './support/tokens.ts'
import {
  firstTokensVersionWithTheHighlight,
  namedTokens,
  publishedTokens,
  undeclaredIn,
} from './support/w3-tokens-floor.ts'
import {
  aboutAnUnreleasedRelease,
  type Changeset,
  changesetProblems,
  changesetsNaming,
  hasTheSeven,
  NOTHING_RELEASED,
  releasedNow,
  releasedOf,
  releasesOf,
  ROOT,
  SEVEN_COMPONENTS,
} from './support/w12-release.ts'

const NAME = '@navecss/base-ui'

const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>
}

/**
The eight names the stylesheet newly uses, from the spec: none of them is in the published package.
 */
const NEW_TO_THE_PACKAGE = [
  '--nave-color-surface-sunken',
  '--nave-font-size-xl',
  '--nave-layer-toast',
  '--nave-line-height-none',
  '--nave-radius-card',
  '--nave-size-avatar-sm',
  '--nave-size-avatar-md',
  '--nave-size-avatar-lg',
]

/**
The stylesheet with the placement's rule out: what the build leaves while that draft is unsigned.
 */
const withoutPlacement = (css: string): string =>
  withoutRules(css, ['nave-base-ui-toast-placement'])

const workspaceDeclared = (): Set<string> => new Set(declaredTokens(workspaceTokensCss()).keys())

const publishedOrSkip = (
  context: TestContext,
): { declared: ReadonlySet<string>; version: string } => {
  const published = publishedTokens()
  if ('reason' in published) {
    return context.skip(published.reason)
  }
  return published
}

const make = (file: string, frontmatter: string, text: string): Changeset => ({
  file,
  releases: releasesOf(`---\n${frontmatter}\n---\n\n${text}`),
  text,
})

/**
The entries of a CHANGELOG section that name the seven components, one per changeset, keyed by its
commit.
 */
const entriesOfTheSeven = (section: string): string[] =>
  section
    .split(/^(?=- [\da-f]{7,}: )/m)
    .filter((entry) => /^- [\da-f]{7,}: /.test(entry) && hasTheSeven(entry))

const planted = '.x { color: var(--nave-layer-notification) }'

describe('AC-base-ui-feedback-navigation-48: the release, its order, and the tokens floor (supersedes AC-base-ui-overlay-completion-31 and -38 for the combined package)', () => {
  describe('the changeset', () => {
    const pending = changesetsNaming(NAME)
    const changelog = path.join(ROOT, 'packages/base-ui/CHANGELOG.md')
    const released = releasedNow()
    // The seven's own changeset, while their release is not yet in the CHANGELOG.
    const isSevenPending = pending.some(({ text }) => !released.seven && hasTheSeven(text))

    it.runIf(pending.some(aboutAnUnreleasedRelease(released)))(
      'has every pending changeset about a release not yet made name @navecss/base-ui alone with bump minor, and exactly one of them name the seven components',
      () => {
        expect(changesetProblems(pending, NAME, released)).toEqual([])
      },
    )

    it("has the changeset that names the seven be a file of this pull request, not the overlay release's", () => {
      const own = pending.filter(({ text }) => hasTheSeven(text))
      expect(own.map(({ file }) => file)).not.toContain('base-ui-overlay-components.md')
    })

    it.runIf(!isSevenPending && existsSync(changelog))(
      'was released as a minor, with exactly one changeset that names the seven components among its entries, once the changeset is spent',
      () => {
        const sections = readFileSync(changelog, 'utf8').split(/^## /m).slice(1)
        // One entry per changeset, keyed by its commit. An earlier changeset that was still pending
        // when this one merged is released in the same section, so the entries are not counted. A
        // later release can follow, so the section is the one holding the entry, wherever it sits.
        expect(sections.flatMap((section) => entriesOfTheSeven(section))).toHaveLength(1)
        const released = sections.find((section) => entriesOfTheSeven(section).length > 0) ?? ''
        expect(released).toContain('### Minor Changes')
        expect(released).not.toContain('### Major Changes')
      },
    )

    it('control: a second changeset for the seven, a second package or another bump is reported', () => {
      const seven = SEVEN_COMPONENTS.join(', ')
      const own = make('own.md', "'@navecss/base-ui': minor", seven)
      const earlier = make(
        'earlier.md',
        "'@navecss/base-ui': minor",
        'alert-dialog, context-menu, menubar, preview-card, combobox, autocomplete',
      )
      expect(changesetProblems([earlier, own], NAME)).toEqual([])
      expect(changesetProblems([earlier], NAME)).toEqual([
        'not exactly one pending changeset names the seven components',
      ])
      expect(
        changesetProblems(
          [earlier, own, make('twice.md', "'@navecss/base-ui': minor", seven)],
          NAME,
        ),
      ).toEqual(['not exactly one pending changeset names the seven components'])
      expect(
        changesetProblems(
          [make('both.md', "'@navecss/base-ui': minor\n'@navecss/tokens': minor", seven)],
          NAME,
        ),
      ).toEqual(['both.md does not name @navecss/base-ui alone with bump minor'])
      expect(
        changesetProblems([earlier, make('patch.md', "'@navecss/base-ui': patch", seven)], NAME),
      ).toEqual(['patch.md does not name @navecss/base-ui alone with bump minor'])
    })

    it('control: a lone patch changeset for the package, after the release, is accepted', () => {
      const fix = make('fix.md', "'@navecss/base-ui': patch", 'A fix that names neither set.')
      const own = make('own.md', "'@navecss/base-ui': minor", SEVEN_COMPONENTS.join(', '))
      expect(changesetProblems([fix], NAME)).toEqual([])
      expect(changesetProblems([fix, own], NAME)).toEqual([])
    })

    it('control: a later patch that names the seven is reported before their release and accepted after it', () => {
      const focus = make(
        'focus.md',
        "'@navecss/base-ui': patch",
        `The focus ring of ${SEVEN_COMPONENTS.join(', ')} now follows the token.`,
      )
      expect(changesetProblems([focus], NAME, NOTHING_RELEASED)).toEqual([
        'focus.md does not name @navecss/base-ui alone with bump minor',
      ])
      expect(changesetProblems([focus], NAME, { seven: true, six: true })).toEqual([])
    })

    it('control: the CHANGELOG tells a released set from an unreleased one by its entries', () => {
      const seven = SEVEN_COMPONENTS.join(', ')
      expect(releasedOf(`## 0.2.0\n\n### Minor Changes\n\n- c20ff6d: ${seven}.\n`)).toEqual({
        seven: true,
        six: false,
      })
      expect(releasedOf(`## 0.2.1\n\nA note on ${seven}, outside any entry.\n`)).toEqual(
        NOTHING_RELEASED,
      )
      expect(releasedNow()).toEqual({ seven: true, six: true })
    })

    it('control: a second changeset, a second package or another bump is not the release', () => {
      expect(releasesOf("---\n'@navecss/base-ui': minor\n---\n\nx")).toEqual({ [NAME]: 'minor' })
      expect(
        releasesOf("---\n'@navecss/base-ui': minor\n'@navecss/tokens': minor\n---\n\nx"),
      ).not.toEqual({ [NAME]: 'minor' })
      expect(releasesOf("---\n'@navecss/base-ui': patch\n---\n\nx")).not.toEqual({
        [NAME]: 'minor',
      })
      expect(releasesOf("---\n'@navecss/base-ui': major\n---\n\nx")).not.toEqual({
        [NAME]: 'minor',
      })
    })
  })

  describe('every --nave-* name the stylesheet uses is declared', () => {
    it('names 67 distinct tokens with every draft signed, among them the eight new to the package', () => {
      const named = namedTokens(readStylesheet())
      expect(named.size).toBe(67)
      expect(NEW_TO_THE_PACKAGE.filter((name) => !named.has(name))).toEqual([])
    })

    it('names 66 with the placement unsigned: the one that goes is --nave-layer-toast', () => {
      const all = namedTokens(readStylesheet())
      const unsigned = namedTokens(withoutPlacement(readStylesheet()))
      expect(unsigned.size).toBe(66)
      expect([...all].filter((name) => !unsigned.has(name))).toEqual(['--nave-layer-toast'])
    })

    it('has the workspace declare each of the eight new names, and every name the stylesheet uses', () => {
      const declared = workspaceDeclared()
      expect(NEW_TO_THE_PACKAGE.filter((name) => !declared.has(name))).toEqual([])
      expect(undeclaredIn(readStylesheet(), declared)).toEqual([])
      const unsigned = withoutPlacement(readStylesheet())
      expect(undeclaredIn(unsigned, declared)).toEqual([])
    })

    it('has the published tokens release, installed through an alias, declare the same', (context) => {
      const published = publishedOrSkip(context)
      expect(published.version).toBe(firstTokensVersionWithTheHighlight())
      expect(NEW_TO_THE_PACKAGE.filter((name) => !published.declared.has(name))).toEqual([])
      expect(undeclaredIn(readStylesheet(), published.declared)).toEqual([])
    })

    it('control: a planted var(--nave-layer-notification) is reported against the workspace', () => {
      expect(undeclaredIn(planted, workspaceDeclared())).toEqual(['--nave-layer-notification'])
      expect(undeclaredIn(`${readStylesheet()}\n${planted}`, workspaceDeclared())).toEqual([
        '--nave-layer-notification',
      ])
    })

    it('control: the same planted name is reported against the published release', (context) => {
      const published = publishedOrSkip(context)
      expect(undeclaredIn(planted, published.declared)).toEqual(['--nave-layer-notification'])
    })

    it('control: the stylesheet with --nave-layer-toast withdrawn is what the check reports', () => {
      const css = `${readStylesheet()}\n.x { z-index: var(--nave-layer-toast) }`
      const declared = workspaceDeclared()
      declared.delete('--nave-layer-toast')
      expect(undeclaredIn(css, declared)).toEqual(['--nave-layer-toast'])
    })
  })

  describe('the tokens peer', () => {
    it('is given as ">=<V> <1.0.0", V being the release that ships the highlight fill', () => {
      expect(manifest.peerDependencies['@navecss/tokens']).toBe(
        `>=${firstTokensVersionWithTheHighlight()} <1.0.0`,
      )
    })

    it('control: the range that floored the tokens before the highlight fill is not the expected one', () => {
      expect('>=0.3.0 <1.0.0').not.toBe(`>=${firstTokensVersionWithTheHighlight()} <1.0.0`)
    })
  })
})

// Checked by hand, not by tests: that the type-member fix is merged first and alone and the overlay
// release's changes are on `main` before this branch opens, that this release follows the overlay
// release's minor, that `pnpm run ci:check` exits 0 on the head merged with `main`, and that the
// accessibility wording the README carries is checked again, byte for byte, at the commit the
// tarball is built from.
