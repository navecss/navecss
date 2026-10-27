/**
 * The install of Next.js 16.2.0 that the real-build rows share: several test files ask for it at
 * once on a fresh machine, and none may run `next` on a tree npm is still writing. The `npm` here
 * is a script that writes `next` first, waits, then writes `react`, as the real one extracts them
 * one after another.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FLOOR_HELPER,
  isReactInstalled,
  RACE_HELPER,
  raceTrial,
  script,
} from './helpers/floor-fixture.ts'
import { FLOOR_VERSION, floorNextRootIn } from './helpers/next-floor.ts'

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
  /**
   * The file the `npm` writes once it has written `next`, in the staging directory.
   */
  readonly stagingStarted: () => string
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
      `touch ${path.join(directory, 'staging-started')}`,
      'sleep 2',
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
    ])
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))
  return {
    directory: () => directory,
    floorDir: () => path.join(directory, 'floor'),
    npm: () => npm,
    stagingStarted: () => path.join(directory, 'staging-started'),
  }
}

/**
 * Whether the process `pid` is running.
 */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Whether the process `pid` has ended within `ms` milliseconds.
 */
async function isStoppedWithin(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (isRunning(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return !isRunning(pid)
}

/**
 * What `task` rejects with, or a note that it did not.
 */
async function failureOf(task: Promise<void>): Promise<unknown> {
  try {
    await task
    return 'it did not fail'
  } catch (error) {
    return error
  }
}

/**
 * An `npm` that writes `next`, notes that it has got that far in the file `started`, and then waits.
 */
function midwayNpm(scratch: Scratch): string {
  return script(scratch.directory(), 'slow', [
    'mkdir -p node_modules/next',
    `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
    `touch ${path.join(scratch.directory(), 'started')}`,
    'sleep 60',
  ])
}

/**
 * Starts an installer in a process group of its own that runs `npm`, waits until `npm` has noted
 * that it got as far as writing `next`, for at most `tries` looks, then kills the group.
 */
async function killInstallerMidway(
  scratch: Scratch,
  npm: string = midwayNpm(scratch),
  tries = 200,
): Promise<void> {
  const started = path.join(scratch.directory(), 'started')
  const installer = path.join(scratch.directory(), 'install.mjs')
  writeFileSync(
    installer,
    `import { floorNextRootIn } from ${JSON.stringify(FLOOR_HELPER)}\nawait floorNextRootIn(process.argv[2], process.argv[3])\n`,
  )
  // Its own process group, so the kill takes the installer and the npm it started together.
  const child = spawn(process.execPath, [installer, scratch.floorDir(), npm], {
    detached: true,
    stdio: 'ignore',
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    for (let looks = 0; !existsSync(started) && looks < tries; looks += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(existsSync(started), 'the installer reached npm').toBe(true)
  } finally {
    // Whether or not npm got that far, the group does not outlive the row.
    process.kill(-child.pid!, 'SIGKILL')
    await exited
  }
}

/**
 * Asks for the floor with `npm`, looks at the floor while that `npm` is still running, and waits
 * for the install to end. Resolves to what the look found.
 */
async function lookWhileInstalling(
  scratch: Scratch,
  npm: string,
): Promise<{ readonly hasBegun: boolean; readonly isFloorShown: boolean }> {
  const installing = floorNextRootIn(scratch.floorDir(), npm)
  try {
    // The `npm` notes in a file that it has written `next`; the look waits for that note.
    for (let looks = 0; !existsSync(scratch.stagingStarted()) && looks < 200; looks += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const nextManifest = path.join(scratch.floorDir(), 'node_modules/next/package.json')
    return {
      hasBegun: existsSync(scratch.stagingStarted()),
      isFloorShown: existsSync(nextManifest),
    }
  } finally {
    await installing
  }
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

  it('leaves no directory behind but the install itself and its marker', async () => {
    await floorNextRootIn(scratch.floorDir(), scratch.npm())

    expect(readdirSync(scratch.directory()).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'floor',
      'npm',
      'staging-started',
    ])
  })

  it('shows no installed floor while npm is still running', async () => {
    const seen = await lookWhileInstalling(scratch, scratch.npm())

    expect(seen.isFloorShown).toBe(false)
    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  })

  it('looks only once npm has begun to write, however slow npm is to begin', async () => {
    const slow = script(scratch.directory(), 'slow-start', [
      'sleep 1.5',
      'mkdir -p node_modules/next node_modules/react',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      `touch ${scratch.stagingStarted()}`,
      'sleep 2',
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
    ])

    const seen = await lookWhileInstalling(scratch, slow)

    expect(seen.hasBegun, 'npm had begun to write when the floor was looked at').toBe(true)
    expect(seen.isFloorShown).toBe(false)
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

  it('kills the installer it started when npm never gets as far as writing next', async () => {
    const pidFile = path.join(scratch.directory(), 'npm.pid')
    const silent = script(scratch.directory(), 'silent', [`echo $$ > ${pidFile}`, 'sleep 60'])

    const killing = failureOf(killInstallerMidway(scratch, silent, 100))
    for (let looks = 0; !existsSync(pidFile) && looks < 90; looks += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    // The installer is awaited whatever the wait for npm found, so it is gone before the row ends.
    const failure = await killing
    const npmPid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0
    try {
      expect(npmPid, 'npm started').toBeGreaterThan(0)
      expect(String(failure)).toContain('the installer reached npm')
      expect(await isStoppedWithin(npmPid, 5000), 'npm is not left running').toBe(true)
    } finally {
      if (npmPid > 0 && isRunning(npmPid)) process.kill(npmPid, 'SIGKILL')
    }
  }, 30_000)

  it('installs afresh after an installer was killed in the middle of it, once its lock has gone unrefreshed for the lease', async () => {
    await killInstallerMidway(scratch)

    // The killed installer's lock is not renewed again; a short lease stands for the two minutes.
    await floorNextRootIn(scratch.floorDir(), scratch.npm(), { refreshMs: 100, staleMs: 600 })

    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  }, 30_000)
})

/**
 * An `npm` that logs each start to `starts.log` beside it and then installs as the usual one does.
 */
function loggingNpm(scratch: Scratch): string {
  return script(scratch.directory(), 'logging-npm', [
    `echo $$ >> ${scratch.directory()}/starts.log`,
    'mkdir -p node_modules/next node_modules/react',
    `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
    `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
  ])
}

/**
 * Writes the install lock with `content`, last written `minutes` minutes ago.
 */
function writeOldLock(scratch: Scratch, content: string, minutes: number): string {
  const lock = `${scratch.floorDir()}.installing`
  writeFileSync(lock, content)
  const written = new Date(Date.now() - minutes * 60_000)
  utimesSync(lock, written, written)
  return lock
}

describe('the install lock of the Next.js floor', () => {
  const scratch = useScratch()

  it('is taken over when it was not refreshed for two minutes, whatever process it names', async () => {
    // This test process is running, as a process whose id was reused would be.
    writeOldLock(scratch, String(process.pid), 3)
    const asking = floorNextRootIn(scratch.floorDir(), loggingNpm(scratch))

    await new Promise((resolve) => setTimeout(resolve, 1500))
    const hasStarted = existsSync(path.join(scratch.directory(), 'starts.log'))
    rmSync(`${scratch.floorDir()}.installing`, { force: true })
    await asking

    expect(hasStarted, 'npm started over a lock nobody refreshed').toBe(true)
  })

  it('is taken over when it was not refreshed for two minutes and names an installer that is gone', async () => {
    // A process that has ended: its id names no installer that is running.
    writeOldLock(scratch, String(spawnSync(process.execPath, ['-e', '']).pid), 3)

    await floorNextRootIn(scratch.floorDir(), loggingNpm(scratch))

    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  })

  it('is held while it was refreshed lately, even if it names a process that is gone', async () => {
    const lock = writeOldLock(scratch, String(spawnSync(process.execPath, ['-e', '']).pid), 1)
    const asking = floorNextRootIn(scratch.floorDir(), loggingNpm(scratch))

    await new Promise((resolve) => setTimeout(resolve, 1500))
    const hasStarted = existsSync(path.join(scratch.directory(), 'starts.log'))
    rmSync(lock, { force: true })
    await asking

    expect(hasStarted, 'npm started over a lock that was refreshed a minute ago').toBe(false)
  })

  it('is kept by a holder whose install runs for longer than the lease, so no one takes it over', async () => {
    // A lease of 600 ms renewed every 100 ms stands for two minutes renewed every fifteen seconds,
    // and an install of 3 s for one past minute sixteen.
    const lease = { refreshMs: 100, staleMs: 600 }
    const long = script(scratch.directory(), 'long-npm', [
      `echo $$ >> ${scratch.directory()}/starts.log`,
      'mkdir -p node_modules/next node_modules/react',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      'sleep 3',
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
    ])

    const callers = [1, 2].map(async (caller) => {
      // The second caller asks once the first has the lock and the lease has run out twice over.
      await new Promise((resolve) => setTimeout(resolve, caller === 1 ? 0 : 1500))
      return floorNextRootIn(scratch.floorDir(), long, lease)
    })
    await Promise.all(callers)

    const starts = readFileSync(path.join(scratch.directory(), 'starts.log'), 'utf8')
    expect(starts.trim().split('\n')).toHaveLength(1)
    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  }, 30_000)

  /**
   * An `npm` that logs its start and keeps installing for `seconds`.
   */
  function slowNpm(seconds: number): string {
    return script(scratch.directory(), 'slow-npm', [
      `echo $$ >> ${scratch.directory()}/starts.log`,
      'mkdir -p node_modules/next node_modules/react',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      `sleep ${seconds}`,
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
    ])
  }

  it('is left to its successor by a holder that lost it: neither its renewal nor its release touches it', async () => {
    const lock = `${scratch.floorDir()}.installing`
    const installing = floorNextRootIn(scratch.floorDir(), slowNpm(2), {
      refreshMs: 100,
      staleMs: 600,
    })
    for (let looks = 0; !existsSync(path.join(scratch.directory(), 'starts.log')); looks += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      if (looks > 200) throw new Error('the install never started')
    }
    // A successor took the lock over while the first holder was stalled.
    writeFileSync(lock, 'successor')
    const written = new Date(Date.now() - 10 * 60_000)
    utimesSync(lock, written, written)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const timeAfterRenewals = statSync(lock).mtimeMs
    await installing

    expect(timeAfterRenewals, 'the first holder went on renewing').toBe(written.getTime())
    expect(readFileSync(lock, 'utf8'), 'the first holder released the successor’s lock').toBe(
      'successor',
    )
  }, 30_000)

  it('stops renewing when the holder releases it', async () => {
    const set = vi.spyOn(globalThis, 'setInterval')
    const cleared = vi.spyOn(globalThis, 'clearInterval')
    try {
      await floorNextRootIn(scratch.floorDir(), loggingNpm(scratch), {
        refreshMs: 100,
        staleMs: 600,
      })

      // The timers the lock made, told from any other by their delay.
      const timers = set.mock.results
        .filter((_result, call) => set.mock.calls[call]?.[1] === 100)
        .map((result) => result.value as unknown)
      expect(timers).toHaveLength(1)
      expect(cleared).toHaveBeenCalledWith(timers[0])
    } finally {
      set.mockRestore()
      cleared.mockRestore()
    }
  })

  it('is taken over when it names no process and was not refreshed for two minutes', async () => {
    writeOldLock(scratch, '', 3)

    await floorNextRootIn(scratch.floorDir(), loggingNpm(scratch))

    expect(isReactInstalled(scratch.floorDir())).toBe(true)
  })
})

describe('the Next.js floor install asked by several processes at once', () => {
  it('runs npm once and answers every caller, with no lock in place', async () => {
    const trial = await raceTrial(8, false)

    expect(trial.starts).toBe(1)
    expect(trial.answers).toEqual(Array.from({ length: 8 }, () => 'ok'))
    expect(trial.isWhole).toBe(true)
  })

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

describe('a worker of the race that is stopped in the middle of a trial', () => {
  const scratch = useScratch()

  it('leaves no directory of the trial behind', async () => {
    const trial = path.join(scratch.directory(), 'trial.mjs')
    writeFileSync(
      trial,
      `import { raceTrial } from ${JSON.stringify(RACE_HELPER)}\nawait raceTrial(2, false)\n`,
    )
    const made = (): string[] =>
      readdirSync(scratch.directory()).filter((name) => name.startsWith('prune-floor-race-'))
    const child = spawn(process.execPath, [trial], {
      env: { ...process.env, TMPDIR: scratch.directory() },
      stdio: 'ignore',
    })
    const exited = new Promise((resolve) => child.once('exit', resolve))
    for (let looks = 0; made().length === 0 && looks < 200; looks += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(made(), 'the trial made its directory').toHaveLength(1)

    child.kill('SIGTERM')
    await exited

    expect(made(), 'the directory of the trial').toEqual([])
  })
})
