/**
 * What counts as a plain object, by the brand where the host has `node:util` and by the throwing
 * `valueOf` of each box where it has not. Both ways must give one verdict on every value, and the
 * module must not import `node:util`, because a browser harness loads it too.
 */
/* eslint-disable unicorn/new-for-builtins, unicorn/no-null, unicorn/prefer-single-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- the rows build boxed primitives, null prototypes and proxies on purpose, which is the subject of the file */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as PlainObjectModule from '../../src/directive/plain-object.ts'

type PlainObject = typeof PlainObjectModule

const SOURCE = new URL('../../src/directive/plain-object.ts', import.meta.url)

/**
 * A fresh copy of the module, made with the host's `node:util` lookup removed when `isHostBare`.
 */
async function load(isHostBare: boolean): Promise<PlainObject> {
  vi.resetModules()
  if (isHostBare) vi.stubGlobal('process', { ...process, getBuiltinModule: undefined })
  const loaded = await import('../../src/directive/plain-object.ts')
  vi.unstubAllGlobals()
  return loaded
}

/**
 * What `ask` says of `value`, or the message it throws (a revoked proxy cannot be asked).
 */
function verdict(ask: (value: unknown) => unknown, value: unknown): unknown {
  try {
    return ask(value)
  } catch (error) {
    return `throws ${(error as Error).message}`
  }
}

const other = vm.runInNewContext('globalThis') as typeof globalThis

/**
 * The values the verdicts are compared on: boxes of every kind, in this realm and another, values
 * that only look like boxes, and proxies over both.
 */
function corpus(): [string, unknown][] {
  const traps = ['getPrototypeOf', 'get', 'ownKeys', 'getOwnPropertyDescriptor']
  const throwing = Object.fromEntries(
    traps.map((trap) => [
      trap,
      () => {
        throw new Error(trap)
      },
    ]),
  )
  const entries: [string, unknown][] = [
    ['plain', {}],
    ['array', []],
    ['null prototype', Object.create(null)],
    ['null', null],
    ['string', 'x'],
    ['String box', new String('x')],
    ['Number box', new Number(1)],
    ['Boolean box', new Boolean(false)],
    ['BigInt box', Object(1n)],
    ['Symbol box', Object(Symbol('s'))],
    ['String box of another realm', new other.String('x')],
    ['BigInt box of another realm', other.Object(other.BigInt(1))],
    ['String box with a null prototype', Object.setPrototypeOf(new String('x'), null)],
    [
      'Number box with the Object prototype',
      Object.setPrototypeOf(new Number(1), Object.prototype),
    ],
    ['subclass of String', new (class extends String {})('x')],
    ['object made from String.prototype', Object.create(String.prototype)],
    ['object made from BigInt.prototype', Object.create(BigInt.prototype)],
    ['a tag that says String', { [Symbol.toStringTag]: 'String' }],
    [
      'a null prototype with the tag Number',
      Object.assign(Object.create(null), { [Symbol.toStringTag]: 'Number' }),
    ],
    ['a valueOf of its own', { valueOf: () => 1 }],
    [
      'a box with a throwing valueOf',
      Object.assign(new String('x'), {
        valueOf: () => {
          throw new Error('v')
        },
      }),
    ],
    ['date', new Date(0)],
    ['map', new Map()],
    ['function', () => {}],
  ]
  for (const [name, make] of [
    ['plain', () => ({})],
    ['String box', () => new String('x')],
    ['Number box', () => new Number(1)],
    ['BigInt box', () => Object(1n)],
    ['array', () => []],
  ] as const) {
    entries.push([`proxy over ${name}`, new Proxy(make(), {})])
    entries.push([`proxy over ${name}, every trap throwing`, new Proxy(make(), throwing)])
    entries.push([
      `proxy over ${name} claiming String.prototype`,
      new Proxy(make(), { getPrototypeOf: () => String.prototype }),
    ])
    const { proxy, revoke } = Proxy.revocable(make(), {})
    revoke()
    entries.push([`revoked proxy over ${name}`, proxy])
  }
  return entries
}

describe('the verdicts of plain-object.ts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('are the same by the brand and by the throwing valueOf, on every value', async () => {
    const byBrand = await load(false)
    const byValueOf = await load(true)

    for (const [name, value] of corpus()) {
      for (const ask of ['boxedPrimitiveKind', 'isPlainObject'] as const) {
        expect(verdict(byValueOf[ask], value), `${ask} of ${name}`).toBe(
          verdict(byBrand[ask], value),
        )
      }
    }
  })

  it.each([
    ['a plain object', {}, undefined, true],
    ['a String box', new String('x'), 'String', false],
    ['a box of another realm', new other.Number(1), 'Number', false],
    ['an object made from Boolean.prototype', Object.create(Boolean.prototype), 'Boolean', false],
    ['a tag that says String', { [Symbol.toStringTag]: 'String' }, undefined, true],
    ['a box with a null prototype', Object.setPrototypeOf(Object(1n), null), 'BigInt', false],
  ] as const)('read %s as the brand says, either way', async (_name, value, kind, isPlain) => {
    for (const isHostBare of [false, true]) {
      const loaded = await load(isHostBare)

      expect(loaded.boxedPrimitiveKind(value)).toBe(kind)
      expect(loaded.isPlainObject(value)).toBe(isPlain)
    }
  })

  it('ask the box prototypes only where the host has no node:util', async () => {
    const valueOf = vi.spyOn(String.prototype, 'valueOf')

    const byBrand = await load(false)
    byBrand.isPlainObject({})
    expect(valueOf).not.toHaveBeenCalled()

    const byValueOf = await load(true)
    byValueOf.isPlainObject({})
    expect(valueOf).toHaveBeenCalled()
  })

  it('does not import node:util, so a bundler for the browser has nothing to externalise', () => {
    const code = readFileSync(SOURCE, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '')

    expect(code).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+['"]node:/m)
  })
})
