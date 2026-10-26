/**
 * A `next dev` or `next start` that a row starts is stopped with the process that started it, and
 * a scratch app a file makes is removed when the file ends, however the rows ended: a passing
 * file, a failing assertion, a worker that is signalled. The `next` here is a stand-in that
 * serves one page and starts a helper process beside it, as `next dev` does with its workers.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { forgetGroup, killGroups, trackGroup } from './helpers/leftovers.ts'
import { startDev } from './helpers/next-dev.ts'
import { nextEnvironment, PACKAGE_ROOT } from './helpers/next-process.ts'

const HELPERS = path.join(import.meta.dirname, 'helpers')
const NEXT_DEV = pathToFileURL(path.join(HELPERS, 'next-dev.ts')).href
const NEXT_APP = path.join(HELPERS, 'next-app.ts')
const HOOKS = path.join(HELPERS, 'leftovers-hooks.ts')
const VITEST = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs')

interface Scratch {
  /**
   * The directory of the stand-in `next` package.
   */
  readonly fakeNext: () => string
  /**
   * The scratch directory of the row.
   */
  readonly directory: () => string
  /**
   * Notes processes to stop after the row, whatever it did.
   */
  readonly track: (pids: readonly number[]) => void
}

/**
 * The helper process of the stand-in `next`: on SIGTERM it takes a second and a half to write
 * `finishedFile` and end, as a worker finishing what it writes does.
 */
function helperScript(finishedFile: string): string {
  return `process.on('SIGTERM', () => setTimeout(() => { require('node:fs').writeFileSync(${JSON.stringify(finishedFile)}, 'done'); process.exit(0) }, 1500)); setInterval(() => {}, 1000)`
}

/**
 * The stand-in `next`: it listens on `--port`, starts a helper that outlives nothing but its
 * group, and prints both process ids.
 */
function writeFakeNext(root: string, finishedFile: string): void {
  const bin = path.join(root, 'dist/bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    path.join(bin, 'next'),
    [
      "const { spawn } = require('node:child_process')",
      "const http = require('node:http')",
      "const port = Number(process.argv[process.argv.indexOf('--port') + 1])",
      `const helper = spawn(process.execPath, ['-e', ${JSON.stringify(helperScript(finishedFile))}], { stdio: 'ignore' })`,
      "http.createServer((_, res) => res.end('ok')).listen(port, '127.0.0.1', () => {",
      '  console.log(`PIDS ${process.pid} ${helper.pid}`)',
      '})',
      '',
    ].join('\n'),
  )
}

/**
 * A scratch directory holding the stand-in `next`, made before each row and removed after it,
 * with the processes the row noted stopped.
 */
function useScratch(): Scratch {
  let directory = ''
  let fakeNext = ''
  const started: number[] = []
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-leftovers-'))
    directory = realpathSync(made)
    fakeNext = path.join(directory, 'node_modules/next')
    writeFakeNext(fakeNext, path.join(directory, 'helper-finished'))
  })
  afterEach(() => {
    for (const pid of started) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    started.length = 0
    rmSync(directory, { recursive: true, force: true })
  })
  return {
    directory: () => directory,
    fakeNext: () => fakeNext,
    track: (pids) => {
      started.push(...pids)
    },
  }
}

/**
 * Whether a process with this id is running.
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
 * Waits until none of `pids` is running, for at most `ms`, and returns those that still are.
 */
async function untilGone(pids: readonly number[], ms: number): Promise<number[]> {
  const deadline = Date.now() + ms
  let running = pids.filter((pid) => isRunning(pid))
  while (running.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    running = pids.filter((pid) => isRunning(pid))
  }
  return running
}

/**
 * The process ids on the `PIDS` line of `output`, or none while the line is not there yet.
 */
function pidsIn(output: string): number[] {
  const line = /PIDS (\d+) (\d+)/u.exec(output)
  return line === null ? [] : [Number(line[1]), Number(line[2])]
}

/**
 * Starts `command` with `args` and resolves to its output once it has ended, with its exit code.
 */
async function finished(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv },
): Promise<{ readonly code: number | null; readonly output: string }> {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const code = await new Promise<number | null>((resolve) => child.once('close', resolve))
  return { code, output }
}

/**
 * Runs a process that starts the stand-in server through `startDev`, waits until it answers, then
 * ends as `ending` says, or is sent `signal`. Resolves to the process ids of the server and of its
 * helper.
 */
