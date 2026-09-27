/**
 * Resolves whether a callee in a linted file is Nave's `cx`/`cx.raw`, by the variable an
 * identifier resolves to through scope analysis, never by its name: `cx('x')` in a file that
 * never imported `@navecss/core/cx` is not Nave's, an aliased import (`cx as ncx`) still is, and
 * a parameter or inner declaration that shadows the import is a different variable, so it is not.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope, SourceCode } from 'eslint'

import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const CORE_CX_SPECIFIER = '@navecss/core/cx'

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
 * plugin's recognised `cx` modules: `@navecss/core/cx` always, or a `cxModules` entry, matched
 * either by string equality or by both resolving (from the working directory for the entry,
 * from the linted file's directory for the import) to the same real path.
 */
function isRecognisedCxModule(source: string, cxModules: string[], filename: string): boolean {
  if (source === CORE_CX_SPECIFIER) return true
  const fileDir = path.dirname(filename)
  const cwd = process.cwd()
  for (const entry of cxModules) {
    if (entry === source) return true
    const entryPath = resolveSpecifier(cwd, entry)
    if (!entryPath) continue
    const importPath = resolveSpecifier(fileDir, source)
    if (importPath && importPath === entryPath) return true
  }
  return false
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

/**
Finds the variable `name` resolves to from `scope`, walking scopes outward, or `undefined`.
 */
function findVariable(name: string, scope: Scope.Scope): Scope.Variable | undefined {
  let current: Scope.Scope | null = scope
  while (current) {
    const variable = current.set.get(name)
    if (variable) return variable
    current = current.upper
  }
  return undefined
}

/**
The static name a member access reads: `.x`, `['x']` or `` [`x`] ``; `undefined` when computed.
 */
function staticPropertyName(node: TSESTree.MemberExpression): string | undefined {
  const { property } = node
  if (!node.computed) return property.type === 'Identifier' ? property.name : undefined
  if (property.type === 'Literal' && typeof property.value === 'string') return property.value
  if (property.type === 'TemplateLiteral' && property.expressions.length === 0) {
    return property.quasis[0]!.value.cooked ?? undefined
  }
  return undefined
}

/**
True when `node` is Nave's `cx` itself: an import binding, or `ns.cx` on a namespace import.
 */
function isCxReference(node: TSESTree.Node, bindings: CxBindings, scope: Scope.Scope): boolean {
  if (node.type === 'Identifier') {
    const variable = findVariable(node.name, scope)
    return variable !== undefined && bindings.cxVariables.has(variable)
  }
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
    const variable = findVariable(node.object.name, scope)
    return (
      variable !== undefined &&
      bindings.namespaceVariables.has(variable) &&
      staticPropertyName(node) === 'cx'
    )
  }
  return false
}

/**
True when `node` reads `.raw` off Nave's `cx` (`cx.raw`, `cx['raw']`, `` cx[`raw`] ``, `ns.cx.raw`).
 */
function isRawAccess(node: TSESTree.Node, bindings: CxBindings, scope: Scope.Scope): boolean {
  return (
    node.type === 'MemberExpression' &&
    staticPropertyName(node) === 'raw' &&
    isCxReference(node.object, bindings, scope)
  )
}

/**
 * One-hop resolution of an identifier to Nave's `cx.raw`, through a `const` only (a `let` or
 * `var` can be reassigned, so what it holds is not read from its declaration): `const r = cx.raw`,
 * or `const { raw } = cx` / `const { raw: esc } = cx`.
 */
function isOneHopRawAccess(
  node: TSESTree.Identifier,
  bindings: CxBindings,
  scope: Scope.Scope,
): boolean {
  const variable = findVariable(node.name, scope)
  if (variable?.defs.length !== 1) return false
  const def = variable.defs[0]!
  if (def.type !== 'Variable' || def.parent.kind !== 'const') return false
  const declarator = def.node as unknown as TSESTree.VariableDeclarator
  const init = declarator.init
  if (!init) return false

  if (declarator.id.type === 'Identifier') return isRawAccess(init, bindings, variable.scope)

  if (declarator.id.type !== 'ObjectPattern' || !isCxReference(init, bindings, variable.scope)) {
    return false
  }
  return declarator.id.properties.some(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      property.key.type === 'Identifier' &&
      property.key.name === 'raw' &&
      property.value.type === 'Identifier' &&
      property.value.name === node.name,
  )
}

/**
 * Resolves a call expression's callee against `bindings`: `'cx'` when it is Nave's `cx` itself,
 * `'raw'` when it is Nave's `cx.raw`, reached directly or through exactly one `const` hop,
 * `'none'` otherwise. A second hop (aliasing an already-resolved `raw` binding again) is never
 * followed, and neither is a hop to `cx` itself.
 */
export function resolveCxCallee(
  callee: TSESTree.Node,
  bindings: CxBindings,
  scope: Scope.Scope,
): 'cx' | 'none' | 'raw' {
  if (isCxReference(callee, bindings, scope)) return 'cx'
  if (isRawAccess(callee, bindings, scope)) return 'raw'
  if (callee.type === 'Identifier' && isOneHopRawAccess(callee, bindings, scope)) return 'raw'
  return 'none'
}
