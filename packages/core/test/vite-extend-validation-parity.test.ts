/**
 * The Vite plugin may import no PostCSS, so it validates `extend` with the core's own tokenizer
 * (`validateExtendAtomsHostFree`). This is the parity table that keeps the two honest: every atom
 * the PostCSS-backed `validateExtendAtoms` refuses is refused host-free too, with the same message,
 * on a fixed matrix of injection shapes and benign ones and on every short string built from the
 * fragments an injection is made of; and the check is applied to a snapshot of the map, never to
 * live lookups.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../src/atoms.ts'

import { navePlugin } from '../src/vite.ts'
import { validateExtendAtoms } from '../src/validate-extend-atoms.ts'
import { validateExtendAtomsHostFree } from '../src/validate-extend-host-free.ts'
import { runHook } from './helpers/vite-hook.ts'

type Atom = AtomDefinition

const decl = (value: string, prop = 'color'): Record<string, Atom> => ({
  x: { declarations: { [prop]: value } },
})
const pseudo = (key: string): Record<string, Atom> => ({
  x: { declarations: {}, pseudos: { [key]: { color: 'red' } } },
})
const media = (condition: string): Record<string, Atom> => ({
  x: { declarations: {}, media: { [condition]: { declarations: { color: 'red' } } } },
})
const container = (condition: string): Record<string, Atom> => ({
  x: { declarations: {}, container: { [condition]: { declarations: { color: 'red' } } } },
})

const MATRIX: readonly (readonly [string, Record<string, Atom>])[] = [
  // benign: each of these is accepted by both
  ['a plain value', decl('red')],
  ['!important', decl('1px solid red !important')],
  ['var() with a fallback', decl('var(--x, 1px)')],
  ['calc()', decl('calc(1px + 2px)')],
  ['a semicolon inside url("...")', decl('url("a;b")')],
  ['a semicolon inside a string', decl('"a;b"')],
  ['a closing brace inside a string', decl('"a}b"')],
  ['a custom property', decl('red', '--x')],
  ['a pseudo with a class', pseudo(':hover')],
  ['a pseudo list', pseudo(':hover, :focus')],
  ['an attribute selector', pseudo('[data-a="b"]')],
  ['a media condition', media('(min-width: 600px)')],
  ['a container condition', container('(width > 1px)')],
  // injection: each of these is refused by both
  ['a value that closes the rule', decl('red; } body { display: none')],
  ['a value that adds a declaration', decl('red; color: blue')],
  ['a value ending in a semicolon', decl('red;')],
  ['a value with a stray closing brace', decl('red } body { display: none')],
  ['a value that opens a block', decl('red { x: y }')],
  ['a value that imports', decl('red; @import "x"')],
  ['an unclosed string', decl('"unclosed')],
  ['an unclosed paren', decl('rgb(')],
  ['a property that closes the rule', decl('red', 'a}b{c')],
  ['a property with a semicolon', decl('red', 'a;b')],
  ['a property with a colon and a value', decl('red', 'color:red;x')],
  ['a pseudo that opens a block', pseudo(':hover{color:red}')],
  ['a pseudo that adds a rule', pseudo(':hover { } .x')],
  ['a pseudo that closes the rule', pseudo('}')],
  ['a pseudo that is an at-rule', pseudo('@media x')],
  ['an empty pseudo branch', pseudo(':hover,')],
  ['a media condition that opens a second rule', media('(x) { } body { color: red } @media (y)')],
  ['a media condition with a block', media('(x){a:b}')],
  ['a container condition that closes the rule', container('}')],
  ['a media condition ending in a comment', media('(x) /* c */')],
]

function verdict(validate: (extend: Record<string, Atom>) => void, extend: Record<string, Atom>) {
  try {
    validate(extend)
    return { refused: false, message: '' }
  } catch (error) {
    return { refused: true, message: (error as Error).message }
  }
}

