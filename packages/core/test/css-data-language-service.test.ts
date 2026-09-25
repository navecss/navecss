/**
 * AC-consumer-constraints-05: exercises the packed `nave.css-data.json` through the real editor
 * tooling it is written for (`vscode-css-languageservice`), never the generator's in-memory
 * output — a reader loads the FILE, and only the packed tarball's copy is what a consumer's
 * editor would ever see (`test/helpers/pack-core.ts`, never the working-tree copy).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getCSSLanguageService, newCSSDataProvider, TextDocument } from 'vscode-css-languageservice'

import { readSections } from '../scripts/generate-atoms-doc.ts'
import { atoms } from '../src/atoms.ts'
import { packCoreTarball } from './helpers/pack-core.ts'

interface PackedCssData {
  atDirectives: Array<{ description: { kind: string; value: string } }>
}

function readPackedCssData(): PackedCssData {
  return JSON.parse(packCoreTarball().read('package/nave.css-data.json')) as PackedCssData
}

describe('AC-consumer-constraints-05: the packed file is what it claims to an editor', () => {
  // Packing is one real `npm pack` plus two `tar` spawns; every test below wants the SAME
  // tarball, so it is read once here rather than once per `it()` (which is what pushed
  // `ci:check` past vitest's 5s default under load).
  let packed: PackedCssData

  beforeAll(() => {
    packed = readPackedCssData()
  }, 120_000)

  it('silences the unknown-at-rule diagnostic for @nave, and only with the file loaded', () => {
    const withData = getCSSLanguageService({
      customDataProviders: [newCSSDataProvider(packed as never)],
    })
    const withoutData = getCSSLanguageService()

    const text = '.card { @nave interactive; }'
    const doc = TextDocument.create('test://test/with.css', 'css', 1, text)

    const diagnosticsWithData = withData.doValidation(doc, withData.parseStylesheet(doc))
    expect(diagnosticsWithData.some((d) => d.code === 'unknownAtRules')).toBe(false)

    // The control: the default provider alone DOES report it, proving the file does the work.
    const diagnosticsWithoutData = withoutData.doValidation(doc, withoutData.parseStylesheet(doc))
    expect(
      diagnosticsWithoutData.some(
        (d) => d.code === 'unknownAtRules' && d.message.includes('@nave'),
      ),
    ).toBe(true)
  })

  it('still reports a misspelt at-rule naming it', () => {
    const withData = getCSSLanguageService({
      customDataProviders: [newCSSDataProvider(packed as never)],
    })
    const text = '.card { @nvae interactive; }'
    const doc = TextDocument.create('test://test/misspelt.css', 'css', 1, text)
    const diagnostics = withData.doValidation(doc, withData.parseStylesheet(doc))
    expect(
      diagnostics.some((d) => d.code === 'unknownAtRules' && d.message.includes('@nvae')),
    ).toBe(true)
  })

  it('hovering @nave returns the file’s own description, exactly', () => {
    const withData = getCSSLanguageService({
      customDataProviders: [newCSSDataProvider(packed as never)],
    })
    const text = '.card { @nave interactive; }'
    const doc = TextDocument.create('test://test/hover.css', 'css', 1, text)
    const stylesheet = withData.parseStylesheet(doc)
    const hover = withData.doHover(doc, doc.positionAt(text.indexOf('@nave') + 2), stylesheet)
    expect(hover).not.toBeNull()
    const content =
      typeof hover!.contents === 'string'
        ? hover!.contents
        : (hover!.contents as { value: string }).value
    // The description is now shipped as markdown (`kind: 'markdown'`), so the language service
    // returns it verbatim rather than escaping it as plain text: exact equality is the property
    // AC-05 asks for, and it is a stronger assertion than the old unescape-and-contain check.
    expect(content).toBe(packed.atDirectives[0]!.description.value)
  })

  it('the hover value carries no backslash-escaped backtick, and one section line per readSections() section', () => {
    const value = packed.atDirectives[0]!.description.value
    expect(value).not.toMatch(/\\`/)
    const sectionLines = value.split('\n').filter((line) => line.startsWith('- **'))
    expect(sectionLines).toHaveLength(readSections().size)
  })

  it('completion immediately after "@nave " suggests no built-in atom name', () => {
    const withData = getCSSLanguageService({
      customDataProviders: [newCSSDataProvider(packed as never)],
    })
    const text = '.card { @nave interactive; }'
    const doc = TextDocument.create('test://test/complete.css', 'css', 1, text)
    const stylesheet = withData.parseStylesheet(doc)
    const completions = withData.doComplete(
      doc,
      doc.positionAt(text.indexOf('@nave ') + 6),
      stylesheet,
    )
    const atomNames = new Set(Object.keys(atoms))
    expect(completions.items.some((item) => atomNames.has(item.label))).toBe(false)
  })
})
