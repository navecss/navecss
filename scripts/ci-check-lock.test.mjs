/**
 * Coverage for ci-check-lock.mjs, run with Node's built-in test runner.
 *
 * Every test takes its own lock path under a scratch directory and a clock it controls, so none
 * touches the lock a real `ci:check` on this machine may be holding, and none waits in real time.
 * The race between waiters that find the same stale lock is run with real processes, since one
 * thread cannot interleave its own synchronous file calls.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as lockModule from './ci-check-lock.mjs'

const { acquireLock, defaultLockPath, isAlive, makeAlive } = lockModule

const scratch = []
const spawned = []
after(() => {
  for (const child of spawned) if (isRunning(child.pid)) process.kill(child.pid, 'SIGKILL')
  for (const dir of scratch) {
    try {
      chmodSync(path.join(dir, 'lock'), 0o755)
    } catch {
      // Most scratch directories hold no lock, or one that was never locked down.
    }
    rmSync(dir, { force: true, recursive: true })
  }
})

const isRunning = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * A process that stays up for a while. `shaped` puts `run-ci-check` in its command line, so it
 * looks like a `ci:check` runner to anyone reading it; without it, it is an unrelated process.
 */
function spawnHolder({ shaped }) {
  const child = shaped
    ? spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'run-ci-check'])
    : spawn('sleep', ['30'])
  spawned.push(child)
  return child
}

/**
 * Resolves to what `promise` resolves to, or to `fallback` after `ms`.
 */
async function within(promise, ms, fallback) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

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
  const time = { count: 0, now: 0, step: stepMs }
  return {
    now: () => time.now,
    sleep: async () => {
      time.now += time.step
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

test('a live process that is a ci:check runner is alive; an unrelated one, and one that is gone, are not', async () => {
  const runner = spawnHolder({ shaped: true })
  const unrelated = spawnHolder({ shaped: false })
  const gone = spawnHolder({ shaped: false })
  gone.kill('SIGKILL')
  await new Promise((resolve) => gone.on('close', resolve))

  assert.equal(isAlive(runner.pid), true)
  assert.equal(isAlive(unrelated.pid), false)
  assert.equal(isAlive(gone.pid), false)
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

test('a pid that exists but cannot be signalled counts as alive when its command line is a runner', () => {
  const eperm = () => {
    throw Object.assign(new Error('not permitted'), { code: 'EPERM' })
  }

  assert.equal(
    makeAlive({ commandOf: () => 'node /x/scripts/run-ci-check.mjs', kill: eperm })(1),
    true,
  )
  assert.equal(makeAlive({ commandOf: () => 'sleep 30', kill: eperm })(1), false)
})

test('liveness needs a process and a command line that names the runner', () => {
  const exists = () => true
  const missing = () => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
  }
  const commands = {
    runner: 'node /work/scripts/run-ci-check.mjs',
    unrelated: 'sleep 30',
  }

  assert.equal(makeAlive({ commandOf: () => commands.runner, kill: exists })(7), true)
  assert.equal(makeAlive({ commandOf: () => commands.unrelated, kill: exists })(7), false)
  assert.equal(makeAlive({ commandOf: () => commands.runner, kill: missing })(7), false)
})

test('when the command line cannot be read, the kill result alone decides', () => {
  const exists = () => true
  const missing = () => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
  }

  assert.equal(makeAlive({ commandOf: () => undefined, kill: exists })(7), true)
  assert.equal(makeAlive({ commandOf: () => undefined, kill: missing })(7), false)
})

test('the real ps reads the command line of a runner-shaped process and of an unrelated one', () => {
  const runner = spawnHolder({ shaped: true })
  const unrelated = spawnHolder({ shaped: false })
  const ps = (pid) =>
    spawnSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })

  assert.match(ps(runner.pid).stdout, /run-ci-check/)
  assert.doesNotMatch(ps(unrelated.pid).stdout, /run-ci-check/)
})

test('a lock owned by an unrelated live process is taken over, by the real liveness check', async () => {
  const { lockPath } = freshLock()
  const unrelated = spawnHolder({ shaped: false })
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/other', pid: unrelated.pid, startedAt: 1 }))
  const lines = []

  const pending = acquireLock({
    cwd: '/work/b',
    lockPath,
    log: (line) => lines.push(line),
    pid: 1002,
    pollMs: 20,
  })
  const taken = await within(pending, 3000, 'waited')
  unrelated.kill('SIGKILL')
  const release = taken === 'waited' ? await pending : taken

  assert.notEqual(taken, 'waited', 'the lock of an unrelated process held the acquirer up')
  assert.equal(ownerOf(lockPath).pid, 1002)
  assert.deepEqual(lines, [])
  release()
})

