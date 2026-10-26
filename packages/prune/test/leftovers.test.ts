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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { nextEnvironment, PACKAGE_ROOT } from './helpers/next-process.ts'

const HELPERS = path.join(import.meta.dirname, 'helpers')
const NEXT_DEV = pathToFileURL(path.join(HELPERS, 'next-dev.ts')).href
const NEXT_APP = pathToFileURL(path.join(HELPERS, 'next-app.ts')).href
const HOOKS = path.join(HELPERS, 'leftovers-hooks.ts')
const VITEST = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs')

let scratch = ''
let fakeNext = ''
const started: number[] = []

/**
 * The stand-in `next`: it listens on `--port`, starts a helper that outlives nothing but its
 * group, and prints both process ids.
 */
function writeFakeNext(root: string): void {
  const bin = path.join(root, 'dist/bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    path.join(bin, 'next'),
    [
      "const { spawn } = require('node:child_process')",
      "const http = require('node:http')",
      "const port = Number(process.argv[process.argv.indexOf('--port') + 1])",
      "const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
      "http.createServer((_, res) => res.end('ok')).listen(port, '127.0.0.1', () => {",
      '  console.log(`PIDS ${process.pid} ${helper.pid}`)',
      '})',
      '',
    ].join('\n'),
  )
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
 * Waits until none of `pids` is running, for at most `ms`.
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

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'prune-leftovers-')))
  fakeNext = path.join(scratch, 'node_modules/next')
  writeFakeNext(fakeNext)
})

afterEach(() => {
  // Whatever a row left running is stopped here, so a failing row does not leak into the next.
  for (const pid of started.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  rmSync(scratch, { recursive: true, force: true })
})

describe('a process that started a server through startDev', () => {
  /**
   * Runs a process that starts the stand-in server, waits until it answers, then ends as `ending`
   * says. Resolves to the server's and its helper's process ids and how the process ended.
   */
  async function runStarter(ending: 'exit' | 'throw' | 'wait', signal?: NodeJS.Signals) {
    const script = path.join(scratch, 'start.mjs')
    writeFileSync(
      script,
      [
        `import { startDev } from ${JSON.stringify(NEXT_DEV)}`,
        `const server = await startDev([], ${JSON.stringify(scratch)}, { nextRoot: ${JSON.stringify(fakeNext)} })`,
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
    started.push(...pids)
    expect(pids, `the server started:\n${output}`).toHaveLength(2)
    if (signal !== undefined) child.kill(signal)
    await exited
    return pids
  }

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'leaves neither the server nor its helper running when it is sent %s',
    async (signal) => {
      const pids = await runStarter('wait', signal)

      expect(await untilGone(pids, 10_000)).toEqual([])
    },
  )

  it.each(['exit', 'throw'] as const)(
    'leaves neither the server nor its helper running when it ends by %s',
    async (ending) => {
      const pids = await runStarter(ending)

      expect(await untilGone(pids, 10_000)).toEqual([])
    },
  )
})

describe('a test file that makes an app and starts a server', () => {
  /**
   * Runs one test file, under this package's cleanup, whose single row makes an app, starts the
   * stand-in server and then does `ending`. Resolves to the app's directory, the processes it
   * started and the run's exit code.
   */
  async function runFile(ending: 'fails' | 'forgets') {
    const report = path.join(scratch, 'report.json')
    writeFileSync(
      path.join(scratch, 'vitest.config.mjs'),
      `export default { test: { root: ${JSON.stringify(scratch)}, include: ['file.test.ts'], setupFiles: [${JSON.stringify(HOOKS)}], testTimeout: 60000 } }\n`,
    )
    writeFileSync(
      path.join(scratch, 'file.test.ts'),
      [
        "import { writeFileSync } from 'node:fs'",
        "import { expect, it } from 'vitest'",
        `import { createNextApp } from ${JSON.stringify(NEXT_APP)}`,
        "it('makes an app and starts a server', async () => {",
        `  const app = createNextApp(undefined, { nextRoot: ${JSON.stringify(fakeNext)} })`,
        '  const server = await app.dev([])',
        "  await server.get('/')",
        `  writeFileSync(${JSON.stringify(report)}, JSON.stringify({ top: app.top, output: server.output() }))`,
        `  ${ending === 'fails' ? 'expect(1).toBe(2)' : ''}`,
        '})',
        '',
      ].join('\n'),
    )
    const child = spawn(process.execPath, [VITEST, 'run', '--config', 'vitest.config.mjs'], {
      cwd: scratch,
      env: nextEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    const code = await new Promise<number | null>((resolve) => child.once('close', resolve))
    const seen = JSON.parse(readFileSync(report, 'utf8')) as { top: string; output: string }
    const pids = pidsIn(seen.output)
    started.push(...pids)
    return { code, output, pids, top: seen.top }
  }

  it.each([
    ['an assertion fails', 'fails', 1],
    ['the row ends without stopping anything', 'forgets', 0],
  ] as const)(
    'leaves no app and no server once the file has ended, where %s',
    async (_row, ending, code) => {
      const run = await runFile(ending)

      expect(run.code, run.output).toBe(code)
      expect(existsSync(run.top), 'the app is removed').toBe(false)
      expect(await untilGone(run.pids, 10_000), 'the server and its helper are gone').toEqual([])
    },
    120_000,
  )
})
