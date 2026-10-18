/**
 * The lock that lets one `ci:check` run at a time on a machine.
 *
 * Two runs at once make the timing-sensitive tests fail on correct code, so a second run waits for
 * the first and starts when it finishes. The lock is a directory made with `mkdirSync`, which is
 * atomic: whoever makes it holds it. It contains `owner.json` (the holder's pid, working
 * directory and start time), written by a rename so a reader never sees half of it.
 *
 * The lock is per user and per temporary directory: two users, or two sessions with different
 * `TMPDIR`, do not wait on each other.
 *
 * A lock whose holder is gone is stale and is taken over. A holder is gone when its pid is not a
 * process, or is one that is not a `ci:check` runner (the pid was reused), or is this process's own. Taking over is done under a second
 * directory, `<lock>.takeover`, because two waiters can both find the same lock stale: whoever
 * makes the guard checks again that the lock is still the one it judged stale, and only then
 * replaces it, so a waiter that was slow cannot remove a lock that a faster one has just taken.
 * A lock with no readable owner file is a holder between `mkdir` and the write, so it is judged
 * stale only after a grace. The grace belongs to the lock it began on: when that lock is removed
 * and another with no owner file is made in its place, the new one gets a grace of its own.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

const LOCK_NAME = 'navecss-ci-check.lock'
const OWNER_FILE = 'owner.json'

/**
 * Where the lock is on this machine: one name in the temporary directory.
 */
export const defaultLockPath = () => path.join(tmpdir(), LOCK_NAME)

/**
 * The command line of the process `pid`, or `undefined` when `ps` cannot say. `ps` is run by its
 * absolute path, where macOS and Linux both install it, so no directory on the caller's `PATH` can
 * stand in for it; where it is somewhere else, or missing, the liveness check falls back to the
 * signal alone.
 */
function commandOfProcess(pid) {
  const result = spawnSync('/bin/ps', ['-ww', '-o', 'command=', '-p', String(pid)], {
    encoding: 'utf8',
  })
  return result.error || result.status !== 0 ? undefined : result.stdout
}

/**
 * A liveness check for the pid in a lock: the process exists (one this user may not signal still
 * does) and its command line names the `ci:check` runner, so a pid that has been given to some
 * other process since the holder died is not taken for the holder. When the command line cannot be
 * read, the existence of the process decides.
 */
export function makeAlive({
  commandOf = commandOfProcess,
  kill = process.kill.bind(process),
} = {}) {
  return (pid) => {
    try {
      kill(pid, 0)
    } catch (error) {
      if (error.code !== 'EPERM') return false
    }
    const command = commandOf(pid)
    return command === undefined || command.includes('run-ci-check')
  }
}

/**
 * Whether the process `pid` is a running `ci:check`.
 */
export const isAlive = makeAlive()

/**
 * The owner `lockPath` records, or `undefined` when the file is missing or says no pid.
 */
function readOwner(lockPath) {
  try {
    const owner = JSON.parse(readFileSync(path.join(lockPath, OWNER_FILE), 'utf8'))
    return Number.isInteger(owner?.pid) && owner.pid > 0 ? owner : undefined
  } catch {
    return undefined
  }
}

/**
 * A string that changes when the lock is replaced: its directory's inode and change time, and its
 * owner file's text. The change time is there because an inode freed by a removed lock is often
 * given to the next one, so the inode alone does not tell a lock from the one that replaced it. It
 * is the change time and not the creation time, which some Linux file systems report as 0.
 */
function fingerprintOf(lockPath) {
  try {
    const text = readFileSync(path.join(lockPath, OWNER_FILE), 'utf8')
    return `${identityOf(lockPath)}:${text}`
  } catch {
    try {
      return `${identityOf(lockPath)}:`
    } catch {
      return undefined
    }
  }
}

/**
 * The inode and change time of the lock directory, in nanoseconds (a file system may keep the time coarser).
 */
function identityOf(lockPath) {
  const { ctimeNs, ino } = statSync(lockPath, { bigint: true })
  return `${ino}:${ctimeNs}`
}

/**
 * Makes the lock directory for `owner`. False when it exists already.
 */
function tryCreate(lockPath, owner) {
  try {
    mkdirSync(lockPath)
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    const file = path.join(lockPath, OWNER_FILE)
    writeFileSync(`${file}.tmp`, JSON.stringify(owner))
    renameSync(`${file}.tmp`, file)
  } catch (error) {
    rmSync(lockPath, { force: true, recursive: true })
    throw error
  }
  return true
}

/**
 * Whether `holder`, the owner a lock records, is a run that is still going: not this process
 * itself (a lock of its own pid is a leftover), and alive.
 */
const isHolding = (holder, { alive, pid }) =>
  holder !== undefined && holder.pid !== pid && alive(holder.pid)

