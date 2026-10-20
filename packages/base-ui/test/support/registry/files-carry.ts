/**
 * The checks that a copy carries Nave's code only: none of the bytes of a tokens or core file, no
 * run of 120 characters shared with an installed Base UI file, and Base UI reached only through
 * `import` from, and `export type * from`, its public subpath specifiers.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import type { Problem } from './files-problem.ts'
import type { LoadedRegistry, RegistryItem } from './load.ts'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { isLicenseTarget } from './files-header.ts'
import { foldWhitespace, type NamedText, sharedRuns, WINDOW } from './files-run-length.ts'

const MODULES = path.join(PACKAGE_DIR, 'node_modules')

/**
 * Every file under a directory, as text, named by its path relative to the directory.
 */
export const textFilesUnder = (directory: string): NamedText[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .map((file) => ({ name: path.relative(directory, file), text: readFileSync(file, 'utf8') }))

/**
 * The installed `@base-ui/react`, every file, whitespace folded.
 */
export const baseUiFiles = (): NamedText[] =>
  textFilesUnder(path.join(MODULES, '@base-ui/react')).map((file) => ({
    name: file.name,
    text: foldWhitespace(file.text),
  }))

/**
 * The built `dist/` of `@navecss/tokens` and `@navecss/core`, every file, named `<package>/<path>`.
 */
export const navePackageFiles = (): NamedText[] =>
  ['tokens', 'core'].flatMap((name) =>
    textFilesUnder(path.join(MODULES, '@navecss', name, 'dist')).map((file) => ({
      name: `${name}/dist/${file.name}`,
      text: file.text,
    })),
  )

const itemFiles = (item: RegistryItem): RegistryItem['files'] => item.files

const copiedFiles = (registry: LoadedRegistry): (NamedText & { item: string; target: string })[] =>
  registry.items
    .values()
    .flatMap((item) =>
      itemFiles(item).map((file) => ({
        item: item.name,
        name: `${item.name} ${file.target}`,
        target: file.target,
        text: file.content ?? '',
      })),
    )
    .toArray()

/**
 * A file of a tokens or core package is too small to say anything below this many characters.
 */
const MEANINGFUL_LENGTH = 100

/**
 * No item file is, or contains, the bytes of a tokens or core file, and no target names one.
 */
export const navePackageProblems = (
  registry: LoadedRegistry,
  vendored: readonly NamedText[],
): Problem[] => {
  const meaningful = vendored.filter((file) => file.text.trim().length >= MEANINGFUL_LENGTH)
  const names = new Set(vendored.map((file) => path.posix.basename(file.name)))
  return copiedFiles(registry).flatMap((copied) => {
    const at = { file: copied.target, item: copied.item }
    const holds = meaningful
      .filter((file) => copied.text.includes(file.text))
      .map((file) => ({ ...at, message: `contains the bytes of ${file.name}` }))
    const named = names.has(path.posix.basename(copied.target))
      ? [{ ...at, message: 'has the name of a tokens or core file' }]
      : []
    return [...holds, ...named]
  })
}

/**
 * No copied file shares a run of `WINDOW` characters, whitespace folded, with an installed Base UI
 * file. `NAVECSS-LICENSE` is left out: it is the repository's LICENSE, whose MIT text any MIT licence
 * shares, Base UI's included.
 */
export const baseUiRunProblems = (
  registry: LoadedRegistry,
  baseUi: readonly NamedText[],
): Problem[] => {
  const copied = copiedFiles(registry).filter((file) => !isLicenseTarget(file.target))
  const folded = copied.map((file) => ({ ...file, text: foldWhitespace(file.text) }))
  return sharedRuns(folded, baseUi).map((run) => {
    const file = folded.find((candidate) => candidate.name === run.first)
    return {
      file: file?.target ?? run.first,
      item: file?.item ?? run.first,
      message: `shares ${WINDOW} or more characters with @base-ui/react/${run.second}`,
    }
  })
}

const BASE_UI_ROOT = '@base-ui/react'
const PUBLIC_SUBPATH = /^@base-ui\/react\/[a-z][a-z-]*$/

const specifierOf = (node: ts.Node): string | undefined => {
  const specifier =
    ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : undefined
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined
}

const isBaseUiLiteral = (node: ts.Node | undefined): boolean =>
  node !== undefined && ts.isStringLiteral(node) && node.text.startsWith(BASE_UI_ROOT)

const isLoaderCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'require'))

const isImportType = (node: ts.Node): node is ts.ImportTypeNode =>
  ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)

const specifierMisuse = (node: ts.Node, specifier: string): string | undefined => {
  if (!PUBLIC_SUBPATH.test(specifier))
    return `${specifier} is not a public subpath of @base-ui/react`
  if (!ts.isExportDeclaration(node)) return undefined
  const isTypeStar = node.isTypeOnly && node.exportClause === undefined
  return isTypeStar ? undefined : `re-exports from ${specifier} other than as export type *`
}

const misuseOf = (node: ts.Node): string | undefined => {
  const specifier = specifierOf(node)
  if (specifier?.startsWith(BASE_UI_ROOT) === true) return specifierMisuse(node, specifier)
  const isReachedByCall =
    isLoaderCall(node) && node.arguments.some((argument) => isBaseUiLiteral(argument))
  const isReachedByType =
    isImportType(node) && isBaseUiLiteral((node.argument as ts.LiteralTypeNode).literal)
  return isReachedByCall || isReachedByType
    ? 'reaches @base-ui/react other than by import from'
    : undefined
}

const reachInFile = (item: string, target: string, content: string): Problem[] => {
  const source = ts.createSourceFile(target, content, ts.ScriptTarget.ES2022, true)
  const problems: Problem[] = []
  const visit = (node: ts.Node): void => {
    const misuse = misuseOf(node)
    if (misuse !== undefined) problems.push({ file: target, item, message: misuse })
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

/**
 * Base UI's parts and types reach the TypeScript files of a copy only through `import` from, and
 * `export type * from`, a public `@base-ui/react/<subpath>` specifier.
 */
export const baseUiReachProblems = (registry: LoadedRegistry): Problem[] =>
  copiedFiles(registry)
    .filter((file) => file.target.endsWith('.ts'))
    .flatMap((file) => reachInFile(file.item, file.target, file.text))
