/**
 * AC-native-apply-order-39: CONSUMER-ATOMS.md's two "Compiles to:" fences are compared whole.
 *
 * `consumer-atoms-doc-shape.test.ts` checks each fence as formatted text. This one checks the
 * structure the fence shows: it expands each example's own stylesheet with the PostCSS plugin and
 * the atoms the doc defines, and requires the fence after "Compiles to:" to be the same tree, node
 * for node and in the same order, so a block shown before a declaration the plugin writes first
 * (or the reverse) is caught, not only a missing or reordered declaration.
 */
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

import {
  docSrc,
  extractFenceAfter,
  extractInputFenceBefore,
  extractTsFenceAfter,
  loadMyAtoms,
} from './helpers/consumer-atoms-doc.ts'
import { isEquivalent } from './helpers/css-equivalence.ts'
import { expandedByPlugin, expansionPairs } from './helpers/native-order-docs.ts'

const EXAMPLES = [
  {
    name: 'Using consumer atoms',
    directive: '@nave interactive focusRing transition primaryButton;',
    definitions: '## Defining consumer atoms',
  },
  {
    name: 'the container-query Usage',
    directive: '@nave adaptiveCard;',
    definitions: '### Consumer atoms with container queries',
  },
] as const

type Example = (typeof EXAMPLES)[number]

/**
 * The example's stylesheet, the fence the doc shows under "Compiles to:", and what the plugin
 * writes for the stylesheet with the atoms the doc defines.
 */
async function expandExample(
  example: Example,
): Promise<{ readonly fence: string; readonly output: string }> {
  const directiveIndex = docSrc.indexOf(example.directive)
  expect(directiveIndex, `the documented directive ${example.directive} is missing`).not.toBe(-1)
  const source = extractInputFenceBefore(docSrc.indexOf('Compiles to:', directiveIndex))
  const { fence } = extractFenceAfter(directiveIndex)
  const myAtoms = await loadMyAtoms(extractTsFenceAfter(example.definitions))
  return { fence, output: await expandedByPlugin(source, myAtoms) }
}

describe('AC-native-apply-order-39: the "Compiles to:" fences are the plugin output, whole', () => {
  it('the doc holds exactly the two examples this test reads', () => {
    expect(expansionPairs(docSrc)).toHaveLength(EXAMPLES.length)
  })

  it.each(EXAMPLES)('$name: the fence is equivalent to the plugin output', async (example) => {
    const { fence, output } = await expandExample(example)

    expect(
      isEquivalent(output, fence),
      `the plugin writes:\n${output}\nthe doc shows:\n${fence}`,
    ).toBe(true)
  })

  it('control: the first fence with `&:focus-visible` moved after the following wrapper is not equivalent', async () => {
    const { fence, output } = await expandExample(EXAMPLES[0])
    const scratch = postcss.parse(fence)
    let focusVisible: Rule | undefined
    scratch.walkRules('&:focus-visible', (rule) => {
      focusVisible ??= rule
    })
    const wrapper = focusVisible?.next()

    expect(focusVisible, 'the first fence holds no `&:focus-visible` block').toBeDefined()
    expect(wrapper?.type === 'rule' && wrapper.selector === '&').toBe(true)
    expect(isEquivalent(output, fence)).toBe(true)

    wrapper!.after(focusVisible)

    expect(isEquivalent(output, scratch.toString())).toBe(false)
  })
})
