/**
 * A static file server on 127.0.0.1 for the address criteria: it answers `GET /<file>` from one
 * directory and ignores the query string (the CLI asks for `registry.json?limit=100&offset=0`).
 */
import type { AddressInfo } from 'node:net'

import { existsSync, readFileSync, statSync } from 'node:fs'
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

const fileFor = (directory: string, url: string | undefined): string | undefined => {
  const name = decodeURIComponent(pathOf(url)).replace(/^\/+/, '')
  const file = path.join(directory, name)
  const isInside = !path.relative(directory, file).startsWith('..')
  return isInside && existsSync(file) && statSync(file).isFile() ? file : undefined
}

export const serveDirectory = (directory: string): Promise<StaticServer> =>
  new Promise((resolve, reject) => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(pathOf(request.url))
      const file = fileFor(directory, request.url)
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
