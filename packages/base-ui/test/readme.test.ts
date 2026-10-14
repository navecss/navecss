import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { COLOR_KEYWORDS } from './support/colors.ts'
import { manifest } from './support/dist.ts'
import {
  fencesOf,
  FIXED_SENTENCES,
  PROMISE_SENTENCE,
  proseOf,
  readReadme,
  sha256,
  WITHDRAWN,
} from './support/readme.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'
import {
  documentFiles,
  fencesWithLines,
  inputPlacements,
  isInsidePopup,
  misplacedInputs,
  misplacedInputsInFile,
  misplacedInputsInRepository,
} from './support/w9-jsx.ts'
import {
  hasSentenceWith,
  NOT_PAINTED,
  notPaintedFor,
  notPaintedIn,
  notPaintedParagraph,
  sentencesOf,
  WITHDRAWN_NOT_PAINTED,
} from './support/w9-readme-items.ts'
import {
  ALL_LITERALS,
  composeSentence4,
  REDUCED_MOTION_STATES,
  sentence4Code,
  sentenceProblems,
  sentencesAbsentFrom,
  sentencesPresentIn,
} from './support/w9-sentence-rules.ts'
import {
  PARENT_REDUCED_MOTION,
  SENTENCE_3_PREVIEW_CARD,
  SENTENCE_4_FORMS,
  SENTENCE_7_DIALOG_BACKDROP,
  SHIPPING,
} from './support/w9-sentences.ts'

const readme = readReadme()
const prose = proseOf(readme)
const fences = fencesOf(readme)

const rootReadme = readFileSync(path.join(PACKAGE_DIR, '../../README.md'), 'utf8')

const hasProseSentenceWith = (patterns: readonly RegExp[]): boolean =>
  hasSentenceWith(prose, patterns)

const importedFrom = (pattern: RegExp): string[] =>
  fences.flatMap(({ body }) =>
    body
      .matchAll(pattern)
      .map((match) => match[1] ?? '')
      .toArray(),
  )

