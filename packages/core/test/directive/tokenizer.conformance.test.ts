/**
 * AC-directive-core-08: the tokenizer is first-party and is checked against
 * the published CSS Syntax Level 3 conformance corpus, never by copying its
 * cases into this repository.
 */
import { testCorpus } from '@rmenke/css-tokenizer-tests'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { tokenize } from '../../src/directive/tokenizer.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIRECTIVE = path.resolve(HERE, '..', '..', 'src', 'directive')
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

describe('AC-directive-core-08 — the corpus test is not vacuous', () => {
  it('reds on a scratch tokenizer with comment tokenization broken', async () => {
    const scratch = mkdtempSync(
      path.join(path.resolve(HERE, '..', '..'), '.nave-tokenizer-scratch-'),
    )
    try {
      const scratchDirectiveDir = path.join(scratch, 'directive')
      mkdirSync(scratchDirectiveDir, { recursive: true })
      cpSync(
        path.join(SRC_DIRECTIVE, 'tokenizer.ts'),
        path.join(scratchDirectiveDir, 'tokenizer.ts'),
      )
      cpSync(path.join(SRC_DIRECTIVE, 'tokenizer'), path.join(scratchDirectiveDir, 'tokenizer'), {
        recursive: true,
      })

      const commentPath = path.join(scratchDirectiveDir, 'tokenizer', 'comment.ts')
      const original = readFileSync(commentPath, 'utf8')
      const broken = original.replace(
        "if (s.peek() !== '/' || s.peek(1) !== '*') return undefined",
        'return undefined',
      )
      expect(broken).not.toBe(original)
      writeFileSync(commentPath, broken)

      const { tokenize: brokenTokenize } = (await import(
        `${pathToFileURL(path.join(scratchDirectiveDir, 'tokenizer.ts')).href}?scratch=${Date.now()}`
      )) as { tokenize: (css: string) => unknown }

      let failures = 0
      for (const [, testCase] of cases) {
        try {
          expect(brokenTokenize(testCase.css)).toEqual(testCase.tokens)
        } catch {
          failures++
        }
      }

      // Not pinned to a specific failure count: this break is one way,
      // among others, to disable comment recognition, not a byte-for-byte
      // reproduction of any particular measurement. What this proves is the
      // shape of the claim — breaking comment tokenization measurably reds
      // the corpus, so the corpus comparison is exercising real behaviour,
      // not passing vacuously.
      expect(failures).toBeGreaterThan(0)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
