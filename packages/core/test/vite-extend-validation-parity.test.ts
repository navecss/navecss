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
    ['true', true],
  ])('%s', (_name, atom) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, { sneaky: atom as never })

      expect(refused).toBe(true)
      expect(message).toContain('atom "sneaky"')
      expect(message).toContain('not a plain object')
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

  it('false (what `cond && { ... }` gives) is read as an unknown atom where a directive uses it, not refused up front', () => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      expect(verdict(validate, { sneaky: false as never }).refused).toBe(false)
    }
  })

  it.each([
    ['0', 0],
    ['an empty string', ''],
    ['NaN', Number.NaN],
    ['-0', -0],
  ])(
    '%s is read as an unknown atom where a directive uses it, not refused up front',
    (_name, atom) => {
      for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
        expect(verdict(validate, { sneaky: atom as never }).refused).toBe(false)
      }
    },
  )

  it('a false atom that a directive uses reports an unknown atom through onUnknown', async () => {
    const run = await runHook({
      code: '.a { @nave x; }',
      options: { extend: { x: false as never }, onUnknown: 'error' },
    })

    expect(run.error?.message).toMatch(/unknown atom "x"/)
  })
})

describe('a falsy value at a nested position is skipped, so `cond && { ... }` keeps building', () => {
  const when = '(min-width: 1px)'
  const positions: readonly (readonly [string, (value: unknown) => Record<string, unknown>])[] = [
    ['a pseudos map', (value) => ({ pseudos: value })],
    ['a media map', (value) => ({ media: value })],
    ['a container map', (value) => ({ container: value })],
    ['a pseudo’s declarations', (value) => ({ pseudos: { ':hover': value } })],
    ['a media block', (value) => ({ media: { [when]: value } })],
    ['a container block', (value) => ({ container: { [when]: value } })],
    ['a media block’s declarations', (value) => ({ media: { [when]: { declarations: value } } })],
    [
      'a media block’s pseudos map',
      (value) => ({ media: { [when]: { declarations: { margin: '1px' }, pseudos: value } } }),
    ],
    [
      'a media block’s pseudo declarations',
      (value) => ({
        media: { [when]: { declarations: { margin: '1px' }, pseudos: { ':focus': value } } },
      }),
    ],
  ]
  const cases = positions.flatMap(([name, at]) =>
    [false, null].map((value) => [`${name} is ${String(value)}`, at(value)] as const),
  )

  it.each(cases)('%s: it builds and nothing comes from that position', async (_name, nested) => {
    const run = await runHook({
      code: '.a { @nave nested; }',
      options: { extend: { nested: { declarations: { color: 'red' }, ...nested } as never } },
    })

    expect(run.error).toBeUndefined()
    expect(run.code).toContain('color: red;')
    expect(run.code).not.toMatch(/&:hover|&:focus|@container/)
    expect(run.code).not.toMatch(/\{\s*\}/)
    if (!JSON.stringify(nested).includes('margin')) expect(run.code).not.toContain('@media')
  })

  it('a pseudo whose declarations are null expands without throwing', async () => {
    const run = await runHook({
      code: '.a { @nave nested; }',
      options: {
        extend: {
          nested: { declarations: { color: 'red' }, pseudos: { ':hover': null } } as never,
        },
      },
    })

    expect(run.code).toContain('color: red;')
  })

  it('a media block that is null expands without throwing', async () => {
    const run = await runHook({
      code: '.a { @nave nested; }',
      options: {
        extend: { nested: { declarations: { color: 'red' }, media: { md: null } } as never },
      },
    })

    expect(run.code).toContain('color: red;')
  })
})

describe('a refusal says why it refuses', () => {
  const svg = decl(
    `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><style>circle{fill:red}</style></svg>")`,
    'background-image',
  )

  it.each([
    ['a function atom', { sneaky: (() => {}) as never }],
    ['an inline SVG data URI holding a <style> element', svg],
  ])('%s is refused without claiming it would break out of the rule', (_name, extend) => {
    const { refused, message } = verdict(validateExtendAtomsHostFree, extend)

    expect(refused).toBe(true)
    expect(message).not.toContain('would break out of the rule')
  })

  it('a real break-out still says it would break out of the rule', () => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, decl('red; } body { x: y'))

      expect(refused).toBe(true)
      expect(message).toContain('would break out of the rule it is spliced into')
    }
  })

  it('a value that is not a plain object names its kind, and prints the value only when it can', () => {
    const cases: readonly (readonly [Record<string, unknown>, string])[] = [
      [
        { sneaky: () => {} },
        'atom "sneaky" is a function, not a plain object. Write an atom as { declarations: { ... } }. ',
      ],
      [
        { brandBox: 'abc' },
        'atom "brandBox" is a string, not a plain object: "abc". Write an atom as { declarations: { ... } }. ',
      ],
      [
        { brandBox: true },
        'atom "brandBox" is a boolean, not a plain object: true. Write an atom as { declarations: { ... } }. ',
      ],
      [
        { card: { declarations: {}, pseudos: { ':hover': ['a; } body { display: none'] } } },
        `atom "card"'s pseudo ":hover"'s declarations is an array, not a plain object: ["a; } body { display: none"]. Write it as a plain object ({ ... }). `,
      ],
    ]
    for (const [extend, expected] of cases) {
      for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
        expect(verdict(validate, extend as never).message).toContain(expected)
      }
    }
  })

  it('a value written back changed says so, and how to write it', () => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { message } = verdict(validate, svg)

      expect(message).toContain('parses, but would not be written back exactly as given: ')
      expect(message).toContain(String.raw`write the "<" as \3c with a space after it (\3c /style)`)
    }
  })

  it.each([
    ['a break-out', decl('red; } body { x: y')],
    ['a value of the wrong kind', { sneaky: 'abc' as never }],
    [
      'an array where a declarations map belongs',
      { x: { declarations: {}, pseudos: { ':hover': ['a; } b'] } } } as never,
    ],
    ['an HTML sequence', svg],
    ['a custom property’s trailing space', decl('red ', '--x')],
    ['a trailing escaped space', decl(String.raw`\a `)],
    ['a media condition ending in an escaped space', media(String.raw`\a `)],
    ['an escaped comment opener', decl(String.raw`red\/*x*/`)],
    ['an escaped space inside a property name', decl('red', String.raw`a\ b`)],
    ['a media condition ending in a comment', media('(x) /* c */')],
  ])('%s: both validators print the same reason', (_name, extend) => {
    const viaPostcss = verdict(validateExtendAtoms, extend)
    const hostFree = verdict(validateExtendAtomsHostFree, extend)

    expect(viaPostcss.refused).toBe(true)
    expect(hostFree.message).toBe(viaPostcss.message)
  })
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

  it('a function-valued atom whose declarations getter turns evil on its second read is refused (Vite)', async () => {
    await expect(
      runHook({
        code: '.a { @nave sneaky; }',
        options: { extend: { sneaky: flippingFunctionAtom() as never } },
      }),
    ).rejects.toThrow(/atom "sneaky" is a function, not a plain object/)
  })

  it('the same atom is refused through the PostCSS adapter', async () => {
    const { navePlugin: postcssNave } = await import('../src/postcss.ts')

    expect(() => postcssNave({ extend: { sneaky: flippingFunctionAtom() as never } })).toThrow(
      /atom "sneaky" is a function, not a plain object/,
    )
  })
})
