/**
 * The reader that finds which atoms a build uses, with no parser behind it: it reads the syntax
 * tree its caller parsed. The Vite plugin calls it with Vite's parser; this entry exposes it so a
 * host with another parser can read modules the same way, report what it cannot read with the
 * same sentences, validate the same options, trim the atomic layer to the atoms it read and judge
 * the re-exports of `cx` that a package `keepFor` lists gives out over its own module graph, and
 * tell whether a module hands out the `cx` it imports in a form the reader does not bind. The
 * tree must be the one Vite's parser returns, with no node for a pair of parentheses
 * (`oxc-parser` gives it with `preserveParens: false`); `readModule` throws a `TypeError` on a
 * tree that keeps one. Not meant for application code.
 */
export type { AstNode } from './vite-ast.ts'
export { CX_SOURCE, readModule } from './vite-collect.ts'
export type { ModuleReading, ReadOptions } from './vite-collect.ts'
export { assertOptions, keptAtoms, resolveUsedOptions } from './vite-options.ts'
export type { ResolvedUsedOptions, UsedAtomOptions } from './vite-options.ts'
export type { Problem, ProblemKind } from './vite-problems.ts'
export { inspectAtomicLayer, pruneAtomicLayer, unprunedAtoms } from './vite-prune.ts'
export type { LayerReading } from './vite-prune.ts'
export { judgeReexports } from './vite-reexport-judge.ts'
export type { ModuleOutcome } from './vite-reexport-judge.ts'
export { isImportedCxHandedOut } from './vite-require-uses.ts'
export { withRestorers } from './vite-restorers.ts'
export type { ModuleHost, ModuleInfo, TakesContext } from './vite-takes-host.ts'
export { buildReport, REPORT_CAUSE } from './vite-used-report.ts'
export type { HostRemedies, LocatedProblem, ReportHost } from './vite-used-report.ts'
