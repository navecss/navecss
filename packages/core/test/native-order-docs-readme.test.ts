/**
 * AC-native-apply-order-38 and the README half of AC-native-apply-order-46: the README teaches
 * the order, corrects the sentences that described the old placement, and shows no expansion that
 * is not the PostCSS plugin's.
 */
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

import { MIGRATION_VERSION } from '../src/directive/migration.ts'
import { extractFences } from './doc-fences.ts'
import { readCoreReadme, readmeSection } from './helpers/astro-readme.ts'
import { scanForBrainReferences } from './helpers/brain-reference-scan.ts'
import { isEquivalent } from './helpers/css-equivalence.ts'
import {
  expandedByPlugin,
  expansionPairs,
  fold,
  framedWarnings,
  placeholdersIn,
  withoutCodeSpans,
} from './helpers/native-order-docs.ts'

const readme = readCoreReadme()
const SECTION = '#### Order inside a rule'
const folded = fold(readme)

/**
 * The README's sentences and paragraphs that the order adds or changes, each as it is to read.
 */
const CHANNEL_SENTENCE =
  'the PostCSS plugin as a PostCSS warning (and with `console.warn` on Next.js under Turbopack, which does not print PostCSS warnings)'
const STALE_MARKER_SENTENCE =
  "A marker naming a property that nothing overrides any more is reported, so remove it when you reorder. The Vite plugin under `css.transformer: 'lightningcss'` does not report one, at any targets, because it cannot tell whether Lightning CSS has already moved what follows the directive."
const MARKER_CASE_SENTENCE =
  'The head `nave-allow-override:` is matched in lower case only, as `eslint-disable` is, so a comment that writes it in another case is not a marker: it allows nothing, and the warning it was meant to silence still prints.'
const PLACEMENT_SENTENCE =
  "Pseudo-class rules (`:focus-visible` from `focusRing`), `@media` and `@container` blocks are emitted as native CSS nesting inside your rule, each right after its own atom's declarations, so they apply to every selector in a selector list. Native nesting is inside the browser floor under [Requirements](#requirements), and [Order inside a rule](#order-inside-a-rule) says what wins when your rule sets the same property."
const ADAPTER_SENTENCE =
  "under `'warn'` it prints each problem with `console.warn`, and prints the [order warning](#order-inside-a-rule) the same way under every `onUnknown`."
const OPTIONS_SENTENCE =
  'The [order warning](#order-inside-a-rule) is not one of these problems: it is printed as a warning whatever `onUnknown` says.'
const EXPAND_SENTENCE =
  'An order warning is printed and is not a problem here: it changes neither the exit code nor what is written.'
const NEXTJS_PARAGRAPH =
  "**Where Nave's warnings show.** With webpack (`next build --webpack`), `next build` prints them under `Compiled with warnings`, once for each compilation that reads the stylesheet, so a CSS Module imported from a Server Component can show the same warning twice; `next dev --webpack` may not print a global stylesheet's, so read them from `next build`. Turbopack does not print PostCSS warnings, so under Turbopack the plugin prints them itself on standard error, with the file, line and column, in `next build` and `next dev` alike. Neither bundler shows them in the browser console or Next's error overlay."
const NEXTJS_ONUNKNOWN_SENTENCES =
  "A problem that [`onUnknown`](#options) covers is a warning only under `'warn'`; under the default, `'error'`, it fails the build on either bundler. Where the warnings show was measured on Next 16.4.1, not on Next 15."
const OPTIONS_TURBOPACK_TEXT =
  "On Turbopack, Next 16's default bundler, which shows no PostCSS warning, the PostCSS plugin prints each problem under `'warn'` and each order warning to the terminal instead, as `file:line:column:` and the message ([where Next.js shows them](#nextjs)). It knows Turbopack by the `TURBOPACK` environment variable, which Next.js sets for it, so wherever that variable is set and not empty, under Vite or the PostCSS CLI as well, it does the same and raises no PostCSS warning. The Vite plugin and the Lightning CSS adapter do not read the variable."
const BROWSERSLIST_PARAGRAPH = 'Without it, Turbopack compiles for older browsers'

