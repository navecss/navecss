/**
 * Finds the variables a linted file binds to Nave's `cx`, by the imports that make them so, never
 * by name: `cx('x')` in a file that never imported `@navecss/core/cx` is not Nave's, and an
 * aliased import (`cx as ncx`) still is. `cx-callee.ts` resolves a callee against these variables
 * through scope analysis, so a parameter or inner declaration that shadows the import is a
 * different variable, and is not.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope, SourceCode } from 'eslint'

import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const CORE_CX_SPECIFIER = '@navecss/core/cx'

export interface CxBindings {
  /**
  The module-scope variables a named import binds to Nave's `cx` itself.
   */
  cxVariables: Set<Scope.Variable>
  /**
  The module-scope variables a namespace import (`import * as c`) binds, so `c.cx` is Nave's `cx`.
   */
  namespaceVariables: Set<Scope.Variable>
}

export const NO_CX_BINDINGS: CxBindings = { cxVariables: new Set(), namespaceVariables: new Set() }

const CANDIDATE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/**
 * The TypeScript sources a NodeNext import specifier ending in a JavaScript extension names:
 * TypeScript has the import written with the extension the emitted file will carry
 * (`'./cx.js'` for `cx.ts`), so the source itself is found by swapping it.
 */
const TYPESCRIPT_SOURCE_EXTENSIONS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
}

/**
The real path of `candidate`, or `candidate` itself when it cannot be resolved further.
 */
function realPathOf(candidate: string): string {
  try {
    return realpathSync(candidate)
  } catch {
    return candidate
  }
}

/**
Resolves a relative specifier to a real path, trying common extensions; `undefined` if none exist.
 */
function resolveRelative(fromDir: string, specifier: string): string | undefined {
  const base = path.resolve(fromDir, specifier)
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate)) return realPathOf(candidate)
  }
  const extension = path.extname(base)
  const sourceExtensions = TYPESCRIPT_SOURCE_EXTENSIONS[extension] ?? []
  for (const sourceExtension of sourceExtensions) {
    const candidate = base.slice(0, -extension.length) + sourceExtension
    if (existsSync(candidate)) return realPathOf(candidate)
  }
  return undefined
}

/**
Resolves a bare package specifier via Node's own (CJS) resolution; `undefined` on failure.
 */
function resolvePackageSpecifier(fromDir: string, specifier: string): string | undefined {
  try {
    const require = createRequire(path.join(fromDir, 'noop.cjs'))
    return realpathSync(require.resolve(specifier))
  } catch {
    return undefined
  }
}

/**
A relative or absolute specifier resolved as a path, any other as a package; `undefined` on failure.
 */
function resolveSpecifier(fromDir: string, specifier: string): string | undefined {
  return specifier.startsWith('.') || specifier.startsWith('/')
    ? resolveRelative(fromDir, specifier)
    : resolvePackageSpecifier(fromDir, specifier)
}

/**
 * True when `source` (an import specifier written in the linted file) names one of the
 * plugin's recognised `cx` modules: `@navecss/core/cx` always, or a `cxModules` entry. An entry
 * matches when it and the import resolve, the entry from the working directory and the import
 * from the linted file's directory, to the same real path. A package name, subpath, alias or
 * absolute path also matches by string equality. A relative entry never does, since the same text
 * names another file in another directory, and a `#` entry does only when the import does not
 * resolve, since a `#` import resolves through the `package.json` nearest the file that writes it.
 */
function isRecognisedCxModule(source: string, cxModules: string[], filename: string): boolean {
  if (source === CORE_CX_SPECIFIER) return true
  if (cxModules.some((entry) => entry === source && !isScopedEntry(entry))) return true
  const importPath =
    cxModules.length === 0 ? undefined : resolveSpecifier(path.dirname(filename), source)
  if (importPath === undefined) return source.startsWith('#') && cxModules.includes(source)
  const cwd = process.cwd()
  return cxModules.some((entry) => resolveSpecifier(cwd, entry) === importPath)
}

/**
 * Whether an entry names a file relative to the file that writes it (it begins `./` or `../`, or
 * is `.` or `..`) or in that file's package scope (it begins `#`), so its text alone names nothing.
 */
function isScopedEntry(entry: string): boolean {
  return entry.startsWith('#') || /^\.\.?(?:\/|$)/.test(entry)
}

/**
The name an import specifier imports, whether written as an identifier or a string.
 */
function importedName(specifier: TSESTree.ImportSpecifier): string {
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value
}

/**
The set an import specifier's variable belongs in, or `undefined` when it does not bind `cx`.
 */
function bindingTarget(
  specifier: TSESTree.ImportClause,
  cxVariables: Set<Scope.Variable>,
  namespaceVariables: Set<Scope.Variable>,
): Set<Scope.Variable> | undefined {
  if (specifier.type === 'ImportNamespaceSpecifier') return namespaceVariables
  if (specifier.type === 'ImportSpecifier' && importedName(specifier) === 'cx') return cxVariables
  return undefined
}

/**
 * Scans a `Program`'s imports from a recognised `cx` module for the variables they bind: a named
 * `cx` import (aliased or not), and a namespace import. A default import is not Nave's `cx`:
 * `@navecss/core/cx` has no default export.
 */
export function collectCxBindings(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  cxModules: string[],
  filename: string,
): CxBindings {
  const cxVariables = new Set<Scope.Variable>()
  const namespaceVariables = new Set<Scope.Variable>()

  const imports = program.body.filter(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === 'ImportDeclaration' &&
      isRecognisedCxModule(statement.source.value, cxModules, filename),
  )
  const specifiers = imports.flatMap((statement) => statement.specifiers)
  for (const specifier of specifiers) {
    const target = bindingTarget(specifier, cxVariables, namespaceVariables)
    if (!target) continue
    const variables = sourceCode.getDeclaredVariables(specifier)
    for (const variable of variables) target.add(variable)
  }

  return { cxVariables, namespaceVariables }
}
