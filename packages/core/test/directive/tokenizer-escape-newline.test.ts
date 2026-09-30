/**
 * A hex escape's trailing whitespace consumes at most one input code point
 * (CSS Syntax Level 3 §4.3.7), and a backslash immediately before a CR or FF
 * is not a valid escape (§4.3.8) even though this tokenizer never rewrites
 * CR/FF/CRLF to LF up front (it keeps every byte position intact instead).
 */
import { describe, expect, it } from 'vitest'

import { findSurvivors } from '../../src/directive/find-survivors.ts'
import { tokenize } from '../../src/directive/tokenizer.ts'

describe('a hex escape consumes one trailing whitespace code point, not two', () => {
  it('stops the escaped name before a space that follows a consumed newline', () => {
    const types = tokenize('@n\\61\n ve').map((t) => t.type)
    expect(types).toEqual(['at-keyword-token', 'whitespace-token', 'ident-token'])
  })

  it('is not one surviving directive, because its name is not "nave"', () => {
    expect(findSurvivors('.a { @n\\61\n ve flex; }')).toEqual([])
  })

  it('control: with no space after the newline, the whole name reads as one at-keyword "nave"', () => {
    const tokens = tokenize('@n\\61\nve')
    expect(tokens.map((t) => t.type)).toEqual(['at-keyword-token'])
    expect(tokens[0]!.structured).toMatchObject({ value: 'nave' })
  })
})

describe('a backslash directly before a CR or FF is not a valid escape', () => {
  it('splits on a bare backslash before a CR', () => {
    const types = tokenize('a\\\rb').map((t) => t.type)
    expect(types).toEqual(['ident-token', 'delim-token', 'whitespace-token', 'ident-token'])
  })

  it('splits on a bare backslash before a form feed', () => {
    const types = tokenize('a\\\fb').map((t) => t.type)
    expect(types).toEqual(['ident-token', 'delim-token', 'whitespace-token', 'ident-token'])
  })
})
