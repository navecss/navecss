/**
 * AC-directive-core-19: one corpus, every leg present at the slice (the
 * PostCSS adapter and expandText()), one equivalence.
 */
import postcss, { type ChildNode, type Container } from 'postcss'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { expandText } from '../../src/directive/expand-text.ts'
import { navePlugin } from '../../src/postcss.ts'

const EXTEND: Record<string, AtomDefinition> = {
  brandBox: { declarations: { color: 'red', padding: '1px' } },
}

const CORPUS: readonly string[] = [
  '.a { color: red; @nave flex; }',
  '.a, .b { @nave focusRing; }',
  '.a, .b { @nave hidePhoneOnly; }',
  '.x { @nave first; @nave second; }',
  '.card { &:hover { color: red; } @nave interactive; }',
  '.card { @nave interactive; &:hover { color: red; } }',
  '.card { &:hover { color: red; } @nave flex itemsCenter; }',
  '@supports (display: grid) { .a { @nave flex; } }',
  '.a { @media (x) { & { @nave flex; } } }',
  '.a { @nave flex /* c */ block; }',
  '.a { @nave flex, block; }',
  '.a { @nave brandBox; }',
  '.btn { @nave focusRing; }',
  '.btn { &:hover { color: red } @nave focusRing; }',
  '@media (width >= 1px) { .btn { @nave focusRing; } }',
  '.btn { @nave srOnlyFocusable; }',
  '.btn { &:hover { color: red } @nave srOnlyFocusable; }',
  '@media (width >= 1px) { .btn { @nave srOnlyFocusable; } }',
]

function normalize(node: ChildNode): unknown {
  if (node.type === 'comment') return { type: 'comment', text: node.text }
  if (node.type === 'decl')
    return {
      type: 'decl',
      prop: node.prop,
      value: node.value.replaceAll(/\s+/g, ' '),
      important: node.important,
    }
  if (node.type === 'atrule') {
    return {
      type: 'atrule',
      name: node.name.toLowerCase(),
      params: node.params.replaceAll(/\s+/g, ' '),
      nodes: normalizeChildren(node),
    }
  }
  return {
    type: 'rule',
    selector: node.selector.replaceAll(/\s+/g, ' '),
    nodes: normalizeChildren(node),
  }
}

function normalizeChildren(container: Container): unknown[] {
  return (container.nodes ?? []).map((n) => normalize(n))
}

/**
R8's equivalence: same node kinds, in the same order and nesting, on the fields that matter (selector/name+prelude/prop+value+important/comment text); whitespace and semicolon raws ignored.
 */
function isEquivalent(cssA: string, cssB: string): boolean {
  const treeA = normalizeChildren(postcss.parse(cssA))
  const treeB = normalizeChildren(postcss.parse(cssB))
  return JSON.stringify(treeA) === JSON.stringify(treeB)
}

async function throughPostcss(css: string): Promise<string> {
  const result = await postcss([navePlugin({ onUnknown: 'warn', extend: EXTEND })]).process(css, {
    from: undefined,
  })
  return result.css
}

function throughExpandText(css: string): string {
  return expandText(css, { onUnknown: 'warn', extend: EXTEND }).css
}

describe('AC-directive-core-19 — one corpus, every leg, one equivalence', () => {
  it.each(CORPUS)('%s', async (css) => {
    const postcssOutput = await throughPostcss(css)
    const expandTextOutput = throughExpandText(css)

    expect(isEquivalent(postcssOutput, expandTextOutput)).toBe(true)
  })

  it('asserts the corpus is non-empty', () => {
    expect(CORPUS.length).toBeGreaterThan(0)
  })

  it('reds on swapped declaration order (equivalence control)', () => {
    expect(
      isEquivalent('.a { color: red; display: flex; }', '.a { display: flex; color: red; }'),
    ).toBe(false)
  })

  it('reds on a missing nested rule (equivalence control)', () => {
    expect(isEquivalent('.a { &:hover { color: red; } }', '.a { }')).toBe(false)
  })

  it('reds on a changed selector (equivalence control)', () => {
    expect(isEquivalent('.a { color: red; }', '.b { color: red; }')).toBe(false)
  })

  it('reds on a dropped !important (equivalence control)', () => {
    expect(isEquivalent('.a { color: red !important; }', '.a { color: red; }')).toBe(false)
  })

  it('greens on whitespace-only differences (equivalence control)', () => {
    expect(isEquivalent('.a{color:red;display:flex}', '.a { color: red; display: flex; }')).toBe(
      true,
    )
  })
})
