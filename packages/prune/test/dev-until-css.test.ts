/**
 * `untilCss` waits for a dev server to serve a stylesheet holding some text. A watcher event lost
 * on a busy machine means the server never sees an edit, so the wait writes the file again every
 * tenth check, and it ends with the server's output once its deadline is up. The server here is a
 * stand-in `next` that serves one page linking one stylesheet, which holds `.nave-grid` once the
 * file `writes.log` has as many lines as `writes-needed` says.
 */
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startDev } from './helpers/next-dev.ts'

const STAND_IN_SOURCE = [
  "const fs = require('node:fs')",
  "const http = require('node:http')",
  "const path = require('node:path')",
  "const port = Number(process.argv[process.argv.indexOf('--port') + 1])",
  'const lines = (name) => {',
  '  try {',
  String.raw`    return fs.readFileSync(path.join(process.cwd(), name), 'utf8').split('\n').filter(Boolean).length`,
  '  } catch {',
  '    return 0',
  '  }',
  '}',
  'http.createServer((request, response) => {',
  "  if (request.url === '/') {",
  '    response.end(\'<link rel="stylesheet" href="/app.css">\')',
  '    return',
  '  }',
  String.raw`  fs.appendFileSync(path.join(process.cwd(), 'css-requests.log'), 'request\n')`,
  "  const needed = Number(fs.readFileSync(path.join(process.cwd(), 'writes-needed'), 'utf8'))",
  "  response.end(lines('writes.log') >= needed ? '.nave-grid{}' : '.nave-flex{}')",
  "}).listen(port, '127.0.0.1', () => console.log('stand-in next is listening'))",
  '',
].join('\n')

interface Scratch {
  /**
   * The directory the stand-in runs in, holding its settings and logs.
   */
  readonly directory: () => string
  /**
   * The directory of the stand-in `next` package.
   */
  readonly nextRoot: () => string
}

/**
 * A scratch directory per row holding the stand-in `next`, removed after the row.
 */
function useScratch(): Scratch {
  let directory = ''
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-until-css-'))
    directory = realpathSync(made)
    mkdirSync(path.join(directory, 'next/dist/bin'), { recursive: true })
    writeFileSync(path.join(directory, 'next/dist/bin/next'), STAND_IN_SOURCE)
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))
  return { directory: () => directory, nextRoot: () => path.join(directory, 'next') }
}

describe('untilCss', () => {
  const scratch = useScratch()

  /**
   * Starts the stand-in, which serves the text once the watched file has been written `needed` times.
   */
  async function startStandIn(needed: number): Promise<Awaited<ReturnType<typeof startDev>>> {
    writeFileSync(path.join(scratch.directory(), 'writes-needed'), String(needed))
    return startDev([], scratch.directory(), { nextRoot: scratch.nextRoot() })
  }

  /**
   * Notes a write of the watched file, the way a test that edits a file would make one.
   */
  const noteWrite = (): void => {
    appendFileSync(path.join(scratch.directory(), 'writes.log'), 'write\n')
  }

  /**
   * How many times the stylesheet has been requested.
   */
  const requests = (): number => {
    const log = readFileSync(path.join(scratch.directory(), 'css-requests.log'), 'utf8')
    return log.split('\n').filter(Boolean).length
  }

  it('writes the file again every tenth check, so a lost event does not stop it', async () => {
    const server = await startStandIn(3)
    const requestsAtRewrite: number[] = []
    noteWrite()

    await server.untilCss('/', '.nave-grid', {
      intervalMs: 20,
      rewrite: () => {
        noteWrite()
        requestsAtRewrite.push(requests())
      },
    })

    expect(requestsAtRewrite).toEqual([10, 20])
    await server.stop()
  }, 20_000)

  it('fails at its deadline with what the server printed, when the text never comes', async () => {
    const server = await startStandIn(999)
    noteWrite()

    const waiting = server.untilCss('/', '.nave-grid', { deadlineMs: 1500, intervalMs: 50 })

    await expect(waiting).rejects.toThrow(/within 1500 ms[\s\S]*stand-in next is listening/u)
    await server.stop()
  }, 20_000)
})