describe('the host-free extend validator agrees with the PostCSS-backed one', () => {
  it.each(MATRIX)('%s', (_name, extend) => {
    const viaPostcss = verdict(validateExtendAtoms, extend)
    const hostFree = verdict(validateExtendAtomsHostFree, extend)

    expect(hostFree).toEqual(viaPostcss)
  })

  it('the matrix holds both verdicts, so agreement is not vacuous', () => {
    const verdicts = MATRIX.map(([, extend]) => verdict(validateExtendAtoms, extend).refused)

    expect(verdicts).toContain(true)
    expect(verdicts).toContain(false)
  })

  it('refuses at least every string the PostCSS-backed validator refuses, over every short injection', () => {
    const fragments = [
      'red',
      ';',
      '}',
      '{',
      '/* c */',
      '"',
      '(',
      ')',
      '@media (x)',
      '@import "x"',
      '!important',
      '\n',
      ' ',
      '/*',
      '<!--',
      '</style',
      '\\',
      'url(',
      ':',
      '--x',
      ',',
      '&',
      ':hover',
    ]
    const shapes = [decl, pseudo, media, container, (v: string) => decl(v, '--x')]
    const unsafe: string[] = []
    const build = function* (depth: number, prefix = ''): Generator<string> {
      yield prefix
      if (depth === 0) return
      for (const fragment of fragments) yield* build(depth - 1, prefix + fragment)
    }
    for (const text of new Set(build(3))) {
      for (const shape of shapes) {
        const extend = shape(text)
        const refusedByPostcss = verdict(validateExtendAtoms, extend).refused
        const refusedHostFree = verdict(validateExtendAtomsHostFree, extend).refused
        if (refusedByPostcss && !refusedHostFree) unsafe.push(JSON.stringify(text))
      }
    }

    expect(unsafe).toEqual([])
  }, 60_000)
})

describe('the host-free extend validator refuses strings only a browser or an HTML host can misread', () => {
  it.each([
    ['a value carrying a style end tag', decl('"</style><script>x</script>"', 'content')],
    ['a value carrying an HTML comment opener', decl('red<!--')],
    ['a custom property carrying an HTML comment opener', decl('a<!--', '--x')],
    ['a value ending in an escape and a space', decl(String.raw`\a `)],
    ['a property ending in an escaped space', decl('red', String.raw`a\ `)],
    ['a media condition ending in an escape and a space', media(String.raw`\a `)],
  ])('%s: the host-free validator refuses what the PostCSS-backed one refuses', (_name, extend) => {
    expect(verdict(validateExtendAtoms, extend).refused).toBe(true)
    expect(verdict(validateExtendAtomsHostFree, extend).refused).toBe(true)
  })
})

describe('an atom that is not a plain object is refused by both validators, used or not', () => {
  it.each([
    ['a function', () => {}],
    ['an array', [{ color: 'red' }]],
    ['a string', 'color: red'],
    ['a number', 42],
    ['zero', 0],
    ['an empty string', ''],
  ])('%s', (_name, atom) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, { sneaky: atom as never })

      expect(refused).toBe(true)
      expect(message).toContain('atom "sneaky"')
    }
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])(
    '%s is still read as an unknown atom where a directive uses it, not refused up front',
    (_name, atom) => {
      for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
        expect(verdict(validate, { sneaky: atom as never }).refused).toBe(false)
      }
    },
  )
})

describe('the Vite plugin validates extend before it reaches expandText()', () => {
  it('a value that closes the rule is refused, where expandText() alone would splice it', () => {
    const evil = { evil: { declarations: { color: 'red; } body { display: none' } } }

    expect(() => navePlugin({ extend: evil })).toThrow(/does not parse as a single/)
  })

  it('a media condition that opens a second rule is refused', () => {
    const evil = {
      evil: { declarations: {}, media: { '(x) { } body { color: red } @media (y)': {} } },
    }

    expect(() => navePlugin({ extend: evil })).toThrow(/does not parse as a single/)
  })

  it('reads the map once, into a snapshot: a getter that turns evil on its second read changes nothing', async () => {
    let reads = 0
    const declarations = {
      get color(): string {
        reads += 1
        return reads === 1 ? 'red' : 'red; } body { display: none'
      },
    }

    const run = await runHook({
      code: '.a { @nave sneaky; }',
      options: { extend: { sneaky: { declarations } } },
    })

    expect(run.code).toContain('color: red;')
    expect(run.code).not.toContain('body')
  })

  const flippingFunctionAtom = () => {
    let reads = 0
    return Object.defineProperty(function atom() {}, 'declarations', {
      enumerable: true,
      get: () => (++reads === 1 ? { color: 'red' } : { color: 'red; } body { display: none' }),
    })
  }

  it('a function-valued atom whose declarations getter turns evil on its second read changes nothing (Vite)', async () => {
    const run = await runHook({
      code: '.a { @nave sneaky; }',
      options: { extend: { sneaky: flippingFunctionAtom() as never } },
    }).catch(() => undefined)

    expect(run?.code ?? '').not.toContain('body')
  })

  it('the same atom changes nothing through the PostCSS adapter', async () => {
    const { default: postcss } = await import('postcss')
    const { navePlugin: postcssNave } = await import('../src/postcss.ts')
    const css = await Promise.resolve()
      .then(() =>
        postcss([postcssNave({ extend: { sneaky: flippingFunctionAtom() as never } })]).process(
          '.a { @nave sneaky; }',
          { from: undefined },
        ),
      )
      .then(
        (result) => result.css,
        () => '',
      )

    expect(css).not.toContain('body')
  })
})
