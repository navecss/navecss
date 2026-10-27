import { vi } from 'vitest'

/**
 * Scenarios for the used-atoms rules on Next.js: the fixture's layout, a page that imports the
 * modules a row names, the plugin run over core's `atomic.css` in a scratch project, and the
 * report the build's check would print for what the run recorded. No bundler runs.
 */
import type { NaveOptions } from '../../src/options.ts'
import type { PruneRecord } from '../../src/record.ts'
import type { Report } from '../../src/report.ts'
import type { Project } from './project.ts'

import { reportOf } from '../../src/report.ts'
import { manifest, PLAIN_LAYOUT, useScratchProjects } from './atoms-fixture.ts'
import { atomsIn } from './layer.ts'
import { runAtomic } from './plugin-run.ts'
import { recordOf } from './project.ts'

export const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * The report text's problem lines: one `path:line:column: text` line per problem.
 */
const PLACED = /^\S+:\d+:\d+: /u

export interface Scenario {
  /**
   * Modules the page imports, by path from the project directory (under `app/` or `components/`).
   */
  readonly modules?: Readonly<Record<string, string>>
  /**
   * Any other file, not imported by the page.
   */
  readonly files?: Readonly<Record<string, string>>
  /**
   * Packages installed under `node_modules`, by name, each a map of file to text. The page
   * imports each of them for its effect.
   */
  readonly packages?: Readonly<Record<string, Record<string, string>>>
  /**
   * Whether the page imports every installed package for its effect (it does, unless this is
   * `false`): a row where the application takes names from a package imports them itself.
   */
  readonly importsPackages?: boolean
  /**
   * More specifiers the page imports for their effect.
   */
  readonly imports?: readonly string[]
  /**
   * Called with the project once its files and packages are written, before the plugin runs: for
   * a layout the other fields cannot spell, such as a link into `node_modules`.
   */
  readonly setup?: (project: Project) => void
  /**
   * Extra statements at the top of the page, before the generated imports.
   */
  readonly pageHead?: string
  /**
   * What the page returns; an element with no class when omitted.
   */
  readonly pageBody?: string
  readonly options?: NaveOptions
  /**
   * Runs the plugin as `next dev` does: it prints its report to the terminal.
   */
  readonly isDev?: boolean
}

/**
 * What Next.js gives a function config in `next dev`.
 */
const DEV = 'phase-development-server'

export interface Read {
  /**
   * The built-in atoms the trimmed layer still holds a rule for, sorted.
   */
  readonly atoms: string[]
  readonly css: string
  /**
   * Every line of the report that is not a problem line, after the first: its remedy block.
   */
  readonly remedies: string[]
  /**
   * What the run printed through `console.error` and `console.warn`, one text per call.
   */
  readonly printed: { readonly errors: string[]; readonly warnings: string[] }
  readonly project: Project
  readonly record: PruneRecord
  readonly report: Report | undefined
  /**
   * The report's text, or an empty text when nothing was recorded.
   */
  readonly text: string
  /**
   * The report's first line.
   */
  readonly first: string
  /**
   * The report's problem lines.
   */
  readonly problems: string[]
}

/**
 * The generated page: it imports every module and package a scenario names, and renders an element
 * with no class.
 */
function pageOf(scenario: Scenario): string {
  const modules = Object.keys(scenario.modules ?? {}).map((file) => `import '@/${file}'`)
  const packages =
    scenario.importsPackages === false
      ? []
      : Object.keys(scenario.packages ?? {}).map((name) => `import '${name}'`)
  const more = (scenario.imports ?? []).map((specifier) => `import '${specifier}'`)
  return [
    scenario.pageHead ?? '',
    ...modules,
    ...packages,
    ...more,
    '',
    `export default function Page() { return ${scenario.pageBody ?? '<main />'} }`,
    '',
  ].join('\n')
}

/**
 * A package manifest for a dependency written as plain ESM that lists core in `dependencies`.
 */
export function nave(name: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dependencies: { '@navecss/core': '*' },
    ...extra,
  })
}

