/**
 * The positive control for "offline": the same preload the CLI runs under is applied to a plain
 * `node`, which must lose its public connections and keep its loopback ones. A run that is offline
 * only because the machine is would pass any check on the CLI, so the control shows the preload is
 * what refuses: it names what it refused, and a target reachable on this machine is refused by name.
 */
import type { AddressInfo } from 'node:net'

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { inheritedPath, OFFLINE_PRELOAD } from './cli-run.ts'

const exec = promisify(execFile)

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli-offline-probe-child.mjs')

export type Answer = 'answered' | 'refused'

export interface Reach {
  readonly fetchLoopback: Answer
  readonly fetchReachable: Answer
  readonly httpReachable: Answer
  readonly socketReachable: Answer
}

export interface PublicFetch {
  /**
  Whether `node -e "await fetch('https://example.com')"` exited non-zero.
   */
  readonly didFail: boolean
  /**
  What the preload logged as refused.
   */
  readonly refused: string[]
}

const withLoopbackServer = async <T>(use: (port: number) => Promise<T>): Promise<T> => {
  const server = createServer((_request, response) => {
    response.end('ok')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await use((server.address() as AddressInfo).port)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

const reach = (nodeOptions: string): Promise<Reach> =>
  withLoopbackServer(async (port) => {
    const { stdout } = await exec(process.execPath, [CHILD, String(port)], {
      env: { ...inheritedPath(), NODE_OPTIONS: nodeOptions },
    })
    return JSON.parse(stdout) as Reach
  })

const PRELOAD_OPTIONS = `--import ${OFFLINE_PRELOAD}`

/**
 * What a plain `node` reaches with nothing preloaded: the targets are there to be reached.
 */
export const reachWithoutPreload = (): Promise<Reach> => reach('')

/**
 * What the same `node` reaches under the preload the CLI runs under.
 */
export const reachUnderPreload = (): Promise<Reach> => reach(PRELOAD_OPTIONS)

/**
 * `node -e "await fetch('https://example.com')"` under the preload.
 */
export const publicFetchUnderPreload = async (): Promise<PublicFetch> => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nave-offline-'))
  const log = path.join(directory, 'refused')
  try {
    let didFail = false
    try {
      await exec(
        process.execPath,
        ['--input-type=module', '-e', "await fetch('https://example.com')"],
        {
          env: { ...inheritedPath(), NAVE_OFFLINE_LOG: log, NODE_OPTIONS: PRELOAD_OPTIONS },
        },
      )
    } catch {
      didFail = true
    }
    const refused = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
    return { didFail, refused }
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}