/**
 * The README's text from `heading` to the next heading of the same or a shallower level, as it is
 * written. A heading the README lacks fails the test that reads it, not the file.
 */
function sectionOf(heading: string): string {
  return readmeSection(heading, readme)
}

/**
 * The same, folded.
 */
function under(heading: string): string {
  return fold(sectionOf(heading))
}

describe('AC-native-apply-order-38: "Order inside a rule" sits in the @nave directives section', () => {
  it('is a level-four section after the paragraph on blocks, before the escape hatch', () => {
    const blocks = readme.indexOf('Pseudo-class rules (`:focus-visible` from `focusRing`)')
    const heading = readme.indexOf(`\n${SECTION}\n`)

    expect(heading).toBeGreaterThan(blocks)
    expect(heading).toBeLessThan(readme.indexOf('\n### Escape hatch'))
    expect(heading).toBeGreaterThan(readme.indexOf('\n### Primary — @nave directives\n'))
  })

  it('shows the expansion of `@nave flex hideDesktopUp;` as the plugin writes it', async () => {
    const pairs = expansionPairs(sectionOf(SECTION))

    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.source).toContain('@nave flex hideDesktopUp;')
    expect(isEquivalent(await expandedByPlugin(pairs[0]!.source), pairs[0]!.output)).toBe(true)
  })

  it('has the four-row order table', () => {
    const rows = sectionOf(SECTION)
      .split('\n')
      .filter((line) => line.startsWith('| `'))

    expect(rows.map((row) => row.split('|', 2)[1]!.trim())).toEqual([
      '`@nave flex hideDesktopUp;`',
      '`@nave hideDesktopUp flex;`',
      '`display: grid; @nave hideDesktopUp;`',
      '`@nave hideDesktopUp; display: grid;`',
    ])
  })

  it('shows the order warning in the house frame, as the plugin prints it at the release', async () => {
    const sample = extractFences('README.md', sectionOf(SECTION)).find((f) => f.lang === 'text')
    const [printed] = await framedWarnings(
      '.panel {\n  @nave hideDesktopUp;\n  display: grid;\n}\n',
      'src/panel.css',
    )

    expect(sample?.body.trim()).toBe(printed)
    expect(printed).toContain(`Before @navecss/core ${MIGRATION_VERSION} "hideDesktopUp" won`)
  })

  it('shows the marker with an example the plugin accepts without a warning', async () => {
    const marked =
      '.panel {\n  @nave /* nave-allow-override: display */ hideDesktopUp;\n  display: grid;\n}\n'
    const example = extractFences('README.md', sectionOf(SECTION)).find(
      (fence) => fence.lang === 'css' && fence.body.includes('nave-allow-override'),
    )

    expect(example?.body.trim()).toBe(marked.trim())
    expect(await framedWarnings(marked, 'src/panel.css')).toEqual([])
    expect(
      await framedWarnings(marked.replace(/ \/\*.*?\*\/ /, ' '), 'src/panel.css'),
    ).toHaveLength(1)
  })

  it('holds the stale-marker sentence and the channel sentence as written', () => {
    expect(under(SECTION)).toContain(STALE_MARKER_SENTENCE)
    expect(under(SECTION)).toContain(CHANNEL_SENTENCE)
  })

  it('says the head of a marker is matched in lower case only, before the stale-marker sentence', () => {
    const section = under(SECTION)

    expect(section).toContain(MARKER_CASE_SENTENCE)
    expect(section.indexOf(MARKER_CASE_SENTENCE)).toBeLessThan(
      section.indexOf(STALE_MARKER_SENTENCE),
    )
  })

  it('says no option turns the warning off and that onUnknown does not govern it', () => {
    expect(under(SECTION)).toContain('never fails the build, and `onUnknown` does not change it')
    expect(under(SECTION)).toContain('No option turns it off for the whole project.')
  })
})

