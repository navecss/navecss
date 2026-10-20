import { describe, expect, it } from 'vitest'

import { cleared } from './support/registry/cleared.ts'
import {
  cloneRegistry,
  type LoadedRegistry,
  loadRegistry,
  type RegistryItem,
} from './support/registry/load.ts'
import { buildWithPeers } from './support/registry/strings-build.ts'
import { floorsOf, floorWords } from './support/registry/strings-floors.ts'
import { documentStrings } from './support/registry/strings-sources.ts'
import {
  componentNameOf,
  docsFolderProblems,
  exportNameOf,
  type ManifestFacts,
  templateProblems,
} from './support/registry/strings-templates.ts'
import { itemsOf, readHead } from './support/registry/strings-text.ts'
import {
  copiedCommentStrings,
  cssCommentTexts,
  exemptions,
  imageProblems,
  type LabeledString,
  registryStrings,
  shadcnNameProblems,
  tripwireLines,
  tripwireProblems,
  tsCommentTexts,
} from './support/registry/strings-tripwire.ts'
import { manifestOf, styledSubpaths } from './support/registry/styled-subpaths.ts'

const registry = (): LoadedRegistry => loadRegistry()

const byCodeUnit = (a: string, b: string): number => {
  if (a === b) return 0
  return a < b ? -1 : 1
}

const firstItem = (loaded: LoadedRegistry): RegistryItem => {
  const item = loaded.items.get('base-ui-dialog') ?? loaded.items.values().toArray()[0]
  if (item === undefined) throw new Error('the registry holds no item')
  return item
}

const manifestFacts = (): ManifestFacts => {
  const { peerDependencies, version } = manifestOf()
  return { peerDependencies, version }
}

const CLI_SOURCE_PATH = 'packages/cli/src/index.ts'

const tripwireOverRegistry = (loaded: LoadedRegistry): string[] =>
  tripwireProblems(registryStrings(loaded))

/**
 * One string per line of the list, each matched by that line and by no exemption, planted in a
 * description to show the line reds the run.
 */
const PLANTS: Readonly<Record<string, string>> = {
  '\\beject': 'eject the component',
  '\\bown(?:s|ed|er|ers|ership)?\\b': 'you keep ownership',
  'licen[cs]': 'under a license',
  copyright: 'Copyright notice',
  '\\bMIT\\b': 'the MIT terms',
  '\\bSPDX\\b': 'an SPDX tag',
  '\\bnotice\\b': 'a notice travels',
  '\\battribution\\b': 'with attribution',
  '\\bwarrant': 'no warranty',
  '\\brights\\b': 'all rights granted',
  '\\bpatent': 'a patent grant',
  'trade ?mark': 'a trademark',
  '[©®™]': 'Nave ©',
  '\\bMUI\\b': 'by MUI',
  'material[- ]?ui': 'like Material UI',
  '\\bvercel\\b': 'hosted on Vercel',
  'shadcn/ui': 'unlike shadcn/ui',
  '\\baffiliat': 'an affiliated project',
  '\\bendors': 'endorsed by Base UI',
  '\\bsponsor': 'sponsored work',
  '\\bofficial': 'the official copy',
  '\\bpartner': 'a partner project',
  '\\bcertif': 'a certified build',
  accessib: 'an accessible dialog',
  a11y: 'good a11y',
  WCAG: 'meets WCAG',
  'success criterion': 'each success criterion',
  '\\bSC \\d': 'passes SC 2',
  conform: 'full conformance',
  'screen reader': 'a screen reader announces it',
  'focus ring': 'keeps the focus ring',
  'reduced motion': 'honours reduced motion',
  'reduced-motion': 'a reduced-motion guard',
  'prefers-reduced': 'under prefers-reduced-motion',
  '\\bARIA\\b': 'adds ARIA roles',
  keyboard: 'works by keyboard',
  assistive: 'assistive technology',
}

const withDescription = (loaded: LoadedRegistry, addition: string): LoadedRegistry => {
  const clone = cloneRegistry(loaded)
  const item = firstItem(clone)
  item.description = `${item.description} ${addition}`
  return clone
}

const withFileContent = (
  loaded: LoadedRegistry,
  base: string,
  edit: (content: string) => string,
): LoadedRegistry => {
  const clone = cloneRegistry(loaded)
  const item = firstItem(clone)
  const file = item.files.find((candidate) => candidate.target.endsWith(base))
  if (file?.content === undefined) throw new Error(`${item.name} has no file ending ${base}`)
  file.content = edit(file.content)
  return clone
}

