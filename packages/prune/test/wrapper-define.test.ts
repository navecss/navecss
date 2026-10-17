import { atomClassMap } from '@navecss/core/atoms'
import { describe, expect, it } from 'vitest'

import type { ConfigLike } from './helpers/wrapper-config.ts'

import { withNave } from '../src/index.ts'
import { asConfig, DEFINE_KEY, settle } from './helpers/wrapper-config.ts'

/**
 * The define value of a wrapped config, with a message when the key is missing.
 */
function defineOf(config: ConfigLike): unknown {
  const define = config.compiler?.define
  if (define === undefined || !Object.hasOwn(define, DEFINE_KEY)) {
    throw new Error(`compiler.define has no ${DEFINE_KEY}`)
  }
  return define[DEFINE_KEY]
}

/**
 * The map a define value decodes to, after checking the value is a string holding a plain object.
 */
function decoded(value: unknown): Record<string, string> {
  expect(typeof value).toBe('string')
  const map: unknown = JSON.parse(value as string)
  expect(Array.isArray(map)).toBe(false)
  expect(map === null).toBe(false)
  expect(typeof map).toBe('object')
  expect(Object.getPrototypeOf(map)).toBe(Object.prototype)
  return map as Record<string, string>
}

describe("AC-nextjs-used-atoms-22: withNave()'s define carries the keep map as JSON text", () => {
  it('holds, for keep, a string that decodes to the plain object from the atom to its class', () => {
    const config = asConfig(withNave({}, { keep: ['interactive'] }))
    expect(typeof defineOf(config)).toBe('string')
    expect(decoded(defineOf(config))).toEqual({ interactive: atomClassMap.interactive })
    expect(decoded(defineOf(config))).toEqual({ interactive: 'nave-interactive' })
  })

  it('holds keep and every keepFor list', () => {
    const keepFor = { 'kf-lib': ['block'], '@acme/ui': ['flex', 'grid'] } as const
    const config = asConfig(withNave({}, { keep: ['grid'], keepFor }))
    expect(decoded(defineOf(config))).toEqual({
      block: atomClassMap.block,
      flex: atomClassMap.flex,
      grid: atomClassMap.grid,
    })
  })

  it('holds a keepFor entry with no keep', () => {
    const config = asConfig(withNave({}, { keepFor: { 'kf-lib': ['block'] } }))
    expect(decoded(defineOf(config))).toEqual({ block: atomClassMap.block })
  })

  it.each([
    ['no options at all', undefined],
    ['an empty options object', {}],
    ['empty lists', { keep: [], keepFor: {} }],
  ] as const)('is the text {} with %s, with the key still there', (_name, options) => {
    const config = asConfig(withNave({}, options))
    expect(Object.hasOwn(config.compiler?.define ?? {}, DEFINE_KEY)).toBe(true)
    expect(defineOf(config)).toBe('{}')
  })

  it('adds exactly one key to the define and keeps the user entries', () => {
    const user = { compiler: { define: { OWN: '"x"' }, removeConsole: true } }
    const config = asConfig(withNave(user, { keep: ['flex'] }))
    const keys = Object.keys(config.compiler?.define ?? {})
    expect(keys.toSorted((a, b) => a.localeCompare(b))).toEqual(
      ['OWN', DEFINE_KEY].toSorted((a, b) => a.localeCompare(b)),
    )
    expect(config.compiler?.define?.OWN).toBe('"x"')
    expect((config.compiler as Record<string, unknown>).removeConsole).toBe(true)
  })

  it('puts the key in the config a function and an async function return', async () => {
    const options = { keep: ['interactive'] } as const
    const fromFunction = await settle(withNave((): ConfigLike => ({}), options))
    const fromAsync = await settle(
      withNave((): Promise<ConfigLike> => Promise.resolve({}), options),
    )
    expect(decoded(defineOf(fromFunction))).toEqual({ interactive: 'nave-interactive' })
    expect(decoded(defineOf(fromAsync))).toEqual({ interactive: 'nave-interactive' })
  })
})
