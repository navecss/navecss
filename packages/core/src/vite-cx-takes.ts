/**
 * What an importer takes from a module that gives out Nave's `cx`: which of its `cx` exports it
 * imports, re-exports or reads off a namespace. The test is by name, not by file: an importer that
 * takes only `Button` from a module which also exports `cx` as `cn` takes no `cx` from it, so
 * nothing of its own routes calls through `cn`. A take the parse cannot tell apart (a namespace
 * passed on, a computed key, a rest element, an `import()` used any other way) counts as taken, and
 * so does an importer whose text names the module in no way the build reads (a `require()`). A
 * declaration written for the types only (`import type`, `export type`, a `type` specifier), and a
 * named import that is referenced only in type positions, take nothing: TypeScript leaves them out
 * of the compiled module.
 */
import type { AstNode } from './vite-ast.ts'

import {
  childrenOf,
  exportNameOf,
  isTypeOnly,
  nodeAt,
  pushAll,
  staticStringOf,
  valueSpecifiersOf,
} from './vite-ast.ts'
import { jsxMembersIn, jsxNameOf, namesIn, typeNameOf } from './vite-cx-reference-names.ts'
import { type CxNames, dynamicKeys, isCxName, referenceTakes } from './vite-cx-take-keys.ts'
import { heldNamespace, isCarriedOn, passingOf, usesOf, withHeld } from './vite-cx-take-passing.ts'
import { isUsedAsCallsOnly } from './vite-require-uses.ts'
import { analyze, type Reference, type ScopeAnalysis } from './vite-scope.ts'

/**
 * How an importer takes the module: by the names it imports or re-exports, as a namespace, as
 * `export *`, as an `import()`, or in a way the build cannot read.
 */
type TakeShape = 'dynamic-import' | 'names' | 'namespace' | 'star' | 'unreadable'

export interface Taken {
  readonly shape: TakeShape
  /**
   * The `cx` exports the importer takes by name; none when it takes the module whole.
   */
  readonly names: readonly string[]
  /**
   * Whether the importer only passes on what it takes: a named re-export, or an import that it
   * then exports.
   */
  readonly isPassedOn?: boolean
  /**
   * Whether the importer does nothing with what it takes but re-export it: `export ... from`, or an
   * import that every use of is an export. A forward is followed to what takes it; it is not a
   * take on the `cxModules` route.
   */
  readonly isForward?: boolean
  /**
   * Whether the take comes from what an earlier server command left in the cache directory.
   */
  readonly isRecorded?: boolean
  /**
   * For a dependency's take: whether the build reads it neither as calls only nor as a forward, so
   * it cannot tell where what is taken goes. `form` says what the dependency does, in words.
   */
  readonly isHeld?: boolean
  readonly form?: string
}

export interface Take extends Taken {
  /**
   * The importer's path, relative to the project root, with forward slashes.
   */
  readonly taker: string
  /**
   * Whether the module taken from is reached through another module of its package, which
   * re-exports the `cx` it gives out.
   */
  readonly isReached: boolean
}

/**
 * The take of an importer the build cannot read: it takes the module whole.
 */
export const UNREADABLE: Taken = { shape: 'unreadable', names: [] }

/**
 * What the references to a namespace import take.
 */
function namespaceTakes(
  analysis: ScopeAnalysis,
  references: readonly Reference[],
  names: CxNames,
): Taken | undefined {
  const found = new Set<string>()
  for (const reference of references) {
    const taken = referenceTakes(analysis, reference.node, names)
    if (taken === undefined) return { shape: 'namespace', names: [] }
    for (const name of taken) found.add(name)
  }
  return found.size === 0 ? undefined : { shape: 'namespace', names: [...found] }
}

/**
 * The references to the namespace import that `specifier` declares in the module.
 */
