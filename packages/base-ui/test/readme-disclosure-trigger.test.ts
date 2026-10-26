import { describe, expect, it } from 'vitest'

import { FIXED_SENTENCES, proseOf, readReadme, sha256 } from './support/readme.ts'

// The paragraph the README carried while a disabled Accordion or Collapsible trigger kept the
// colour and cursor of an enabled one on Base UI 1.9.0. The stylesheet now paints that trigger
// disabled, so the paragraph is withdrawn and must not come back.
const WITHDRAWN_PARAGRAPH =
  'In Base UI 1.9.0, outside a Toolbar, `Tabs.List`, Radio Group, Toggle Group, Menubar or Navigation Menu, a disabled `Accordion.Trigger` or `Collapsible.Trigger` that renders a `<button>`, as it does by default, is marked with the `disabled` attribute and not `aria-disabled`, so it keeps the colour and pointer cursor of an enabled trigger; if you disable one, style its `:disabled` state yourself.'
const WITHDRAWN_PREFIX = '9493767cfc25613f'

// A paragraph that names a disclosure trigger and tells the reader it keeps an enabled trigger's
// look or that they must style its `:disabled` state.
const isTellingReaderToStyleDisabled = (paragraph: string): boolean =>
  /(?:Accordion|Collapsible)\.Trigger/.test(paragraph) &&
  (paragraph.includes('`:disabled`') || /keeps the colou?r/.test(paragraph))

const offendingParagraphs = (markdown: string): string[] =>
  proseOf(markdown)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => isTellingReaderToStyleDisabled(paragraph))

describe('AC-base-ui-bridge-55: the README no longer tells a consumer to style a disabled trigger themselves', () => {
  it('has no paragraph saying a disabled disclosure trigger keeps an enabled look or needs :disabled styling', () => {
    expect(offendingParagraphs(readReadme())).toEqual([])
  })

  it('pins no sentence about the disclosure trigger on 1.9.0', () => {
    expect(
      FIXED_SENTENCES.filter(
        (sentence) =>
          sentence.prefix === WITHDRAWN_PREFIX || /disclosure trigger/i.test(sentence.name),
      ),
    ).toEqual([])
  })

  it('reds on the withdrawn paragraph planted back (the control)', () => {
    expect(sha256(WITHDRAWN_PARAGRAPH).slice(0, 16)).toBe(WITHDRAWN_PREFIX)
    expect(Buffer.byteLength(WITHDRAWN_PARAGRAPH)).toBe(398)
    const without = readReadme().replace(`${WITHDRAWN_PARAGRAPH}\n\n`, '')
    expect(offendingParagraphs(without)).toEqual([])
    expect(offendingParagraphs(`${without}\n${WITHDRAWN_PARAGRAPH}\n`)).toEqual([
      WITHDRAWN_PARAGRAPH,
    ])
  })
})