test('a lock owned by the acquirer’s own pid is taken over', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/old', pid: 1002, startedAt: 1 }))
  const state = { alive: true }

  const pending = acquireLock({
    alive: () => state.alive,
    cwd: '/work/b',
    lockPath,
    pid: 1002,
    pollMs: 20,
  })
  const taken = await within(pending, 1000, 'waited')
  state.alive = false
  const release = taken === 'waited' ? await pending : taken

  assert.notEqual(taken, 'waited', 'a lock of this very pid held the acquirer up')
  release()
})

test('the waiting line names the lock path and what to do if that run is gone', async () => {
  const { lockPath } = freshLock()
  const first = await acquireLock({
    alive: aliveOnly(1001, 1002),
    cwd: '/work/a',
    lockPath,
    pid: 1001,
  })
  const lines = []
  const clock = fakeTime(10, (count) => {
    if (count === 2) first()
  })

  const release = await acquireLock({
    alive: aliveOnly(1001, 1002),
    cwd: '/work/b',
    lockPath,
    log: (line) => lines.push(line),
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  assert.equal(lines.length, 1)
  assert.ok(lines[0].endsWith(`If that run is no longer running, delete ${lockPath}.`), lines[0])
  release()
})

test('a takeover guard seen while the lock was stale does not outlive a live holder', async () => {
  const { lockPath } = freshLock()
  const guard = `${lockPath}.takeover`
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: 4242, startedAt: 1 }))
  mkdirSync(guard)
  const seen = {}
  const clock = fakeTime(1000, (count) => {
    const writeOwner = (pid) =>
      writeFileSync(
        path.join(lockPath, 'owner.json'),
        JSON.stringify({ cwd: '/work/x', pid, startedAt: 1 }),
      )
    if (count === 1) {
      // A live run now holds the lock, and for an hour.
      rmSync(guard, { recursive: true })
      writeOwner(1001)
      clock.time.step = 3_600_000
    } else if (count === 2) {
      // It is gone, and a taker is replacing it just now: the guard is a fresh one.
      writeOwner(4242)
      mkdirSync(guard)
    } else if (count === 3) {
      seen.guardStillThere = existsSync(guard)
      rmSync(guard, { recursive: true })
    }
  })

  const release = await acquireLock({
    alive: aliveOnly(1001, 1002),
    cwd: '/work/b',
    lockPath,
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  assert.equal(seen.guardStillThere, true, 'a fresh takeover guard was broken as an old one')
  release()
})

test('a lock that is unreadable, then held by a live run, then unreadable again, gets its grace again', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath)
  const clock = fakeTime(1000, (count) => {
    if (count === 1) {
      writeFileSync(
        path.join(lockPath, 'owner.json'),
        JSON.stringify({ cwd: '/work/a', pid: 1001, startedAt: 1 }),
      )
    } else if (count === 61) {
      rmSync(path.join(lockPath, 'owner.json'))
    }
  })

  const release = await acquireLock({
    alive: aliveOnly(1001, 1002),
    cwd: '/work/b',
    graceMs: 5000,
    lockPath,
    log: () => {},
    now: clock.now,
    pid: 1002,
    sleep: clock.sleep,
  })

  // Unreadable again at 61 s: taken a full grace after that, not at once.
  assert.ok(clock.time.now >= 66_000, `taken at ${clock.time.now} ms`)
  release()
})

test('durations are measured on a clock that a change of the wall clock does not move', async () => {
  const { lockPath } = freshLock()
  leaveLock(lockPath)
  const wall = Date.now
  const skew = { ms: 0 }
  const started = performance.now()
  let release
  // The wall clock is the one a default `now` would read, so it is replaced before the call.
  Date.now = () => wall() + skew.ms
  try {
    release = await acquireLock({
      cwd: '/work/b',
      graceMs: 300,
      lockPath,
      pid: 1002,
      sleep: async () => {
        // It jumps an hour ahead; a grace measured on it would be over.
        skew.ms = 3_600_000
        await new Promise((resolve) => setTimeout(resolve, 20))
      },
    })
  } finally {
    Date.now = wall
  }

  assert.ok(
    performance.now() - started >= 280,
    'the grace ended early, on a jump of the wall clock',
  )
  release()
})

/**
 * Replaces the lock at `lockPath` with what `replacement` leaves, from inside the liveness check
 * that judges the first owner dead, so the lock changes between the judgement and the takeover.
 */
