/**
 * The workspace's built token stylesheet, read the way the instruments need it: the layer order
 * statement it opens with and the custom properties it declares.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

/**
`@navecss/tokens/css` as the workspace built it.
 */
export const workspaceTokensCss = (): string =>
  readFileSync(fileURLToPath(import.meta.resolve('@navecss/tokens/css')), 'utf8')

/**
The params of a stylesheet's first block-less `@layer` at-rule: the layer order statement.
 */
export const firstOrderStatement = (css: string): string | undefined => {
  let params: string | undefined
  postcss.parse(css).walkAtRules('layer', (rule) => {
    if (params === undefined && rule.nodes === undefined) params = rule.params
  })
  return params
}

/**
Every `--nave-*` custom property a stylesheet declares, with its first value.
 */
export const declaredTokens = (css: string): Map<string, string> => {
  const declared = new Map<string, string>()
  postcss.parse(css).walkDecls(/^--nave-/, (decl) => {
    if (!declared.has(decl.prop)) declared.set(decl.prop, decl.value)
  })
  return declared
}
