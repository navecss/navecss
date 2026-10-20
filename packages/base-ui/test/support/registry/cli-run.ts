/**
 * Running the pinned shadcn CLI (`node_modules/.bin/shadcn` of this package, never `npx`) the way the
 * install criteria need it: hermetic (`HOME` and the XDG directories inside a temp directory), offline
 * (a preload that refuses every connection to a non-loopback address, logging each refusal), with no
 * terminal on any stream, and with stdout and stderr captured into one file so the order the CLI
 * printed in is the order read back.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PACKAGE_DIR } from '../stylesheet.ts'

export const PINNED_CLI = path.join(PACKAGE_DIR, 'node_modules/.bin/shadcn')

export const OFFLINE_PRELOAD = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'cli-offline-preload.mjs',
)

const RUN_TIMEOUT_MS = 180_000

export interface CliRun {
  /**
  Every line the CLI wrote to stdout and stderr, in the order written, without colour codes.
   */
  readonly output: string
  /**
  Each connection to a non-loopback address the preload refused, as `host:port`.
   */
  readonly refused: string[]
  readonly signal: NodeJS.Signals | null
  readonly status: number | null
}

export interface CliRunOptions {
  readonly args: readonly string[]
  readonly cwd: string
  /**
  A directory the run may use as `HOME` and for the XDG directories; it and the log live here.
   */
  readonly home: string
}

/**
 * The caller's `PATH`, for a child that needs to find `npm` and `tar` as well as `node`.
 */
export const inheritedPath = (): Record<string, string> => ({
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- the search path of a child process, not a build input
  PATH: process.env.PATH ?? '',
})

/**
 * The environment a run gets: nothing of the caller's, a `PATH` that finds `node`, and the
 * directories a CLI would write its own files into pointed at `home`.
 */
export const hermeticEnv = (home: string): Record<string, string> => ({
  HOME: home,
  NO_COLOR: '1',
  PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`,
  XDG_CACHE_HOME: path.join(home, '.cache'),
  XDG_CONFIG_HOME: path.join(home, '.config'),
  XDG_DATA_HOME: path.join(home, '.local/share'),
  XDG_STATE_HOME: path.join(home, '.local/state'),
})

// eslint-disable-next-line no-control-regex -- the escape character of the colour codes is what this matches
const COLOUR_CODE = /\u{1B}\[[\d;?]*[A-Za-z]/gu

const logPaths = (home: string): { output: string; refused: string } => {
  const directory = path.join(home, 'runs')
  mkdirSync(directory, { recursive: true })
  const stem = path.join(directory, randomUUID())
  return { output: `${stem}.out`, refused: `${stem}.refused` }
}

const readLines = (file: string): string[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
    : []

/**
 * Runs the pinned CLI, offline and hermetic. The caller gets the refusals the preload logged; the
 * child's stdin is closed, as it is for an agent or a CI job.
 */
export const runPinnedCli = (options: CliRunOptions): Promise<CliRun> => {
  const logs = logPaths(options.home)
  const fd = openSync(logs.output, 'w')
  return new Promise((resolve, reject) => {
    const child = spawn(PINNED_CLI, [...options.args], {
      cwd: options.cwd,
      env: {
        ...hermeticEnv(options.home),
        NAVE_OFFLINE_LOG: logs.refused,
        NODE_OPTIONS: `--import ${OFFLINE_PRELOAD}`,
      },
      // Its own process group, so a run that has to be stopped takes the package manager the CLI
      // started (a dependency with a version specifier makes it install) down with it.
      detached: true,
      stdio: ['ignore', fd, fd],
    })
    const timer = setTimeout(() => {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    }, RUN_TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      closeSync(fd)
      reject(error)
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      closeSync(fd)
      resolve({
        output: readFileSync(logs.output, 'utf8').replaceAll(COLOUR_CODE, ''),
        refused: readLines(logs.refused),
        signal,
        status,
      })
    })
  })
}