async function acquireWhileLockIsReplaced(replacement) {
  const { lockPath } = freshLock()
  leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: 4242, startedAt: 1 }))
  const state = { replaced: false, atFirstSleep: undefined }
  const alive = (pid) => {
    if (pid === 4242 && !state.replaced) {
      state.replaced = true
      rmSync(lockPath, { recursive: true })
      mkdirSync(lockPath)
      replacement(lockPath)
      return false
    }
    return pid === 1001
  }
  const sleep = async () => {
    state.atFirstSleep ??= {
      exists: existsSync(lockPath),
      owner: existsSync(path.join(lockPath, 'owner.json')) ? ownerOf(lockPath).pid : undefined,
    }
    rmSync(lockPath, { force: true, recursive: true })
  }
  const release = await acquireLock({
    alive,
    cwd: '/work/b',
    lockPath,
    log: () => {},
    pid: 1002,
    sleep,
  })
  release()
  return state
}

test('a takeover backs off when the lock it judged stale was replaced by one with a live owner', async () => {
  const state = await acquireWhileLockIsReplaced((lockPath) =>
    writeFileSync(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({ cwd: '/work/a', pid: 1001, startedAt: 1 }),
    ),
  )

  assert.deepEqual(state.atFirstSleep, { exists: true, owner: 1001 })
})

test('a takeover backs off when the lock it judged stale was replaced by one with no owner file yet', async () => {
  const state = await acquireWhileLockIsReplaced(() => {})

  assert.deepEqual(state.atFirstSleep, { exists: true, owner: undefined })
})

test(
  'a stale lock that cannot be removed fails with a message naming it and saying to delete it',
  {
    skip: process.getuid?.() === 0 && 'root can remove it',
  },
  async () => {
    const { lockPath } = freshLock()
    leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: 4242, startedAt: 1 }))
    chmodSync(lockPath, 0o555)

    await assert.rejects(
      acquireLock({ alive: aliveOnly(1002), cwd: '/work/b', lockPath, pid: 1002 }),
      (error) =>
        error.message.includes(lockPath) &&
        /delete/.test(error.message) &&
        !error.message.startsWith('EACCES'),
    )
    assert.equal(existsSync(`${lockPath}.takeover`), false)
  },
)

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
 * A child process that waits for the shared start time, acquires `lockPath`, logs when it holds
 * it, and releases it.
 */
const WAITER = String.raw`
import { appendFileSync } from 'node:fs'
import { acquireLock } from ${JSON.stringify(path.join(path.dirname(fileURLToPath(import.meta.url)), 'ci-check-lock.mjs'))}
const [, , lockPath, logPath, deadPid, startAt] = process.argv
while (Date.now() < Number(startAt)) {
  // Spin, so every waiter leaves together.
}
const release = await acquireLock({
  alive: (pid) => pid !== Number(deadPid),
  lockPath,
  log: () => {},
  pollMs: 10,
})
appendFileSync(logPath, 'in ' + process.pid + '\n')
await new Promise((resolve) => setTimeout(resolve, 30))
appendFileSync(logPath, 'out ' + process.pid + '\n')
release()
`

const ROUNDS = 8
const WAITERS = 4
// The pid the stale lock names, which every waiter is told is dead. It must be one no waiter can
// be given, or a waiter holding the lock under it is judged dead and taken over: the largest
// pid_t, above the most any system hands out (2^22 on Linux, 99999 on macOS).
const DEAD_PID = 2 ** 31 - 1

test('four waiters racing a freshly stale lock take it one at a time, eight times over', async () => {
  const { dir, lockPath } = freshLock()
  const script = path.join(dir, 'waiter.mjs')
  writeFileSync(script, WAITER)
  for (let round = 0; round < ROUNDS; round += 1) {
    const logPath = path.join(dir, `log-${round}.txt`)
    writeFileSync(logPath, '')
    leaveLock(lockPath, JSON.stringify({ cwd: '/work/dead', pid: DEAD_PID, startedAt: 1 }))
    const startAt = String(Date.now() + 400)

    const exits = Array.from(
      { length: WAITERS },
      () =>
        new Promise((resolve) => {
          const child = spawn(
            process.execPath,
            [script, lockPath, logPath, String(DEAD_PID), startAt],
            {
              stdio: 'inherit',
            },
          )
          child.on('close', resolve)
        }),
    )
    const codes = await Promise.all(exits)

    assert.deepEqual(codes, [0, 0, 0, 0], `round ${round}`)
    const events = readFileSync(logPath, 'utf8').trim().split('\n')
    assert.equal(events.length, WAITERS * 2, `round ${round}: ${events.join(', ')}`)
    // Alternating `in` and `out` of one pid at a time means no two held the lock together.
    for (let index = 0; index < events.length; index += 2) {
      const [inKind, inPid] = events[index].split(' ', 2)
      const [outKind, outPid] = events[index + 1].split(' ', 2)
      assert.equal(inKind, 'in', `round ${round}: ${events.join(', ')}`)
      assert.equal(outKind, 'out', `round ${round}: ${events.join(', ')}`)
      assert.equal(inPid, outPid, `round ${round}: ${events.join(', ')}`)
    }
    assert.equal(existsSync(lockPath), false)
  }
})
