/**
 * The Vite fixtures claim to run on two Vites: the floor the README states and the newest 8.x. A
 * leg whose label names a version it does not run measures nothing, so a dependency bump that
 * moves the floor leg is caught here rather than in the README.
 */
import { describe, expect, it } from 'vitest'
import { VITE_APIS } from './helpers/vite-app.ts'

const FLOOR = '8.2.1'
const NEWEST = 'newest 8.x'

describe('the Vite fixture legs', () => {
  it('runs the floor leg on the Vite its label names', () => {
    expect(VITE_APIS[FLOOR]?.version).toBe(FLOOR)
  })

  it('runs the newest leg on an 8.x that is not older than the floor', () => {
    const version = VITE_APIS[NEWEST]?.version ?? ''
    expect(version).toMatch(/^8\./)
    expect(version.localeCompare(FLOOR, 'en', { numeric: true })).toBeGreaterThanOrEqual(0)
  })
})