/**
 * Removes `target` and what is in it, or throws an error that names it and says to delete it by
 * hand: it is another user's, or locked down, and no raw system error helps whoever reads it.
 */
function removeOrExplain(target) {
  try {
    rmSync(target, { force: true, recursive: true })
  } catch (error) {
    throw new Error(`ci:check: cannot remove ${target} (${error.code}); delete it and run again.`, {
      cause: error,
    })
  }
}

/**
 * Replaces the lock that `judged` (its fingerprint) described, when it is still that lock.
 * Returns true when `owner` now holds the lock.
 */
function takeOver(config, judged, owner) {
  const guard = `${config.lockPath}.takeover`
  try {
    mkdirSync(guard)
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    const { lockPath } = config
    if (fingerprintOf(lockPath) !== judged || isHolding(readOwner(lockPath), config)) return false
    removeOrExplain(lockPath)
    return tryCreate(lockPath, owner)
  } finally {
    rmSync(guard, { force: true, recursive: true })
  }
}

/**
 * Removes the lock if `pid` owns it.
 */
function releaseFor(lockPath, pid) {
  if (readOwner(lockPath)?.pid === pid) rmSync(lockPath, { force: true, recursive: true })
}

/**
 * What `acquireLock` does by default; a test replaces any of it.
 */
const defaults = () => ({
  alive: isAlive,
  cwd: process.cwd(),
  graceMs: 5000,
  lockPath: defaultLockPath(),
  log: console.log,
  now: () => performance.now(),
  pid: process.pid,
  pollMs: 2000,
  reportMs: 60_000,
  sleep: delay,
  staleGuardMs: 30_000,
  wallNow: Date.now,
})

/**
 * Prints the line that says this run is waiting, unless it said so within the last minute. It
 * names the lock, for the case that the run it waits for is gone and the lock was not.
 */
function reportWaiting(config, wait, holder) {
  const { log, now, reportMs } = config
  if (wait.reportedAt !== undefined && now() - wait.reportedAt < reportMs) return
  wait.reportedAt = now()
  log(
    `ci:check: another ci:check is running in ${holder.cwd} (pid ${holder.pid}); this run starts when that one finishes. If that run is no longer running, delete ${config.lockPath}.`,
  )
}

/**
 * Removes a takeover guard that has stood for `staleGuardMs`: its taker died holding it.
 */
function breakOldGuard(config, wait) {
  const guard = `${config.lockPath}.takeover`
  try {
    statSync(guard)
  } catch {
    wait.guardSince = undefined
    return
  }
  wait.guardSince ??= config.now()
  if (config.now() - wait.guardSince < config.staleGuardMs) return
  removeOrExplain(guard)
  wait.guardSince = undefined
}

/**
 * Whether the lock `holder` left (undefined when unreadable) is stale. An unreadable one is a
 * holder between `mkdir` and its write, so it is stale only once it has stayed so for the grace.
 * The grace is counted from when this lock, the one `judged` (its fingerprint) describes, was first
 * seen unreadable: a different lock that is also unreadable starts the count again.
 */
function isStale(config, wait, holder, judged) {
  if (holder !== undefined) return true
  if (wait.invalidFingerprint !== judged) {
    wait.invalidFingerprint = judged
    wait.invalidSince = config.now()
  }
  return config.now() - wait.invalidSince >= config.graceMs
}

/**
 * Waits until this process holds the lock, and resolves to the function that releases it. It
 * prints nothing when the lock is free, and one line when it has to wait, repeated at most once a
 * minute. There is no time limit: the line names the other run, and a stuck one can be stopped.
 *
 * `options` is for tests: the lock path, the process id and directory to record, the clock, the
 * sleep, the line printer and the liveness check.
 */
export async function acquireLock(options = {}) {
  const config = { ...defaults(), ...options }
  const { lockPath, pid } = config
  const owner = { cwd: config.cwd, pid, startedAt: config.wallNow() }
  const release = () => releaseFor(lockPath, pid)
  const wait = {
    guardSince: undefined,
    invalidFingerprint: undefined,
    invalidSince: undefined,
    reportedAt: undefined,
  }
  for (;;) {
    if (tryCreate(lockPath, owner)) return release
    // Taken before the owner is read, so a lock replaced in between is never judged by the old one.
    const judged = fingerprintOf(lockPath)
    if (judged === undefined) continue
    const holder = readOwner(lockPath)
    if (isHolding(holder, config)) {
      wait.invalidFingerprint = undefined
      wait.invalidSince = undefined
      wait.guardSince = undefined
      reportWaiting(config, wait, holder)
    } else if (isStale(config, wait, holder, judged)) {
      if (takeOver(config, judged, owner)) return release
      breakOldGuard(config, wait)
    }
    await config.sleep(config.pollMs)
  }
}
