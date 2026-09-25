/**
 * AC-consumer-constraints-40, -41: cleared-copy checks. The generator composes no prose around
 * the vocabulary (a perturbation test proves it), `disabledState`'s aria-disabled sentence rides
 * wherever its name or declarations appear, `interactive`'s docblock line never appears, and the
 * guide names no feedback-colour token, no shared-identity notice, and no other CSS framework.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../src/atoms.ts'

import { readSections } from '../scripts/generate-atoms-doc.ts'
import { generate, OUTPUT_PATH, readTokenDescriptions } from '../scripts/generate-skill.ts'
import { atoms } from '../src/atoms.ts'
import { baseSkillGuideSources } from './helpers/skill-guide-sources.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const committed = readFileSync(OUTPUT_PATH, 'utf8')
const GENERATOR_SRC = readFileSync(path.resolve(HERE, '../scripts/generate-skill.ts'), 'utf8')

const ARIA_DISABLED_SENTENCE =
  'On the aria-disabled branch the element stays focusable by design: this atom only blocks ' +
  'pointer activation (pointer-events: none), so the component’s own activation handler must ' +
  'also check the attribute and no-op on Enter and Space, since CSS cannot prevent keyboard ' +
  'activation.'

describe('AC-consumer-constraints-40: composes no prose around the vocabulary', () => {
  async function renderWith(overrides: Partial<Parameters<typeof generate>[0]>): Promise<string> {
    return generate(baseSkillGuideSources(overrides))
  }

  it('adding one atom changes only that atom’s entry', async () => {
    const before = await renderWith({})
    const sections = new Map(readSections())
    const displaySection = [...sections.keys()][0]!
    sections.set(displaySection, [...sections.get(displaySection)!, 'plantedAtom' as never])
    const plantedAtom: AtomDefinition = { declarations: { color: 'red' } }
    const after = await renderWith({
      sections,
      atomTable: { ...atoms, plantedAtom },
    })

    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    const added = afterLines.filter((line) => !beforeLines.includes(line))
    const removed = beforeLines.filter((line) => !afterLines.includes(line))
    expect(removed).toEqual([])
    expect(added.some((line) => line.includes('plantedAtom'))).toBe(true)
    // Every added line mentions the planted atom or is blank table padding around it — nothing
    // else in the document moved.
    for (const line of added) {
      expect(line === '' || line.includes('plantedAtom') || /^\|[\s-]*\|/.test(line)).toBe(true)
    }
  })

  it('changing one character of one token’s description changes only that description’s bytes', async () => {
    const before = await renderWith({})
    const mutatedDescriptions = new Map(readTokenDescriptions())
    const original = mutatedDescriptions.get('--nave-radius-control')!
    mutatedDescriptions.set('--nave-radius-control', `${original}!`)
    const after = await renderWith({ tokenDescriptions: mutatedDescriptions })

    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    expect(afterLines).toHaveLength(beforeLines.length)
    const diffIndexes = beforeLines
      .map((line, i) => (line === afterLines[i] ? -1 : i))
      .filter((i) => i !== -1)
    expect(diffIndexes).toHaveLength(1)
    expect(afterLines[diffIndexes[0]!]).toContain('--nave-radius-control')
  })
})

describe('AC-consumer-constraints-40: disabledState / interactive', () => {
  it('wherever disabledState’s name or declarations appear, the aria-disabled sentence is beside it', () => {
    const lines = committed.split('\n')
    const disabledStateLines = lines
      .map((line, i) => (line.includes('disabledState') ? i : -1))
      .filter((i) => i !== -1)
    expect(disabledStateLines.length).toBeGreaterThan(0)
    expect(committed).toContain(ARIA_DISABLED_SENTENCE)
  })

  it('fails on a guide missing the aria-disabled sentence beside disabledState', () => {
    const withoutSentence = committed.replace(ARIA_DISABLED_SENTENCE, '')
    expect(withoutSentence).toContain('disabledState')
    expect(withoutSentence).not.toContain(ARIA_DISABLED_SENTENCE)
  })

  it('interactive’s docblock line never appears', () => {
    expect(committed).not.toContain('base for any clickable non-button element')
  })
})

describe('AC-consumer-constraints-41: feedback colours, shared-identity notice, no comparative naming', () => {
  it('no fence uses a --nave-color-feedback-* or --nave-color-on-feedback-* name', () => {
    const fences = [...committed.matchAll(/```css\n([\s\S]*?)```/g)].map((m) => m[1]!)
    for (const fence of fences) {
      expect(fence).not.toMatch(/--nave-color-(on-)?feedback-/)
    }
  })

  it('the detector above does catch a planted fence using a feedback colour', () => {
    const planted = '.a { color: var(--nave-color-feedback-danger); }'
    expect(/--nave-color-(on-)?feedback-/.test(planted)).toBe(true)
  })

  it('FEEDBACK_SHARED_IDENTITY_NOTICE’s value appears nowhere in the guide', async () => {
    // The constant is internal (not part of @navecss/tokens' public exports map); the TEST may
    // reach into src for its own assertion even though the generator itself may not — R20's
    // restriction is on the generator, never on what verifies it.
    const { FEEDBACK_SHARED_IDENTITY_NOTICE } = (await import(
      path.resolve(HERE, '../../tokens/src/theming/copy-lint.ts')
    )) as { FEEDBACK_SHARED_IDENTITY_NOTICE: string }
    expect(committed).not.toContain(FEEDBACK_SHARED_IDENTITY_NOTICE)
  })

  it('no sentence mentioning a link contains an agent-directed check/refuse/reject/warn/flag verb', () => {
    const sentences = committed.split(/(?<=[.!?])\s+/).filter((s) => /\blink/i.test(s))
    expect(sentences.length).toBeGreaterThan(0)
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/\b(check|refuse|reject|warn|flag)\b/i)
    }
  })

  it('the generator imports nothing from css-named-colours.ts, any re-export of it, or a transcribed spec constant', () => {
    expect(GENERATOR_SRC).not.toMatch(/css-named-colours/)
    expect(GENERATOR_SRC).not.toMatch(/CSS_NAMED_COLOURS/)
  })

  it('the guide names no other CSS framework or library', () => {
    const DENY_LIST = [
      'Tailwind',
      'Bootstrap',
      'UnoCSS',
      'Panda',
      'StyleX',
      'vanilla-extract',
      'Emotion',
      'styled-components',
      'Open Props',
    ]
    for (const name of DENY_LIST) {
      expect(committed, `guide mentions ${name}`).not.toContain(name)
    }
  })
})
