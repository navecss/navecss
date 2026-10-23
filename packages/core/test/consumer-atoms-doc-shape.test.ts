/**
 * CONSUMER-ATOMS.md's two "Compiles to:" fences claim to show what the PostCSS plugin
 * actually emits. `consumer-atoms-doc.test.ts` checks that the built-in atoms' declarations
 * are present and in order, but not the output's SHAPE: pseudo-class, `@media` and
 * `@container` blocks are nested inside the rule with `&` (ADR 0001, native CSS nesting), not
 * hoisted out as sibling rules, and the doc previously showed the pre-ADR-0001 hoisted form.
 *
 * This test runs the real `navePlugin()` transform on each example's own input fence, with the
 * consumer atom definitions read out of the doc's own "Defining consumer atoms" fences (never
 * retyped here), formats the result with the repository's own Prettier config (the doc's
 * fences are formatted, not raw PostCSS output), and asserts the result is byte-identical to
 * the fence that follows "Compiles to:". Reading the definitions from the doc, rather than a
 * hand-typed copy, is what makes this a real guarantee: a value changed in the doc's
 * definition fence without regenerating its "Compiles to" fence reds this test (see the last
 * `it` below), where a hand-typed copy could not have noticed.
 */
import { format } from 'prettier'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../src/atoms.ts'

import {
  docSrc,
  extractFenceAfter,
  extractInputFenceBefore,
  extractTsFenceAfter,
  loadMyAtoms,
} from './helpers/consumer-atoms-doc.ts'
import { expandedByPlugin } from './helpers/native-order-docs.ts'

const PRETTIER_OPTIONS = {
  parser: 'css' as const,
  semi: false,
  singleQuote: true,
  trailingComma: 'all' as const,
  printWidth: 100,
  tabWidth: 2,
}

async function compile(input: string, extend: Record<string, AtomDefinition>): Promise<string> {
  const formatted = await format(await expandedByPlugin(input, extend), PRETTIER_OPTIONS)
  return formatted.trimEnd()
}

describe('CONSUMER-ATOMS.md "Compiles to:" fences match the real plugin output', () => {
  it('"Using consumer atoms" example matches the real navePlugin() output, nesting included', async () => {
    const directiveIndex = docSrc.indexOf('@nave interactive focusRing transition primaryButton;')
    expect(directiveIndex, 'the documented directive line is missing').not.toBe(-1)

    const input = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
    const { fence } = extractFenceAfter(directiveIndex)

    const myAtoms = await loadMyAtoms(extractTsFenceAfter('## Defining consumer atoms'))
    const compiled = await compile(input, { primaryButton: myAtoms.primaryButton! })
    expect(compiled).toBe(fence.trimEnd())
  })

  it('the container-query "Usage" example matches the real navePlugin() output, nesting included', async () => {
    const directiveIndex = docSrc.indexOf('@nave adaptiveCard;')
    expect(directiveIndex, 'the documented directive line is missing').not.toBe(-1)

    const input = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
    const { fence } = extractFenceAfter(directiveIndex)

    const myAtoms = await loadMyAtoms(
      extractTsFenceAfter('### Consumer atoms with container queries'),
    )
    const compiled = await compile(input, { adaptiveCard: myAtoms.adaptiveCard! })
    expect(compiled).toBe(fence.trimEnd())
  })

  it('reds when the definition fence changes without the "Compiles to:" fence being regenerated', async () => {
    const directiveIndex = docSrc.indexOf('@nave interactive focusRing transition primaryButton;')
    const input = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
    const { fence } = extractFenceAfter(directiveIndex)

    const mutatedSource = extractTsFenceAfter('## Defining consumer atoms').replace(
      "background: 'var(--nave-color-action-primary-hover)',",
      "background: 'var(--nave-color-feedback-danger)',",
    )
    expect(mutatedSource, 'the mutation target text was not found in the fence').not.toBe(
      extractTsFenceAfter('## Defining consumer atoms'),
    )

    const myAtoms = await loadMyAtoms(mutatedSource)
    const compiled = await compile(input, { primaryButton: myAtoms.primaryButton! })

    // The stale "Compiles to:" fence still shows the un-mutated hover value, so a definition
    // fence edited without regenerating its output fence is caught, not silently accepted.
    expect(compiled).not.toBe(fence.trimEnd())
  })
})
