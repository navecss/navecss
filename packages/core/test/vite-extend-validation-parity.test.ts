/**
 * The Vite plugin may import no PostCSS, so it validates `extend` with the core's own tokenizer
 * (`validateExtendAtomsHostFree`). This is the parity table that keeps the two honest: every atom
 * the PostCSS-backed `validateExtendAtoms` refuses is refused host-free too, with the same message,
 * on a fixed matrix of injection shapes and benign ones and on every short string built from the
 * fragments an injection is made of; and the check is applied to a snapshot of the map, never to
 * live lookups.
 */
import vm from 'node:vm'
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

  it.each([
    ['Infinity', Number.POSITIVE_INFINITY, 'Infinity'],
    ['-Infinity', Number.NEGATIVE_INFINITY, '-Infinity'],
  ])('a non-finite number atom (%s) is printed as itself, not as null', (_name, atom, printed) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, { sneaky: atom as never })

      expect(refused).toBe(true)
      expect(message).toContain(`is a number, not a plain object: ${printed}.`)
      expect(message).not.toContain(': null')
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

describe('a refusal that stays inside its rule does not claim to break out of it', () => {
  const STAYS = 'though it would stay inside the rule it is spliced into'
  const BREAKS = 'would break out of the rule it is spliced into'

  it.each([
    ['a value ending in a semicolon', decl('aa;')],
    ['a value ending in a backslash', decl('aa\\')],
    ['a value with a comment in it', decl('red /* note */')],
    ['a value that adds a declaration', decl('red; background: blue')],
    ['a property with a space in it', decl('red', 'a b')],
  ])('%s is refused as staying inside the rule', (_name, extend) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, extend)

      expect(refused).toBe(true)
      expect(message).toContain(STAYS)
      expect(message).toContain('Write exactly one, with nothing else in it')
      expect(message).not.toContain('would break out')
    }
  })

  it.each([
    ['a value that closes the rule', decl('red; } body { x: y')],
    ['a pseudo that opens a second rule', pseudo(':hover{} body')],
    ['a media condition that opens a second rule', media('(x) { } body { color: red } @media (y)')],
  ])('%s is refused as breaking out of the rule', (_name, extend) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, extend)

      expect(refused).toBe(true)
      expect(message).toContain(BREAKS)
      expect(message).not.toContain(STAYS)
    }
  })

  it.each([
    ['a value ending in a semicolon', decl('aa;')],
    ['a value ending in a backslash', decl('aa\\')],
    ['a value with a comment in it', decl('red /* note */')],
    ['a value that adds a declaration', decl('red; background: blue')],
    ['a property with a space in it', decl('red', 'a b')],
    ['a value that closes the rule', decl('red; } body { x: y')],
    ['a pseudo that opens a second rule', pseudo(':hover{} body')],
    ['a media condition that opens a second rule', media('(x) { } body { color: red } @media (y)')],
  ])('%s: both validators print the identical message', (_name, extend) => {
    expect(verdict(validateExtendAtomsHostFree, extend).message).toBe(
      verdict(validateExtendAtoms, extend).message,
    )
  })
})

describe('a boxed primitive is not a plain object, so it is refused and never read as a map', () => {
  const nested = (declarations: unknown) => ({
    a: { declarations: { color: 'red' }, pseudos: { ':hover': declarations } },
  })

  it.each([
    [
      "new String('x') as a pseudo's declarations",
      nested(new String('x')),
      'a String object',
      '"x"',
    ],
    ["new String('x') as an atom", { a: new String('x') }, 'a String object', '"x"'],
    [
      'new Number(1) as a media block',
      { a: { declarations: {}, media: { '(min-width: 1px)': new Number(1) } } },
      'a Number object',
      '1',
    ],
    [
      'new Boolean(true) as a container map',
      { a: { declarations: {}, container: new Boolean(true) } },
      'a Boolean object',
      'true',
    ],
  ])('%s is refused by both validators, naming its kind', (_name, extend, kind, printed) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      const { refused, message } = verdict(validate, extend as never)

      expect(refused).toBe(true)
      expect(message).toContain(`is ${kind}, not a plain object: ${printed}.`)
    }
  })

  it('a boxed string as a pseudo’s declarations emits no numbered declaration through the PostCSS adapter', async () => {
    const { default: postcss } = await import('postcss')
    const { navePlugin: postcssNave } = await import('../src/postcss.ts')

    expect(() => postcssNave({ extend: nested(new String('ab')) as never })).toThrow(
      /is a String object, not a plain object/,
    )
    const css = await postcss([postcssNave({ extend: nested(undefined) as never })]).process(
      '.x { @nave a; }',
      { from: undefined },
    )
    expect(css.css).not.toMatch(/0:\s*a/)
  })

  it('an instance of a class with a declarations property still expands', async () => {
    class Atom {
      declarations = { color: 'red' }
    }
    const run = await runHook({
      code: '.x { @nave a; }',
      options: { extend: { a: new Atom() as never } },
    })

    expect(run.code).toContain('color: red;')
  })
})

