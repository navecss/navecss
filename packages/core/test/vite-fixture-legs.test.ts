/**
 * The Vite fixtures claim to run on two Vites: the floor the README states and the newest 8.x. A
 * leg whose label names a version it does not run measures nothing, so a dependency bump that
 * moves the floor leg is caught here, and the README's stated floor is pinned to it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as viteNewest from 'vite'
import * as viteFloor from 'vite-floor'
import { describe, expect, it } from 'vitest'

import { VITE_APIS } from './helpers/vite-app.ts'

const FLOOR = '8.2.1'
const NEWEST = 'newest 8.x'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readme = readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>
}

describe('the Vite fixture legs', () => {
  it('runs the floor leg on the Vite its label names', () => {
    expect(VITE_APIS[FLOOR]?.version).toBe(FLOOR)
  })

  it('runs the newest leg on an 8.x newer than the floor, so the two legs are two Vites', () => {
    const version = VITE_APIS[NEWEST]?.version ?? ''

    expect(
      version,
      'the README promises 8.x; a new major needs the floor and the README decided first',
    ).toMatch(/^8\./)
    expect(version.localeCompare(FLOOR, 'en', { numeric: true })).toBeGreaterThan(0)
  })

  it('wires each leg to the functions of the Vite it reports', () => {
    expect(VITE_APIS[FLOOR]?.build).toBe(viteFloor.build)
    expect(VITE_APIS[FLOOR]?.createBuilder).toBe(viteFloor.createBuilder)
    expect(VITE_APIS[FLOOR]?.createServer).toBe(viteFloor.createServer)
    expect(VITE_APIS[NEWEST]?.build).toBe(viteNewest.build)
    expect(VITE_APIS[NEWEST]?.createBuilder).toBe(viteNewest.createBuilder)
    expect(VITE_APIS[NEWEST]?.createServer).toBe(viteNewest.createServer)
  })

  it('is the floor the README states, from an alias pinned to exactly that version', () => {
    // README: "the fixtures run on Vite <floor> and on the newest 8.x at the time of each release"
    const stated = /fixtures run on Vite (\d+\.\d+\.\d+) and on the\s+newest 8\.x/.exec(readme)?.[1]

    expect(
      stated,
      'packages/core/README.md must say "the fixtures run on Vite X.Y.Z and on the newest 8.x"',
    ).toBe(FLOOR)
    expect(manifest.devDependencies['vite-floor']).toBe(`npm:vite@${FLOOR}`)
  })
})