/**
 * The files of a dependency that lists core in `dependencies`; `files` are relative to its
 * directory, and `index.js` is its entry unless a manifest says otherwise.
 */
export function dependency(
  name: string,
  files: Record<string, string>,
  extra: Record<string, unknown> = {},
): Record<string, string> {
  return { 'package.json': nave(name, extra), ...files }
}

/**
 * The files of a dependency that does not list core.
 */
export function plainDependency(
  name: string,
  files: Record<string, string>,
): Record<string, string> {
  return { 'package.json': manifest(name, './index.js'), ...files }
}

/**
 * Prints nothing: the console is silenced so a test reads what was printed.
 */
function silent(): void {
  // The calls are recorded by the spy.
}

/**
 * One text per console call.
 */
function textsOf(calls: readonly (readonly unknown[])[]): string[] {
  return calls.map((call) => call.map(String).join(' '))
}

/**
 * The problem lines of a report.
 */
export function problemLinesOf(text: string): string[] {
  return text.split('\n').filter((line) => PLACED.test(line))
}

/**
 * The remedy block of a report: its lines after the first that are not problem lines.
 */
export function remedyLinesOf(text: string): string[] {
  return text
    .split('\n')
    .slice(1)
    .filter((line) => !PLACED.test(line))
}

/**
 * The last `cxModules: [...]` array a report prints, as the list a reader would paste, or
 * `undefined` when it prints none.
 */
export function printedList(text: string): string[] | undefined {
  const last = text
    .matchAll(/cxModules: (\[[^\]]*\])/gu)
    .toArray()
    .at(-1)?.[1]
  if (last === undefined) return undefined
  return last
    .matchAll(/'([^']*)'/gu)
    .map((entry) => entry[1]!)
    .toArray()
}

/**
 * The file of a problem line.
 */
export function fileOf(line: string): string {
  return line.split(':', 1)[0]!
}

/**
 * Runs the plugin over core's `atomic.css` in a project, as `scenario` says, and reads the layer,
 * the record, the report and what the run printed.
 */
async function runAgain(project: Project, scenario: Scenario = {}): Promise<Read> {
  const options = scenario.options ?? {}
  const errors = vi.spyOn(console, 'error').mockImplementation(silent)
  const warnings = vi.spyOn(console, 'warn').mockImplementation(silent)
  try {
    const result = await runAtomic(project, [], {
      options,
      ...(scenario.isDev === true && { phase: DEV }),
    })
    const printed = { errors: textsOf(errors.mock.calls), warnings: textsOf(warnings.mock.calls) }
    const record = recordOf(project)
    const report = reportOf(record, options, project.dir)
    const text = report?.text ?? ''
    return {
      atoms: atomsIn(result.css),
      css: result.css,
      first: text.split('\n', 1)[0] ?? '',
      printed,
      problems: problemLinesOf(text),
      project,
      record,
      remedies: remedyLinesOf(text),
      report,
      text,
    }
  } finally {
    errors.mockRestore()
    warnings.mockRestore()
  }
}

/**
 * The scratch projects of a test file, and the function that runs a scenario in a new one.
 */
export function useUsedAtoms(): {
  readonly build: (scenario: Scenario) => Promise<Project>
  readonly read: (scenario: Scenario) => Promise<Read>
  readonly runAgain: (project: Project, scenario?: Scenario) => Promise<Read>
} {
  const create = useScratchProjects()
  const toProject = (scenario: Scenario): Project => {
    const project = create({
      'app/layout.tsx': PLAIN_LAYOUT,
      'app/page.tsx': pageOf(scenario),
      ...scenario.files,
      ...scenario.modules,
    })
    const packages = Object.entries(scenario.packages ?? {})
    for (const [name, files] of packages) project.install(name, files)
    scenario.setup?.(project)
    return project
  }
  return {
    read: (scenario) => runAgain(toProject(scenario), scenario),
    build: (scenario) => Promise.resolve(toProject(scenario)),
    runAgain,
  }
}
