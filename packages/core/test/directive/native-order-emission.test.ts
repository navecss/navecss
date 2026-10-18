/**
 * Where `@nave` puts what it expands: each atom's body right at the directive, in `resolve()`'s
 * order, and whatever the rule says after it in authored order, wrapped in `& { }` where it
 * follows a nested node. Both hosts (the PostCSS plugin and the text expander) are asserted on
 * the same rows.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { atoms } from '../../src/atoms.ts'
import { isEquivalent } from '../helpers/css-equivalence.ts'
import { childrenOf, kindsOf, viaPostcss, viaText } from '../helpers/native-order.ts'

const BOX: Record<string, AtomDefinition> = {
  box: {
    declarations: { color: 'red' },
    pseudos: { ':hover': { color: 'blue' } },
    media: { '(width >= 48em)': { declarations: { padding: '1px' } } },
    container: { '(width > 10em)': { declarations: { margin: '1px' } } },
  },
}

const HOSTS = [
  ['the PostCSS host', (css: string) => viaPostcss(css, { extend: BOX })],
  ['the text expander', (css: string) => Promise.resolve(viaText(css, { extend: BOX }))],
] as const

const ATOMIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/atomic.css')

/**
 * `dist/atomic.css`'s rule for `name`, as the kinds of its children.
 */
function atomicKinds(name: string): string[] {
  const className = `.nave-${name.replaceAll(/([A-Z])/g, '-$1').toLowerCase()}`
  const css = readFileSync(ATOMIC, 'utf8')
  return kindsOf(css, className)
}

describe.each(HOSTS)(
  'AC-native-apply-order-01 — each atom sits at the directive (%s)',
  (_name, run) => {
    it.each([
      [
        '.x { @nave focusRing hideDesktopUp flex; }',
        ['decl outline', 'rule &:focus-visible', 'at media (width >= 75em)', 'rule &'],
      ],
      [
        '.x { @nave srOnlyFocusable flex; }',
        [
          ...Object.keys(atoms.srOnlyFocusable.declarations).map((p) => `decl ${p}`),
          'rule &:focus-visible',
          'rule &:focus-within',
          'rule &',
        ],
      ],
      [
        '.x { @nave box flex; }',
        [
          'decl color',
          'rule &:hover',
          'at media (width >= 48em)',
          'at container (width > 10em)',
          'rule &',
        ],
      ],
    ])('%s keeps the atoms in order', async (input, expected) => {
      expect(kindsOf(await run(input))).toEqual(expected)
    })

    it('wraps the later atom declarations and nothing else in the first row', async () => {
      const output = await run('.x { @nave focusRing hideDesktopUp flex; }')

      expect(childrenOf(output).at(-1)).toBe('& { display: flex }')
      expect(childrenOf(output)[2]).toBe('@media (width >= 75em) { & { display: none } }')
    })

    it('emits, for every built-in atom, the parts its .nave- class rule holds, in that order', async () => {
      for (const name of Object.keys(atoms)) {
        const output = await run(`.x { @nave ${name}; }`)
        expect(kindsOf(output), name).toEqual(atomicKinds(name))
      }
    })

    it('is red against a copy whose parts are swapped (control)', async () => {
      const kinds = kindsOf(await run('.x { @nave srOnlyFocusable; }'))
      const swapped = [...kinds.slice(1), kinds[0]!]

      expect(kinds).toEqual(atomicKinds('srOnlyFocusable'))
      expect(swapped).not.toEqual(atomicKinds('srOnlyFocusable'))
    })
  },
)