describe('a String object as an atom’s own declarations is refused like every nested position', () => {
  it("a String object as an atom's own declarations never reaches the CSS, through either adapter", async () => {
    const extend = { a: { declarations: new String('} body { display: none; }') as never } }
    const viaVite = await runHook({ code: '.x { @nave a; }', options: { extend } }).then(
      (run) => run.code ?? '',
      () => '',
    )
    const { default: postcss } = await import('postcss')
    const { navePlugin: postcssNave } = await import('../src/postcss.ts')
    const viaPostcss = await Promise.resolve()
      .then(() =>
        postcss([postcssNave({ extend })]).process('.x { @nave a; }', { from: undefined }),
      )
      .then(
        (result) => result.css,
        () => '',
      )

    expect(viaVite).not.toMatch(/\b0: \}/)
    expect(viaPostcss).not.toMatch(/\b0: \}/)
  })
})

describe('a boxed primitive is recognised by its brand, never by its Symbol.toStringTag', () => {
  const retagged = Object.assign(new String('x'), { [Symbol.toStringTag]: 'Object' })
  const tagged = { declarations: { color: 'red' }, [Symbol.toStringTag]: 'String' }
  const nested = (declarations: unknown) => ({
    a: { declarations: { color: 'red' }, pseudos: { ':hover': declarations } },
  })

  async function viaBoth(extend: Record<string, unknown>): Promise<(string | undefined)[]> {
    const { default: postcss } = await import('postcss')
    const { navePlugin: postcssNave } = await import('../src/postcss.ts')
    const viaVite = await runHook({
      code: '.x { @nave a; }',
      options: { extend: extend as never },
    }).then(
      (run) => run.code,
      () => undefined,
    )
    const viaPostcss = await Promise.resolve()
      .then(() =>
        postcss([postcssNave({ extend: extend as never })]).process('.x { @nave a; }', {
          from: undefined,
        }),
      )
      .then(
        (result) => result.css,
        () => undefined,
      )
    return [viaVite, viaPostcss]
  }

  it.each([
    ['a String object retagged as an Object, as a pseudo’s declarations', nested(retagged)],
    [
      'a Proxy over a String object, as a pseudo’s declarations',
      nested(new Proxy(new String('ab'), {})),
    ],
    [
      'a String object from another realm, as a pseudo’s declarations',
      nested(vm.runInNewContext("new String('x')")),
    ],
  ])('%s is refused, so no numbered declaration is emitted', async (_name, extend) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      expect(verdict(validate, extend as never).refused).toBe(true)
    }
    for (const output of await viaBoth(extend)) expect(output).toBeUndefined()
  })

  it.each([
    ['a plain object tagged String', { a: tagged }],
    [
      'a plain object from another realm',
      { a: vm.runInNewContext("({ declarations: { color: 'red' } })") },
    ],
  ])('%s still expands', async (_name, extend) => {
    for (const output of await viaBoth(extend)) expect(output).toContain('color: red')
  })
})

describe('a refusal says whether the string, as the expander splices it, leaves the rule', () => {
  it.each([
    ['a pseudo with a stray closing brace', pseudo(':hover}')],
    ['a media condition with a stray closing brace', media('(min-width: 1px)}')],
    ['a container condition with a stray closing brace', container('(width > 1px) }')],
    ['a value whose string a line break cuts', decl('a"\n')],
  ])('%s says it would break out of the rule: spliced, it ends the rule early', (_name, extend) => {
    for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
      expect(verdict(validate, extend).message).toContain('would break out of the rule')
    }
  })

  it.each([
    ['a pseudo ending in a backslash', pseudo(':hover\\')],
    ['a media condition ending in a backslash', media('(min-width: 1px)\\')],
  ])(
    '%s says it would stay inside the rule: spliced, the backslash escapes the space before the block',
    (_name, extend) => {
      for (const validate of [validateExtendAtoms, validateExtendAtomsHostFree]) {
        expect(verdict(validate, extend).message).toContain('would stay inside the rule')
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