async function runStarter(
  scratch: Scratch,
  ending: 'exit' | 'throw' | 'wait',
  signal?: NodeJS.Signals,
): Promise<number[]> {
  const script = path.join(scratch.directory(), 'start.mjs')
  writeFileSync(
    script,
    [
      `import { startDev } from ${JSON.stringify(NEXT_DEV)}`,
      `const server = await startDev([], ${JSON.stringify(scratch.directory())}, { nextRoot: ${JSON.stringify(scratch.fakeNext())} })`,
      "await server.get('/')",
      'console.log(server.output())',
      `if (${JSON.stringify(ending)} === 'exit') process.exit(0)`,
      `if (${JSON.stringify(ending)} === 'throw') throw new Error('the process ended with an error')`,
      'setInterval(() => {}, 1000)',
      '',
    ].join('\n'),
  )
  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  for (let tries = 0; pidsIn(output).length === 0 && tries < 300; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  const pids = pidsIn(output)
  scratch.track(pids)
  expect(pids, `the server started:\n${output}`).toHaveLength(2)
  if (signal !== undefined) child.kill(signal)
  await exited
  return pids
}

describe('a process that started a server through startDev', () => {
  const scratch = useScratch()

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'leaves neither the server nor its helper running when it is sent %s',
    async (signal) => {
      const pids = await runStarter(scratch, 'wait', signal)

      expect(await untilGone(pids, 10_000)).toEqual([])
    },
  )

  it.each(['exit', 'throw'] as const)(
    'leaves neither the server nor its helper running when it ends by %s',
    async (ending) => {
      const pids = await runStarter(scratch, ending)

      expect(await untilGone(pids, 10_000)).toEqual([])
    },
  )
})

/**
 * The text of a test file, under this package's cleanup, whose first row makes an app, starts the
 * stand-in server and then does `ending`, and whose second row records whether that server is
 * still running.
 */
function leakyFile(scratch: Scratch, ending: 'fails' | 'forgets'): string {
  const dir = scratch.directory()
  return [
    "import { readFileSync, writeFileSync } from 'node:fs'",
    "import { expect, it } from 'vitest'",
    `import { createNextApp } from ${JSON.stringify(NEXT_APP)}`,
    '',
    'const isRunning = (pid: number): boolean => {',
    '  try {',
    '    process.kill(pid, 0)',
    '    return true',
    '  } catch {',
    '    return false',
    '  }',
    '}',
    '',
    "it('makes an app and starts a server', async () => {",
    `  const app = createNextApp(undefined, { nextRoot: ${JSON.stringify(scratch.fakeNext())} })`,
    '  const server = await app.dev([])',
    "  await server.get('/')",
    `  writeFileSync(${JSON.stringify(path.join(dir, 'report.json'))}, JSON.stringify({ top: app.top, output: server.output() }))`,
    `  ${ending === 'fails' ? 'expect(1).toBe(2)' : ''}`,
    '})',
    '',
    "it('finds the server of the row before it gone', async () => {",
    `  const seen = JSON.parse(readFileSync(${JSON.stringify(path.join(dir, 'report.json'))}, 'utf8')) as { output: string }`,
    String.raw`  const pids = [...seen.output.matchAll(/PIDS (\d+) (\d+)/gu)].flatMap((match) => [Number(match[1]), Number(match[2])])`,
    '  // A killed process is gone once its parent has noticed, which takes a few turns.',
    '  for (let tries = 0; tries < 30 && pids.some((pid) => isRunning(pid)); tries += 1) {',
    '    await new Promise((resolve) => setTimeout(resolve, 100))',
    '  }',
    `  writeFileSync(${JSON.stringify(path.join(dir, 'after.json'))}, JSON.stringify({ isGone: pids.length === 2 && pids.every((pid) => !isRunning(pid)) }))`,
    '})',
    '',
  ].join('\n')
}

/**
 * Runs the test file of `leakyFile` with vitest and resolves to what the run left behind.
 */
async function runFile(
  scratch: Scratch,
  ending: 'fails' | 'forgets',
): Promise<{
  readonly code: number | null
  readonly isGone: boolean
  readonly output: string
  readonly pids: number[]
  readonly top: string
}> {
  const dir = scratch.directory()
  writeFileSync(
    path.join(dir, 'vitest.config.mjs'),
    `export default { test: { root: ${JSON.stringify(dir)}, include: ['file.test.ts'], setupFiles: [${JSON.stringify(HOOKS)}], testTimeout: 60000 } }\n`,
  )
  writeFileSync(path.join(dir, 'file.test.ts'), leakyFile(scratch, ending))
  const run = await finished(process.execPath, [VITEST, 'run', '--config', 'vitest.config.mjs'], {
    cwd: dir,
    env: nextEnvironment(),
  })
  const seen = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8')) as {
    output: string
    top: string
  }
  const pids = pidsIn(seen.output)
  scratch.track(pids)
  const after = JSON.parse(readFileSync(path.join(dir, 'after.json'), 'utf8')) as {
    isGone: boolean
  }
  return { ...run, isGone: after.isGone, pids, top: seen.top }
}