describe.each(HOSTS)('AC-native-apply-order-03 — runs after a nested node (%s)', (_name, run) => {
  it.each([
    [
      '.x { @nave hideDesktopUp; color: red; /* c */ gap: 1px; }',
      ['@media (width >= 75em) { & { display: none } }', '& { color: red; /* c */ gap: 1px }'],
    ],
    [
      '.x { @nave hideDesktopUp; color: red; &:hover { color: blue } gap: 1px; }',
      [
        '@media (width >= 75em) { & { display: none } }',
        '& { color: red }',
        '&:hover { color: blue }',
        '& { gap: 1px }',
      ],
    ],
    [
      '.x { @nave focusRing flex; color: red; }',
      [
        'outline: none',
        expect.stringMatching(/^&:focus-visible \{/),
        '& { display: flex }',
        '& { color: red }',
      ],
    ],
    [
      '.x { &:hover { color: blue } @nave flex; color: red; }',
      ['&:hover { color: blue }', '& { display: flex }', '& { color: red }'],
    ],
    [
      '.x { @nave flex; &:hover { color: blue } color: red; }',
      ['display: flex', '&:hover { color: blue }', '& { color: red }'],
    ],
    [
      '.x { color: red; @nave hideDesktopUp; }',
      ['color: red', '@media (width >= 75em) { & { display: none } }'],
    ],
    [
      '.x { @nave flex textLeft; color: red; }',
      ['display: flex', 'text-align: left', 'color: red'],
    ],
    [
      '.x { @nave hideDesktopUp; @media (x) { color: red } gap: 1px; }',
      [
        '@media (width >= 75em) { & { display: none } }',
        '@media (x) { color: red }',
        '& { gap: 1px }',
      ],
    ],
  ])('%s', async (input, expected) => {
    expect(childrenOf(await run(input))).toEqual(expected)
  })

  it('never wraps a rule, an at-rule or nothing, nor a directive and rule declaration together', async () => {
    const output = await run(
      '.x { @nave focusRing flex; color: red; @nave hideDesktopUp; gap: 1px }',
    )

    postcss.parse(output).walkRules('&', (wrapper) => {
      expect(wrapper.nodes.length).toBeGreaterThan(0)
      expect(wrapper.nodes.every((node) => node.type === 'decl' || node.type === 'comment')).toBe(
        true,
      )
    })
    expect(childrenOf(output)).toContain('& { display: flex }')
    expect(childrenOf(output)).toContain('& { color: red }')
  })

  it('keeps own declarations before the directive exactly as authored', async () => {
    const output = await run('.x { &:hover { color: blue } color: red; @nave flex; }')

    expect(childrenOf(output)).toEqual([
      '&:hover { color: blue }',
      'color: red',
      '& { display: flex }',
    ])
  })
})

describe.each(HOSTS)('AC-native-apply-order-04 — several directives (%s)', (_name, run) => {
  it('expands each at its own position', async () => {
    const output = await run('.x { @nave hideDesktopUp; color: red; @nave focusRing; gap: 1px; }')

    expect(kindsOf(output)).toEqual([
      'at media (width >= 75em)',
      'rule &',
      'rule &',
      'rule &:focus-visible',
      'rule &',
    ])
    expect(childrenOf(output)[1]).toBe('& { color: red }')
    expect(childrenOf(output)[2]).toBe('& { outline: none }')
    expect(childrenOf(output)[4]).toBe('& { gap: 1px }')
  })
})

describe('AC-native-apply-order-04 — both hosts agree', () => {
  it('produces equivalent output', async () => {
    const css = '.x { @nave hideDesktopUp; color: red; @nave focusRing; gap: 1px; }'

    expect(isEquivalent(await viaPostcss(css), viaText(css))).toBe(true)
  })
})

describe('AC-native-apply-order-02 — nothing is appended at the end of the rule', () => {
  it.each(HOSTS)(
    '%s ends the rule with the wrapper holding the declaration',
    async (_name, run) => {
      const output = await run('.x { @nave hideDesktopUp; color: red; }')

      expect(childrenOf(output).at(-1)).toBe('& { color: red }')
      expect(kindsOf(output)).toEqual(['at media (width >= 75em)', 'rule &'])
    },
  )

  it('is red when the media block is moved after the wrapper (control)', async () => {
    const output = await viaPostcss('.x { @nave hideDesktopUp; color: red; }')
    const moved = '.x { & { color: red } @media (width >= 75em) { & { display: none } } }'

    expect(isEquivalent(output, moved)).toBe(false)
  })
})
