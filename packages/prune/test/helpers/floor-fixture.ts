/**
 * What the rows of the Next.js floor install share: the `npm` shims they write and the trial of
 * several processes asking for the floor at once.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { removeDirectory, trackDirectory } from './leftovers.ts'
import { FLOOR_VERSION } from './next-floor.ts'

export const FLOOR_HELPER = pathToFileURL(path.join(import.meta.dirname, 'next-floor.ts')).href
export const RACE_HELPER = import.meta.url

/**
 * Writes an executable shell script and returns its path.
 */
export function script(directory: string, name: string, lines: readonly string[]): string {
  const file = path.join(directory, name)
  writeFileSync(file, ['#!/bin/sh', ...lines, ''].join('\n'))
  chmodSync(file, 0o755)
  return file
}

/**
 * Whether `react` is installed beside `next` under `floorDir`.
 */
export function isReactInstalled(floorDir: string): boolean {
  return existsSync(path.join(floorDir, 'node_modules/react/package.json'))
}

/**
 * One trial of the race: `callers` processes ask for the floor at once, a lock of an installer
 * that is gone is in place when `isLocked` is set, and a shim `npm` logs each start. Resolves to
 * how many times npm started and what each caller answered.
 */
export async function raceTrial(
  callers: number,
  isLocked: boolean,
): Promise<{ readonly answers: string[]; readonly isWhole: boolean; readonly starts: number }> {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-floor-race-'))
  const directory = realpathSync(made)
  // Removed with the process that runs the trial, even when that process is stopped in the middle.
  trackDirectory(directory)
  try {
    const floorDir = path.join(directory, 'floor')
    const npm = script(directory, 'npm', [
      `echo $$ >> ${directory}/starts.log`,
      'mkdir -p node_modules/next node_modules/react',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      'sleep 1',
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
    ])
    const asking = path.join(directory, 'ask.mjs')
    writeFileSync(
      asking,
      [
        `import { floorNextRootIn } from ${JSON.stringify(FLOOR_HELPER)}`,
        'try {',
        '  await floorNextRootIn(process.argv[2], process.argv[3])',
        "  console.log('ok')",
        '} catch (error) {',
        "  console.log(`ERR ${String(error.message).split('\\n')[0]}`)",
        '}',
        '',
      ].join('\n'),
    )
    // A process that has ended: its id names no installer that is running.
    if (isLocked)
      writeFileSync(`${floorDir}.installing`, String(spawnSync(process.execPath, ['-e', '']).pid))
    const answers = await Promise.all(
      Array.from({ length: callers }, () => answerOf(asking, floorDir, npm)),
    )
    const log = path.join(directory, 'starts.log')
    return {
      answers,
      starts: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').length : 0,
      isWhole: isReactInstalled(floorDir),
    }
  } finally {
    removeDirectory(directory)
  }
}

/**
 * What one process running `script` with `args` printed.
 */
function answerOf(file: string, ...args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.once('close', () => resolve(output.trim()))
  })
}
