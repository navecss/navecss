/**
 * The one lint comment a parts file carries on the line after its directive: it names the
 * `typescript-eslint` rules the file's code trips. The reason text and the rule names are held here
 * as literals, and whether a package module has an explicit `any` is read from its source with the
 * TypeScript API, so none of it comes from the generator.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import ts from 'typescript'

export const NAMESPACE_RULE = '@typescript-eslint/no-namespace'
export const ANY_RULE = '@typescript-eslint/no-explicit-any'

export const TYPES_REASON =
  'the types keep the names and generic defaults @navecss/base-ui exports, so code typed against the package compiles here unchanged'

/**
 * Whether the source writes an explicit `any` type anywhere.
 */
export const hasExplicitAny = (source: string): boolean => {
  const file = ts.createSourceFile('module.ts', source, ts.ScriptTarget.ES2022, true)
  let isFound = false
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) isFound = true
    if (!isFound) ts.forEachChild(node, visit)
  }
  visit(file)
  return isFound
}

/**
 * The rules a parts file names, namespace first, given the package module it is made from.
 */
export const typesRules = (packageModule: string): string[] =>
  hasExplicitAny(packageModule) ? [NAMESPACE_RULE, ANY_RULE] : [NAMESPACE_RULE]

/**
 * The comment, as the spec's template renders it.
 */
export const typesComment = (rules: readonly string[]): string =>
  `/* eslint-disable ${rules.join(', ')} -- ${TYPES_REASON} */`
