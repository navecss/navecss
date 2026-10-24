/**
 * Pieces the real-build rows of the used-atoms criteria share: the bundlers, the `next.config` text
 * for a set of options, the atoms a build's CSS holds a rule for, and a wait on a dev server's
 * terminal.
 */
import type { NaveOptions } from '../../src/options.ts'
import type { NextApp } from './next-app.ts'
import type { DevServer } from './next-dev.ts'

import { atomsNamedBy, flattenAtomic } from './atoms-flatten.ts'
import { pause } from './next-process.ts'

export const TIMEOUT = 900_000

/**
 * The bundlers of the newest `next` the workspace installed: Turbopack is the default, webpack is
 * `--webpack`.
 */
export const BUNDLERS: readonly (readonly [string, readonly string[]])[] = [
  ['Turbopack', []],
  ['webpack', ['--webpack']],
]

/**
 * The text of `next.config.mjs` wrapping an empty config with `withNave()` and these options.
 */
export function configText(options: NaveOptions | Record<string, unknown> = {}): string {
  return [
    "import { withNave } from '@navecss/prune'",
    '',
    `export default withNave({}, ${JSON.stringify(options)})`,
    '',
  ].join('\n')
}

/**
 * The built-in atoms the CSS a build wrote holds a rule for, sorted.
 */
export function builtAtoms(app: Pick<NextApp, 'builtCss'>): string[] {
  const names = new Set<string>()
  for (const entry of flattenAtomic(app.builtCss())) {
    for (const name of atomsNamedBy(entry.selector)) names.add(name)
  }
  return [...names].toSorted((a, b) => a.localeCompare(b))
}

/**
 * Waits until the server's terminal holds `text`. It has no time limit of its own: the test's
 * timeout bounds it. The route is requested on the way, which is what makes the server compile.
 */
export async function untilPrinted(server: DevServer, text: string, route = '/'): Promise<void> {
  while (!server.output().includes(text)) {
    await server.get(route)
    await pause(1000)
  }
}

/**
 * How many times `text` occurs in `output`.
 */
export function occurrences(output: string, text: string): number {
  return output.split(text).length - 1
}
