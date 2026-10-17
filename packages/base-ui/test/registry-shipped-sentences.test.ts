import { describe, expect, it } from 'vitest'

import { shippedFilesBuiltFrom } from './support/registry/strings-shipped-built.ts'
import {
  adr0010Problems,
  layersUnchangedProblems,
  registryUpdateOf,
  SHIPPED_CHECKS,
  type ShippedFiles,
  shippedFilesFrom,
  STALE_PHRASES,
  staleSentenceProblems,
} from './support/registry/strings-shipped.ts'
import { readAtBase, readHead } from './support/registry/strings-text.ts'

const RELEASE_DOCS_TEST = 'packages/base-ui/test/release-docs.test.ts'
const RELEASE_DOCS_SUPPORT = 'packages/base-ui/test/support/w12-release.ts'

const checkNames = Object.keys(SHIPPED_CHECKS)

const withText = (
  files: ShippedFiles,
  key: keyof ShippedFiles,
  edit: (text: string) => string,
): ShippedFiles => ({
  ...files,
  [key]: edit(files[key]),
})

describe('AC-base-ui-registry-30: every shipped sentence the registry makes false changes in the same pull request', () => {
  const base = shippedFilesFrom(readAtBase)

  describe('the files as they stand', () => {
    it.each(checkNames)('holds: %s', (name) => {
      const files = shippedFilesFrom(readHead)
      expect(SHIPPED_CHECKS[name]?.check(files, base)).toEqual([])
    })

    it('leaves the AC-base-ui-bridge-49 rows unedited', () => {
      expect(readHead(RELEASE_DOCS_TEST)).toBe(readAtBase(RELEASE_DOCS_TEST))
      expect(readHead(RELEASE_DOCS_SUPPORT)).toBe(readAtBase(RELEASE_DOCS_SUPPORT))
    })
  })

  describe('the same checks, fed each line as it stands at the base branch', () => {
    const redChecks = checkNames.filter((name) => SHIPPED_CHECKS[name]?.redsAtBase === true)

    it('has checks that the base branch reds', () => {
      expect(redChecks.length).toBeGreaterThan(0)
    })

    it.each(redChecks)('reds: %s', (name) => {
      expect(SHIPPED_CHECKS[name]?.check(base, base)).not.toEqual([])
    })

    it("finds each of the four stale sentences in the base branch's files, naming the file", () => {
      const problems = staleSentenceProblems(base)
      expect(problems).toHaveLength(STALE_PHRASES.length + 1)
      for (const phrase of STALE_PHRASES) {
        expect(problems.some((problem) => problem.includes(`"${phrase}"`))).toBe(true)
      }
    })

    it('finds the eject help line, the old add help line and the old NOT_YET separately', () => {
      expect(SHIPPED_CHECKS['no help line names eject']?.check(base, base)).toHaveLength(1)
      expect(SHIPPED_CHECKS['the add help line is C-add-help']?.check(base, base)).toHaveLength(1)
      expect(SHIPPED_CHECKS['NOT_YET is C-notyet']?.check(base, base)).toHaveLength(1)
    })
  })

  describe('the checks, run over files the cleared blocks describe', () => {
    const built = shippedFilesBuiltFrom(base)

    it('changes the base files only in the lines the blocks replace', () => {
      expect(built.cli).not.toBe(base.cli)
      expect(built.claude).not.toBe(base.claude)
      expect(built.docsIndex).not.toBe(base.docsIndex)
      expect(built.techIndex).not.toBe(base.techIndex)
      expect(built.adr0003).toBe(base.adr0003)
    })

    it.each(checkNames.filter((name) => !name.startsWith('ADR 0')))('accepts them: %s', (name) => {
      expect(SHIPPED_CHECKS[name]?.check(built, base)).toEqual([])
    })

    const ONE_WORD_EDITS = [
      {
        check: 'the CLI header carries C-doc in place of lines 4 and 5',
        file: 'cli',
        present: 'every command is a stub',
        replacement: 'every command is stub',
        what: 'the CLI header',
      },
      {
        check: 'NOT_YET is C-notyet',
        file: 'cli',
        present: 'are copied with shadcn',
        replacement: 'are copied by shadcn',
        what: 'NOT_YET',
      },
      {
        check: 'the add help line is C-add-help',
        file: 'cli',
        present: 'Not implemented: see',
        replacement: 'Not implemented; see',
        what: 'the add help line',
      },
      {
        check: 'CLAUDE.md has D-claude42',
        file: 'claude',
        present: 'unpublished and not implemented',
        replacement: 'unpublished and unimplemented',
        what: 'the CLAUDE.md line',
      },
      {
        check: 'docs/index.md lines 47 and 23 are D-index47 and D-index23',
        file: 'docsIndex',
        present: 'and its registry.',
        replacement: 'and its registries.',
        what: 'docs/index.md line 23',
      },
      {
        check: 'docs/index.md lines 47 and 23 are D-index47 and D-index23',
        file: 'docsIndex',
        present: 'Its commands are stubs.',
        replacement: 'Its commands are stub.',
        what: 'docs/index.md line 47',
      },
      {
        check: 'docs/03-tech-docs/index.md line 12 is D-tech12',
        file: 'techIndex',
        present: 'The Base UI registry',
        replacement: 'The Base UI registries',
        what: 'docs/03-tech-docs/index.md line 12',
      },
    ] as const

    it.each(ONE_WORD_EDITS)(
      'reds one word changed in $what',
      ({ check, file, present, replacement }) => {
        const edited = withText(built, file, (text) => text.replace(present, () => replacement))
        expect(edited[file]).not.toBe(built[file])
        expect(SHIPPED_CHECKS[check]?.check(edited, base)).not.toEqual([])
      },
    )

    it('reds a help line that names eject', () => {
      const edited = withText(built, 'cli', (text) =>
        text.replace('    init ', () => '    eject           Export it\n    init '),
      )
      expect(SHIPPED_CHECKS['no help line names eject']?.check(edited, base)).toHaveLength(1)
    })

    it('reds a stale sentence put back into each file', () => {
      for (const key of [
        'cli',
        'claude',
        'docsIndex',
        'techIndex',
        'adr0003',
        'adr0010',
      ] as const) {
        const edited = withText(built, key, (text) => `${text}\n${STALE_PHRASES[0]}\n`)
        expect(
          SHIPPED_CHECKS['no file still holds a stale sentence']?.check(edited, base),
        ).toHaveLength(1)
      }
      expect(staleSentenceProblems(built)).toEqual([])
    })
  })

  describe('the ADR checks, run over text with one thing changed', () => {
    const updateText = [
      '## Update: the registry exists',
      '',
      'The registry is generated from the package source by generate-registry and served by jsDelivr',
      'at an exact version, and it ships in dist/registry. Decision: a copy scopes its class names',
      'with CSS Modules, a bundler convention, because no standard isolates class names per file;',
      'a host without CSS Modules uses the package.',
      '',
    ].join('\n')
    const withUpdate = (): ShippedFiles =>
      withText(base, 'adr0010', (adr) =>
        adr.replace('## Consequences', () => `${updateText}\n## Consequences`),
      )

    it('accepts an Update section that says each thing, as a control for the clause', () => {
      expect(adr0010Problems(withUpdate())).toEqual([])
    })

    it('finds the section it reads, and not the text after the next heading', () => {
      const update = registryUpdateOf(withUpdate().adr0010)
      expect(update).toContain('## Update:')
      expect(update).not.toContain('## Consequences')
    })

    it.each([
      ['ownership', 'The registry gives ownership of a copy.'],
      ['own', 'Teams can own a copy.'],
      ['eject', 'This is the eject path.'],
    ])('reds the word "%s" in the Update section', (_word, sentence) => {
      const files = withText(withUpdate(), 'adr0010', (adr) =>
        adr.replace('## Consequences', () => `${sentence}\n\n## Consequences`),
      )
      expect(
        adr0010Problems(files).filter((problem) => problem.includes('uses the word')),
      ).toHaveLength(1)
    })

    it('does not read a word outside the Update section', () => {
      const files = withText(withUpdate(), 'adr0010', (adr) => `${adr}\nA team can own it.\n`)
      expect(adr0010Problems(files)).toEqual([])
    })

    it.each([
      ['the reason', 'because no standard isolates class names per file', 'because it is simpler'],
      ['where it is served', 'served by jsDelivr', 'served somewhere'],
      ['the fallback', 'a host without CSS Modules uses the package', 'a host does what it likes'],
    ])('reds an Update section without %s', (_what, present, replacement) => {
      const files = withText(withUpdate(), 'adr0010', (adr) =>
        adr.replace(present, () => replacement),
      )
      expect(files.adr0010).not.toBe(withUpdate().adr0010)
      expect(adr0010Problems(files)).not.toEqual([])
    })

    it('accepts a row and a precondition paragraph that name the copy, and reds the row alone and the paragraph alone', () => {
      const files = withText(base, 'adr0003', (adr) =>
        adr
          .replace('| the consumer       |', () => '| the consumer, or a registry copy |')
          .replace(
            '**3. The consumer',
            () =>
              "A registry copy opens its module with the header, then Nave's order statement.\n\n**3. The consumer",
          ),
      )
      expect(files.adr0003).not.toBe(base.adr0003)
      expect(
        SHIPPED_CHECKS['ADR 0003 names the copy in its row and its precondition']?.check(
          files,
          base,
        ),
      ).toEqual([])
      const rowOnly = withText(files, 'adr0003', (adr) =>
        adr.replace(
          "A registry copy opens its module with the header, then Nave's order statement.\n\n",
          () => '',
        ),
      )
      expect(
        SHIPPED_CHECKS['ADR 0003 names the copy in its row and its precondition']?.check(
          rowOnly,
          base,
        ),
      ).toEqual([
        'the precondition paragraph does not name a registry copy',
        'the precondition paragraph does not name the header',
      ])
    })
  })

  describe('the layer order and names, run over text with one thing changed', () => {
    it("accepts the base branch's files, which read non-empty layers", () => {
      expect(layersUnchangedProblems(base, base)).toEqual([])
    })

    it('reds two layer names swapped in the order statement', () => {
      const files = withText(base, 'adr0003', (adr) =>
        adr.replace('reset, atomic,', () => 'atomic, reset,'),
      )
      expect(files.adr0003).not.toBe(base.adr0003)
      expect(layersUnchangedProblems(files, base)).toEqual(['ADR 0003 states a different order'])
    })

    it('reds a layer row renamed and a changed core layers file', () => {
      const renamed = withText(base, 'adr0003', (adr) =>
        adr.replace('| `overrides`', () => '| `exceptions`'),
      )
      expect(layersUnchangedProblems(renamed, base)).toEqual([
        'ADR 0003 names the layers differently',
      ])
      const core = withText(base, 'coreLayers', (css) =>
        css.replace('overrides', () => 'exceptions'),
      )
      expect(layersUnchangedProblems(core, base)).toEqual(['@navecss/core layers.css differs'])
    })
  })
})
