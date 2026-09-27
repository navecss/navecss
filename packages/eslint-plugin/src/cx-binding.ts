/**
 * Resolves whether an identifier or member access in a linted file is Nave's `cx`/`cx.raw`, by
 * import binding, never by name (R5): the callee `cx('x')` in a file that never imported
 * `@navecss/core/cx` is not Nave's, and an aliased import (`cx as ncx`) still is.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const CORE_CX_SPECIFIER = '@navecss/core/cx'

export interface CxBindings {
  /**
  Local names bound (by import) to Nave's `cx` itself.
   */
  cxNames: Set<string>
  /**
  Local names bound (one hop) to Nave's `cx.raw`.
   */
  rawNames: Set<string>
}

const CANDIDATE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/**
Resolves a relative specifier to a real path, trying common extensions; `undefined` if none exist.
 */
function resolveRelative(fromDir: string, specifier: string): string | undefined {
  const base = path.resolve(fromDir, specifier)
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate)) {
      try {
        return realpathSync(candidate)
      } catch {
        return candidate
      }
    }
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
 *
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
export function isRecognisedCxModule(
  source: string,
  cxModules: string[],
  filename: string,
): boolean {
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
Scans a `Program`'s top-level imports for bindings of Nave's `cx`, direct or via a wrapper.
 */
export function collectCxBindings(
  program: TSESTree.Program,
  cxModules: string[],
  filename: string,
): CxBindings {
  const cxNames = new Set<string>()
  const rawNames = new Set<string>()

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    const source = statement.source.value
    if (!isRecognisedCxModule(source, cxModules, filename)) continue

    for (const specifier of statement.specifiers) {
      const isNamedCx =
        specifier.type === 'ImportSpecifier' &&
        (specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : specifier.imported.value) === 'cx'
      if (isNamedCx || specifier.type === 'ImportDefaultSpecifier') {
        cxNames.add(specifier.local.name)
      }
    }
  }

  return { cxNames, rawNames }
}

/**
True when `node` is a `MemberExpression` reading a non-computed `.raw`, or a computed `['raw']`.
 */
function isRawAccess(node: TSESTree.Node, cxNames: Set<string>): boolean {
  if (node.type !== 'MemberExpression') return false
  if (node.object.type !== 'Identifier' || !cxNames.has(node.object.name)) return false
  const { property } = node
  if (property.type === 'Identifier') return !node.computed && property.name === 'raw'
  return node.computed && property.type === 'Literal' && property.value === 'raw'
}

/**
 * Resolves a call expression's callee against `bindings`: `'cx'` when it is Nave's `cx` itself
 * (directly, or a one-hop destructure/const alias is not extended to `cx` — only `.raw` gets
 * that treatment, per R5/R6), `'raw'` when it is Nave's `cx.raw`, reached directly or through
 * exactly one hop (`const { raw } = cx`, `const r = cx.raw`), `'none'` otherwise. A second hop
 * (aliasing an already-resolved `raw` binding again) is never followed.
 */
export function resolveCxCallee(
  callee: TSESTree.Node,
  bindings: CxBindings,
  scope: Scope.Scope,
): 'cx' | 'raw' | 'none' {
  if (callee.type === 'Identifier' && bindings.cxNames.has(callee.name)) return 'cx'
  if (isRawAccess(callee, bindings.cxNames)) return 'raw'

  if (callee.type === 'Identifier' && isOneHopRawAccess(callee.name, bindings.cxNames, scope)) {
    return 'raw'
  }

  return 'none'
}

/**
Finds `name`'s variable by walking scopes outward, or returns `undefined`.
 */
function findVariable(name: string, scope: Scope.Scope): Scope.Variable | undefined {
  let current: Scope.Scope | null = scope
  while (current) {
    const variable = current.variables.find((candidate) => candidate.name === name)
    if (variable) return variable
    current = current.upper
  }
  return undefined
}

/**
One-hop resolution of an identifier to Nave's `cx.raw`, via a const alias or a destructure.
 */
function isOneHopRawAccess(name: string, cxNames: Set<string>, scope: Scope.Scope): boolean {
  const variable = findVariable(name, scope)
  if (variable?.defs.length !== 1) return false
  const def = variable.defs[0]!
  if (def.type !== 'Variable') return false
  const declarator = def.node
  const init = declarator.init as TSESTree.Node | null
  if (!init) return false

  if (declarator.id.type === 'Identifier') {
    // const r = cx.raw
    return isRawAccess(init, cxNames)
  }

  if (
    declarator.id.type === 'ObjectPattern' &&
    init.type === 'Identifier' &&
    cxNames.has(init.name)
  ) {
    // const { raw } = cx  /  const { raw: esc } = cx
    return declarator.id.properties.some(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        property.key.type === 'Identifier' &&
        property.key.name === 'raw' &&
        property.value.type === 'Identifier' &&
        property.value.name === name,
    )
  }

  return false
}