describe('AC-base-ui-bridge-45: the README carries each item the release owes', () => {
  it('opens with a sentence that starts "NaveCSS" and says it styles Base UI\'s components', () => {
    const first = prose
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .find((paragraph) => paragraph !== '' && !paragraph.startsWith('#'))
    const sentence = sentencesOf(first ?? '')[0] ?? ''
    expect(sentence).toMatch(/^NaveCSS /)
    expect(sentence).toMatch(/styles Base UI's components/)
  })

  it('has a manifest description that starts "NaveCSS"', () => {
    const { description } = manifest() as unknown as { description: string }
    expect(description).toMatch(/^NaveCSS /)
  })

  it('says @base-ui/react is a separately installed peer from its own maintainers', () => {
    expect(
      hasProseSentenceWith([/`@base-ui\/react`/, /separately installed/, /peer/, /maintainers/]),
    ).toBe(true)
  })

  it('carries no image', () => {
    expect(prose).not.toMatch(/!\[|<img|<picture/i)
  })

  it('has an install command naming the package and its peers', () => {
    const commands = fences
      .filter(({ language }) => ['bash', 'sh', 'shell'].includes(language))
      .map(({ body }) => body)
    const peers = ['@navecss/base-ui', '@navecss/tokens', '@base-ui/react', 'react', 'react-dom']
    expect(commands.some((body) => peers.every((name) => body.split(/\s+/).includes(name)))).toBe(
      true,
    )
  })

  it('shows the prefix swap with one example: the same component imported from both', () => {
    const before = importedFrom(/from '@base-ui\/react\/([\w-]+)'/g)
    const after = new Set(importedFrom(/from '@navecss\/base-ui\/([\w-]+)'/g))
    expect(before.length).toBeGreaterThan(0)
    expect(before.some((component) => after.has(component))).toBe(true)
  })

  it('shows importing the tokens, then the stylesheet', () => {
    const fence = fences.find(
      ({ body }) =>
        body.includes('@navecss/tokens/css') && body.includes('@navecss/base-ui/styles.css'),
    )
    expect(fence).toBeDefined()
    expect(fence?.body.indexOf('@navecss/tokens/css')).toBeLessThan(
      fence?.body.indexOf('@navecss/base-ui/styles.css') ?? -1,
    )
  })

  it("holds the build.cssTarget line, byte for byte as the root README's quick start has it, in its own fence", () => {
    const line = rootReadme
      .split('\n')
      .find((candidate) => candidate.includes('build: { cssTarget'))
    expect(line).toBeDefined()
    expect(fences.some(({ body }) => body.trim() === line?.trim())).toBe(true)
  })

  it('gives the override ladder and says a consumer class wins in every state', () => {
    expect(prose).toMatch(/tokens/)
    expect(prose).toMatch(/`className`/)
    expect(prose).toMatch(/raw Base UI/i)
    expect(prose).toMatch(/wins in every state/)
    expect(prose).toMatch(/restyl\w* (?:a|that) property[^.]*every state/)
  })

  it('says to scope a token on the part or on :root, never on an ancestor of a portalled part', () => {
    expect(hasProseSentenceWith([/`:root`/, /ancestor/, /portal/])).toBe(true)
  })

  it('documents variant and size as props, with their values and defaults', () => {
    // The variant values the combined package adds, and the not-painted list, are `-39`'s.
    expect(prose).toMatch(/`variant`/)
    expect(prose).toMatch(/`size`/)
    // A value is written in code, bare or quoted as the props table quotes it.
    for (const value of ['secondary', 'primary', 'md', 'sm']) {
      expect(prose).toMatch(new RegExp(`\`'?${value}'?\``))
    }
    expect(prose).toMatch(/default/i)
  })

  it("says the trigger's last child turns when it is an svg, and to wrap a leading icon", () => {
    expect(hasProseSentenceWith([/last child/, /`svg`/, /turns/])).toBe(true)
    expect(hasProseSentenceWith([/leading icon/, /inside/, /element/])).toBe(true)
  })

  it('carries the Menu.LinkItem sentence', () => {
    const fixed = FIXED_SENTENCES.find((sentence) => sentence.name === 'Menu.LinkItem')
    expect(readme).toContain(fixed?.text)
  })

  it('says "zero-runtime styling" and never "zero runtime" unqualified', () => {
    expect(prose).toContain('zero-runtime styling')
    expect(readme).not.toMatch(/zero runtime/i)
    expect(readme).not.toMatch(/zero-runtime(?! styling)/i)
  })
})

describe('AC-base-ui-bridge-46: the fixed sentences are carried byte for byte', () => {
  it.each(FIXED_SENTENCES)(
    'holds the $name sentence at its length and hash',
    ({ bytes, prefix, text }) => {
      expect(Buffer.byteLength(text, 'utf8')).toBe(bytes)
      expect(sha256(text).startsWith(prefix)).toBe(true)
    },
  )

  it.each(FIXED_SENTENCES)('contains the $name sentence', ({ text }) => {
    expect(readme).toContain(text)
  })

  it('carries the non-affiliation line as its own paragraph', () => {
    const line = FIXED_SENTENCES.find((sentence) => sentence.name === 'non-affiliation')?.text
    expect(readme.split(/\n{2,}/).map((paragraph) => paragraph.trim())).toContain(line)
  })

  it('does not contain the withdrawn sentence', () => {
    expect(Buffer.byteLength(WITHDRAWN.text, 'utf8')).toBe(WITHDRAWN.bytes)
    expect(sha256(WITHDRAWN.text).startsWith(WITHDRAWN.prefix)).toBe(true)
    expect(readme).not.toContain(WITHDRAWN.text)
  })

  it('control: changing one word of the panel sentence reds containment', () => {
    const panel =
      FIXED_SENTENCES.find((sentence) => sentence.name === 'disclosure panel')?.text ?? ''
    expect(readme.replace(panel, () => panel.replace('Keep', 'Hold'))).not.toContain(panel)
  })

  it('control: editing a literal reds its hash', () => {
    const [first] = FIXED_SENTENCES
    const edited = first?.text.replace('Accordion', 'Accordions') ?? ''
    expect(sha256(edited).startsWith(first?.prefix ?? '')).toBe(false)
  })
})

const FORBIDDEN: readonly RegExp[] = [
  /accessib/i,
  /a11y/i,
  /WCAG/i,
  /success criterion/i,
  /\bSC \d/i,
  /conform/i,
  /screen reader/i,
  /focus ring/i,
  /reduced motion/i,
  /reduced-motion/i,
  /prefers-reduced/i,
]

/**
The sentences removed before the claims are scanned for: the first release's that are still carried,
the combined package's that are present in the shipping state, and the promise.
 */
const CLEARED: readonly string[] = [
  ...FIXED_SENTENCES.map(({ text }) => text),
  ...sentencesPresentIn(SHIPPING).map(({ text }) => text),
  PROMISE_SENTENCE,
]

const remainder = (text: string): string =>
  CLEARED.reduce((rest, sentence) => rest.replaceAll(sentence, ''), text)

const COLOUR_LITERAL =
  /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i

/**
Whether a fence names a colour by keyword in a declaration value: a named or system colour, or
`transparent`. `var()` references are removed first, since token names contain such words.
 */
const hasColourKeyword = (css: string): boolean =>
  css.matchAll(/[\w-]+\s*:\s*([^;{}]+)/g).some((match) =>
    (match[1] ?? '')
      .replaceAll(/var\([^()]*\)/g, '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((word) => word === 'transparent' || COLOR_KEYWORDS.has(word)),
  )

describe('AC-base-ui-overlay-completion-41: no accessibility claim beyond the cleared copy (extends AC-base-ui-bridge-47)', () => {
  it('contains none of the forbidden words once the fixed sentences are removed', () => {
    const rest = remainder(readme)
    expect(FORBIDDEN.filter((pattern) => pattern.test(rest)).map(String)).toEqual([])
  })

  it('control: a planted claim is reported', () => {
    const planted = `${remainder(CLEARED.join('\n'))}\nEvery part is accessible and meets WCAG.`
    expect(FORBIDDEN.filter((pattern) => pattern.test(planted))).toHaveLength(2)
  })

  it('control: a cleared sentence left in the text is what the removal takes out', () => {
    expect(FORBIDDEN.some((pattern) => pattern.test(CLEARED.join('\n')))).toBe(true)
    expect(FORBIDDEN.some((pattern) => pattern.test(remainder(CLEARED.join('\n'))))).toBe(false)
  })

  it('has no colour literal and no opacity declaration in any fence', () => {
    for (const { body } of fences) {
      expect(body).not.toMatch(COLOUR_LITERAL)
      expect(hasColourKeyword(body)).toBe(false)
      expect(body).not.toMatch(/\bopacity\s*:/)
    }
  })

  it('control: a planted colour and opacity are reported', () => {
    expect('a { color: #fff }').toMatch(COLOUR_LITERAL)
    expect('a { background: oklch(0.5 0 0) }').toMatch(COLOUR_LITERAL)
  })
})

describe('AC-base-ui-bridge-05: the README names no class, attribute or atom', () => {
  it('names no nave-base-ui- class, no data-nave- attribute and no baseUi atom', () => {
    expect(readme).not.toMatch(/nave-base-ui-/)
    expect(readme).not.toMatch(/data-nave-/)
    expect(readme).not.toMatch(/baseUi[A-Z]/)
  })
})

describe('AC-base-ui-bridge-19: the README needs no PostCSS on the consumer side', () => {
  it('configures no PostCSS plugin in any fence', () => {
    expect(fences.filter(({ body }) => /postcss/i.test(body))).toEqual([])
  })
})

describe('AC-base-ui-bridge-35: the README states no 44px target', () => {
  it('has no 44', () => {
    expect(readme).not.toMatch(/\b44\b/)
  })
})

const isScript = ({ language }: { language: string }): boolean => ['jsx', 'tsx'].includes(language)

const comboboxExamples = fences.filter(
  (fence) => isScript(fence) && /<Combobox\.Root[\s>]/.test(fence.body),
)
const menubarExamples = fences.filter(
  (fence) => isScript(fence) && /<Menubar[\s>]/.test(fence.body),
)

// What the first release's README said about what it did not paint, as one paragraph.
const FIRST_RELEASE_PARAGRAPH =
  "Version 1 does not paint everything. It has no highlight on the hovered or arrowed item of a menu or select, no scrim colour behind a dialog (its backdrop has no paint, and this package recommends no value for one), no motion on popups, tooltips or the tab indicator, an arrow that sits on physical sides only (top, bottom, left and right, not the logical start and end), and no fill on a slider's range. Button comes in `secondary` and `primary`, in sizes `md` and `sm`, and no other."

const SIX_SUBPATHS = [
  'alert-dialog',
  'context-menu',
  'menubar',
  'preview-card',
  'combobox',
  'autocomplete',
]

describe('AC-base-ui-overlay-completion-39: the README carries each item R19 lists, in the shipping state', () => {
  it.each(SIX_SUBPATHS)('names the subpath @navecss/base-ui/%s', (name) => {
    expect(prose).toContain(`\`@navecss/base-ui/${name}\``)
  })

  it('has exactly one Combobox example, which puts Input inside InputGroup and never inside the popup', () => {
    expect(comboboxExamples).toHaveLength(1)
    const placements = inputPlacements(comboboxExamples[0]?.body ?? '', 'README.md')
    expect(placements.length).toBeGreaterThan(0)
    for (const placement of placements) {
      expect(placement.tag).toBe('Combobox.Input')
      expect(placement.ancestors).toContain('Combobox.InputGroup')
      expect(isInsidePopup(placement)).toBe(false)
    }
  })

  it("says Menubar's menus come from @navecss/base-ui/menu", () => {
    expect(hasProseSentenceWith([/Menubar/, /`@navecss\/base-ui\/menu`/])).toBe(true)
  })

  it('shows a Menubar whose triggers are <Menu.Trigger variant="ghost">', () => {
    expect(menubarExamples.length).toBeGreaterThan(0)
    for (const { body } of menubarExamples) {
      const triggers = body.matchAll(/<Menu\.Trigger\b[^>]*>/g).toArray()
      expect(triggers.length).toBeGreaterThan(0)
      expect(triggers.filter(([trigger]) => !trigger.includes('variant="ghost"'))).toEqual([])
    }
  })

  it('says a right-to-left app needs dir="rtl" on <html> or the Portal container, and DirectionProvider with the same direction', () => {
    expect(
      hasProseSentenceWith([
        /`dir="rtl"`/,
        /`<html>`/,
        /\bPortal\b/,
        /\bcontainer\b/,
        /`DirectionProvider`/,
        /\bboth\b/,
        /same direction/,
      ]),
    ).toBe(true)
  })

  it("says Context Menu's trigger area is the reader's own element and Nave paints nothing on it", () => {
    expect(
      hasProseSentenceWith([/Context Menu/, /trigger area/, /\bown element\b/, /paints nothing/]),
    ).toBe(true)
  })

  it('says parts younger than the floor are exported as whatever the installed Base UI provides', () => {
    expect(hasProseSentenceWith([/\b1\.3\b/, /\binstalled\b/, /\bexport/i, /\bparts?\b/i])).toBe(
      true,
    )
  })

  it('documents variant as secondary (the default), primary or ghost, and never a data-nave attribute', () => {
    const block = prose
      .split(/\n{2,}/)
      .find((paragraph) => paragraph.includes('`variant`') && /\bghost\b/.test(paragraph))
    expect(block, 'a paragraph or table documenting `variant` with ghost').toBeDefined()
    for (const value of ['secondary', 'primary', 'ghost']) {
      expect(block).toContain(value)
    }
    expect(block).toMatch(/default/i)
    expect(readme).not.toMatch(/data-nave-/)
  })

  it.each(NOT_PAINTED)('$name: listed only when its condition holds', ({ listed, name }) => {
    expect(notPaintedIn(prose).includes(name)).toBe(listed(SHIPPING))
  })

  it('lists exactly the four items of what is not painted that the shipping state calls for', () => {
    expect(notPaintedFor(SHIPPING)).toEqual([
      'no backdrop colour behind a Dialog',
      "no fill on the Slider's range",
      'Button sizes md and sm only',
      'recommends no other scrim value',
    ])
    expect(notPaintedIn(prose)).toEqual(notPaintedFor(SHIPPING))
  })

  it.each(WITHDRAWN_NOT_PAINTED.map((pattern) => ({ pattern })))(
    'no longer says what the first release did: $pattern',
    ({ pattern }) => {
      expect(prose.replaceAll(/\s+/g, ' ')).not.toMatch(pattern)
    },
  )

  it('control: the first release paragraph, and each withdrawn claim, is what the checks report', () => {
    expect(notPaintedIn(FIRST_RELEASE_PARAGRAPH)).not.toEqual(notPaintedFor(SHIPPING))
    const planted = `${FIRST_RELEASE_PARAGRAPH} The tab indicator does not move. Button comes in \`secondary\` and \`primary\` only.`
    expect(WITHDRAWN_NOT_PAINTED.filter((pattern) => !pattern.test(planted))).toEqual([])
  })

  it('control: a paragraph written from a state lists exactly that state, in every state', () => {
    const states = [
      SHIPPING,
      { scope: 'ii' as const, unsigned: [] },
      { unsigned: ['scrim' as const] },
      {
        unsigned: [
          'combobox' as const,
          'highlight-fill' as const,
          'open-ghost' as const,
          'popup-fade' as const,
          'scrim' as const,
          'tooltip-fade' as const,
        ],
      },
    ]
    expect(
      states.filter(
        (state) =>
          notPaintedIn(notPaintedParagraph(state)).join('|') !== notPaintedFor(state).join('|'),
      ),
    ).toEqual([])
    expect(notPaintedFor(SHIPPING)).toHaveLength(4)
    expect(notPaintedFor({ unsigned: ['scrim'] })).toHaveLength(5)
    expect(notPaintedFor({ scope: 'ii', unsigned: [] })).toHaveLength(3)
  })

  it('control: a sentence naming the floor and the installed version is found, one without is not', () => {
    const present =
      'A part Base UI added after 1.3 is exported as whatever your installed version provides.'
    const patterns = [/\b1\.3\b/, /\binstalled\b/, /\bexport/i, /\bparts?\b/i]
    expect(hasSentenceWith(present, patterns)).toBe(true)
    expect(hasSentenceWith('It needs `@base-ui/react` 1.3 or later.', patterns)).toBe(false)
  })
})

const planted = (tag: string, wrapper: string): string =>
  [
    '# A page',
    '',
    '```tsx',
    "import { Combobox } from '@navecss/base-ui/combobox'",
    'export default function Planted() {',
    '  return (',
    '    <Combobox.Root>',
    '      <Combobox.Portal>',
    `        <${wrapper}>`,
    `          <${tag} />`,
    `        </${wrapper}>`,
    '      </Combobox.Portal>',
    '    </Combobox.Root>',
    '  )',
    '}',
    '```',
  ].join('\n')

const lineOf = (text: string, needle: string): number =>
  text.split('\n').findIndex((line) => line.includes(needle)) + 1

describe('AC-base-ui-overlay-completion-13: the input-inside-popup pattern is shown nowhere', () => {
  it('has no Combobox.Input or Autocomplete.Input under a popup or positioner in the README, the package or docs', () => {
    expect(misplacedInputsInRepository()).toEqual([])
  })

  it('control: the scan reaches the README and the docs', () => {
    const files = documentFiles()
    expect(files.some((file) => file.endsWith('packages/base-ui/README.md'))).toBe(true)
    expect(files.some((file) => file.endsWith('docs/04-adr/index.md'))).toBe(true)
  })

  it('shows an input for the scan to read: the README has a Combobox.Input', () => {
    const inputs = fencesWithLines(readme)
      .filter((fence) => isScript(fence))
      .flatMap(({ body, line }) => inputPlacements(body, 'README.md', line))
    expect(inputs.map(({ tag }) => tag)).toContain('Combobox.Input')
  })

  it.each([
    ['Combobox.Input', 'Combobox.Popup'],
    ['Combobox.Input', 'Combobox.Positioner'],
    ['Autocomplete.Input', 'Autocomplete.Popup'],
    ['Autocomplete.Input', 'Autocomplete.Positioner'],
  ])('control: a fence placing %s inside %s is reported with its file and line', (tag, wrapper) => {
    const text = planted(tag, wrapper)
    expect(misplacedInputsInFile('planted.md', text)).toEqual([
      `planted.md:${lineOf(text, `<${tag} />`)}`,
    ])
  })

  it('control: a TSX file is read whole, with the line it is written on', () => {
    const source = [
      "import { Combobox as C } from '@navecss/base-ui/combobox'",
      'export const Planted = () => (',
      '  <C.Popup>',
      '    <div>',
      '      <C.Input />',
      '    </div>',
      '  </C.Popup>',
      ')',
    ].join('\n')
    expect(misplacedInputsInFile('planted.tsx', source)).toEqual(['planted.tsx:5'])
    expect(misplacedInputs(source, 'x.tsx', 11)).toEqual(['x.tsx:15'])
  })

  it('control: an input in an InputGroup, or beside the popup, is not reported', () => {
    const beside = [
      '<Combobox.Root>',
      '  <Combobox.InputGroup>',
      '    <Combobox.Input />',
      '  </Combobox.InputGroup>',
      '  <Combobox.Portal>',
      '    <Combobox.Positioner>',
      '      <Combobox.Popup>',
      '        <Combobox.List />',
      '      </Combobox.Popup>',
      '    </Combobox.Positioner>',
      '  </Combobox.Portal>',
      '</Combobox.Root>',
    ].join('\n')
    expect(inputPlacements(beside, 'beside.tsx')).toHaveLength(1)
    expect(misplacedInputs(beside, 'beside.tsx')).toEqual([])
    expect(inputPlacements(beside, 'beside.tsx')[0]?.ancestors).toEqual([
      'Combobox.Root',
      'Combobox.InputGroup',
    ])
  })

  it('control: a markdown fence in another language is not read as JSX', () => {
    const text = '```css\n<Combobox.Popup><Combobox.Input /></Combobox.Popup>\n```'
    expect(misplacedInputsInFile('style.md', text)).toEqual([])
  })
})

const SENTENCE_FOUR_CODES = Object.keys(SENTENCE_4_FORMS)

const readmeFor = (state: Parameters<typeof sentencesPresentIn>[0]): string =>
  sentencesPresentIn(state)
    .map(({ text }) => text)
    .join('\n\n')

describe('AC-base-ui-overlay-completion-40: the cleared sentences are carried byte for byte, each in exactly its signature state', () => {
  it.each(ALL_LITERALS)('holds $name at its length and hash', ({ bytes, prefix, text }) => {
    expect(Buffer.byteLength(text, 'utf8')).toBe(bytes)
    expect(sha256(text).startsWith(prefix)).toBe(true)
  })

  it('holds the two ends of sentence 4 at their full sha256', () => {
    expect(sha256(SENTENCE_4_FORMS.SSS?.text ?? '')).toBe(
      'ac7cdbed478729cdc93e972ee1d62acfcbf25bc5716e3102659b4d0c525a3efd',
    )
    expect(sha256(SENTENCE_4_FORMS.uuu?.text ?? '')).toBe(
      '9299c00177cd0c6322153f84c0fb5645c59b52a4c508ff1df624afed59520057',
    )
  })

  it('builds each of the eight forms of sentence 4 from the template and the rule', () => {
    expect(SENTENCE_FOUR_CODES).toHaveLength(8)
    for (const state of REDUCED_MOTION_STATES) {
      expect(composeSentence4(state)).toBe(SENTENCE_4_FORMS[sentence4Code(state)]?.text)
    }
    expect(new Set(REDUCED_MOTION_STATES.map((state) => sentence4Code(state))).size).toBe(8)
  })

  it('has no form of sentence 4 inside another, or inside the first release sentence, or the reverse', () => {
    const texts = [
      ...Object.values(SENTENCE_4_FORMS).map(({ text }) => text),
      PARENT_REDUCED_MOTION.text,
    ]
    const nested = texts.flatMap((text, index) =>
      texts.filter((other, at) => at !== index && other.includes(text)),
    )
    expect(nested).toEqual([])
  })

  it.each(sentencesPresentIn(SHIPPING))('contains $name', ({ text }) => {
    expect(readme).toContain(text)
  })

  it.each(sentencesAbsentFrom(SHIPPING))('does not contain $name', ({ text }) => {
    expect(readme).not.toContain(text)
  })

  it('contains exactly one of the eight forms of sentence 4, the one for the shipping state', () => {
    const contained = Object.entries(SENTENCE_4_FORMS)
      .filter(([, { text }]) => readme.includes(text))
      .map(([code]) => code)
    expect(contained).toEqual(['SSS'])
    expect(sentence4Code(SHIPPING)).toBe('SSS')
  })

  it('still contains the first release sentences that stand, and none of the superseded texts', () => {
    for (const name of [
      'disclosure panel',
      'bare popup focus',
      'non-affiliation',
      'Menu.LinkItem',
    ]) {
      expect(readme).toContain(FIXED_SENTENCES.find((sentence) => sentence.name === name)?.text)
    }
    expect(sentenceProblems(readme, SHIPPING)).toEqual([])
  })

  it('has one reduced-motion item, sentence 4, where the first release sentence stood', () => {
    expect(readme.match(/reduced[- ]motion/gi)).toHaveLength(1)
    expect(readme.indexOf(SENTENCE_4_FORMS.SSS?.text ?? '')).toBeGreaterThan(
      readme.indexOf(FIXED_SENTENCES.find((s) => s.name === 'Menu.LinkItem')?.text ?? ''),
    )
  })

  describe('controls, on a README written from the state', () => {
    it('is clean for its own state, in every state of sentence 4, and reds for any other', () => {
      for (const state of REDUCED_MOTION_STATES) {
        expect(sentenceProblems(readmeFor(state), state)).toEqual([])
        const others = REDUCED_MOTION_STATES.filter((other) => other !== state)
        for (const other of others) {
          expect(sentenceProblems(readmeFor(state), other)).not.toEqual([])
        }
      }
    })

    it('control: replacing one word of sentence 3 reds containment', () => {
      const edited = readmeFor(SHIPPING).replace(SENTENCE_3_PREVIEW_CARD.text, () =>
        SENTENCE_3_PREVIEW_CARD.text.replace('Keep', 'Hold'),
      )
      expect(edited).not.toContain(SENTENCE_3_PREVIEW_CARD.text)
      expect(sentenceProblems(edited, SHIPPING)).toEqual(['missing: sentence 3, Preview Card'])
    })

    it('control: editing a literal reds its hash', () => {
      for (const { bytes, prefix, text } of ALL_LITERALS) {
        const edited = `${text.slice(0, -1)}!`
        expect(
          Buffer.byteLength(edited, 'utf8') === bytes && sha256(edited).startsWith(prefix),
        ).toBe(false)
        expect(sha256(edited).startsWith(prefix)).toBe(false)
      }
    })

    it('control: sentence 7 reds under scope (i) and is required under scope (ii)', () => {
      const withSeven = `${readmeFor(SHIPPING)}\n\n${SENTENCE_7_DIALOG_BACKDROP.text}`
      expect(sentenceProblems(withSeven, SHIPPING)).toEqual([
        'unexpected: sentence 7, Dialog.Backdrop only for modal',
      ])
      const scopeTwo = { scope: 'ii' as const, unsigned: [] }
      expect(sentenceProblems(withSeven, scopeTwo)).toEqual([])
      expect(sentenceProblems(readmeFor(SHIPPING), scopeTwo)).toEqual([
        'missing: sentence 7, Dialog.Backdrop only for modal',
      ])
    })

    it('control: the S S S form reds when the scrim is unsigned', () => {
      const scrimUnsigned = { unsigned: ['scrim' as const] }
      const problems = sentenceProblems(readmeFor(SHIPPING), scrimUnsigned)
      expect(problems).toContain('unexpected: sentence 4, S S S')
      expect(problems).toContain('missing: sentence 4, S S u')
    })

    it('control: the first release sentence beside sentence 4 reds', () => {
      const both = `${readmeFor(SHIPPING)}\n\n${PARENT_REDUCED_MOTION.text}`
      expect(sentenceProblems(both, SHIPPING)).toEqual([
        "unexpected: the parent's reduced-motion sentence",
      ])
    })

    it('control: with the Combobox unsigned, sentences 1 and 6 are absent and reds if carried', () => {
      const state = { scope: 'i' as const, unsigned: ['combobox' as const] }
      expect(sentenceProblems(readmeFor(state), state)).toEqual([])
      expect(sentenceProblems(readmeFor(SHIPPING), state)).toEqual([
        'unexpected: sentence 1, the active option',
        'unexpected: sentence 6, the Combobox field',
      ])
    })
  })
})

describe('AC-base-ui-overlay-completion-41: the scrim is neither recommended nor named in an example', () => {
  const BACKDROP_RULE = /backdrop[^{}]*\{[^{}]*\b(?:background|color|opacity)/i

  const scrimClaims = (body: string): string[] =>
    [
      body.includes('backdrop-modal') ? 'names the modal backdrop colour' : '',
      /scrim/i.test(body) ? 'names a scrim' : '',
      BACKDROP_RULE.test(body) ? 'paints a backdrop' : '',
    ].filter((claim) => claim !== '')

  it('has no fence that recommends a scrim value or names --nave-color-backdrop-modal', () => {
    expect(fences.flatMap(({ body }) => scrimClaims(body))).toEqual([])
  })

  it('control: a planted fence naming the colour, a scrim or a painted backdrop is reported', () => {
    expect(scrimClaims('.x { background: var(--nave-color-backdrop-modal) }')).toEqual([
      'names the modal backdrop colour',
    ])
    expect(scrimClaims('.scrim { color: red }')).toEqual(['names a scrim'])
    expect(scrimClaims('.backdrop { background-color: var(--a) }')).toEqual(['paints a backdrop'])
    expect(scrimClaims('.popup { border-radius: var(--nave-radius-control) }')).toEqual([])
  })
})