describe('AC-base-ui-registry-17: registry-facing strings are the cleared templates, and pass the tripwire list', () => {
  describe('the floors', () => {
    it('words the three range shapes at the ranges of the base release', () => {
      const floors = floorsOf({
        '@base-ui/react': '^1.3.0',
        '@navecss/tokens': '>=0.4.0 <1.0.0',
        react: '^18 || ^19',
        'react-dom': '^18 || ^19',
      })
      expect(floors).toEqual({
        baseUi: '1.3 or later in the 1.x line',
        react: '18 or 19',
        tokens: '0.4.0 or later before 1.0',
      })
    })

    it('words the manifest peer ranges, each of them non-empty', () => {
      const floors = floorsOf(manifestOf().peerDependencies)
      expect(Object.values(floors).every((words) => words !== '')).toBe(true)
    })

    it('has no words for a range outside the three shapes', () => {
      expect(() => floorWords('>=1.3.0 <1.5.0 || 2.x')).toThrow('>=1.3.0 <1.5.0 || 2.x')
    })
  })

  describe('the templates', () => {
    it('derives the display and export names from the subpath, and finds styled subpaths to fill', () => {
      expect(styledSubpaths().length).toBeGreaterThan(0)
      expect(componentNameOf('alert-dialog')).toBe('Alert Dialog')
      expect(exportNameOf('alert-dialog')).toBe('AlertDialog')
      expect(exportNameOf('button')).toBe('Button')
    })

    it("has every item's title, description and docs equal to the templates with only their slots filled", () => {
      const subpaths = styledSubpaths()
      expect(subpaths.length).toBeGreaterThan(0)
      expect(templateProblems(registry(), subpaths, manifestFacts())).toEqual([])
    })

    it('has no docs message that names a folder', () => {
      expect(registry().items.size).toBeGreaterThan(0)
      expect(docsFolderProblems(registry())).toEqual([])
    })

    it('reds a description with one word changed, naming the item and the field', () => {
      const clone = cloneRegistry(registry())
      const item = firstItem(clone)
      item.description = item.description.replace('styling', 'styles')
      expect(templateProblems(clone, styledSubpaths(), manifestFacts())).toEqual([
        `${item.name} description is not the filled template`,
      ])
    })

    it('reds a docs message with a floor worded differently', () => {
      const clone = cloneRegistry(registry())
      const item = firstItem(clone)
      item.docs = item.docs.replace('18 or 19', '18 and 19')
      expect(templateProblems(clone, styledSubpaths(), manifestFacts())).toEqual([
        `${item.name} docs is not the filled template`,
      ])
    })

    it('reds a docs message that names a folder', () => {
      const clone = cloneRegistry(registry())
      const item = firstItem(clone)
      item.docs = `${item.docs}\nIt lands in components/nave.`
      expect(docsFolderProblems(clone)).toEqual([`${item.name} docs names components/nave`])
    })

    it('reds an item that is missing for a styled subpath', () => {
      const clone = cloneRegistry(registry())
      clone.items.delete('base-ui-dialog')
      expect(templateProblems(clone, styledSubpaths(), manifestFacts())).toContain(
        'base-ui-dialog: no item',
      )
    })
  })

  describe('the tripwire', () => {
    it('reads a list of 37 lines or more, each compiling as a regular expression', () => {
      const lines = tripwireLines()
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) expect(() => new RegExp(line, 'i')).not.toThrow()
    })

    it('has a planted control for every line of the list, and the plant matches its line', () => {
      const lines = tripwireLines()
      expect(Object.keys(PLANTS).toSorted(byCodeUnit)).toEqual(lines.toSorted(byCodeUnit))
      for (const line of lines) {
        const plant = PLANTS[line] ?? ''
        expect(new RegExp(line, 'i').test(plant), line).toBe(true)
        expect(tripwireProblems([{ label: 'plant', text: plant }])).not.toEqual([])
      }
    })

    it('passes the item strings, the index strings and the comments of the copied files', () => {
      const loaded = registry()
      const strings = registryStrings(loaded)
      expect(loaded.items.size).toBeGreaterThan(0)
      expect(copiedCommentStrings(loaded).length).toBeGreaterThan(0)
      expect(strings.length).toBeGreaterThan(loaded.items.size)
      expect(tripwireOverRegistry(loaded)).toEqual([])
    })

    it('reads the lint comment of every parts file among the comments it runs over, and it passes', () => {
      const reason =
        'the types keep the names and generic defaults @navecss/base-ui exports, so code typed against the package compiles here unchanged'
      const loaded = registry()
      const comments = copiedCommentStrings(loaded)
      const parts = itemsOf(loaded).flatMap((item) =>
        item.files.filter((file) => file.target.endsWith('.parts.ts')).map(() => item.name),
      )
      expect(parts.length).toBeGreaterThan(0)
      for (const name of parts) {
        const lint = comments.filter(
          ({ label, text }) =>
            label.startsWith(`${name} `) &&
            label.includes('.parts.ts') &&
            text.startsWith('eslint-disable @typescript-eslint/no-namespace') &&
            text.endsWith(`-- ${reason}`),
        )
        expect(lint, name).toHaveLength(1)
        expect(tripwireProblems(lint)).toEqual([])
      }
    })

    it('passes the README section, the ladder step, and the CLI lines as the repository has them', () => {
      const strings = documentStrings(readHead(CLI_SOURCE_PATH))
      expect(strings.length).toBeGreaterThan(4)
      expect(tripwireProblems(strings)).toEqual([])
    })

    it.each(Object.entries(PLANTS))(
      'reds a description carrying the plant for /%s/, naming the line',
      (line, plant) => {
        const problems = tripwireOverRegistry(withDescription(registry(), plant))
        expect(problems.filter((problem) => problem.includes(`/${line}/i`))).not.toEqual([])
        expect(problems.every((problem) => problem.includes('description'))).toBe(true)
      },
    )

    it('reds "ownership" planted in one description', () => {
      const clone = withDescription(registry(), 'ownership')
      expect(tripwireOverRegistry(clone).join('\n')).toContain(
        `${firstItem(clone).name} description`,
      )
    })

    it('reds "eject" planted in one docs message', () => {
      const clone = cloneRegistry(registry())
      const item = firstItem(clone)
      item.docs = `${item.docs}\neject it`
      expect(tripwireOverRegistry(clone).join('\n')).toContain(`${item.name} docs matches`)
    })

    it('reds a planted word in a meta value and in the index', () => {
      const clone = cloneRegistry(registry())
      const item = firstItem(clone)
      item.meta = { ...item.meta, version: '0.3.0 certified' }
      clone.index.homepage = `${clone.index.homepage ?? ''} official`
      const problems = tripwireOverRegistry(clone)
      expect(problems.join('\n')).toContain(`${item.name} meta.version`)
      expect(problems.join('\n')).toContain('registry.json.homepage')
    })

    it('reds a comment planted in the TypeScript and in the stylesheet of a copy', () => {
      const loaded = registry()
      const inTs = withFileContent(
        loaded,
        '.parts.ts',
        (content) => `${content}\n// keyboard use\n`,
      )
      const inCss = withFileContent(
        loaded,
        '.module.css',
        (content) => `${content}\n/* ARIA roles */\n`,
      )
      expect(tripwireOverRegistry(inTs).join('\n')).toContain('.parts.ts comment')
      expect(tripwireOverRegistry(inCss).join('\n')).toContain('.module.css comment')
    })

    it('reads line and block comments out of a source, and none out of a string', () => {
      const source = [
        '// first',
        "const url = 'https://not-a-comment.example' // trailing",
        '/* block',
        ' * second line',
        ' */',
        'export {}',
      ].join('\n')
      expect(tsCommentTexts(source)).toEqual(['first', 'trailing', 'block\nsecond line'])
      expect(cssCommentTexts('/* one */\n.a { color: red }\n/* two */')).toEqual(['one', 'two'])
    })

    it('replaces the exemptions by a space, and only them', () => {
      const exempt: LabeledString[] = exemptions().map((text) => ({ label: text, text }))
      expect(exempt).toHaveLength(4)
      expect(tripwireProblems(exempt)).toEqual([])
      expect(tripwireProblems([{ label: 'own', text: "the consumer's own style" }])).not.toEqual([])
      expect(tripwireProblems([{ label: 'file', text: 'NAVECSS-LICENSE license' }])).not.toEqual([])
    })
  })

  describe('names and images', () => {
    it('has no "shadcn" in an item name, file path or target, or in the index name or its entries', () => {
      expect(registry().items.size).toBeGreaterThan(0)
      expect(shadcnNameProblems(registry())).toEqual([])
    })

    it('reds a target renamed shadcn-nave.ts', () => {
      const clone = cloneRegistry(registry())
      const item = firstItem(clone)
      const file = item.files[0]
      if (file === undefined) throw new Error(`${item.name} has no file`)
      file.target = 'components/nave/shadcn-nave.ts'
      expect(shadcnNameProblems(clone)).toEqual([
        `${item.name} target: components/nave/shadcn-nave.ts`,
      ])
    })

    it('has no image in an item, the index or a meta value', () => {
      expect(imageProblems(registry())).toEqual([])
    })

    it.each([
      ['an .svg reference in a description', '.svg'],
      ['a .png reference in a description', 'logo.png'],
      ['a data:image URL in a description', 'data:image/gif;base64,AA'],
      ['an <svg element in a description', '<svg></svg>'],
    ])('reds %s', (_name, addition) => {
      const clone = withDescription(registry(), addition)
      expect(imageProblems(clone)).toContain(`${firstItem(clone).name}.description`)
    })
  })

  describe('a range the build cannot word', () => {
    const UNWORDABLE = '>=1.3.0 <1.5.0 || 2.x'

    it('builds the unmodified copy, so a refusal is the range', { timeout: 200_000 }, () => {
      const run = buildWithPeers({})
      expect(run.output).not.toContain('Cannot find module')
      expect(run.status).toBe(0)
      expect(run.items.length).toBeGreaterThan(0)
    })

    it('exits non-zero naming the range and writes no item', { timeout: 200_000 }, () => {
      const run = buildWithPeers({ '@base-ui/react': UNWORDABLE })
      expect(run.status).not.toBe(0)
      expect(run.output).toContain(UNWORDABLE)
      expect(run.items).toEqual([])
    })
  })

  it('reads the tripwire list as cleared, not from a copy of its own', () => {
    expect(cleared('W-list').split('\n')).toEqual(tripwireLines())
  })
})
