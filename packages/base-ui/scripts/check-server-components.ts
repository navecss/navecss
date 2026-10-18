/**
 * Builds a Next.js App Router app whose Server Components use the package, under both bundlers, and
 * says whether `next build` accepts them. Four routes: a namespace (`Dialog`, `Accordion`), a
 * single component (`Button`), the package root and a page that starts with `'use client'`. As the
 * control, the same app with the directive put back on the installed `dialog/index.js` (0.2.0's
 * shape) must fail to build under each bundler.
 *
 * The app lives in the operating system's temporary directory and nothing is added to any
 * `package.json` of this repository, so `next` is never a dependency here. It installs from the
 * network and takes 30 to 60 seconds per bundler. Run after `pnpm run build`, before a release:
 *
 *   node scripts/check-server-components.ts [--next 16.4.2] [--react 19.3.1] [--keep]
 *
 * `--next` and `--react` choose the versions (the defaults are the ones the fix was measured on);
 * `--keep` leaves the app in place and prints where. The exit code is 0 only when every build and
 * the control behave as stated.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import type { Runner } from './server-components/run.ts'

import { runCheck } from './server-components/run.ts'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

const DEFAULT_NEXT = '16.4.2'
const DEFAULT_REACT = '19.3.1'

const runner: Runner = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

const main = (): number => {
  const { values } = parseArgs({
    options: {
      keep: { type: 'boolean' },
      next: { default: DEFAULT_NEXT, type: 'string' },
      react: { default: DEFAULT_REACT, type: 'string' },
    },
  })
  return runCheck({
    complain: (line) => process.stderr.write(`${line}\n`),
    keep: values.keep === true,
    node: process.execPath,
    packageDir: PACKAGE_DIR,
    runner,
    say: (line) => process.stdout.write(`${line}\n`),
    versions: { next: values.next, react: values.react },
  })
}

if (isMain) {
  process.exitCode = main()
}
