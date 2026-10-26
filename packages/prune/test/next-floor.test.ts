/**
 * The install of Next.js 16.2.0 that the real-build rows share: several test files ask for it at
 * once on a fresh machine, and none may run `next` on a tree npm is still writing. The `npm` here
 * is a script that writes `next` first, waits, then writes `react`, as the real one extracts them
 * one after another.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FLOOR_VERSION, floorNextRootIn } from './helpers/next-floor.ts'

const FLOOR_HELPER = pathToFileURL(path.join(import.meta.dirname, 'helpers/next-floor.ts')).href

interface Scratch {
  /**
   * Where the floor is installed.
   */
  readonly floorDir: () => string
  /**
   * The `npm` that writes `next`, waits two seconds, then writes `react`.
   */
  readonly npm: () => string
  /**
   * The scratch directory holding both.
   */
  readonly directory: () => string
}

/**
 * Writes an executable shell script and returns its path.
 */
function script(directory: string, name: string, lines: readonly string[]): string {
  const file = path.join(directory, name)
  writeFileSync(file, ['#!/bin/sh', ...lines, ''].join('\n'))
  chmodSync(file, 0o755)
  return file
}

/**
 * A scratch directory per row, with the floor's directory and an `npm` that installs `next` and
 * `react` one after the other.
 */
function useScratch(): Scratch {
  let directory = ''
  let npm = ''
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-floor-'))
    directory = realpathSync(made)
    npm = script(directory, 'npm', [
      'mkdir -p node_modules/next node_modules/react',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      'sleep 2',
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
    ])
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))
  return {
    directory: () => directory,
    floorDir: () => path.join(directory, 'floor'),
    npm: () => npm,
  }
}

/**
 * Whether `react` is installed beside `next` under `floorDir`.
 */
function isReactInstalled(floorDir: string): boolean {
  return existsSync(path.join(floorDir, 'node_modules/react/package.json'))
}

/**
 * Starts an installer in a process group of its own whose `npm` stops after writing `next`, waits
 * until it has got that far, then kills the group.
 */
async function killInstallerMidway(scratch: Scratch): Promise<void> {
  const started = path.join(scratch.directory(), 'started')
  const slow = script(scratch.directory(), 'slow', [
    'mkdir -p node_modules/next',
    `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
    `touch ${started}`,
    'sleep 60',
  ])
  const installer = path.join(scratch.directory(), 'install.mjs')
  writeFileSync(
    installer,
    `import { floorNextRootIn } from ${JSON.stringify(FLOOR_HELPER)}\nawait floorNextRootIn(process.argv[2], process.argv[3])\n`,
  )
  // Its own process group, so the kill takes the installer and the npm it started together.
  const child = spawn(process.execPath, [installer, scratch.floorDir(), slow], {
    detached: true,
    stdio: 'ignore',
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  for (let tries = 0; !existsSync(started) && tries < 200; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  expect(existsSync(started), 'the installer reached npm').toBe(true)
  process.kill(-child.pid!, 'SIGKILL')
  await exited
}

describe('the Next.js floor install', () => {
  const scratch = useScratch()

  it('hands the directory to no caller before react is installed beside next', async () => {
    const seen = await Promise.all(
      [1, 2, 3].map(async () => {
        await floorNextRootIn(scratch.floorDir(), scratch.npm())
        return isReactInstalled(scratch.floorDir())
      }),
    )

    expect(seen).toEqual([true, true, true])
  })

  it('leaves no directory behind but the install itself', async () => {
    await floorNextRootIn(scratch.floorDir(), scratch.npm())

    expect(readdirSync(scratch.directory()).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'floor',
      'npm',
    ])
  })

  it('shows no installed floor while npm is still running', async () => {
    const installing = floorNextRootIn(scratch.floorDir(), scratch.npm())
    try {
      // npm has written `next` by now and is waiting before it writes `react`.
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const nextManifest = path.join(scratch.floorDir(), 'node_modules/next/package.json')
      expect(existsSync(nextManifest)).toBe(false)
    } finally {
      await installing
    }
    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  })

  it('leaves nothing installed when npm fails, and installs on the next ask', async () => {
    const failing = script(scratch.directory(), 'failing', [
      'mkdir -p node_modules/next',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      'exit 1',
    ])

    await expect(floorNextRootIn(scratch.floorDir(), failing)).rejects.toThrow('exited 1')
    expect(existsSync(scratch.floorDir())).toBe(false)
    await floorNextRootIn(scratch.floorDir(), scratch.npm())
    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  })

  it('installs afresh after an installer was killed in the middle of it', async () => {
    await killInstallerMidway(scratch)

    await floorNextRootIn(scratch.floorDir(), scratch.npm())

    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  }, 30_000)
})

/**
 * One trial of the race: `callers` processes ask for the floor at once, a lock of an installer
 * that is gone is in place when `isLocked` is set, and a shim `npm` logs each start. Resolves to
 * how many times npm started and what each caller answered.
 */
async function raceTrial(
  callers: number,
  isLocked: boolean,
): Promise<{ readonly answers: string[]; readonly isWhole: boolean; readonly starts: number }> {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-floor-race-'))
  const directory = realpathSync(made)
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
    rmSync(directory, { recursive: true, force: true })
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

describe('the Next.js floor install asked by several processes at once', () => {
  it('runs npm once and answers every caller, with no lock in place', async () => {
    const trial = await raceTrial(8, false)

    expect(trial.starts).toBe(1)
    expect(trial.answers).toEqual(Array.from({ length: 8 }, () => 'ok'))
    expect(trial.isWhole).toBe(true)
  }, 60_000)

  it('runs npm once and answers every caller, when a lock of an installer that is gone is in place, 20 of 20 times', async () => {
    const trials: Awaited<ReturnType<typeof raceTrial>>[] = []
    for (let batch = 0; batch < 4; batch += 1) {
      trials.push(...(await Promise.all(Array.from({ length: 5 }, () => raceTrial(8, true)))))
    }

    expect(trials.map((trial) => trial.starts)).toEqual(Array.from({ length: 20 }, () => 1))
    expect(trials.flatMap((trial) => trial.answers)).toEqual(
      Array.from({ length: 160 }, () => 'ok'),
    )
    expect(trials.every((trial) => trial.isWhole)).toBe(true)
  }, 300_000)
})
