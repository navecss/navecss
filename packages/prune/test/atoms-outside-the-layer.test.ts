import { navePlugin } from '@navecss/core/postcss'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { pageWith, useScratchProjects } from './helpers/atoms-fixture.ts'
import { ATOMIC_CSS, runPlugin } from './helpers/project.ts'

const CARD = '.card { display: flex }'
const BRAND = '@layer atomic { .brand-x { color: red } }'
const GRID_CHILD = '@layer atomic { .nave-grid > .child { color: red } }'
const DIRECTIVE = '.x { @nave block; }'
const OVERRIDE = '@layer overrides { .menu .nave-hidden { color: red } }'

const STYLESHEET = [ATOMIC_CSS, CARD, BRAND, GRID_CHILD, DIRECTIVE, OVERRIDE].join('\n')

/**
 * The stylesheet without its `@layer atomic` blocks and without the rule of the directive.
 */
function outsideTheLayer(css: string): string {
  const root = postcss.parse(css)
  root.walkAtRules('layer', (rule) => {
    if (rule.nodes !== undefined && rule.params.trim() === 'atomic') rule.remove()
  })
  root.walkRules('.x', (rule) => {
    rule.remove()
  })
  return root.toString()
}

/**
 * The rule `.x` of the stylesheet as written, or `undefined` when it has none.
 */
function directiveRule(css: string): string | undefined {
  let found: string | undefined
  postcss.parse(css).walkRules('.x', (rule) => {
    found = rule.toString()
  })
  return found
}

describe('AC-nextjs-used-atoms-40 only built-in atom rules in the layer are removed', () => {
  const create = useScratchProjects()
  const page = pageWith("cx('flex')")

  /**
   * Runs the plugin over the stylesheet in a project whose page calls `cx('flex')`.
   */
  async function trimmed(options: { keep?: ['grid'] } = {}): Promise<string> {
    const project = create({ 'app/page.tsx': page })
    const result = await runPlugin(project, { css: STYLESHEET, options })
    return result.css
  }

  /**
   * Runs the plugin with the wrapper's variable unset, so it leaves the layer alone.
   */
  async function untouched(): Promise<string> {
    const project = create({ 'app/page.tsx': page })
    const result = await runPlugin(project, { css: STYLESHEET, options: false })
    return result.css
  }

  it('AC-nextjs-used-atoms-40 leaves every byte outside the layer as the untouched run has it', async () => {
    const css = await trimmed()
    expect(outsideTheLayer(css)).toBe(outsideTheLayer(await untouched()))
    expect(outsideTheLayer(css)).toContain(CARD)
    expect(outsideTheLayer(css)).toContain(OVERRIDE)
  })

  it('AC-nextjs-used-atoms-40 expands the directive the way the core adapter does', async () => {
    const core = await postcss([navePlugin()]).process(DIRECTIVE, { from: undefined })
    const expected = directiveRule(core.css)
    expect(expected).toContain('display: block')
    const css = await trimmed()
    expect(directiveRule(css)).toBe(expected)
  })

  it('AC-nextjs-used-atoms-40 keeps a consumer rule inside the layer', async () => {
    const css = await trimmed()
    expect(css).toContain(BRAND)
  })

  it('AC-nextjs-used-atoms-40 removes a rule of an atom that is not emitted', async () => {
    const css = await trimmed()
    expect(css).not.toContain('.nave-grid > .child')
    expect(css).toContain('.nave-flex')
  })

  it('AC-nextjs-used-atoms-40 keeps that rule byte for byte when its atom is kept', async () => {
    const css = await trimmed({ keep: ['grid'] })
    expect(css).toContain(GRID_CHILD)
  })

  it('AC-nextjs-used-atoms-40 control: the untouched run holds the rule the trimmed run removes', async () => {
    expect(await untouched()).toContain(GRID_CHILD)
  })
})
