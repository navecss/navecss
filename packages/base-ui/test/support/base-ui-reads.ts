/**
 * What a built module reads off Base UI: each import from `@base-ui/react/<c>`, the name it brings
 * in, and every member the module reads off that binding by a literal key. Read from the parsed
 * module, never from the generator's roster, so it sees what a bundler sees.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import ts from 'typescript'

export interface BaseUiImport {
  readonly file: string
  /**
  The name the import brings in (`Combobox` in `{ Combobox as Base }`), or `undefined` for a
  namespace import, whose binding is the module itself.
   */
  readonly imported: string | undefined
  /**
  The members read off the binding by a literal key, in the order they are read.
   */
  readonly members: readonly string[]
  /**
  The Base UI subpath: `combobox` for `@base-ui/react/combobox`, `.` for the package root.
   */
  readonly subpath: string
}

export interface ModuleText {
  readonly file: string
  readonly text: string
}

const SPECIFIER = /^@base-ui\/react(?:\/(.+))?$/

const literalText = (node: ts.Node): string | undefined =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined

const nameText = (name: ts.BindingName | ts.PropertyName | undefined): string | undefined =>
  name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined

const isBinding = (node: ts.Node | undefined, local: string): boolean =>
  node !== undefined && ts.isIdentifier(node) && node.text === local

/**
 * The key a node reads off the binding: `Base.X`, `Base?.X`, `Base['X']` and ``Base[`X`]``. A
 * computed key that is not a literal is not a key anyone can list.
 */
const keyRead = (node: ts.Node, local: string): string | undefined => {
  if (ts.isPropertyAccessExpression(node) && isBinding(node.expression, local)) {
    return node.name.text
  }
  if (ts.isElementAccessExpression(node) && isBinding(node.expression, local)) {
    return literalText(node.argumentExpression)
  }
  return undefined
}

/**
 * The keys a destructuring of the binding reads: `const { X, Y: y } = Base`, and the same pattern
 * as the left side of an assignment.
 */
const destructuredKeys = (node: ts.Node, local: string): string[] => {
  if (ts.isVariableDeclaration(node) && isBinding(node.initializer, local)) {
    return ts.isObjectBindingPattern(node.name)
      ? node.name.elements.flatMap(
          (element) => nameText(element.propertyName ?? element.name) ?? [],
        )
      : []
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isBinding(node.right, local) &&
    ts.isObjectLiteralExpression(node.left)
  ) {
    return node.left.properties.flatMap((property) =>
      ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)
        ? (nameText(property.name) ?? [])
        : [],
    )
  }
  return []
}

const membersRead = (source: ts.SourceFile, local: string): string[] => {
  const members: string[] = []
  const visit = (node: ts.Node): void => {
    const key = keyRead(node, local)
    members.push(...(key === undefined ? destructuredKeys(node, local) : [key]))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return members
}

interface Binding {
  readonly imported: string | undefined
  readonly local: string
}

/**
 * The names an import clause binds: the default, the namespace, or each named import with the
 * name it imports.
 */
const bindingsOf = (clause: ts.ImportClause): Binding[] => {
  const { name, namedBindings } = clause
  return [
    ...(name === undefined ? [] : [{ imported: 'default', local: name.text }]),
    ...(namedBindings !== undefined && ts.isNamespaceImport(namedBindings)
      ? [{ imported: undefined, local: namedBindings.name.text }]
      : []),
    ...(namedBindings !== undefined && ts.isNamedImports(namedBindings)
      ? namedBindings.elements.map((element) => ({
          imported: (element.propertyName ?? element.name).text,
          local: element.name.text,
        }))
      : []),
  ]
}

const importsOf = ({ file, text }: ModuleText): BaseUiImport[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return []
    }
    const match = SPECIFIER.exec(statement.moduleSpecifier.text)
    if (match === null || statement.importClause === undefined) {
      return []
    }
    return bindingsOf(statement.importClause).map(({ imported, local }) => ({
      file,
      imported,
      members: membersRead(source, local),
      subpath: match[1] ?? '.',
    }))
  })
}

/**
 * Every import from Base UI in the modules, with the members each reads off its binding.
 */
export const readBaseUiImports = (modules: readonly ModuleText[]): BaseUiImport[] =>
  modules.flatMap((module) => importsOf(module))

/**
 * How many times the modules name a Base UI module as a string, found by a text search and not by
 * the parse, so a parse that skips a module cannot agree with it.
 */
export const baseUiSpecifierCount = (modules: readonly ModuleText[]): number =>
  modules.reduce(
    (count, { text }) => count + (text.match(/['"]@base-ui\/react(?:\/[^'"]*)?['"]/g)?.length ?? 0),
    0,
  )

/**
 * What a read cannot be, against the Base UI module the subpath names: the names that are not
 * exports of it, and the members that are not exports of the binding. `load` returns the
 * module's runtime exports.
 */
export const problemsAgainst = async (
  imports: readonly BaseUiImport[],
  load: (subpath: string) => Promise<Record<string, unknown>>,
): Promise<string[]> => {
  const problems: string[] = []
  for (const { imported, members, subpath } of imports) {
    const module = await load(subpath)
    if (imported !== undefined && !Reflect.has(module, imported)) {
      problems.push(`${subpath}: ${imported} is not an export of @base-ui/react/${subpath}`)
      continue
    }
    const target = imported === undefined ? module : (module[imported] as object)
    const named = imported ?? `@base-ui/react/${subpath}`
    const unique = [...new Set(members)]
    problems.push(
      ...unique
        .filter((member) => !Reflect.has(target, member))
        .map((member) => `${subpath}: ${member} is not an export of ${named}`),
    )
  }
  return problems
}
