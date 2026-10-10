/**
 * Reads one module for the atoms its `cx()` calls and written classes name, and for everything
 * in it the build cannot read. Pure: it takes the parsed module and returns what it found, so the
 * host (the post-order plugin) decides where the findings go.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleReading, ReadOptions } from './vite-collect-types.ts'
import type { CxUse } from './vite-cx-use.ts'
import type { Problem } from './vite-problems.ts'

import { nodesAt } from './vite-ast.ts'
import { judgeAtom } from './vite-atom-check.ts'
import { resolveArgument } from './vite-cx-args.ts'
import { cxBindingsOf, isImportingCx } from './vite-cx-bindings.ts'
import { useOf, useOfExpression } from './vite-cx-reference.ts'
import { sourceFormProblems } from './vite-cx-source-forms.ts'
import { declaredExportProblems } from './vite-declared-exports.ts'
import {
  atomsInEscapedStrings,
  atomsWrittenIn,
  concatenationProblems,
} from './vite-literal-classes.ts'
import { analyze, type ScopeAnalysis } from './vite-scope.ts'
import { mergedExposures, setupMemberName } from './vite-setup-member.ts'
import { cxReadsOnSetup, stringExposures } from './vite-vue-setup.ts'

export const CX_SOURCE = '@navecss/core/cx'

export type { ModuleReading, ReadOptions } from './vite-collect-types.ts'

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
 * The problem a refused use makes. A listed module's exports of `cx` are judged whole by
 * `declaredExportProblems`, so a refused re-export there makes none.
 */
function refusedProblem(reading: Reading, use: CxUse): Problem | undefined {
  if (use.isReexport && reading.options.isDeclared === true) return undefined
  return {
    kind: use.isReexport ? 'reexport' : 'reference',
    offset: use.node.start,
    construct: '',
    text: `${use.phrase ?? ''}.`,
    ...(use.isReexport && { isListable: use.isListable }),
    ...(use.isRenamed === true && { isRenamed: true }),
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
      const problem = refusedProblem(reading, use)
      if (problem) report(reading, problem)

      break
    }
    // No default
  }
}

/**
 * Reads every use of a `cx` binding in the module, and, in a compiled Vue template, every read of
 * one off `$setup`.
 */
function readUses(
  reading: Reading,
  program: AstNode,
): { analysis: ScopeAnalysis; bindings: ReturnType<typeof cxBindingsOf> } {
  const { code, options, result } = reading
  const analysis = analyze(program)
  const bindings = cxBindingsOf(analysis, options.cxSources)
  const frame = {
    analysis,
    code,
    allowsExposure: options.isVueScript === true,
    declaredSources: options.declaredSources,
  }
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
  return { analysis, bindings }
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
  const { analysis, bindings } = readUses(reading, program)
  const listed =
    options.isDeclared === true
      ? declaredExportProblems({
          program,
          analysis,
          bindings,
          cxSources: options.cxSources,
          declaredSources: options.declaredSources ?? new Set(),
        })
      : []
  for (const problem of [...sourceFormProblems(code, program, options), ...listed]) {
    report(reading, problem)
  }
  for (const atom of atomsWrittenIn(code)) result.classes.add(atom)
  for (const atom of atomsInEscapedStrings(program)) result.classes.add(atom)
  if (result.usesCx || !options.isDependency) {
    for (const problem of concatenationProblems(program, code, analysis)) report(reading, problem)
  }
  return result
}
