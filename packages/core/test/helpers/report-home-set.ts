/**
 * One problem set that reaches every remedy line naming where the options live: an application
 * module of each kind that prints such a line, and one dependency per sentence that does. Built
 * from located problems, so the report formatter is the only code that reads it.
 */
import type { LocatedProblem } from '../../src/vite-used-report.ts'

/**
 * The `cxModules` list the set's remedies extend.
 */
export const CONFIGURED_MODULES = ['./src/own.ts'] as const

/**
 * A located problem in `overrides.file`, an argument problem at 1:1 unless the overrides say otherwise.
 */
function problem(
  overrides: Partial<LocatedProblem> & Pick<LocatedProblem, 'file'>,
): LocatedProblem {
  return {
    kind: 'argument',
    offset: 0,
    construct: 'cx(v)',
    text: '',
    line: 1,
    column: 1,
    ...overrides,
  }
}

/**
 * A dependency's problem: its path lies under `node_modules` and carries the package name.
 */
function inPackage(
  pkg: string,
  overrides: Partial<LocatedProblem> & Pick<LocatedProblem, 'kind'>,
): LocatedProblem {
  return problem({ file: `node_modules/${pkg}/index.js`, pkg, ...overrides })
}

export const HOME_REPORT_SET: readonly LocatedProblem[] = [
  problem({ file: 'src/Card.tsx', line: 3, column: 5 }),
  problem({ file: 'src/Tone.tsx', kind: 'dynamic', construct: 'cx.dynamic(t)' }),
  problem({ file: 'src/ui.ts', kind: 'reexport', construct: 'export { cx }' }),
  inPackage('dynamic-lib', { kind: 'dynamic', construct: 'cx.dynamic(t)' }),
  inPackage('calls-lib', { kind: 'argument' }),
  inPackage('listed-lib', { kind: 'reexport', specifier: 'listed-lib' }),
  inPackage('internal-lib', { kind: 'reexport' }),
  inPackage('renamed-lib', { kind: 'reexport', isRenamed: true }),
  inPackage('declared-lib', { kind: 'declared', entries: ['declared-lib'] }),
  inPackage('through-lib', {
    kind: 'reexport',
    isListable: false,
    callers: ['node_modules/caller-lib/index.js'],
  }),
]
