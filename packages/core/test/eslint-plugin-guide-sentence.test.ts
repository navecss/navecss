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

  it("lists no key of the plugin's own rules, read from the plugin's source at test time", async () => {
    // The source, not the built package: nothing orders this suite after the plugin's build.
    const pluginPath = path.resolve(ROOT, 'packages/eslint-plugin/src/index.ts')
    const { default: plugin } = (await import(pathToFileURL(pluginPath).href)) as {
      default: { meta: { namespace: string }; rules: Record<string, unknown> }
    }
    const ruleKeys = Object.keys(plugin.rules)
    expect(ruleKeys.length).toBeGreaterThan(0)
    for (const ruleKey of ruleKeys) {
      expect(committed).not.toContain(`${plugin.meta.namespace}/${ruleKey}`)
      expect(committed).not.toContain(ruleKey)
    }
  }, 30_000)

  it("the sentence comes from the generator's own template section, and a fresh guide renders that section, so removing it from the template fails", async () => {
    const lines = renderEslintPluginSection()
    expect(lines.filter((line) => line.includes(SENTENCE))).toHaveLength(1)
    const fresh = await generate(baseSkillGuideSources())
    expect(fresh).toContain(lines.join('\n'))
  })
})