describe('AC-native-apply-order-38: the sentences that described the old placement are corrected', () => {
  it('the placement sentence says each block follows its own atom', () => {
    expect(folded).toContain(PLACEMENT_SENTENCE)
  })

  it('the adapter line says the order warning is printed under every onUnknown', () => {
    expect(under('### Lightning CSS adapter setup')).toContain(ADAPTER_SENTENCE)
  })

  it('the Options paragraph says the order warning is not one of its problems, then where both are printed', () => {
    const options = under('### Options')

    expect(options).toContain(OPTIONS_SENTENCE)
    expect(options).toContain(OPTIONS_TURBOPACK_TEXT)
    expect(options.indexOf(OPTIONS_TURBOPACK_TEXT)).toBeGreaterThan(
      options.indexOf(OPTIONS_SENTENCE),
    )
  })

  it('the README holds no conflict marker', () => {
    expect(readme).not.toMatch(/^(?:<{7}|={7}|>{7})(?: |$)/m)
  })

  it('`expand` says an order warning changes neither the exit code nor what is written', () => {
    const expand = under('## `navecss-core expand`')

    expect(expand).toContain(EXPAND_SENTENCE)
    expect(expand.indexOf(EXPAND_SENTENCE)).toBeGreaterThan(expand.indexOf('- `2` —'))
  })

  it('the Lightning transformer paragraph says three things change', () => {
    const paragraph = under('### Vite plugin setup')

    expect(paragraph).toContain('and three things change.')
    expect(paragraph).not.toContain('and two things change.')
    expect(paragraph).toContain('where the default transformer makes `block` win. What a rule says')
  })

  it('#### Next.js holds the paragraph on where the warnings show after the browserslist paragraph', () => {
    const nextjs = under('#### Next.js')

    expect(nextjs).toContain(NEXTJS_PARAGRAPH)
    expect(nextjs).toContain(`${NEXTJS_PARAGRAPH} ${NEXTJS_ONUNKNOWN_SENTENCES}`)
    expect(nextjs.indexOf(NEXTJS_PARAGRAPH)).toBeGreaterThan(nextjs.indexOf(BROWSERSLIST_PARAGRAPH))
    expect(nextjs).toContain('once for each compilation that reads the stylesheet')
  })

  it('no sentence says blocks are appended or emitted at the end of the rule', () => {
    expect(folded).not.toMatch(/appended|at the end of (the|your) rule|end of the (parent )?rule/i)
  })

  it('no sentence about a marker mentions the ring', () => {
    const sentences = folded
      .split(/(?<=[.!?])\s+/)
      .filter((s) => /marker|nave-allow-override/.test(s))

    expect(sentences.length).toBeGreaterThan(0)
    for (const sentence of sentences) expect(withoutCodeSpans(sentence)).not.toMatch(/\bring\b/i)
  })
})

describe('AC-native-apply-order-46: the README ships no slot, no placeholder and no private reference', () => {
  it('holds no [[SLOT and no unfilled placeholder in the text the order adds', () => {
    const added = [
      sectionOf(SECTION),
      PLACEMENT_SENTENCE,
      ADAPTER_SENTENCE,
      OPTIONS_SENTENCE,
      EXPAND_SENTENCE,
      NEXTJS_PARAGRAPH,
    ]

    expect(readme).not.toContain('[[SLOT')
    for (const text of added) expect(placeholdersIn(text)).toEqual([])
  })

  it('holds no private reference', () => {
    expect(() => {
      scanForBrainReferences(readme, 'README.md')
    }).not.toThrow()
  })

  it('every expansion fence in the README is the plugin output for its source', async () => {
    const pairs = expansionPairs(readme)

    expect(pairs).toHaveLength(1)
    for (const { output, source } of pairs) {
      expect(isEquivalent(await expandedByPlugin(source), output)).toBe(true)
    }
  })

  it('control: the comparison reds on the old placement, a block after every declaration', async () => {
    const [{ output, source }] = expansionPairs(readme) as [{ output: string; source: string }]
    const stale = postcss.parse(output)
    const rule = stale.first as Rule
    rule.append(rule.nodes.find((node) => node.type === 'atrule'))

    expect(isEquivalent(await expandedByPlugin(source), output)).toBe(true)
    expect(isEquivalent(await expandedByPlugin(source), stale.toString())).toBe(false)
  })
})
