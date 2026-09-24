/**
 * Bridge CSS authors into a sublayer, never into a bare parent.
 *
 * docs/04-adr/0003-layer-cascade-contract.md, decision 3: "Author into a
 * sublayer, never into its parent. Styles declared directly in a layer
 * outrank that layer's sublayers... a rule in a bare `@layer tokens` beats
 * `tokens.presets` (both measured). The same rule binds every artifact Nave
 * ships: each names a sublayer, never a parent." Both bridge files declared
 * a bare `@layer tokens { :root { … } }`. Styles declared directly in a
 * parent layer outrank every one of its sublayers, whatever order the layer
 * names were registered in, so that block outranked `tokens.presets` (a
 * project's generated token values) no matter which file loaded first. The
 * bridge now authors into `tokens.defaults`, the layer for Nave's shipped
 * token values. This test guards the shape, not the (currently empty)
 * content. It fails on a bare `@layer tokens` or `@layer components` block,
 * on a layer block not named `tokens.defaults`, on a missing, misplaced or
 * comment-only order statement, on a `--nave-*` custom property declared in
 * bridge CSS, and on the statement drifting from `@navecss/tokens`'s own
 * copy, independent of whether either file has any token mappings yet.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss, { type AtRule, type Root } from 'postcss'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

const srcCssFiles = readdirSync(SRC).filter((file) => file.endsWith('.css'))

const ORDER_STATEMENT =
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;'

const ORDER_STATEMENT_PARAMS = ORDER_STATEMENT.replace(/^@layer\s+/, '').replace(/;\s*$/, '')

// A bare `@layer tokens {` or `@layer components {` (a parent), as opposed to
// a named sublayer (`@layer tokens.presets {`). Anchored on the brace so a
// sublayer name (which also starts with `tokens.`/`components.`) never
// matches.
const BARE_PARENT_LAYER_RE = /@layer\s+(?:tokens|components)\s*\{/

/** The order statement, or any other bare `@layer <names>;` at-rule with no
 * block, among a stylesheet's top-level nodes. postcss never turns
 * commented-out CSS into a node, so text that only appears inside a comment
 * is invisible here, and a statement moved after other nodes is still found,
 * just at a different position - both are what the position/drift checks
 * below rely on. */
function findBareLayerAtRule(root: Root): AtRule | undefined {
  return root.nodes.find(
    (node): node is AtRule => node.type === 'atrule' && node.name === 'layer' && !node.nodes,
  )
}

/** The first named `@layer <name> { ... }` block (an `@layer` at-rule that
 * DOES carry a body), among a stylesheet's top-level nodes. */
function findFirstLayerBlock(root: Root): AtRule | undefined {
  return root.nodes.find(
    (node): node is AtRule =>
      node.type === 'atrule' && node.name === 'layer' && Boolean(node.nodes),
  )
}

describe('bridge CSS never authors into a bare parent layer (tokens or components)', () => {
  it.each(srcCssFiles)(
    'src/%s does not declare a bare @layer tokens or components block',
    (file) => {
      const css = readFileSync(path.join(SRC, file), 'utf8')
      expect(BARE_PARENT_LAYER_RE.test(css)).toBe(false)
    },
  )

  it.each(srcCssFiles)('src/%s restates the cascade order statement', (file) => {
    const css = readFileSync(path.join(SRC, file), 'utf8')
    expect(css).toContain(ORDER_STATEMENT)
  })
})

describe('bridge CSS self-layers its block under tokens.defaults', () => {
  it.each(srcCssFiles)('src/%s declares its layer block as tokens.defaults', (file) => {
    const css = readFileSync(path.join(SRC, file), 'utf8')
    const root = postcss.parse(css)
    const blockLayers: string[] = []
    root.walkAtRules('layer', (atrule) => {
      if (atrule.nodes) blockLayers.push(atrule.params)
    })
    expect(blockLayers).toEqual(['tokens.defaults'])
  })
})

describe('the order statement is a live, correctly positioned at-rule', () => {
  it.each(srcCssFiles)(
    'src/%s restates it as a real at-rule, at line start, before its layer block',
    (file) => {
      const css = readFileSync(path.join(SRC, file), 'utf8')
      const root = postcss.parse(css)
      const orderNode = findBareLayerAtRule(root)
      const blockNode = findFirstLayerBlock(root)

      expect(
        orderNode,
        'the order statement must exist as a live at-rule, not just as text inside a comment',
      ).toBeDefined()
      expect(orderNode?.params).toBe(ORDER_STATEMENT_PARAMS)
      expect(blockNode, 'the file must declare a named @layer block').toBeDefined()
      expect(
        root.index(orderNode as AtRule),
        'the order statement must precede the first @layer block',
      ).toBeLessThan(root.index(blockNode as AtRule))
      expect(
        (orderNode as AtRule).source?.start?.column,
        'the order statement must start at the beginning of a line',
      ).toBe(1)
    },
  )
})

describe('bridge CSS never defines a --nave-* custom property', () => {
  it.each(srcCssFiles)('src/%s defines no --nave-* custom property', (file) => {
    const css = readFileSync(path.join(SRC, file), 'utf8')
    const root = postcss.parse(css)
    const naveProps: string[] = []
    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--nave-')) naveProps.push(decl.prop)
    })
    expect(naveProps).toEqual([])
  })
})

describe("bridge CSS does not drift from @navecss/tokens's own order statement", () => {
  it.each(srcCssFiles)('src/%s matches the statement built into @navecss/tokens/css', (file) => {
    const require = createRequire(import.meta.url)
    const tokensCssPath = require.resolve('@navecss/tokens/css')
    const tokensCss = readFileSync(tokensCssPath, 'utf8')
    const tokensRoot = postcss.parse(tokensCss)
    const tokensOrderNode = findBareLayerAtRule(tokensRoot)
    expect(
      tokensOrderNode,
      '@navecss/tokens/css must itself carry a bare order-statement at-rule',
    ).toBeDefined()

    const css = readFileSync(path.join(SRC, file), 'utf8')
    const root = postcss.parse(css)
    const orderNode = findBareLayerAtRule(root)
    expect(orderNode).toBeDefined()

    expect((orderNode as AtRule).params).toBe((tokensOrderNode as AtRule).params)
  })
})