function referencesTo(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): readonly Reference[] {
  const local = exportNameOf(nodeAt(specifier, 'local'))
  return analysis.references.filter(({ binding }) => {
    return (
      binding?.kind === 'import' &&
      binding.imported === '*' &&
      binding.source === source &&
      binding.name === local
    )
  })
}

interface Scan {
  readonly analysis: () => ScopeAnalysis
  /**
   * Whether the importer belongs to a dependency, whose takes the build reads for where they go.
   */
  readonly isDependency: boolean
  readonly names: CxNames
  readonly reaches: ReadonlySet<string>
  /**
   * The names the module's type positions refer to: `typeof name`, `name`, `name.member`.
   */
  readonly typeNames: () => ReadonlySet<string>
  /**
   * The names the module's JSX elements are written with, which are uses of a value though
   * the scope analysis reads no reference there.
   */
  readonly jsxNames: () => ReadonlySet<string>
  /**
   * The members of a namespace import that the module's JSX member tags read: `Cx` of `<UI.Cx />`.
   */
  readonly jsxMembers: (local: string) => ReadonlySet<string>
}

/**
 * Whether the import specifier is referenced only in type positions: it has a reference there and
 * none that is a value (a JSX element name is one), so TypeScript leaves it out of the compiled
 * module. An import nothing references at all stays a take.
 */
function isTypeUseOnly(scan: Scan, source: string, specifier: AstNode): boolean {
  const local = exportNameOf(nodeAt(specifier, 'local'))
  if (local === undefined || !scan.typeNames().has(local) || scan.jsxNames().has(local)) {
    return false
  }
  return usesOf(scan.analysis(), source, specifier).length === 0
}

/**
 * What the namespace import that `specifier` declares takes: what its references take, and the
 * `cx` exports that JSX member tags read off it.
 */
function namespaceTakesOf(scan: Scan, source: string, specifier: AstNode): Taken | undefined {
  const references = referencesTo(scan.analysis(), source, specifier)
  const taken = namespaceTakes(scan.analysis(), references, scan.names)
  if (taken?.names.length === 0) return taken
  const local = exportNameOf(nodeAt(specifier, 'local'))
  const tags = local === undefined ? [] : [...scan.jsxMembers(local)]
  const names = new Set([
    ...(taken?.names ?? []),
    ...tags.filter((name) => isCxName(scan.names, name)),
  ])
  return names.size === 0 ? undefined : { shape: 'namespace', names: [...names] }
}

/**
 * What the namespace import that `specifier` declares takes, held when a dependency does more with
 * it than forward it.
 */
function namespaceTake(scan: Scan, source: string, specifier: AstNode): Taken | undefined {
  const references = referencesTo(scan.analysis(), source, specifier)
  const held = scan.isDependency && heldNamespace(scan.analysis(), references, scan.names, source)
  if (held) return held
  const taken = namespaceTakesOf(scan, source, specifier)
  const isForward = passingOf(scan.analysis(), source, specifier).isForward
  const forwarded = taken && { ...taken, ...(isForward && { isForward }) }
  return forwarded && scan.isDependency ? withHeld(forwarded, source) : forwarded
}

/**
 * What the named or default import that `specifier` declares takes, when it takes a `cx` export;
 * held when a dependency carries it where the build cannot follow it.
 */
function namedTake(scan: Scan, source: string, specifier: AstNode): Taken | undefined {
  const imported =
    specifier.type === 'ImportDefaultSpecifier'
      ? 'default'
      : exportNameOf(nodeAt(specifier, 'imported'))
  if (imported === undefined || !isCxName(scan.names, imported)) return undefined
  if (isTypeUseOnly(scan, source, specifier)) return undefined
  const isHeld = scan.isDependency && isCarriedOn(scan.analysis(), source, specifier)
  const form = `uses ${imported} from ${source} where the build cannot follow it`
  return {
    shape: 'names',
    names: [imported],
    ...passingOf(scan.analysis(), source, specifier),
    ...(isHeld && { isHeld: true, form }),
  }
}

