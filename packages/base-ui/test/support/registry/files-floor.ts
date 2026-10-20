/**
 * The parts younger than the Base UI floor, read from the declarations of the two installed Base UI
 * packages, and the two checks that no copy carries one: no parts file declares an export named
 * after a member of its own subpath's set, and none reads one off the Base UI binding by a literal
 * key. Both parse the file's TypeScript; the compile of the copies at the floor is another
 * criterion's.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import ts from 'typescript'

import type { Problem } from './files-problem.ts'
import type { LoadedRegistry } from './load.ts'

import { readBaseUiTypes } from '../../../scripts/wrappers/read-types.ts'

export interface YoungPart {
  readonly key: string
  readonly subpath: string
}

/**
 * The keys of each `@base-ui/react/<s>` namespace that the devDependency version declares and the
 * floor version does not, by subpath.
 */
export const youngParts = (): YoungPart[] => {
  const atFloor = new Map(
    readBaseUiTypes('floor').map((entry) => [
      entry.subpath,
      new Set(entry.parts.map((part) => part.name)),
    ]),
  )
  return readBaseUiTypes('current').flatMap((entry) =>
    entry.parts
      .filter((part) => atFloor.get(entry.subpath)?.has(part.name) !== true)
      .map((part) => ({ key: part.name, subpath: entry.subpath })),
  )
}

const parse = (content: string): ts.SourceFile =>
  ts.createSourceFile('parts.ts', content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)

const hasExport = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)

const propertyKeyText = (name: ts.PropertyName | ts.BindingName | undefined): string[] =>
  name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? [name.text] : []

/**
 * Every name a binding pattern binds, and every key it destructures: `{ createItems: x }` names
 * both `createItems` and `x`.
 */
const bindingNames = (name: ts.BindingName): string[] => {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element)
      ? []
      : [...propertyKeyText(element.propertyName), ...bindingNames(element.name)],
  )
}

const exportedByDeclaration = (statement: ts.Statement): string[] => {
  if (ts.isVariableStatement(statement)) {
    return hasExport(statement)
      ? statement.declarationList.declarations.flatMap((declaration) =>
          bindingNames(declaration.name),
        )
      : []
  }
  const isNamed =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  return isNamed && hasExport(statement) ? propertyKeyText(statement.name) : []
}

const exportedByClause = (statement: ts.Statement): string[] => {
  if (!ts.isExportDeclaration(statement) || statement.exportClause === undefined) return []
  return ts.isNamespaceExport(statement.exportClause)
    ? [statement.exportClause.name.text]
    : statement.exportClause.elements.map((element) => element.name.text)
}

/**
 * The names the file exports, in every declaration form (`export const`, `export function`,
 * `export declare namespace`, `export { x as y }`, a destructured `export const`), found by
 * parsing the export declarations.
 */
export const exportedNames = (content: string): string[] =>
  parse(content).statements.flatMap((statement) => [
    ...exportedByDeclaration(statement),
    ...exportedByClause(statement),
  ])

/**
 * The expression with parentheses, `as`, `satisfies`, `!` and angle-bracket assertions looked
 * through.
 */
const unwrap = (node: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return unwrap(node.expression)
  }
  return node
}

const literalKey = (node: ts.Expression): string[] => {
  const inner = unwrap(node)
  return ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner) ? [inner.text] : []
}

const isBindingOf = (node: ts.Expression | undefined, bindings: ReadonlySet<string>): boolean => {
  const inner = node === undefined ? undefined : unwrap(node)
  return inner !== undefined && ts.isIdentifier(inner) && bindings.has(inner.text)
}

const destructuredKeys = (node: ts.Node, bindings: ReadonlySet<string>): string[] => {
  if (ts.isVariableDeclaration(node) && isBindingOf(node.initializer, bindings)) {
    return ts.isObjectBindingPattern(node.name)
      ? node.name.elements.flatMap((element) =>
          propertyKeyText(element.propertyName ?? element.name),
        )
      : []
  }
  const isAssignment =
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isBindingOf(node.right, bindings) &&
    ts.isObjectLiteralExpression(unwrap(node.left))
  if (!isAssignment) return []
  const pattern = unwrap(node.left) as ts.ObjectLiteralExpression
  return pattern.properties.flatMap((property) =>
    ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)
      ? propertyKeyText(property.name)
      : [],
  )
}

const keyRead = (node: ts.Node, bindings: ReadonlySet<string>): string[] => {
  if (ts.isPropertyAccessExpression(node) && isBindingOf(node.expression, bindings)) {
    return [node.name.text]
  }
  if (ts.isElementAccessExpression(node) && isBindingOf(node.expression, bindings)) {
    return literalKey(node.argumentExpression)
  }
  return []
}

const clauseNames = (clause: ts.ImportClause): string[] => {
  const bound = clause.namedBindings
  return [
    ...(clause.name === undefined ? [] : [clause.name.text]),
    ...(bound !== undefined && ts.isNamespaceImport(bound) ? [bound.name.text] : []),
    ...(bound !== undefined && ts.isNamedImports(bound)
      ? bound.elements.map((element) => element.name.text)
      : []),
  ]
}

const importedBindings = (source: ts.SourceFile): Set<string> =>
  new Set(
    source.statements.flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        return []
      }
      const { importClause, moduleSpecifier } = statement
      const isValueImport = importClause !== undefined && !importClause.isTypeOnly
      return isValueImport && moduleSpecifier.text.startsWith('@base-ui/react')
        ? clauseNames(importClause)
        : []
    }),
  )

/**
 * The members the file reads off a Base UI binding by a literal key, in value positions only: a
 * type (`typeof Base.X`) is erased and is not walked.
 */
export const membersRead = (content: string): string[] => {
  const source = parse(content)
  const bindings = importedBindings(source)
  const members: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return
    members.push(...keyRead(node, bindings), ...destructuredKeys(node, bindings))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return members
}

const partsFileOf = (
  registry: LoadedRegistry,
  subpath: string,
): { content: string | undefined; item: string; target: string } => {
  const item = `base-ui-${subpath}`
  const target = `components/nave/nave-${subpath}.parts.ts`
  const file = registry.items.get(item)?.files.find((candidate) => candidate.target === target)
  return { content: file?.content, item, target }
}

const checkParts = (
  registry: LoadedRegistry,
  young: readonly YoungPart[],
  names: (content: string) => string[],
  describe: (key: string) => string,
): Problem[] =>
  young.flatMap(({ key, subpath }) => {
    const { content, item, target } = partsFileOf(registry, subpath)
    if (content === undefined) {
      return [{ file: target, item, message: `has no parts file to check for ${key}` }]
    }
    return names(content).includes(key) ? [{ file: target, item, message: describe(key) }] : []
  })

/**
 * No parts file declares an export named after a member of its own subpath's set.
 */
export const youngDeclarationProblems = (
  registry: LoadedRegistry,
  young: readonly YoungPart[],
): Problem[] =>
  checkParts(registry, young, exportedNames, (key) => `declares an export named ${key}`)

/**
 * No parts file reads a member of its own subpath's set off the Base UI binding by a literal key.
 */
export const youngReadProblems = (
  registry: LoadedRegistry,
  young: readonly YoungPart[],
): Problem[] =>
  checkParts(registry, young, membersRead, (key) => `reads ${key} off the Base UI binding`)
