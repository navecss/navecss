/**
 * AC-consumer-constraints-17: the outline guard, shipped after the maintainer's accessibility
 * review. Two surfaces, two messages, one pattern (R10's exception).
 *
 * AC-consumer-constraints-18 and -42 describe two OTHER possible outcomes of that same review
 * (the guard declined entirely, or shipped only behind an opt-in export) and do not apply here:
 * the review cleared the guard for the default export with no opt-in export, so there is no
 * declined-shape or opt-in-shape config to test against real bytes. Recorded here rather than
 * silently skipped so a reader does not go looking for a missing test: AC-18 and AC-42's own
 * "Given" clause states the precondition under which each would apply, and that precondition
 * did not obtain.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint, { type Config } from 'stylelint'
import { describe, expect, it } from 'vitest'

import config, { OUTLINE_GUARD_CONSUMER_MESSAGE, OUTLINE_GUARD_PATTERN } from '../index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

function stripRuleSuffix(text: string): string {
  return text.replace(/ \([\w./-]+\)$/, '')
}

describe('AC-consumer-constraints-17 covers: R11c, R12, R10', () => {
  it('reports outline: none / outline: 0 in a consumer fixture with the 444-byte message', async () => {
    for (const declaration of ['outline: none', 'outline: 0']) {
      const result = await stylelint.lint({ code: `.a { ${declaration}; }`, config })
      const warning = result.results[0]!.warnings.find(
        (w) => w.rule === 'declaration-property-value-disallowed-list',
      )
      expect(warning).toBeDefined()
      expect(stripRuleSuffix(warning!.text)).toBe(OUTLINE_GUARD_CONSUMER_MESSAGE)
    }
  })

  it('reports the same declarations on our own tree with the house message, byte-identical', async () => {
    const rcPath = path.join(ROOT, '.stylelintrc.json')
    const rootConfig = JSON.parse(readFileSync(rcPath, 'utf8')) as Config
    for (const declaration of ['outline: none', 'outline: 0']) {
      const result = await stylelint.lint({
        code: `.a { ${declaration}; }`,
        config: rootConfig,
        configBasedir: ROOT,
      })
      const warning = result.results[0]!.warnings.find(
        (w) => w.rule === 'declaration-property-value-disallowed-list',
      )
      expect(warning).toBeDefined()
      expect(stripRuleSuffix(warning!.text)).not.toBe(OUTLINE_GUARD_CONSUMER_MESSAGE)
      const bytes = Buffer.byteLength(stripRuleSuffix(warning!.text), 'utf8')
      expect(bytes).toBe(1012)
    }
  })

  it('the guard value pattern resolved for the consumer fixture and for our tree is deep-equal', async () => {
    const consumerResolved = await stylelint.resolveConfig(process.cwd(), { config })
    const rcPath = path.join(ROOT, '.stylelintrc.json')
    const rootConfig = JSON.parse(readFileSync(rcPath, 'utf8')) as Config
    const houseResolved = await stylelint.resolveConfig(
      path.join(ROOT, 'packages/core/src/index.css'),
      {
        config: rootConfig,
        configBasedir: ROOT,
      },
    )
    const consumerRule = consumerResolved?.rules?.[
      'declaration-property-value-disallowed-list'
    ] as unknown[]
    const houseRule = houseResolved?.rules?.[
      'declaration-property-value-disallowed-list'
    ] as unknown[]
    expect(consumerRule[0]).toEqual(houseRule[0])
  })

  it('the exported pattern is used, never a copy, by this test failing if it drifts', () => {
    expect(config.rules!['declaration-property-value-disallowed-list']).toBeDefined()
    const [ruleOptions] = config.rules!['declaration-property-value-disallowed-list'] as [
      { outline: string[] },
    ]
    expect(ruleOptions.outline).toEqual(OUTLINE_GUARD_PATTERN)
  })
})

describe('AC-consumer-constraints-19 covers: R12', () => {
  const FORBIDDEN_WORDS = [
    'accessib',
    'a11y',
    'WCAG',
    'screen reader',
    'keyboard user',
    'protect',
    'ensure',
    'guarantee',
    'conform',
  ]

  it('no shipped source mentioning outline contains outcome-describing words', () => {
    const readme = readFileSync(path.join(HERE, '../README.md'), 'utf8')
    const packageJson = readFileSync(path.join(HERE, '../package.json'), 'utf8')
    const description = (JSON.parse(packageJson) as { description: string }).description
    const surfaces = [
      ['README.md', readme],
      ['package.json description', description],
    ] as const

    for (const [name, text] of surfaces) {
      const sentences = text.split(/(?<=[.!?])\s+/)
      const outlineSentences = sentences.filter((s) => /outline/i.test(s))
      for (const sentence of outlineSentences) {
        for (const word of FORBIDDEN_WORDS) {
          expect(sentence.toLowerCase(), `${name}: "${sentence}" contains "${word}"`).not.toContain(
            word.toLowerCase(),
          )
        }
      }
    }
  })

  it('the guard is described by what it flags, in this positive-control sense', () => {
    const plantedSentence = 'It protects keyboard users from losing focus visibility.'
    const words = plantedSentence.toLowerCase()
    const isHit = FORBIDDEN_WORDS.some((word) => words.includes(word.toLowerCase()))
    expect(isHit).toBe(true)
  })
})
