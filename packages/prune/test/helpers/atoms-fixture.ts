/**
 * Scratch Next.js-shaped scenarios for the atom-layer tests: a scenario names the files, the
 * installed packages and the options, and a run gives back the stylesheet the plugin returned.
 */
import { afterEach } from 'vitest'

import type { NaveOptions } from '../../src/options.ts'
import type { Project } from './project.ts'

import { createProject, runPlugin } from './project.ts'

export interface Scenario {
  readonly files: Record<string, string>
  readonly options?: NaveOptions
  /**
   * Packages installed under `node_modules`, by name, each a map of file to text.
   */
  readonly packages?: Readonly<Record<string, Record<string, string>>>
}

export interface Outcome {
  readonly css: string
  readonly project: Project
}

export const CX_IMPORT = "import { cx } from '@navecss/core/cx'"

/**
 * A root layout that renders its children and uses no atom.
 */
export const PLAIN_LAYOUT = [
  'export default function Layout({ children }) {',
  '  return <html><body>{children}</body></html>',
  '}',
].join('\n')

/**
 * A page that renders one element and uses no atom.
 */
export const PLAIN_PAGE = 'export default function Page() { return <main /> }'

/**
 * A page that renders one element whose class list is the expression.
 */
export function pageWith(expression: string): string {
  return [
    CX_IMPORT,
    `export default function Page() { return <main className={${expression}} /> }`,
  ].join('\n')
}

/**
 * A package manifest for a dependency written as plain ESM.
 */
export function manifest(name: string, exports: unknown): string {
  return JSON.stringify({ name, version: '1.0.0', type: 'module', exports })
}

/**
 * Registers the removal of every project the returned function creates, after each test.
 */
export function useScratchProjects(): (files?: Record<string, string>) => Project {
  const made: Project[] = []
  afterEach(() => {
    for (const project of made) project.remove()
    made.length = 0
  })
  return (files = {}) => {
    const project = createProject(files)
    made.push(project)
    return project
  }
}

/**
 * Builds the scenario's project and runs the plugin over core's `atomic.css` in it.
 */
export async function runScenario(
  create: (files?: Record<string, string>) => Project,
  scenario: Scenario,
): Promise<Outcome> {
  const project = create(scenario.files)
  const packages = Object.entries(scenario.packages ?? {})
  for (const [name, files] of packages) {
    project.install(name, files)
  }
  const result = await runPlugin(project, { options: scenario.options ?? {} })
  return { css: result.css, project }
}
