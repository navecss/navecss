/**
 * AC-directive-core-11: the directive's prelude is read as CSS component
 * values, not split on whitespace. An ident is a candidate atom name; a
 * comma, a string, a number, a function with its arguments, a `[...]`/`{...}`
 * block and a `!` plus the ident after it are each their own one `bad-token`
 * component.
 */
import { describe, expect, it } from 'vitest'

import { readPreludeComponents } from '../../src/directive/prelude-components.ts'

describe('AC-directive-core-11 — the prelude is read as component values', () => {
  it.each([
    ['flex block', ['flex', 'block']],
    ['flex /* c */ block', ['flex', 'block']],
    ['flex/**/block', ['flex', 'block']],
  ])('%s: two idents, no bad-token', (prelude, expected) => {
    const components = readPreludeComponents(prelude)

    expect(components.map((c) => c.kind)).toEqual(['ident', 'ident'])
    expect(components.map((c) => (c.kind === 'ident' ? c.name : undefined))).toEqual(expected)
  })

  it.each(['flex, block', 'flex,block'])(
    '%s: one bad-token for the comma, between the two idents',
    (prelude) => {
      const components = readPreludeComponents(prelude)

      expect(components.map((c) => c.kind)).toEqual(['ident', 'bad-token', 'ident'])
      expect(components[1]).toMatchObject({ kind: 'bad-token', text: ',' })
    },
  )

  it('flex !important: one bad-token spanning the whole !important', () => {
    const components = readPreludeComponents('flex !important')

    expect(components.map((c) => c.kind)).toEqual(['ident', 'bad-token'])
    expect(components[1]).toMatchObject({ kind: 'bad-token', text: '!important' })
  })

  it('flex "block": one bad-token for the string', () => {
    const components = readPreludeComponents('flex "block"')

    expect(components.map((c) => c.kind)).toEqual(['ident', 'bad-token'])
    expect(components[1]).toMatchObject({ kind: 'bad-token', text: '"block"' })
  })

  it('flex 2: one bad-token for the number', () => {
    const components = readPreludeComponents('flex 2')

    expect(components.map((c) => c.kind)).toEqual(['ident', 'bad-token'])
    expect(components[1]).toMatchObject({ kind: 'bad-token', text: '2' })
  })

  it('flex var(--x, a b): one bad-token spanning the whole function, comma included', () => {
    const components = readPreludeComponents('flex var(--x, a b)')

    expect(components.map((c) => c.kind)).toEqual(['ident', 'bad-token'])
    expect(components[1]).toMatchObject({ kind: 'bad-token', text: 'var(--x, a b)' })
  })

  it('.flex: one bad-token for the dot, flex still an ident', () => {
    const components = readPreludeComponents('.flex')

    expect(components.map((c) => c.kind)).toEqual(['bad-token', 'ident'])
    expect(components[0]).toMatchObject({ kind: 'bad-token', text: '.' })
    expect(components[1]).toMatchObject({ kind: 'ident', name: 'flex' })
  })

  it('flex [a]: one bad-token for the bracket group', () => {
    const components = readPreludeComponents('flex [a]')

    expect(components.map((c) => c.kind)).toEqual(['ident', 'bad-token'])
    expect(components[1]).toMatchObject({ kind: 'bad-token', text: '[a]' })
  })

  it('nope flex: both idents — an unrecognised name is plan()/resolve()’s job, not the prelude reader’s', () => {
    const components = readPreludeComponents('nope flex')

    expect(components.map((c) => c.kind)).toEqual(['ident', 'ident'])
  })

  it('offsets span exactly the component text, for positioning', () => {
    const components = readPreludeComponents('flex !important')
    const bangIdent = components[1]!

    expect('flex !important'.slice(bangIdent.offset, bangIdent.endOffset)).toBe('!important')
  })
})
