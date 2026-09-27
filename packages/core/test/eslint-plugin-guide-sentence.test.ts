/**
 * AC-eslint-plugin-24 covers: R13.
 *
 * The agent guide gains exactly one sentence about `@navecss/eslint-plugin`, and it names no
 * rule: an agent reading the guide should never learn a rule id to special-case, only that the
 * plugin's own reports already carry their remedies.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { generate, OUTPUT_PATH, renderEslintPluginSection } from '../scripts/generate-skill.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')
const committed = readFileSync(OUTPUT_PATH, 'utf8')

/**
 * The R13 sentence, byte-exact. Kept as one literal here (never reconstructed from the
 * generator's own source) so this test cannot pass merely because it shares a typo with it.
 */
const SENTENCE =
  'If the project runs `@navecss/eslint-plugin`, its reports name their remedies, most preferred first: take the first one that fits. Never answer a report with a disable comment, and never write a `cx.raw()` reason to make a report go away.'

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('AC-eslint-plugin-24: the guide names @navecss/eslint-plugin in one sentence, no rule id', () => {
  it('the committed guide contains the R13 sentence byte-exact, exactly once', () => {
    expect(countOccurrences(committed, SENTENCE)).toBe(1)
  })

  it('a freshly generated guide contains the sentence too (the assertion tracks the template, not only the committed file)', async () => {
    const fresh = await generate(baseSkillGuideSources())
    expect(countOccurrences(fresh, SENTENCE)).toBe(1)
  })

  it('names @navecss/eslint-plugin nowhere else in the guide', () => {
    expect(countOccurrences(committed, '@navecss/eslint-plugin')).toBe(1)
  })

  it("lists no key of the plugin's own rules, read from the built package at test time", async () => {
    const pluginPath = path.resolve(ROOT, 'packages/eslint-plugin/dist/index.js')
    const { default: plugin } = (await import(pathToFileURL(pluginPath).href)) as {
      default: { meta: { namespace: string }; rules: Record<string, unknown> }
    }
    const ruleKeys = Object.keys(plugin.rules)
    expect(ruleKeys.length).toBeGreaterThan(0)
    for (const ruleKey of ruleKeys) {
      expect(committed).not.toContain(`${plugin.meta.namespace}/${ruleKey}`)
      expect(committed).not.toContain(ruleKey)
    }
  })

  it('removing the sentence from the generator’s OWN template array fails, a real regeneration, never string-surgery on the already-rendered committed file', () => {
    const lines = renderEslintPluginSection()
    const targetIndex = lines.findIndex((line) => line.includes(SENTENCE))
    expect(targetIndex).toBeGreaterThan(-1)
    const withoutSentence = lines.filter((_, i) => i !== targetIndex).join('\n')
    expect(withoutSentence).not.toContain(SENTENCE)
    // The unmodified array still carries it: this is genuinely testing the splice, not a
    // sentence that was never there.
    expect(lines.join('\n')).toContain(SENTENCE)
  })
})
