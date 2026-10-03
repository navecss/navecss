/**
 * Reads one module for the atoms its `cx()` calls and written classes name, and for everything
 * in it the build cannot read. Pure: it takes the parsed module and returns what it found, so the
 * host (the post-order plugin) decides where the findings go.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxUse } from './vite-cx-reference.ts'
import type { Problem } from './vite-problems.ts'
import type { SetupExposure, SetupExposures } from './vite-setup-member.ts'

import { childrenOf, nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'
import { judgeAtom } from './vite-atom-check.ts'
import { resolveArgument } from './vite-cx-args.ts'
import { cxBindingsOf, isImportingCx } from './vite-cx-bindings.ts'
import { useOf, useOfExpression } from './vite-cx-reference.ts'
import {
  atomsInEscapedStrings,
  atomsWrittenIn,
  concatenationProblems,
} from './vite-literal-classes.ts'
import { analyze, type ScopeAnalysis } from './vite-scope.ts'
import { mergedExposures, setupMemberName } from './vite-setup-member.ts'
import { cxReadsOnSetup, stringExposures } from './vite-vue-setup.ts'

export const CX_SOURCE = '@navecss/core/cx'

export interface ReadOptions {
  /**
   * The import specifiers that bind Nave's `cx`.
   */
  readonly cxSources: ReadonlySet<string>
  /**
   * The names of the consumer's own atoms, which have no class.
   */
  readonly ownAtoms: ReadonlySet<string>
  /**
   * Whether this module belongs to a dependency, where a Nave class built from pieces is only
   * refused if the module also imports `cx`.
   */
  readonly isDependency: boolean
  /**
   * For a compiled Vue template: what its component's script exposes to it.
   */
  readonly setup?: SetupExposures | undefined
  /**
   * Whether the module is a compiled Vue component's `<script setup>`.
   */
  readonly isVueScript?: boolean
}

export interface ModuleReading {
  /**
   * Built-in atoms named by a readable `cx()` call.
   */
  readonly atoms: Set<string>
  /**
   * Built-in atoms whose class is written whole in the module.
   */
  readonly classes: Set<string>
  readonly problems: Problem[]
  /**
   * Where `cx.dynamic()` is called, and the call as the plugin reads it.
   */
  readonly dynamicCalls: { readonly construct: string; readonly offset: number }[]
  /**
   * For a compiled Vue `<script setup>`: what it exposes to its template.
   */
  readonly exposes: Map<string, SetupExposure>
  /**
   * Whether the module imports from a `cx` source, whether or not it uses the import.
   */
  readonly usesCx: boolean
}

interface Reading {
  readonly code: string
  readonly options: ReadOptions
  readonly result: ModuleReading
  readonly seen: Set<string>
}

/**
 * Records `problem` unless the same one is already recorded at the same place.
 */
function report(reading: Reading, problem: Problem): void {
  const key = `${problem.kind}:${problem.offset}`
  if (reading.seen.has(key)) return
  reading.seen.add(key)
  reading.result.problems.push(problem)
}

/**
 * What a compiler writes before an author's name: Vue's `$setup.` and Svelte's `$$props.`.
 */
const COMPILER_PREFIX = /\$setup\.|\$\$props\./g

/**
 * The call quoted as the plugin reads it: the local name and the arguments' own text.
 */
function quoteCall(
  reading: Reading,
  use: CxUse,
  args: readonly AstNode[],
  callee = use.local,
): string {
  const first = args[0]
  const last = args.at(-1)
  const inner = first && last ? reading.code.slice(first.start, last.end) : ''
  return `${callee}(${inner.replaceAll(COMPILER_PREFIX, '')})`
}

/**
 * Judges one string an argument can be.
 */
function judgeString(reading: Reading, use: CxUse, value: string, node: AstNode): void {
  const verdict = judgeAtom(value, reading.options.ownAtoms)
  switch (verdict.kind) {
    case 'atom': {
      reading.result.atoms.add(value)

      break
    }
    case 'own': {
      report(reading, {
        kind: 'own',
        offset: node.start,
        construct: `${use.local}()`,
        text: `"${value}" is an atom of your own, which has no class. Use @nave ${value} in a CSS rule instead.`,
      })

      break
    }
    case 'whitespace': {
      report(reading, {
        kind: 'argument',
        offset: node.start,
        construct: `${use.local}()`,
        text: verdict.text,
      })

      break
    }
    default: {
      report(reading, {
        kind: 'unknown',
        offset: node.start,
        construct: `${use.local}()`,
        text: verdict.text,
        needsAvailable: !verdict.hasHint,
      })
    }
  }
}

