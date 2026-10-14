/**
 * The reader that finds which atoms a build uses, with no parser behind it: it reads the syntax
 * tree its caller parsed. The Vite plugin calls it with Vite's parser; this entry exposes it so a
 * host with another parser can read modules the same way, report what it cannot read with the
 * same sentences and validate the same options. Not meant for application code.
 */
export type { AstNode } from './vite-ast.ts'
export { CX_SOURCE, readModule } from './vite-collect.ts'
export type { ModuleReading, ReadOptions } from './vite-collect.ts'
export { assertOptions, keptAtoms, resolveUsedOptions } from './vite-options.ts'
export type { ResolvedUsedOptions, UsedAtomOptions } from './vite-options.ts'
export type { Problem, ProblemKind } from './vite-problems.ts'
export { buildReport, REPORT_CAUSE } from './vite-used-report.ts'
export type { LocatedProblem } from './vite-used-report.ts'
