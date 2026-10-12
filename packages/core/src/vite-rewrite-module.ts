/**
 * What the reading of one module hands the rewrite: which uses of the `cx` binding were turned
 * into edits, the map a `cx.dynamic()` call looks a name up in, and the import of `cx` that the
 * module no longer needs once every use of its binding is gone.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleReading, ReadOptions } from './vite-collect-types.ts'
import type { CxBinding, CxUse } from './vite-cx-use.ts'
import type { ArgumentFrame } from './vite-rewrite-class.ts'
import type { Edit } from './vite-rewrite-edit.ts'
import type { Binding, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, staticStringOf, stringAt } from './vite-ast.ts'
import { cxCallEdits, dynamicCallEdits, rawCallEdits, rawCallOf } from './vite-rewrite-call.ts'

/**
 * What the rewrite keeps while a module is read.
 */
export interface Rewriting {
  /**
   * How many problems the reading has met, a repeat of one already met included: a call is
   * rewritten only if reading it meets none.
   */
  attempts: number
  /**
   * The nodes of the uses already rewritten.
   */
  readonly done: Set<AstNode>
  /**
   * The bindings of `cx` that have a use left in the module.
   */
  readonly kept: Set<Binding>
  /**
   * The name the module gives its map of atoms for `cx.dynamic()`, once a call needs it.
   */
  mapName: string | undefined
}

/**
 * A fresh state for the reading of one module.
 */
export function newRewriting(): Rewriting {
  return { attempts: 0, done: new Set(), kept: new Set(), mapName: undefined }
}

/**
 * What a rewrite needs of the reading of a module.
 */
export interface RewriteSubject {
  readonly code: string
  readonly options: ReadOptions
  readonly result: ModuleReading
  readonly rewriting: Rewriting
}

/**
 * Adds the edits that `build` makes for the use `nodes` stand for, once. A use it has no edits
 * for, or that is nested too deeply to walk, is left to the run-time function.
 */
function addEdits(
  subject: RewriteSubject,
  nodes: readonly [AstNode, ...AstNode[]],
  build: () => Edit[] | undefined,
): void {
  const { options, result, rewriting } = subject
  if (!options.rewrite || rewriting.done.has(nodes[0])) return
  let edits: Edit[] | undefined
  try {
    edits = build()
  } catch (error) {
    if (error instanceof RangeError) return
    throw error
  }
  if (!edits) return
  for (const node of nodes) rewriting.done.add(node)
  result.edits.push(...edits)
}

/**
 * The frame the argument edits read a call in.
 */
function frameOf(subject: RewriteSubject, analysis: ScopeAnalysis): ArgumentFrame {
  return { code: subject.code, analysis, setup: subject.options.setup }
}

/**
 * Rewrites a `cx(...)` call the reading found no problem in.
 */
export function rewriteCx(subject: RewriteSubject, call: AstNode, analysis: ScopeAnalysis): void {
  addEdits(subject, [call], () => cxCallEdits(call, frameOf(subject, analysis)))
}

/**
 * Rewrites the `cx.raw(...)` call that `member` is the callee of; an alias has none.
 */
export function rewriteRaw(
  subject: RewriteSubject,
  member: AstNode,
  analysis: ScopeAnalysis,
): void {
  const frame = frameOf(subject, analysis)
  const call = rawCallOf(member, frame)
  if (call) addEdits(subject, [member, call], () => rawCallEdits(call, frame))
}

/**
 * The name for the map: one no identifier of the module spells.
 */
function uniqueName(code: string): string {
  let name = '__naveKeep'
  for (let n = 1; code.includes(name); n += 1) name = `__naveKeep${n}`
  return name
}

/**
 * Rewrites a `cx.dynamic(name)` call into a lookup in the module's map.
 */
export function rewriteDynamic(
  subject: RewriteSubject,
  call: AstNode,
  analysis: ScopeAnalysis,
): void {
  addEdits(subject, [call], () => {
    const name = subject.rewriting.mapName ?? uniqueName(subject.code)
    const edits = dynamicCallEdits(call, frameOf(subject, analysis), name)
    if (edits) subject.rewriting.mapName = name
    return edits
  })
}

/**
 * Notes that the binding `cx` has a use the rewrite did not turn into edits.
 */
export function noteUse(rewriting: Rewriting, cx: CxBinding | undefined, use?: CxUse): void {
  if (cx && !(use && rewriting.done.has(use.node))) rewriting.kept.add(cx.binding)
}

/**
 * The offset of the first statement that is neither an import nor a directive, where a declaration
 * may go: after the imports, which are hoisted anyway, and before any code that could call.
 */
function declarationStart(program: AstNode): number {
  const statement = nodesAt(program, 'body').find(
    (node) =>
      node.type !== 'ImportDeclaration' &&
      (node.type !== 'ExpressionStatement' || typeof node.directive !== 'string'),
  )
  return statement?.start ?? program.end
}

/**
 * The map of the atoms in `keep` to their classes, as an object that holds those keys and nothing
 * inherited, so a name such as `toString` is outside it as it is outside `keep`.
 */
function mapLiteral(keep: Readonly<Record<string, string>>): string {
  const entries = Object.entries(keep).map(
    ([atom, name]) => `${JSON.stringify(atom)}:${JSON.stringify(name)}`,
  )
  return `{${['__proto__:null', ...entries].join(',')}}`
}

/**
 * Declares the map the module's `cx.dynamic()` calls look names up in.
 */
function declareMap(subject: RewriteSubject, program: AstNode): void {
  const { options, result, rewriting } = subject
  if (rewriting.mapName === undefined || !options.rewrite) return
  const at = declarationStart(program)
  const text = `const ${rewriting.mapName}=${mapLiteral(options.rewrite.keep)};`
  result.edits.push({ start: at, end: at, text })
}

/**
 * The local names an import declaration's specifiers bind.
 */
function localNamesOf(declaration: AstNode): string[] {
  return nodesAt(declaration, 'specifiers').map((specifier) => {
    const local = nodeAt(specifier, 'local')
    return (local && stringAt(local, 'name')) ?? ''
  })
}

/**
 * Removes each import of `source` whose bindings have no use left.
 */
function removeUnusedImports(
  subject: RewriteSubject,
  program: AstNode,
  bound: { readonly bindings: ReadonlyMap<Binding, CxBinding>; readonly source: string },
): void {
  const unused = new Set(
    bound.bindings
      .keys()
      .filter((binding) => !subject.rewriting.kept.has(binding))
      .map((binding) => binding.name),
  )
  for (const declaration of nodesAt(program, 'body')) {
    const names =
      declaration.type === 'ImportDeclaration' &&
      staticStringOf(nodeAt(declaration, 'source')) === bound.source
        ? localNamesOf(declaration)
        : []
    if (names.length === 0 || names.some((name) => !unused.has(name))) continue
    const line = /^\r?\n/.exec(subject.code.slice(declaration.end))
    const end = declaration.end + (line?.[0].length ?? 0)
    subject.result.edits.push({ start: declaration.start, end, text: '' })
  }
}

/**
 * Ends the rewrite of a module: declares the map its `cx.dynamic()` calls look names up in, and
 * removes the import of `cx` from `source` when no use of its bindings is left.
 */
export function finishRewrite(
  subject: RewriteSubject,
  program: AstNode,
  bound: { readonly bindings: ReadonlyMap<Binding, CxBinding>; readonly source: string },
): void {
  if (!subject.options.rewrite || subject.result.edits.length === 0) return
  declareMap(subject, program)
  removeUnusedImports(subject, program, bound)
}
