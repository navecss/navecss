/**
 * AC-directive-core-08: the tokenizer is first-party and is checked against
 * the published CSS Syntax Level 3 conformance corpus, never by copying its
 * cases into this repository (R4).
 */
import { testCorpus } from '@rmenke/css-tokenizer-tests'
import { describe, expect, it } from 'vitest'

import { tokenize } from '../../src/directive/tokenizer.ts'

const cases = Object.entries(testCorpus)

describe('AC-directive-core-08 — tokenizer conformance', () => {
  it('holds the corpus at the pinned count (287 at 1.4.0)', () => {
    expect(cases.length).toBe(287)
  })

  it.each(cases)('%s', (_name, testCase) => {
    const tokens = tokenize(testCase.css)
    expect(tokens).toEqual(testCase.tokens)
  })
})
