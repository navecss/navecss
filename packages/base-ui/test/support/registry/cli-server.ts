/**
 * A static file server on 127.0.0.1 for the address criteria: it answers `GET /<file>` from one
 * directory and ignores the query string (the CLI asks for `registry.json?limit=100&offset=0`).
 */
import type { AddressInfo } from 'node:net'

import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'

export interface StaticServer {
  readonly close: () => Promise<void>
  readonly port: number
  /**
  The request paths served so far, query strings left off.
   */
  readonly requests: string[]
}

const pathOf = (url: string | undefined): string => (url ?? '/').split('?', 1)[0] ?? '/'

/**
 * The files of the served directory by name, listed once. A request is answered only from this
 * map, so nothing in a request path is ever used to build a path on disk.
 */
const filesOf = (directory: string): Map<string, string> =>
  new Map(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name, path.join(directory, entry.name)] as const),
  )

const fileFor = (files: ReadonlyMap<string, string>, url: string | undefined): string | undefined =>
  files.get(decodeURIComponent(pathOf(url)).replace(/^\/+/, ''))

export const serveDirectory = (directory: string): Promise<StaticServer> =>
  new Promise((resolve, reject) => {
    const requests: string[] = []
    const files = filesOf(directory)
    const server = createServer((request, response) => {
      requests.push(pathOf(request.url))
      const file = fileFor(files, request.url)
      if (file === undefined || request.method !== 'GET') {
        response.statusCode = 404
        response.end('not found')
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(readFileSync(file))
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve({
        close: async () => {
          server.closeAllConnections()
          await promisify(server.close.bind(server))()
        },
        port: (server.address() as AddressInfo).port,
        requests,
      })
    })
  })
