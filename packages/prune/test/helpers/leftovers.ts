/**
 * What a test process starts and makes on disk that must not outlive it: the process groups of the
 * servers it starts, and the scratch directories it makes. They are removed when the process ends
 * by `exit`, or by a SIGTERM or SIGINT that would otherwise end it with them still there, and the
 * hooks in `leftovers-hooks.ts` clear them after each row and each file.
 */
import { rmSync } from 'node:fs'

const groups = new Set<number>()
const directories = new Set<string>()
const armed = { isDone: false }

/**
 * Sends `signal` to the process group `pid` leads; a group that is gone is not an error.
 */
export function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch {
    // The group has no process left, or macOS answers EPERM for one that has exited unreaped.
  }
}

/**
 * Whether any process is left in the group `pid` leads. macOS answers EPERM, not ESRCH, when the
 * only members left have exited and not yet been reaped, and those are gone for this purpose.
 */
export function isGroupRunning(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Stops every tracked server, and removes every tracked directory.
 */
function cleanUpNow(): void {
  killGroups('SIGKILL')
  removeDirectories()
}

/**
 * Makes the process clean up when it ends, once. A signal is passed on to the process itself after
 * the cleanup, so it ends as it would have without the handler.
 */
function arm(): void {
  if (armed.isDone) return
  armed.isDone = true
  process.once('exit', cleanUpNow)
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      cleanUpNow()
      process.kill(process.pid, signal)
    })
  }
}

/**
 * Tracks the process group the process `pid` leads, so it is stopped with this process.
 */
export function trackGroup(pid: number): void {
  arm()
  groups.add(pid)
}

/**
 * Stops tracking the group `pid` leads, once it is known to be gone.
 */
export function forgetGroup(pid: number): void {
  groups.delete(pid)
}

/**
 * Tracks a scratch directory, so it is removed with this process.
 */
export function trackDirectory(directory: string): void {
  arm()
  directories.add(directory)
}

/**
 * Removes a tracked directory now, and stops tracking it.
 */
export function removeDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
  directories.delete(directory)
}

/**
 * Sends `signal` to every tracked group.
 */
export function killGroups(signal: NodeJS.Signals): void {
  for (const pid of groups) signalGroup(pid, signal)
}

/**
 * Removes every tracked directory.
 */
export function removeDirectories(): void {
  for (const directory of directories) removeDirectory(directory)
}
