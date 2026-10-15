/**
 * Shared pieces for the import-graph tests: scratch projects that are removed after each test,
 * one-line module sources that call `cx()` with the atoms a test names, and a runner that returns
 * the atoms the trimmed layer still holds together with the record the plugin left.
 */
import type { AtomName } from '@navecss/core/atoms'
import type { Result } from 'postcss'

import { afterEach } from 'vitest'

import type { PruneRecord } from '../../src/record.ts'
import type { Project, RunOptions } from './project.ts'

import { atomsIn } from './layer.ts'
import { createProject, recordOf, runPlugin } from './project.ts'

/**
 * The sentence the record gives for an import the build cannot resolve.
 */
export const UNRESOLVED_TEXT =
  'the build cannot resolve this import, so it cannot read the cx() calls behind it'

export interface Outcome {
  /**
   * The built-in atoms the trimmed `@layer atomic` block still holds a rule for, sorted.
   */
  readonly atoms: string[]
  readonly record: PruneRecord
  readonly result: Result
}

/**
 * Returns a function that makes scratch projects and removes every one of them after each test.
 * Call it once inside a `describe` (or at the top of a file).
 */
export function scratchProjects(): (files?: Record<string, string>) => Project {
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
 * The names sorted the way the layer reader and the record sort them.
 */
export function sorted(names: readonly string[]): string[] {
  return names.toSorted((a, b) => a.localeCompare(b))
}

/**
 * The source of a module that calls `cx()` once with `atoms`: a component for a `.tsx` or `.jsx`
 * file, a plain function for any other extension. `imports` goes first, one statement per line.
 */
export function moduleSource(file: string, atoms: readonly AtomName[], imports = ''): string {
  const call = `cx(${atoms.map((atom) => `'${atom}'`).join(', ')})`
  const head = `${imports}import { cx } from '@navecss/core/cx'\n`
  if (/\.[jt]sx$/u.test(file)) {
    return `${head}export default function Module() {\n  return <div className={${call}} />\n}\n`
  }
  return `${head}export function handler() {\n  return ${call}\n}\n`
}

/**
 * Puts a minimal `next` package in the project so `next/dynamic` resolves, as it does in a real
 * Next.js project.
 */
export function installNext(project: Project): void {
  project.install('next', {
    'package.json': JSON.stringify({
      name: 'next',
      version: '16.2.0',
      exports: { './dynamic': './dynamic.js' },
    }),
    'dynamic.js': 'module.exports = function dynamic() {}\n',
  })
}

/**
 * Runs the plugin over core's `atomic.css` and returns the atoms the layer still holds, the
 * record the run left and the PostCSS result.
 */
export async function runAndRead(project: Project, run: RunOptions = {}): Promise<Outcome> {
  const result = await runPlugin(project, run)
  return { atoms: atomsIn(result.css), record: recordOf(project, run.distDir), result }
}
