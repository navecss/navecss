/**
 * Runs the build's check against a project and returns what it threw and what it printed.
 */
import type { MockInstance } from 'vitest'

import { vi } from 'vitest'

import type { HookConfig } from '../../src/hook.ts'
import type { NaveOptions } from '../../src/options.ts'
import type { Project } from './project.ts'

import { checkBuild } from '../../src/hook.ts'
import { hookMetadata } from './build-output.ts'

export interface Printed {
  readonly error: Error | undefined
  readonly errors: string[]
  readonly warnings: string[]
}

export const NOTHING: Printed = { error: undefined, errors: [], warnings: [] }

/**
 * One text per call: the arguments of the call joined.
 */
export function linesOf(calls: readonly (readonly unknown[])[]): string[] {
  return calls.map((call) => call.map(String).join(' '))
}

/**
 * Prints nothing.
 */
function silent(): void {
  // The console is silenced so a test reads what was printed instead of seeing it.
}

/**
 * Silences the console and starts recording what the code under test prints.
 */
export function listen(): {
  readonly errors: MockInstance<typeof console.error>
  readonly warnings: MockInstance<typeof console.warn>
} {
  const errors = vi.spyOn(console, 'error').mockImplementation(silent)
  const warnings = vi.spyOn(console, 'warn').mockImplementation(silent)
  vi.spyOn(console, 'log').mockImplementation(silent)
  errors.mockClear()
  warnings.mockClear()
  return { errors, warnings }
}

/**
 * Runs the check on the project and returns what it threw and what it printed.
 */
export async function runCheck(
  project: Project,
  options: NaveOptions = {},
  config: HookConfig = {},
  distDir = '.next',
): Promise<Printed> {
  const { errors, warnings } = listen()
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project, distDir), options, config)
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}
