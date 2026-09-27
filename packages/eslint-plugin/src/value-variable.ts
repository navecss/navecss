/**
 * Whether a scope variable names a value, the only kind a class position or a call reads.
 * TypeScript's declarations of types sit in the same scope set as values: a type alias, an
 * interface and a type parameter, which the scope analysis marks as type-only, and a namespace
 * whose body declares only types, which TypeScript emits nothing for although the scope analysis
 * marks it as a value.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

/**
True for a statement that declares only types: a type alias, an interface, or such a namespace.
 */
function isTypeOnlyStatement(statement: TSESTree.Node): boolean {
  const declaration =
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  if (!declaration) return false
  if (declaration.type === 'TSInterfaceDeclaration') return true
  if (declaration.type === 'TSTypeAliasDeclaration') return true
  return declaration.type === 'TSModuleDeclaration' && isTypeOnlyNamespace(declaration)
}

/**
True for a namespace whose body, if any, declares only types.
 */
function isTypeOnlyNamespace(node: TSESTree.TSModuleDeclaration): boolean {
  return (
    node.body === undefined || node.body.body.every((statement) => isTypeOnlyStatement(statement))
  )
}

/**
True for a definition made by a namespace that declares only types.
 */
function isTypeOnlyNamespaceDef(def: { node: unknown; type: string }): boolean {
  return (
    def.type === 'TSModuleName' && isTypeOnlyNamespace(def.node as TSESTree.TSModuleDeclaration)
  )
}

/**
True when `variable` names a value: not type-only, and not a namespace that declares only types.
 */
export function isValueVariable(variable: Scope.Variable): boolean {
  if ((variable as { isValueVariable?: boolean }).isValueVariable === false) return false
  const defs = variable.defs as { node: unknown; type: string }[]
  return defs.length === 0 || defs.some((def) => !isTypeOnlyNamespaceDef(def))
}
