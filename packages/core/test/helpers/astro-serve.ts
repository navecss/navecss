import type { AddressInfo } from 'node:net'

/**
 * Serves a scratch Astro project (`astro-app.ts`) that `astro-build.ts` built: the standalone Node
 * server of a server build, Astro's own `preview()` of a static one, and Astro's dev server.
 */
import { dev as astroDev, preview as astroPreview } from 'astro'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'

import type { AstroApp } from './astro-app.ts'
import type { AstroBuilt, PageStyle } from './astro-build.ts'

import { disableTelemetry, prerenderedHtml, stylesOf } from './astro-build.ts'

export interface Served {
  readonly url: string
  /**
   * The text of `route`, fetched from the server.
   */
  text(route: string): Promise<string>
  stop(): Promise<void>
}

/**
 * Starts the standalone Node server a server build wrote, on a free port, and resolves once it
 * listens.
 */
export async function serveServerBuild(app: AstroApp): Promise<Served> {
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(app.root, 'dist', 'server', 'entry.mjs')], {
    cwd: app.root,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let printed = ''
  child.stdout.on('data', (chunk: Buffer) => {
    printed += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    printed += chunk.toString()
  })
  const url = `http://127.0.0.1:${port}`
  for (let waited = 0; waited < 20_000; waited += 100) {
    if (child.exitCode !== null) throw new Error(`the server exited: ${printed}`)
    try {
      await fetch(url)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  return {
    url,
    text: async (route) => {
      const response = await fetch(`${url}${route}`)
      return response.text()
    },
    stop: async () => {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    },
  }
}

/**
 * A port nothing listens on.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

/**
 * The stylesheets holding the atomic layer that `routes` load, with the route each came from, in
 * document order. A static project is read from the prerendered pages; a server project is
 * started, and each route is fetched from it.
 */
export async function layerStylesOfRoutes(
  app: AstroApp,
  built: AstroBuilt,
  routes: readonly string[],
): Promise<Record<string, PageStyle[]>> {
  const result: Record<string, PageStyle[]> = {}
  const server = app.settings.server === true ? await serveServerBuild(app) : undefined
  try {
    for (const route of routes) {
      const html = server ? await server.text(route) : prerenderedHtml(built, route)
      result[route] = stylesOf(built, html).filter((style) => style.css.includes('@layer atomic'))
    }
  } finally {
    await server?.stop()
  }
  return result
}

export interface Running {
  readonly url: string
  stop(): Promise<void>
}

/**
 * Serves a static build with Astro's own `preview()`.
 */
export async function previewStatic(app: AstroApp): Promise<Running> {
  disableTelemetry()
  const server = await astroPreview({
    root: app.root,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  })
  return {
    url: `http://${server.host ?? '127.0.0.1'}:${server.port}`,
    stop: () => server.stop(),
  }
}

/**
 * Serves the project with Astro's dev server, in this process.
 */
export async function serveDev(app: AstroApp): Promise<Running> {
  disableTelemetry()
  // The test runner marks the process as a test, under which Astro's dev server answers nothing.
  const kept = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name === 'NODE_ENV' || name.startsWith('VITEST'),
    ),
  )
  for (const name of Object.keys(kept)) delete process.env[name]
  try {
    const server = await astroDev({
      root: app.root,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    })
    return {
      url: `http://127.0.0.1:${server.address.port}`,
      stop: () => server.stop(),
    }
  } finally {
    Object.assign(process.env, kept)
  }
}
