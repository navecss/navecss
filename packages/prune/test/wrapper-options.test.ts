import { assertOptions } from '@navecss/core/collect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'

const EXTEND = { brandBox: { declarations: { color: 'red' } } }

/**
 * The message `withNave()` throws for these options, or `undefined` when it does not throw.
 */
function thrownBy(options: unknown): string | undefined {
  try {
    withNave({}, options as never)
  } catch (error) {
    return (error as Error).message
  }
  return undefined
}

/**
 * The message core's validation throws for these options, with the call named `withNave()`.
 */
function coreMessageAsWrapper(options: Record<string, unknown>): string {
  const own = options.extend && typeof options.extend === 'object' ? EXTEND : {}
  try {
    assertOptions(options, new Set(Object.keys(own)))
  } catch (error) {
    const message = (error as Error).message
    expect(message.startsWith('navePlugin(): ')).toBe(true)
    return message.replace('navePlugin(): ', 'withNave(): ')
  }
  throw new Error('core accepts these options, so they are not an invalid value')
}

describe('AC-nextjs-used-atoms-20: withNave() validates its options when it is called', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[HANDOFF_VARIABLE]
  })

  afterEach(() => {
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
  })

  it('refuses an unknown atom in keep with the text of core opening withNave():', () => {
    expect(
      thrownBy({ keep: ['nope'] })?.startsWith('withNave(): keep names an unknown atom "nope".'),
    ).toBe(true)
  })

  it('refuses a near miss with the hint core gives', () => {
    expect(thrownBy({ keep: ['sr-only'] })).toBe(
      'withNave(): keep names an unknown atom "sr-only". Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.',
    )
  })

  it('refuses an unknown atom in a keepFor list', () => {
    expect(thrownBy({ keepFor: { '@acme/ui': ['sr-only'] } })).toBe(
      'withNave(): keepFor["@acme/ui"] names an unknown atom "sr-only". Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.',
    )
  })

  it('refuses an atom of the consumer own in keep when extend is an object', () => {
    expect(thrownBy({ extend: EXTEND, keep: ['brandBox'] })).toBe(
      'withNave(): keep names "brandBox", an atom of your own; those have no class, so there is nothing to keep.',
    )
  })

  it('refuses an atom of the consumer own in keepFor when extend is an object', () => {
    expect(thrownBy({ extend: EXTEND, keepFor: { '@acme/ui': ['brandBox'] } })).toBe(
      'withNave(): keepFor["@acme/ui"] names "brandBox", an atom of your own; those have no class, so there is nothing to keep.',
    )
  })

  it.each([
    ['keep: a string', { keep: 'flex' }],
    ['keep: a number', { keep: 42 }],
    ['keep: a Set', { keep: new Set(['flex']) }],
    ['keep: a list with a number', { keep: [42] }],
    ['keepFor: a string', { keepFor: 'x-lib' }],
    ['keepFor: null', { keepFor: JSON.parse('null') as unknown }],
    ['keepFor: an array', { keepFor: ['flex'] }],
    ['keepFor: an entry that is a string', { keepFor: { a: 'flex' } }],
    ['keepFor: an entry with an unknown atom', { keepFor: { a: ['nope'] } }],
    ['cxModules: a string', { cxModules: './components/ui/index.ts' }],
    ['cxModules: an entry that is a number', { cxModules: ['./a.ts', 7] }],
  ])('refuses %s with core text opening withNave():', (_name, options) => {
    const expected = coreMessageAsWrapper(options)
    expect(expected.startsWith('withNave(): ')).toBe(true)
    expect(thrownBy(options)).toBe(expected)
  })

  it.each([['strict'], [42], ['Error'], ['']])('refuses onUnknown: %j', (value) => {
    const message = thrownBy({ onUnknown: value })
    expect(message?.startsWith('withNave(): ')).toBe(true)
    expect(message).toContain('onUnknown')
  })

  it.each(['error', 'ignore', 'warn'] as const)('accepts onUnknown: %s', (value) => {
    expect(thrownBy({ onUnknown: value })).toBeUndefined()
  })

  it('control: valid options do not throw', () => {
    expect(thrownBy({})).toBeUndefined()
    expect(
      thrownBy({ keep: ['flex', 'srOnly'], keepFor: { '@acme/ui': ['grid'] } }),
    ).toBeUndefined()
    expect(thrownBy({ cxModules: ['./components/ui/index.ts'] })).toBeUndefined()
    expect(thrownBy({ extend: './atoms.mjs', keep: ['brandBox'] })).toBeUndefined()
  })

  it('throws at the call, before a function config is invoked', () => {
    expect(() => withNave(() => ({}), { keep: ['nope'] } as never)).toThrow(
      'withNave(): keep names an unknown atom "nope".',
    )
  })
})
