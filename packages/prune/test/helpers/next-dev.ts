/**
 * A running `next dev`, driven over HTTP and stopped by its process group's id.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'

import { forgetGroup, isGroupRunning, signalGroup, trackGroup } from './leftovers.ts'
import { nextCommand, nextEnvironment, pause } from './next-process.ts'

const STYLESHEET_LINK = /<link[^>]+href="([^"]+\.css[^"]*)"/g

export interface DevServer {
  /**
   * The server's origin, such as `http://127.0.0.1:3000`.
   */
  readonly origin: string
  /**
   * What the server printed so far.
   */
  readonly output: () => string
  /**
   * Requests `route` and returns the response's text, waiting until the server answers.
   */
  readonly get: (route: string) => Promise<{ readonly status: number; readonly text: string }>
  /**
   * The CSS the page at `route` links, concatenated.
   */
  readonly css: (route: string) => Promise<string>
  /**
   * Requests `route` again until the CSS it links holds `text`, or until the server is stopped,
   * with no time limit of its own: the test's timeout bounds it.
   */
  readonly untilCss: (route: string, text: string) => Promise<void>
  /**
   * Stops the server by its process group's id. Stopping it again does nothing.
   */
  readonly stop: () => Promise<void>
}

/**
 * A free TCP port on the loopback interface.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address !== null) resolve(address.port)
        else reject(new Error('no port'))
      })
    })
  })
}

/**
 * Stops the server by its process group's id, waiting for it to exit, then stops what its workers
 * left running. Stopping it again does nothing.
 */
async function stopGroup(child: ChildProcess, exited: Promise<void>): Promise<void> {
  if (child.pid === undefined) return
  if (child.exitCode === null) {
    signalGroup(child.pid, 'SIGTERM')
    await exited
  }
  // The workers `next` starts got the same signal and need a moment to finish what they write;
  // what is still running after that is stopped.
  for (let tries = 0; isGroupRunning(child.pid) && tries < 50; tries += 1) await pause(100)
  signalGroup(child.pid, 'SIGKILL')
  forgetGroup(child.pid)
}

/**
 * Starts `next dev` (or `next start`, for a built app) with `args` in `cwd`, on a free port, with
 * the `next` installed at `nextRoot` or the workspace's.
 */
export async function startDev(
  args: readonly string[],
  cwd: string,
  options: { readonly command?: 'dev' | 'start'; readonly nextRoot?: string } = {},
): Promise<DevServer> {
  const { command = 'dev', nextRoot } = options
  const port = await freePort()
  const child = spawn(
    process.execPath,
    nextCommand([command, ...args, '--port', String(port)], nextRoot),
    {
      cwd,
      env: nextEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so the server and the workers it starts stop together.
      detached: true,
    },
  )
  // Stopped with this process, whatever ends it.
  if (child.pid !== undefined) trackGroup(child.pid)
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  let isStopped = false
  const get = async (route: string): Promise<{ status: number; text: string }> => {
    for (;;) {
      if (child.exitCode !== null) throw new Error(`next dev exited:\n${output}`)
      try {
        const response = await fetch(`http://127.0.0.1:${port}${route}`)
        return { status: response.status, text: await response.text() }
      } catch {
        await pause(250)
      }
    }
  }
  const css = async (route: string): Promise<string> => {
    const page = await get(route)
    const hrefs = page.text
      .matchAll(STYLESHEET_LINK)
      .map((match) => match[1]!)
      .toArray()
    const sheets = await Promise.all(hrefs.map((href) => get(href)))
    return sheets.map((sheet) => sheet.text).join('\n')
  }
  const untilCss = async (route: string, text: string): Promise<void> => {
    while (!isStopped) {
      const served = await css(route)
      if (served.includes(text)) return
      await pause(1000)
    }
  }
  const stop = async (): Promise<void> => {
    isStopped = true
    await stopGroup(child, exited)
  }
  return { origin: `http://127.0.0.1:${port}`, output: () => output, get, css, untilCss, stop }
}