/**
 * What an `import` declaration takes.
 */
function importTakes(node: AstNode, source: string, scan: Scan): Taken[] {
  return valueSpecifiersOf(node).flatMap((specifier) => {
    const taken =
      specifier.type === 'ImportNamespaceSpecifier'
        ? namespaceTake(scan, source, specifier)
        : namedTake(scan, source, specifier)
    return taken ? [taken] : []
  })
}

/**
 * What an `export ... from` statement takes: the `cx` exports a named one re-exports, the whole
 * namespace an `export * as` re-exports, and the module's named exports an `export *` re-exports.
 */
function exportTakes(node: AstNode, scan: Scan): Taken[] {
  if (node.type === 'ExportAllDeclaration') {
    if (nodeAt(node, 'exported') !== undefined) {
      return [{ shape: 'namespace', names: [], isForward: true }]
    }
    const hasNamed =
      scan.names === undefined || scan.names.keys().some((name) => name !== 'default')
    return hasNamed ? [{ shape: 'star', names: [], isForward: true }] : []
  }
  const re = valueSpecifiersOf(node)
    .map((specifier) => exportNameOf(nodeAt(specifier, 'local')))
    .filter((name): name is string => name !== undefined && isCxName(scan.names, name))
  return re.length === 0 ? [] : [{ shape: 'names', names: re, isPassedOn: true, isForward: true }]
}

/**
 * What an `import()` takes: the `cx` exports its awaited result, or the parameter of its inline
 * `.then` callback, reads by static keys (none when it reads other keys), and the whole module for
 * any other use.
 */
function dynamicTakes(node: AstNode, scan: Scan): Taken[] {
  const keys = dynamicKeys(scan.analysis(), node, scan.names)
  if (keys === undefined) return [{ shape: 'dynamic-import', names: [] }]
  return keys.length === 0 ? [] : [{ shape: 'dynamic-import', names: keys }]
}

/**
 * What one statement or expression takes from the module, when it names it.
 */
function takesOf(node: AstNode, scan: Scan): Taken[] {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (source === undefined || !scan.reaches.has(source)) return []
  if (isTypeOnly(node)) return []
  if (node.type === 'ImportDeclaration') return importTakes(node, source, scan)
  if (node.type === 'ImportExpression') {
    if (!scan.isDependency) return dynamicTakes(node, scan)
    // A dependency's names are read no further than the keys it takes, so a result that is not
    // used as calls only is a take of the whole module, which the build cannot follow.
    const taken = isUsedAsCallsOnly(scan.analysis(), node)
      ? dynamicTakes(node, scan)
      : [{ shape: 'dynamic-import' as const, names: [] }]
    return taken.map((one) => withHeld(one, source))
  }
  return exportTakes(node, scan)
}

/**
 * What the module `program` takes from a module that exports `cx` under `names`, `reaches` being
 * the specifiers it writes that resolve to that module.
 */
export function takesIn(
  program: AstNode,
  input: {
    readonly isDependency?: boolean
    readonly names: CxNames
    readonly reaches: ReadonlySet<string>
  },
): Taken[] {
  let analysis: ScopeAnalysis | undefined
  let typeNames: ReadonlySet<string> | undefined
  let jsxNames: ReadonlySet<string> | undefined
  let jsxMembers: ReadonlyMap<string, ReadonlySet<string>> | undefined
  const scan: Scan = {
    ...input,
    isDependency: input.isDependency === true,
    analysis: () => (analysis ??= analyze(program)),
    typeNames: () => (typeNames ??= namesIn(program, typeNameOf)),
    jsxNames: () => (jsxNames ??= namesIn(program, jsxNameOf)),
    jsxMembers: (local) => (jsxMembers ??= jsxMembersIn(program)).get(local) ?? new Set(),
  }
  const found: Taken[] = []
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    pushAll(found, takesOf(node, scan))
    pushAll(stack, childrenOf(node))
  }
  return found
}
