/**
 * Coverage for ci-check-lock.mjs, run with Node's built-in test runner.
 *
 * Every test takes its own lock path under a scratch directory and a clock it controls, so none
 * touches the lock a real `ci:check` on this machine may be holding, and none waits in real time.
 * The race between waiters that find the same stale lock is run with real processes, since one
 * thread cannot interleave its own synchronous file calls.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { acquireLock, defaultLockPath, isAlive } from './ci-check-lock.mjs'

const scratch = []
after(() => {
  for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})

/**
 * A scratch directory and the lock path inside it.
 */
function freshLock() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-check-lock-test-'))
  scratch.push(dir)
  return { dir, lockPath: path.join(dir, 'lock') }
}

/**
 * A clock that only `sleep` moves, and the sleep that moves it, so a wait of minutes takes no time.
 * `onSleep(count)` runs after each sleep.
 */
function fakeTime(stepMs, onSleep = () => {}) {
  const time = { count: 0, now: 0 }
  return {
    now: () => time.now,
    sleep: async () => {
      time.now += stepMs
      time.count += 1
      onSleep(time.count)
      await new Promise((resolve) => setImmediate(resolve))
    },
    time,
  }
}

const ownerOf = (lockPath) => JSON.parse(readFileSync(path.join(lockPath, 'owner.json'), 'utf8'))

/**
 * Writes a lock directory the way a holder with `owner` would have left it.
 */
function leaveLock(lockPath, owner) {
  mkdirSync(lockPath)
  if (owner !== undefined) {
    writeFileSync(path.join(lockPath, 'owner.json'), owner)
  }
}

const aliveOnly =
  (...pids) =>
  (pid) =>
    pids.includes(pid)

test('the default lock sits in the temporary directory, under a name of its own', () => {
  assert.equal(path.dirname(defaultLockPath()), tmpdir())
  assert.match(path.basename(defaultLockPath()), /navecss-ci-check/)
})

test('a pid that exists is alive, one that does not is not', () => {
  assert.equal(isAlive(process.pid), true)
  assert.equal(isAlive(2 ** 22 + 12_345), false)
})

test('a free lock is taken at once, prints nothing, records its owner and is removed by its release', async () => {
  const { lockPath } = freshLock()
  const lines = []

  const release = await acquireLock({
    cwd: '/work/a',
    lockPath,
    log: (line) => lines.push(line),
    pid: 1001,
  })

  assert.deepEqual(lines, [])
  const owner = ownerOf(lockPath)
  assert.equal(owner.pid, 1001)
  assert.equal(owner.cwd, '/work/a')
  assert.equal(typeof owner.startedAt, 'number')
  release()
  assert.equal(existsSync(lockPath), false)
})

test('a second acquirer waits while the first holds the lock, says so once, and proceeds after the release', async () => {
  const { lockPath } = freshLock()
  const first = await acquireLock({
    alive: aliveOnly(1001, 1002),
    cwd: '/work/a',
    lockPath,
    pid: 1001,
  })
  const lines = []
  let acquired = false

  const second = (async () => {
    const release = await acquireLock({
      alive: aliveOnly(1001, 1002),
      cwd: '/work/b',
      lockPath,
      log: (line) => lines.push(line),
      pid: 1002,
      pollMs: 5,
    })
    acquired = true
    return release
  })()
  await new Promise((resolve) => setTimeout(resolve, 80))

  assert.equal(acquired, false)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /\/work\/a/)
  assert.match(lines[0], /1001/)
  assert.match(lines[0], /starts when that one finishes/)

  first()
  const release = await second
  assert.equal(acquired, true)
  assert.equal(ownerOf(lockPath).pid, 1002)
  release()
  assert.equal(existsSync(lockPath), false)
})

test('the waiting line is repeated at most once a minute', async () => {
  const { lockPath } = freshLock()
  const holder = await acquireLock({ alive: () => true, cwd: '/work/a', lockPath, pid: 1001 })
  const lines = []
  const clock = fakeTime(20_000, (count) => {
    if (count === 5) holder()
  })

  const release = await acquireLock({
    alive: () => true,
    cwd: '/work/b',
    lockPath,
    log: (line) => lines.push(line),
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  // Waits of 0, 20, 40, 60 and 80 seconds: a line at 0 and one at 60.
  assert.equal(lines.length, 2)
  release()
})

test('a lock left by a pid that is gone is taken over', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: 4242, startedAt: 1 }))
  const lines = []

  const release = await acquireLock({
    alive: aliveOnly(1002),
    cwd: '/work/b',
    lockPath,
    log: (line) => lines.push(line),
    pid: 1002,
  })

  assert.equal(ownerOf(lockPath).pid, 1002)
  assert.deepEqual(lines, [])
  release()
})

test('a pid that exists but cannot be signalled still counts as alive', () => {
  const real = process.kill
  process.kill = () => {
    throw Object.assign(new Error('not permitted'), { code: 'EPERM' })
  }
  try {
    assert.equal(isAlive(1), true)
  } finally {
    process.kill = real
  }
})