describe('a test file that makes an app and starts a server', () => {
  const scratch = useScratch()

  it.each([
    ['an assertion fails', 'fails', 1],
    ['the row ends without stopping anything', 'forgets', 0],
  ] as const)(
    'leaves no app and no server once the file has ended, where %s',
    async (_row, ending, code) => {
      const run = await runFile(scratch, ending)

      expect(run.code, run.output).toBe(code)
      expect(
        run.isGone,
        `the next row finds the server of the row before it gone:\n${run.output}`,
      ).toBe(true)
      expect(existsSync(run.top), 'the app is removed').toBe(false)
      expect(await untilGone(run.pids, 10_000), 'the server and its helper are gone').toEqual([])
    },
    120_000,
  )
})

describe('stopping a server started through startDev', () => {
  const scratch = useScratch()

  it('waits for its workers to finish what they write', async () => {
    const server = await startDev([], scratch.directory(), { nextRoot: scratch.fakeNext() })
    await server.get('/')
    scratch.track(pidsIn(server.output()))

    await server.stop()

    expect(existsSync(path.join(scratch.directory(), 'helper-finished'))).toBe(true)
  })

  it('does nothing the second time: it signals no process', async () => {
    const server = await startDev([], scratch.directory(), { nextRoot: scratch.fakeNext() })
    await server.get('/')
    scratch.track(pidsIn(server.output()))
    await server.stop()
    const kill = vi.spyOn(process, 'kill')

    await server.stop()

    expect(kill).not.toHaveBeenCalled()
    kill.mockRestore()
  })
})

describe('the groups the cleanup tracks', () => {
  // An id no process group has, so nothing real can be signalled by a mistake.
  const GROUP = 2_147_000_000

  it('forgets a group it has signalled: it is not signalled again', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    try {
      trackGroup(GROUP)

      killGroups('SIGKILL')
      killGroups('SIGKILL')

      expect(kill.mock.calls.filter(([pid]) => pid === -GROUP)).toHaveLength(1)
    } finally {
      kill.mockRestore()
      forgetGroup(GROUP)
    }
  })
})

/**
 * The text of a test file, under this package's cleanup, whose server starts once in `beforeAll`
 * and is used by two rows.
 */
function sharedServerFile(scratch: Scratch): string {
  const report = JSON.stringify(path.join(scratch.directory(), 'report.json'))
  return [
    "import { writeFileSync } from 'node:fs'",
    "import { beforeAll, expect, it } from 'vitest'",
    `import { createNextApp } from ${JSON.stringify(NEXT_APP)}`,
    '',
    "let server: Awaited<ReturnType<ReturnType<typeof createNextApp>['dev']>>",
    '',
    'beforeAll(async () => {',
    `  const app = createNextApp(undefined, { nextRoot: ${JSON.stringify(scratch.fakeNext())} })`,
    '  server = await app.dev([])',
    "  await server.get('/')",
    `  writeFileSync(${report}, JSON.stringify({ top: app.top, output: server.output() }))`,
    '})',
    '',
    "it('uses the server', () => {",
    "  expect(server.origin).toContain('http')",
    '})',
    '',
    "it('finds the server of the file still answering', async () => {",
    "  expect((await server.get('/')).status).toBe(200)",
    '})',
    '',
  ].join('\n')
}

describe('a server a file starts for all its rows', () => {
  const scratch = useScratch()

  it('survives the rows, and is gone with the file', async () => {
    const dir = scratch.directory()
    writeFileSync(
      path.join(dir, 'vitest.config.mjs'),
      `export default { test: { root: ${JSON.stringify(dir)}, include: ['file.test.ts'], setupFiles: [${JSON.stringify(HOOKS)}], testTimeout: 60000 } }\n`,
    )
    writeFileSync(path.join(dir, 'file.test.ts'), sharedServerFile(scratch))

    const run = await finished(process.execPath, [VITEST, 'run', '--config', 'vitest.config.mjs'], {
      cwd: dir,
      env: nextEnvironment(),
    })

    const seen = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8')) as {
      output: string
      top: string
    }
    const pids = pidsIn(seen.output)
    scratch.track(pids)
    expect(run.code, run.output).toBe(0)
    expect(existsSync(seen.top), 'the app is removed').toBe(false)
    expect(await untilGone(pids, 10_000), 'the server and its helper are gone').toEqual([])
  }, 120_000)
})