/**
 * Reads the arguments of a direct call.
 */
function readCall(reading: Reading, use: CxUse, analysis: ReturnType<typeof analyze>): void {
  const args = nodesAt(use.node, 'arguments')
  for (const arg of args) {
    if (arg.type === 'SpreadElement') {
      report(reading, {
        kind: 'argument',
        offset: arg.start,
        construct: quoteCall(reading, use, args),
        text: 'a spread argument.',
      })
      continue
    }
    const possibles = resolveArgument(arg, analysis, reading.options.setup)
    if (!possibles) {
      report(reading, {
        kind: 'argument',
        offset: arg.start,
        construct: quoteCall(reading, use, args),
        text: 'the argument is not a literal atom name.',
      })
      continue
    }
    for (const { value, node } of possibles) judgeString(reading, use, value, node)
  }
}

/**
 * Reads one use of the binding.
 */
function readUse(reading: Reading, use: CxUse, analysis: ReturnType<typeof analyze>): void {
  switch (use.kind) {
    case 'call': {
      readCall(reading, use, analysis)

      break
    }
    case 'dynamic': {
      const args = nodesAt(use.node, 'arguments')
      const construct = quoteCall(reading, use, args, `${use.local}.dynamic`)
      reading.result.dynamicCalls.push({ offset: use.node.start, construct })

      break
    }
    case 'exposure': {
      reading.result.exposes.set(use.exposedAs ?? use.local, { kind: 'cx' })

      break
    }
    case 'refused': {
      report(reading, {
        kind: use.isReexport ? 'reexport' : 'reference',
        offset: use.node.start,
        construct: '',
        text: `${use.phrase ?? ''}.`,
      })

      break
    }
    // No default
  }
}

/**
 * The problem a node that names a `cx` source makes, if it makes one: a re-export from it, or a
 * dynamic import of it.
 */
function sourceFormProblem(reading: Reading, node: AstNode): Problem | undefined {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (source === undefined || !reading.options.cxSources.has(source)) return undefined
  const construct = reading.code.slice(node.start, node.end)
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
    const text =
      'a re-export of cx, which the build follows only from a module listed in cxModules.'
    return { kind: 'reexport', offset: node.start, construct, text }
  }
  if (node.type !== 'ImportExpression') return undefined
  const text =
    'a dynamic import of cx, which the build cannot follow. Import it at the top of the module.'
  return { kind: 'reference', offset: node.start, construct, text }
}

/**
 * Re-exports straight from a `cx` source, and dynamic imports of one.
 */
function readSourceForms(reading: Reading, program: AstNode): void {
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const problem = sourceFormProblem(reading, node)
    if (problem) report(reading, problem)
    stack.push(...childrenOf(node))
  }
}

/**
 * Reads every use of a `cx` binding in the module, and, in a compiled Vue template, every read of
 * one off `$setup`.
 */
function readUses(reading: Reading, program: AstNode): ScopeAnalysis {
  const { code, options, result } = reading
  const analysis = analyze(program)
  const bindings = cxBindingsOf(analysis, options.cxSources)
  const frame = { analysis, code, allowsExposure: options.isVueScript === true }
  for (const reference of analysis.references) {
    const cx = reference.binding && bindings.get(reference.binding)
    const use = cx && useOf(frame, reference, cx)
    if (use) readUse(reading, use, analysis)
  }
  for (const [name, exposure] of stringExposures(analysis)) result.exposes.set(name, exposure)
  const setup = mergedExposures(options.setup, result.exposes)
  const members = setup ? cxReadsOnSetup(analysis, setup) : []
  const withSetup: Reading = { ...reading, options: { ...options, setup } }
  for (const member of members) {
    readUse(withSetup, useOfExpression(frame, member, setupMemberName(member) ?? 'cx'), analysis)
  }
  return analysis
}

/**
 * Reads `program`, the parse of `code`.
 */
export function readModule(code: string, program: AstNode, options: ReadOptions): ModuleReading {
  const result: ModuleReading = {
    atoms: new Set(),
    classes: new Set(),
    problems: [],
    dynamicCalls: [],
    exposes: new Map(),
    usesCx: isImportingCx(program, options.cxSources),
  }
  const reading: Reading = { code, options, result, seen: new Set() }
  const analysis = readUses(reading, program)
  readSourceForms(reading, program)
  for (const atom of atomsWrittenIn(code)) result.classes.add(atom)
  for (const atom of atomsInEscapedStrings(program)) result.classes.add(atom)
  if (result.usesCx || !options.isDependency) {
    for (const problem of concatenationProblems(program, code, analysis)) report(reading, problem)
  }
  return result
}
