/**
 * The module specifiers a copied file names, read from its syntax tree and never from its text, so a
 * specifier inside a comment or a string is not an import and a form a pattern would miss (a dynamic
 * `import()`, `export ... from`, `import type`, an import type node) is one.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import postcss from 'postcss'
import ts from 'typescript'

const stringOf = (node: ts.Node | undefined): string | undefined =>
  node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined

const isRequireOrDynamicImport = (call: ts.CallExpression): boolean =>
  call.expression.kind === ts.SyntaxKind.ImportKeyword ||
  (ts.isIdentifier(call.expression) && call.expression.text === 'require')

const specifierOf = (node: ts.Node): string | undefined => {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return stringOf(node.moduleSpecifier)
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return stringOf(node.moduleReference.expression)
  }
  if (ts.isCallExpression(node) && isRequireOrDynamicImport(node)) {
    return stringOf(node.arguments[0])
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return stringOf(node.argument.literal)
  }
  return undefined
}

/**
 * Every module specifier of a TypeScript source, in source order: static imports (side-effect,
 * default, named, namespace, `import type`), `export ... from` (also `export type * from`), dynamic
 * `import()`, `require()`, `import x = require()` and `import('x')` in a type position.
 */
export const specifiersOfTypeScript = (fileName: string, source: string): string[] => {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    const specifier = specifierOf(node)
    if (specifier !== undefined) found.push(specifier)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

const unquoted = (value: string): string =>
  /^\s*(?:url\()?\s*["']([^"']*)["']/.exec(value)?.[1] ?? ''

/**
 * Every module specifier of a stylesheet: `@import` and `composes: x from 'file'`.
 */
export const specifiersOfStylesheet = (source: string): string[] => {
  const found: string[] = []
  postcss.parse(source).walk((node) => {
    if (node.type === 'atrule' && node.name === 'import') found.push(unquoted(node.params))
    if (node.type === 'decl' && node.prop === 'composes') {
      const from = /\sfrom\s+(.*)$/s.exec(node.value)?.[1]
      if (from !== undefined && from !== 'global') found.push(unquoted(from))
    }
  })
  return found.filter((specifier) => specifier !== '')
}

/**
 * The specifiers of one copied file, by its extension. A file of another kind names none.
 */
export const specifiersOf = (fileName: string, content: string): string[] => {
  if (/\.[cm]?[jt]sx?$/.test(fileName)) return specifiersOfTypeScript(fileName, content)
  if (fileName.endsWith('.css')) return specifiersOfStylesheet(content)
  return []
}

/**
 * Whether a specifier is `<scope>/<name>`, a path below it, or a path that runs through it
 * (`../node_modules/@navecss/core/dist/x.js`). `@navecss/coreish` is not.
 */
export const isInsidePackage = (specifier: string, scope: string, name: string): boolean => {
  const segments = specifier.split('/')
  return segments.some((segment, index) => segment === scope && segments[index + 1] === name)
}
