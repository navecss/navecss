/**
 * The environment the real-build helper runs `next` with: none of the test runner's own
 * variables, and no `TURBOPACK`, which Next.js sets itself for the bundler it runs. An empty
 * `TURBOPACK` left in place would survive `next build --turbopack` and tell the PostCSS worker it
 * is not on Turbopack.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nextEnvironment } from './helpers/next-process.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the environment next runs with in the real-build rows', () => {
  it.each([
    ['empty', ''],
    ['set', '1'],
  ])('holds no TURBOPACK when the test process has it %s', (_case, value) => {
    vi.stubEnv('TURBOPACK', value)
    expect(Object.hasOwn(nextEnvironment(), 'TURBOPACK')).toBe(false)
  })

  it('holds none of the test runner variables, and turns telemetry off', () => {
    vi.stubEnv('VITEST', 'true')
    vi.stubEnv('NODE_ENV', 'test')
    const env = nextEnvironment()
    expect(env.VITEST).toBeUndefined()
    expect(env.NODE_ENV).toBeUndefined()
    expect(env.NEXT_TELEMETRY_DISABLED).toBe('1')
  })
})
