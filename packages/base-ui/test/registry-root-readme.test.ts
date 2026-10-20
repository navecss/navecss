import { describe, expect, it } from 'vitest'

import { cleared } from './support/registry/cleared.ts'
import { BASE_ROOT_README } from './support/registry/strings-literals-readme.ts'
import {
  isItemNine,
  promiseItems,
  ROOT_CHECKS,
  type RootContext,
  rootReadmeBuiltFrom,
} from './support/registry/strings-root-readme.ts'
import {
  blockPresenceProblems,
  blockRowProblems,
  readHead,
  withOneWordChanged,
} from './support/registry/strings-text.ts'

const README_PATH = 'README.md'

const problemsOf = (check: string, context: RootContext): string[] =>
  ROOT_CHECKS[check]?.(context) ?? [`no check named ${check}`]

describe('AC-base-ui-registry-29: the root README gains non-promise 9, appended, and the pointer line', () => {
  const base = BASE_ROOT_README
  const [LIST, OLD_SENTENCE, POINTER] = Object.keys(ROOT_CHECKS)

  describe('the README as it stands', () => {
    const context: RootContext = { readme: readHead(README_PATH) }

    it.each(Object.keys(ROOT_CHECKS))('holds: %s', (check) => {
      expect(problemsOf(check, context)).toEqual([])
    })

    it.each(['S-a', 'P'])('has the %s block at its length and sha256', (name) => {
      expect(blockRowProblems(name)).toEqual([])
    })

    it('has nine items in the list, read from a base with eight', () => {
      expect(promiseItems(base)).toHaveLength(8)
      expect(promiseItems(context.readme)).toHaveLength(9)
    })
  })

  describe('the checks, run over the README the cleared bytes describe', () => {
    const built = rootReadmeBuiltFrom(base)
    const context: RootContext = { readme: built }
    const withReadme = (readme: string): RootContext => ({ readme })

    it('builds from a base that has the list and the Radix line', () => {
      expect(promiseItems(base)).toHaveLength(8)
      expect(promiseItems(built)).toHaveLength(9)
      expect(built.split(cleared('P'))).toHaveLength(2)
    })

    it.each(Object.keys(ROOT_CHECKS))('accepts it: %s', (check) => {
      expect(problemsOf(check, context)).toEqual([])
    })

    it('reds the base README as it stands, which has neither addition', () => {
      expect(problemsOf(LIST ?? '', withReadme(base))).not.toEqual([])
      expect(problemsOf(POINTER ?? '', withReadme(base))).not.toEqual([])
    })

    it.each(['S-a', 'P'])(
      'reds %s with one word changed, which the presence check names',
      (name) => {
        const block = cleared(name)
        const edited = built.replace(block, () => withOneWordChanged(block))
        expect(edited).not.toBe(built)
        expect(blockPresenceProblems(name, edited)).toEqual([
          `${name} is present 0 times, expected 1`,
        ])
      },
    )

    it('reds item 9 with any other word changed', () => {
      const edited = built.replace(cleared('S-a'), () => withOneWordChanged(cleared('S-a')))
      expect(edited).not.toBe(built)
      expect(problemsOf(LIST ?? '', withReadme(edited))).toEqual(['the ninth item is not S-a'])
    })

    it('accepts item 9 with "the registry" replaced once by a name, and reds the replacement twice or an edit beside it', () => {
      const itemNine = cleared('S-a')
      expect(isItemNine(itemNine.replace('the registry', () => "Nave's shadcn registry"))).toBe(
        true,
      )
      expect(isItemNine(itemNine.replace('the registry', () => ''))).toBe(false)
      expect(
        isItemNine(
          itemNine
            .replace('the registry', () => "Nave's shadcn registry")
            .replace('fixes', () => 'fix'),
        ),
      ).toBe(false)
      expect(isItemNine(`${itemNine}\n10. A tenth.`)).toBe(false)
    })

    it('reds an item renumbered among the first eight', () => {
      const edited = built.replace(
        '7. **Motion you write with raw values.**',
        () => '8. **Motion you write with raw values.**',
      )
      expect(edited).not.toBe(built)
      expect(problemsOf(LIST ?? '', withReadme(edited))).toEqual(['item 7 is misnumbered'])
    })

    it('reds a ninth item set apart from the list by a blank line', () => {
      const edited = built.replace(`\n${cleared('S-a')}`, () => `\n\n${cleared('S-a')}`)
      expect(edited).not.toBe(built)
      expect(problemsOf(LIST ?? '', withReadme(edited))).not.toEqual([])
    })

    it('reds the old registry sentence planted back', () => {
      const edited = `${built}\nAnything about the component registry, until components exist and have\n   been reviewed one by one.\n`
      expect(problemsOf(OLD_SENTENCE ?? '', withReadme(edited))).toEqual([
        'the old registry sentence is back',
      ])
    })

    it('reds P twice, P moved away from the Radix line, and P outside the bullet', () => {
      const twice = built.replace(cleared('P'), () => `${cleared('P')}\n${cleared('P')}`)
      expect(problemsOf(POINTER ?? '', withReadme(twice))[0]).toBe(
        'P is present 2 times, expected 1',
      )
      const apart = built.replace(
        `Radix has no Nave package yet.\n${cleared('P')}`,
        () => `Radix has no Nave package yet.\n  Another line.\n${cleared('P')}`,
      )
      expect(apart).not.toBe(built)
      expect(problemsOf(POINTER ?? '', withReadme(apart))).toEqual([
        'P does not directly follow the line ending "Radix has no Nave package yet."',
      ])
      const outside = `${built.replace(cleared('P'), () => '')}\n${cleared('P')}\n`.replace(
        'package yet.\n\n',
        () => 'package yet.\n',
      )
      expect(problemsOf(POINTER ?? '', withReadme(outside))).not.toEqual([])
    })
  })
})
