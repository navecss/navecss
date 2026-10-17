import { describe, expect, it } from 'vitest'

import { readReadme } from './support/readme.ts'
import { cleared } from './support/registry/cleared.ts'
import {
  README_CHECKS,
  readmeBuiltFrom,
  type ReadmeContext,
} from './support/registry/strings-readme.ts'
import { copySectionOf } from './support/registry/strings-sources.ts'
import {
  blockPresenceProblems,
  blockRowProblems,
  readAtBase,
  withOneWordChanged,
} from './support/registry/strings-text.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'

const README_PATH = 'packages/base-ui/README.md'

const contextFor = (readme: string, base: string): ReadmeContext => ({
  base,
  peerDependencies: manifestOf().peerDependencies,
  readme,
})

const problemsOf = (check: string, context: ReadmeContext): string[] =>
  README_CHECKS[check]?.(context) ?? [`no check named ${check}`]

const BLOCKS = ['N', 'ladder-L1', 'ladder-L2', 'S-noform', 'S-b']

describe('AC-base-ui-registry-28: the package README documents the copy with the cleared blocks verbatim, the installed package first', () => {
  const base = readAtBase(README_PATH)

  describe('the README as it stands', () => {
    const context = contextFor(readReadme(), base)

    it.each(Object.keys(README_CHECKS))('holds: %s', (check) => {
      expect(problemsOf(check, context)).toEqual([])
    })

    it.each(BLOCKS)('has the %s block at its length and sha256, present byte for byte', (name) => {
      expect(blockRowProblems(name)).toEqual([])
      expect(blockPresenceProblems(name, context.readme)).toEqual([])
    })

    it('has a copy section to read', () => {
      expect(copySectionOf(context.readme)).toBeDefined()
    })

    it('has the section at the length and sha256 of S-noform', () => {
      expect(copySectionOf(context.readme)).toBe(cleared('S-noform'))
    })
  })

  describe('the checks, run over the README the cleared bytes describe', () => {
    const built = readmeBuiltFrom(base)
    const context = contextFor(built, base)

    it('reads a base README that has the three lines the blocks replace', () => {
      expect(built).not.toBe(base)
      expect(built.split('\n').length).toBeGreaterThan(base.split('\n').length)
    })

    it.each(Object.keys(README_CHECKS))('accepts it: %s', (check) => {
      expect(problemsOf(check, context)).toEqual([])
    })

    it.each(BLOCKS)('reds %s with one word changed, which the presence check names', (name) => {
      const block = cleared(name)
      const edited = built.replace(block, () => withOneWordChanged(block))
      expect(edited).not.toBe(built)
      expect(blockPresenceProblems(name, edited)).toEqual([
        `${name} is present 0 times, expected 1`,
      ])
    })

    it('reds one word of S-b changed in a copy, in the paragraph check and the section check', () => {
      const block = cleared('S-b')
      const edited = built.replace(block, () => withOneWordChanged(block))
      const control = contextFor(edited, base)
      expect(problemsOf('S-b is its own paragraph of the section', control)).not.toEqual([])
      expect(problemsOf('S-noform sits directly before "What is styled"', control)).not.toEqual([])
    })

    it('reds S-b run into the paragraph before it', () => {
      const block = cleared('S-b')
      const edited = built.replace(`\n\n${block}`, () => ` ${block}`)
      expect(
        problemsOf('S-b is its own paragraph of the section', contextFor(edited, base)),
      ).not.toEqual([])
    })

    it('reds @navecss/base-ui@0.3.0 planted in a fence', () => {
      const edited = built.replace(
        './node_modules/@navecss/base-ui/dist/',
        () => './node_modules/@navecss/base-ui@0.3.0/dist/',
      )
      expect(edited).not.toBe(built)
      expect(
        problemsOf(
          '<version> sits only in the jsDelivr and registries fences',
          contextFor(edited, base),
        ),
      ).toEqual(['a literal @navecss/base-ui@<digits> appears'])
    })

    it('reds <version> in the installed-package fence', () => {
      const edited = built.replace(
        '/dist/registry/base-ui-dialog.json\n```',
        () => '/dist/registry/base-ui-dialog.json <version>\n```',
      )
      expect(edited).not.toBe(built)
      expect(
        problemsOf(
          '<version> sits only in the jsDelivr and registries fences',
          contextFor(edited, base),
        ),
      ).toEqual(['<version> appears in a fence that is not a jsDelivr one'])
    })

    it('reds the jsDelivr fence moved first', () => {
      const local =
        'npx shadcn@latest add ./node_modules/@navecss/base-ui/dist/registry/base-ui-dialog.json'
      const remote =
        'npx shadcn@latest add https://cdn.jsdelivr.net/npm/@navecss/base-ui@<version>/dist/registry/base-ui-dialog.json'
      expect(built).toContain(local)
      expect(built).toContain(remote)
      const swapped = built
        .replace(local, () => '@@')
        .replace(remote, () => local)
        .replace('@@', () => remote)
      expect(
        problemsOf("the first command fence is the installed package's", contextFor(swapped, base)),
      ).not.toEqual([])
    })

    it('reds an address without /dist/registry/', () => {
      const edited = built.replace(
        '/dist/registry/base-ui-dialog.json\n```',
        () => '/registry/base-ui-dialog.json\n```',
      )
      expect(edited).not.toBe(built)
      expect(
        problemsOf('every address has /dist/registry/', contextFor(edited, base)),
      ).toHaveLength(1)
    })

    it('reds the file list with two files swapped, and with --diff added', () => {
      const wrap = '- `nave-dialog.wrap.ts`'
      const parts = '- `nave-dialog.parts.ts`'
      const swapped = built
        .replace(wrap, () => '@@')
        .replace(parts, () => wrap)
        .replace('@@', () => parts)
      expect(swapped).not.toBe(built)
      expect(
        problemsOf(
          'the file list is in the item order and there is no --diff',
          contextFor(swapped, base),
        ),
      ).not.toEqual([])
      const diffed = built.replace(
        'Then import the component',
        () => 'Compare with `add --diff`. Then import the component',
      )
      expect(diffed).not.toBe(built)
      expect(
        problemsOf(
          'the file list is in the item order and there is no --diff',
          contextFor(diffed, base),
        ),
      ).toEqual(['the section points at --diff'])
    })

    it('reds a floor worded differently from the peer range', () => {
      const edited = built.replace('and React 18 or 19.', () => 'and React 18 and 19.')
      expect(edited).not.toBe(built)
      expect(
        problemsOf('the floor sentence is worded from peerDependencies', contextFor(edited, base)),
      ).toEqual(['the floor sentence lacks "React 18 or 19"'])
    })

    it('words the floors from the peer ranges the check is given, not from its own', () => {
      const moved = {
        ...contextFor(built, base),
        peerDependencies: { ...manifestOf().peerDependencies, '@navecss/tokens': '>=0.5.0 <1.0.0' },
      }
      expect(problemsOf('the floor sentence is worded from peerDependencies', moved)).toEqual([
        'the floor sentence lacks "`@navecss/tokens` 0.5.0 or later before 1.0"',
      ])
    })

    it('reds an edited non-affiliation line, an edited count line and an edited "On this page" line', () => {
      const nonAffiliation =
        'This package is not affiliated with, endorsed by or sponsored by MUI or the Base UI project.'
      expect(built).toContain(nonAffiliation)
      const affiliation = built.replace(nonAffiliation, () =>
        nonAffiliation.replace('MUI', 'Example'),
      )
      expect(
        problemsOf('the non-affiliation line is its own paragraph', contextFor(affiliation, base)),
      ).not.toEqual([])
      const count = built.replace(
        cleared('ladder-L1'),
        () => 'There are three steps, from the lightest:',
      )
      expect(problemsOf('the Overriding count line and list', contextFor(count, base))).not.toEqual(
        [],
      )
      const page = built.replace('On this page:', () => 'On this site:')
      expect(problemsOf('the "On this page" line is N', contextFor(page, base))).not.toEqual([])
    })

    it('reds a changed base item in the ladder and any changed line elsewhere', () => {
      const item = '1. **Tokens.** Re-theme'
      expect(built).toContain(item)
      const ladder = built.replace(item, () => '1. **Tokens.** Retheme')
      expect(
        problemsOf('the Overriding count line and list', contextFor(ladder, base)),
      ).not.toEqual([])
      expect(
        problemsOf("every other line is the base README's", contextFor(ladder, base)),
      ).toHaveLength(1)
      const elsewhere = `${built}\nOne more line.\n`
      expect(
        problemsOf("every other line is the base README's", contextFor(elsewhere, base)),
      ).toHaveLength(1)
    })

    it('reds a README with the section placed anywhere but directly before "What is styled"', () => {
      const section = cleared('S-noform')
      const moved = built
        .replace(`${section}\n\n`, () => '')
        .replace('## Variants', () => `${section}\n\n## Variants`)
      expect(moved).not.toBe(built)
      expect(
        problemsOf('S-noform sits directly before "What is styled"', contextFor(moved, base)),
      ).not.toEqual([])
    })
  })
})
