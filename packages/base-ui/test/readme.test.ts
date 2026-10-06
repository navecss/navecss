import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { manifest } from './support/dist.ts'
import {
  CLEARED,
  fencesOf,
  PROMISE_SENTENCE,
  proseOf,
  readReadme,
  sha256,
  WITHDRAWN,
} from './support/readme.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const readme = readReadme()
const prose = proseOf(readme)
const fences = fencesOf(readme)

const rootReadme = readFileSync(path.join(PACKAGE_DIR, '../../README.md'), 'utf8')

const sentencesOf = (text: string): string[] =>
  text
    .replaceAll(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())

const everySentenceHas = (patterns: readonly RegExp[]): boolean =>
  sentencesOf(prose).some((sentence) => patterns.every((pattern) => pattern.test(sentence)))

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
      everySentenceHas([/`@base-ui\/react`/, /separately installed/, /peer/, /maintainers/]),
    ).toBe(true)
  })

  it('carries no image', () => {
    expect(prose).not.toMatch(/!\[|<img|<picture/i)
  })

  it('has an install command naming the package and its peers', () => {
    const commands = fences
      .filter(({ language }) => ['bash', 'sh', 'shell'].includes(language))
      .map(({ body }) => body)
    expect(
      commands.some((body) =>
        ['@navecss/base-ui', '@navecss/tokens', '@base-ui/react', 'react-dom'].every((name) =>
          body.includes(name),
        ),
      ),
    ).toBe(true)
  })

  it('shows the prefix swap with one example: the same component imported from both', () => {
    const before = fences.flatMap(({ body }) =>
      [...body.matchAll(/from '@base-ui\/react\/([\w-]+)'/g)].map((match) => match[1]),
    )
    const after = fences.flatMap(({ body }) =>
      [...body.matchAll(/from '@navecss\/base-ui\/([\w-]+)'/g)].map((match) => match[1]),
    )
    expect(before.length).toBeGreaterThan(0)
    expect(before.some((component) => after.includes(component))).toBe(true)
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
    expect(everySentenceHas([/`:root`/, /ancestor/, /portal/])).toBe(true)
  })

  it('documents variant and size as props, with their values and defaults', () => {
    expect(prose).toMatch(/`variant`/)
    expect(prose).toMatch(/`size`/)
    for (const value of ['secondary', 'primary', 'md', 'sm']) {
      expect(prose).toContain(`\`${value}\``)
    }
    expect(prose).toMatch(/default/i)
  })

  it('names what v1 does not paint, in reader terms', () => {
    expect(prose).toMatch(/highlight/i)
    expect(prose).toMatch(/backdrop/i)
    expect(prose).toMatch(/tab indicator/i)
    expect(prose).toMatch(/physical sides/i)
    expect(prose).toMatch(/range/i)
    expect(prose).toMatch(/scrim/i)
  })

  it("says the trigger's last child turns when it is an svg, and to wrap a leading icon", () => {
    expect(everySentenceHas([/last child/, /`svg`/, /turns/])).toBe(true)
    expect(everySentenceHas([/leading icon/, /inside/, /element/])).toBe(true)
  })

  it('carries the Menu.LinkItem sentence and the reduced-motion sentence', () => {
    for (const name of ['Menu.LinkItem', 'reduced motion']) {
      const cleared = CLEARED.find((sentence) => sentence.name === name)
      expect(readme).toContain(cleared?.text)
    }
  })

  it('says "zero-runtime styling" and never "zero runtime" unqualified', () => {
    expect(prose).toContain('zero-runtime styling')
    expect(readme).not.toMatch(/zero runtime/i)
    expect(readme).not.toMatch(/zero-runtime(?! styling)/i)
  })
})

describe('AC-base-ui-bridge-46: the cleared sentences are carried byte for byte', () => {
  it.each(CLEARED)('holds the $name sentence at its length and hash', ({ bytes, prefix, text }) => {
    expect(Buffer.byteLength(text, 'utf8')).toBe(bytes)
    expect(sha256(text).startsWith(prefix)).toBe(true)
  })

  it.each(CLEARED)('contains the $name sentence', ({ text }) => {
    expect(readme).toContain(text)
  })

  it('carries the non-affiliation line as its own paragraph', () => {
    const line = CLEARED.find((sentence) => sentence.name === 'non-affiliation')?.text
    expect(readme.split(/\n{2,}/).map((paragraph) => paragraph.trim())).toContain(line)
  })

  it('does not contain the withdrawn sentence', () => {
    expect(Buffer.byteLength(WITHDRAWN.text, 'utf8')).toBe(WITHDRAWN.bytes)
    expect(sha256(WITHDRAWN.text).startsWith(WITHDRAWN.prefix)).toBe(true)
    expect(readme).not.toContain(WITHDRAWN.text)
  })

  it('control: changing one word of the panel sentence reds containment', () => {
    const panel = CLEARED.find((sentence) => sentence.name === 'disclosure panel')?.text ?? ''
    expect(readme.replace(panel, panel.replace('Keep', 'Hold'))).not.toContain(panel)
  })

  it('control: editing a literal reds its hash', () => {
    const [first] = CLEARED
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

const remainder = (text: string): string =>
  [...CLEARED.map(({ text: sentence }) => sentence), PROMISE_SENTENCE].reduce(
    (rest, sentence) => rest.replaceAll(sentence, ''),
    text,
  )

const COLOUR_LITERAL = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i

describe('AC-base-ui-bridge-47: no accessibility claim beyond the cleared copy', () => {
  it('contains none of the forbidden words once the cleared sentences are removed', () => {
    const rest = remainder(readme)
    expect(FORBIDDEN.filter((pattern) => pattern.test(rest)).map(String)).toEqual([])
  })

  it('control: a planted claim is reported', () => {
    const planted = `${remainder(readme)}\nEvery part is accessible and meets WCAG.`
    expect(FORBIDDEN.filter((pattern) => pattern.test(planted))).toHaveLength(2)
  })

  it('control: a cleared sentence left in the text is what the removal takes out', () => {
    expect(FORBIDDEN.some((pattern) => pattern.test(CLEARED.map((c) => c.text).join('\n')))).toBe(
      true,
    )
    expect(
      FORBIDDEN.some((pattern) => pattern.test(remainder(CLEARED.map((c) => c.text).join('\n')))),
    ).toBe(false)
  })

  it('has no colour literal and no opacity declaration in any fence', () => {
    for (const { body } of fences) {
      expect(body).not.toMatch(COLOUR_LITERAL)
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
