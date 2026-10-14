/**
 * The lock that lets one `ci:check` run at a time on a machine.
 *
 * Two runs at once make the timing-sensitive tests fail on correct code, so a second run waits for
 * the first and starts when it finishes. The lock is a directory made with `mkdirSync`, which is
 * atomic: whoever makes it holds it. It contains `owner.json` (the holder's pid, working
 * directory and start time), written by a rename so a reader never sees half of it.
 *
 * A lock whose holder is gone is stale and is taken over. Taking over is done under a second
 * directory, `<lock>.takeover`, because two waiters can both find the same lock stale: whoever
 * makes the guard checks again that the lock is still the one it judged stale, and only then
 * replaces it, so a waiter that was slow cannot remove a lock that a faster one has just taken.
 * A lock with no readable owner file is a holder between `mkdir` and the write, so it is judged
 * stale only after a grace.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const LOCK_NAME = 'navecss-ci-check.lock'
const OWNER_FILE = 'owner.json'

/**
 * Where the lock is on this machine: one name in the temporary directory.
 */
export const defaultLockPath = () => path.join(tmpdir(), LOCK_NAME)

/**
 * Whether a process with `pid` exists. A process this user may not signal still exists.
 */
export function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

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
 * A string that changes when the lock is replaced: its directory's inode and its owner file's text.
 */
function fingerprintOf(lockPath) {
  try {
    const text = readFileSync(path.join(lockPath, OWNER_FILE), 'utf8')
    return `${statSync(lockPath).ino}:${text}`
  } catch {
    try {
      return `${statSync(lockPath).ino}:`
    } catch {
      return undefined
    }
  }
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
 * Replaces the lock that `judged` (its fingerprint) described, when it is still that lock.
 * Returns true when `owner` now holds the lock.
 */
function takeOver(lockPath, judged, owner, alive) {
  const guard = `${lockPath}.takeover`
  try {
    mkdirSync(guard)
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    const current = readOwner(lockPath)
    if (fingerprintOf(lockPath) !== judged || (current && alive(current.pid))) return false
    rmSync(lockPath, { force: true, recursive: true })
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
  now: Date.now,
  pid: process.pid,
  pollMs: 2000,
  reportMs: 60_000,
  sleep: delay,
  staleGuardMs: 30_000,
})

/**
 * Prints the line that says this run is waiting, unless it said so within the last minute.
 */
function reportWaiting(config, wait, holder) {
  const { log, now, reportMs } = config
  if (wait.reportedAt !== undefined && now() - wait.reportedAt < reportMs) return
  wait.reportedAt = now()
  log(
    `ci:check: another ci:check is running in ${holder.cwd} (pid ${holder.pid}); this run starts when that one finishes.`,
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
  rmSync(guard, { force: true, recursive: true })
  wait.guardSince = undefined
}

/**
 * Whether the lock `holder` left (undefined when unreadable) is stale. An unreadable one is a
 * holder between `mkdir` and its write, so it is stale only once it has stayed so for the grace.
 */
function isStale(config, wait, holder) {
  if (holder !== undefined) return true
  wait.invalidSince ??= config.now()
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
  const { alive, lockPath, pid } = config
  const owner = { cwd: config.cwd, pid, startedAt: config.now() }
  const release = () => releaseFor(lockPath, pid)
  const wait = { guardSince: undefined, invalidSince: undefined, reportedAt: undefined }
  for (;;) {
    if (tryCreate(lockPath, owner)) return release
    // Taken before the owner is read, so a lock replaced in between is never judged by the old one.
    const judged = fingerprintOf(lockPath)
    if (judged === undefined) continue
    const holder = readOwner(lockPath)
    if (holder && alive(holder.pid)) {
      wait.invalidSince = undefined
      reportWaiting(config, wait, holder)
    } else if (isStale(config, wait, holder)) {
      if (takeOver(lockPath, judged, owner, alive)) return release
      breakOldGuard(config, wait)
    }
    await config.sleep(config.pollMs)
  }
}
