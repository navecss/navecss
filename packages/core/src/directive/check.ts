/**
 * `check({ source })`, the core logic behind both the `navecss-core
 * check` bin and the `@navecss/core/check` subpath. Exit contract mirrors
 * `navecss-tokens`: `0` read at least one stylesheet and found none, `1`
 * found at least one, `2` a usage error, an unreadable path, or no
 * stylesheet found at all.
 */
export type { CheckOptions, CheckResult, Finding } from './check-run.ts'

import type { CheckOptions, CheckResult } from './check-run.ts'

import { runCheck } from './check-run.ts'

/**
`check({ source })`: reads every stylesheet under `source`, reporting every surviving `@nave`.
 */
export async function check(options: CheckOptions): Promise<CheckResult> {
  const run = await runCheck(options.source)
  return run.result
}
