/**
 * AC-consumer-constraints-05: exercises the packed `nave.css-data.json` through the real editor
 * tooling it is written for (`vscode-css-languageservice`), never the generator's in-memory
 * output — a reader loads the FILE, and only the packed tarball's copy is what a consumer's
 * editor would ever see (`test/helpers/pack-core.ts`, never the working-tree copy).
 */
import { describe, expect, it } from 'vitest'
// `vscode-css-languageservice` ships CommonJS at its `main` entry; Vitest's Vite-based resolver
// follows `module`/`exports` to the real ESM build, where these ARE named exports — but typing
// the import as a default+destructure, as plain Node's ESM loader would require for the CJS
// entry, keeps this file correct under either resolution.
import cssLanguageService from 'vscode-css-languageservice'

import { packCoreTarball } from './helpers/pack-core.ts'

const { getCSSLanguageService, newCSSDataProvider, TextDocument } = cssLanguageService

function readPackedCssData(): unknown {
  return JSON.parse(packCoreTarball().read('package/nave.css-data.json'))
}

describe('AC-consumer-constraints-05: the packed file is what it claims to an editor', () => {
  it('silences the unknown-at-rule diagnostic for @nave, and only with the file loaded', () => {
    const withData = getCSSLanguageService({
      customDataProviders: [newCSSDataProvider(readPackedCssData() as never)],
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
      customDataProviders: [newCSSDataProvider(readPackedCssData() as never)],
    })
    const text = '.card { @nvae interactive; }'
    const doc = TextDocument.create('test://test/misspelt.css', 'css', 1, text)
    const diagnostics = withData.doValidation(doc, withData.parseStylesheet(doc))
    expect(
      diagnostics.some((d) => d.code === 'unknownAtRules' && d.message.includes('@nvae')),
    ).toBe(true)
  })

  it('hovering @nave returns the file’s own description', () => {
    const packed = readPackedCssData() as { atDirectives: Array<{ description: string }> }
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
    // The language service renders the description as markdown, backslash-escaping metacharacters
    // (`.`, `-`, backticks' surrounding punctuation, …); undoing that one-for-one escape recovers
    // the source text exactly, which is the property AC-05 asks for ("content containing the
    // description of the file's @nave entry"), never a rendering the file's own bytes.
    expect(content.replace(/\\(.)/g, '$1')).toContain(packed.atDirectives[0]!.description)
  })

  it('completion immediately after "@nave " suggests no built-in atom name', () => {
    const withData = getCSSLanguageService({
      customDataProviders: [newCSSDataProvider(readPackedCssData() as never)],
    })
    const text = '.card { @nave interactive; }'
    const doc = TextDocument.create('test://test/complete.css', 'css', 1, text)
    const stylesheet = withData.parseStylesheet(doc)
    const completions = withData.doComplete(
      doc,
      doc.positionAt(text.indexOf('@nave ') + 6),
      stylesheet,
    )
    expect(completions.items.some((item) => item.label === 'interactive')).toBe(false)
  })
})