test('a lock with no owner file is stale only after the grace', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath)
  const clock = fakeTime(1000)

  const release = await acquireLock({
    cwd: '/work/b',
    graceMs: 5000,
    lockPath,
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  assert.ok(clock.time.now >= 5000, `taken after ${clock.time.now} ms, before the grace was over`)
  assert.equal(ownerOf(lockPath).pid, 1002)
  release()
})

test('a lock whose owner file cannot be read is stale only after the grace', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath, '{"pid": ')
  const clock = fakeTime(1000)

  const release = await acquireLock({
    cwd: '/work/b',
    graceMs: 5000,
    lockPath,
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  assert.ok(clock.time.now >= 5000, `taken after ${clock.time.now} ms, before the grace was over`)
  release()
})

test('an owner file that appears within the grace is respected', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath)
  const lines = []
  const clock = fakeTime(1000, (count) => {
    if (count === 2) {
      writeFileSync(
        path.join(lockPath, 'owner.json'),
        JSON.stringify({ cwd: '/work/a', pid: 1001, startedAt: 1 }),
      )
    } else if (count === 6) {
      rmSync(lockPath, { force: true, recursive: true })
    }
  })

  const release = await acquireLock({
    alive: aliveOnly(1001, 1002),
    cwd: '/work/b',
    graceMs: 5000,
    lockPath,
    log: (line) => lines.push(line),
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  assert.equal(lines.length, 1)
  assert.match(lines[0], /1001/)
  release()
})

test('a release removes only a lock its own process owns', async () => {
  const { lockPath } = freshLock()
  const release = await acquireLock({ cwd: '/work/a', lockPath, pid: 1001 })
  writeFileSync(
    path.join(lockPath, 'owner.json'),
    JSON.stringify({ cwd: '/work/b', pid: 1002, startedAt: 2 }),
  )

  release()

  assert.equal(existsSync(lockPath), true)
  assert.equal(ownerOf(lockPath).pid, 1002)
})

test('a release is harmless when the lock is gone, and when it is called twice', async () => {
  const { lockPath } = freshLock()
  const release = await acquireLock({ cwd: '/work/a', lockPath, pid: 1001 })
  rmSync(lockPath, { recursive: true })

  release()
  release()
  assert.equal(existsSync(lockPath), false)
})

test('a takeover guard left by a taker that died is broken after a while', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: 4242, startedAt: 1 }))
  mkdirSync(`${lockPath}.takeover`)
  const clock = fakeTime(5000)

  const release = await acquireLock({
    alive: aliveOnly(1002),
    cwd: '/work/b',
    lockPath,
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
    staleGuardMs: 30_000,
  })

  assert.ok(clock.time.now >= 30_000)
  assert.equal(ownerOf(lockPath).pid, 1002)
  assert.equal(existsSync(`${lockPath}.takeover`), false)
  release()
})

/**
 * A child process that acquires `lockPath`, logs when it holds it, and releases it.
 */
const WAITER = String.raw`
import { appendFileSync } from 'node:fs'
import { acquireLock } from ${JSON.stringify(path.join(path.dirname(fileURLToPath(import.meta.url)), 'ci-check-lock.mjs'))}
const [, , lockPath, logPath, deadPid] = process.argv
const release = await acquireLock({
  alive: (pid) => pid !== Number(deadPid),
  lockPath,
  log: () => {},
  pollMs: 10,
})
appendFileSync(logPath, 'in ' + process.pid + '\n')
await new Promise((resolve) => setTimeout(resolve, 60))
appendFileSync(logPath, 'out ' + process.pid + '\n')
release()
`

test('four waiters racing one stale lock take it one at a time', async () => {
  const { dir, lockPath } = freshLock()
  const logPath = path.join(dir, 'log.txt')
  const script = path.join(dir, 'waiter.mjs')
  writeFileSync(script, WAITER)
  writeFileSync(logPath, '')
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: 4242, startedAt: 1 }))

  const exits = Array.from(
    { length: 4 },
    () =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [script, lockPath, logPath, '4242'], {
          stdio: 'inherit',
        })
        child.on('close', resolve)
      }),
  )
  const codes = await Promise.all(exits)

  assert.deepEqual(codes, [0, 0, 0, 0])
  const events = readFileSync(logPath, 'utf8').trim().split('\n')
  assert.equal(events.length, 8)
  // Alternating `in` and `out` of one pid at a time means no two held the lock together.
  for (let index = 0; index < events.length; index += 2) {
    const [inKind, inPid] = events[index].split(' ', 2)
    const [outKind, outPid] = events[index + 1].split(' ', 2)
    assert.equal(inKind, 'in')
    assert.equal(outKind, 'out')
    assert.equal(inPid, outPid)
  }
  assert.equal(existsSync(lockPath), false)
})
