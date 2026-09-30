/**
 * A closing token only closes the bracket it mirrors: `)` closes `(` or a
 * function's own `(`, `]` closes `[`, `}` closes `{`. A `}` seen while a `(`
 * is still open is not a block terminator at all (CSS Syntax Level 3's
 * "consume a component value" returns a token it does not recognise as its
 * own, rather than treating it as ending whatever bracket happens to be open)
 * — so an unclosed `(` inside a declaration value swallows the rest of the
 * rule's content as that declaration's value, `@nave` included.
 */
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { findSurvivors } from '../../src/directive/find-survivors.ts'

describe('a closer only closes its mirror opener', () => {
  it('counts one survivor when a mismatched closer never lets the paren close', () => {
    const survivors = findSurvivors('.a { x: (} y @nave flex; }')
    expect(survivors).toHaveLength(1)
  })

  it('leaves the input unchanged: the directive is buried in an unclosed declaration value, not an item of any block', () => {
    const css = '.a { x: (}; @nave flex; }'
    expect(expandText(css).css).toBe(css)
  })
})
