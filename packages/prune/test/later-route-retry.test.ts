import { spawnSync } from 'node:child_process'
/**
 * The Turbopack pages row runs again, once and from a fresh app, when its wait ends with `/later`
 * answering 404, which is Next.js not building the route, and after nothing else: a route that
 * serves without its atom, or any other red, fails at once. The dev server here is a stand-in
 * whose answers each attempt scripts.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RETRY_ON_ROUTE_NOT_BUILT, untilLaterRouteGrid } from './helpers/later-route.ts'
import { PACKAGE_ROOT } from './helpers/next-process.ts'

const HELPER = path.join(import.meta.dirname, 'helpers/later-route.ts')
const VITEST = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs')

describe('the retry of the pages row', () => {
  let directory = ''
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-later-retry-'))
    directory = realpathSync(made)
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  /**
   * Runs one row under the retry of the helper, against a stand-in dev server. Each attempt takes
   * the next of `attempts`: how the wait ends (`late`, or `green`) and what `/later` answers.
   * Resolves to the run's output, its exit code and how many attempts the row made.
   */
  function run(attempts: readonly { readonly ends: 'green' | 'late'; readonly later: string }[]): {
    readonly attempts: number
    readonly code: number | null
    readonly output: string
  } {
    const log = path.join(directory, 'attempts.log')
    const script = path.join(directory, 'script.json')
    writeFileSync(script, JSON.stringify(attempts))
    writeFileSync(
      path.join(directory, 'vitest.config.mjs'),
      "export default { test: { include: ['file.test.ts'], reporters: ['verbose'] } }\n",
    )
    writeFileSync(
      path.join(directory, 'file.test.ts'),
      [
        "import { appendFileSync, readFileSync } from 'node:fs'",
        "import { it } from 'vitest'",
        `import { RETRY_ON_ROUTE_NOT_BUILT, untilLaterRouteGrid } from ${JSON.stringify(HELPER)}`,
        '',
        "it('the row', { retry: RETRY_ON_ROUTE_NOT_BUILT }, async () => {",
        `  appendFileSync(process.env.ATTEMPTS_LOG, 'x')`,
        `  const attempt = readFileSync(process.env.ATTEMPTS_LOG, 'utf8').length - 1`,
        `  const step = JSON.parse(readFileSync(process.env.ATTEMPTS_SCRIPT, 'utf8'))[attempt]`,
        '  const server = {',
        '    untilCss: async () => {',
        "      if (step.ends === 'late') throw new Error('/ did not serve CSS holding .nave-grid within 240000 ms:')",
        '    },',
        '    get: async () => {',
        "      if (step.later === 'unreachable') throw new Error('the server ended')",
        "      return { status: step.later === '404' ? 404 : 200, text: step.later === 'bare' ? '<p>no atom</p>' : '' }",
        '    },',
        '  }',
        '  await untilLaterRouteGrid(server, () => {})',
        '})',
        '',
      ].join('\n'),
    )
    const result = spawnSync(process.execPath, [VITEST, 'run', '--config', 'vitest.config.mjs'], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, ATTEMPTS_LOG: log, ATTEMPTS_SCRIPT: script },
    })
    return {
      attempts: readFileSync(log, 'utf8').length,
      code: result.status,
      output: `${result.stdout}\n${result.stderr}`,
    }
  }

  it('passes a row whose first attempt left /later unbuilt and whose retry is green, and names it', () => {
    const outcome = run([
      { ends: 'late', later: '404' },
      { ends: 'green', later: '404' },
    ])

    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.attempts).toBe(2)
    expect(outcome.output).toContain('ended with Next.js not building /later')
  })

  it('fails a row that serves /later without its atom after one attempt', () => {
    const outcome = run([
      { ends: 'late', later: 'bare' },
      { ends: 'green', later: 'bare' },
    ])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(1)
  })

  it('fails a row whose wait ended and whose /later cannot be asked after one attempt', () => {
    const outcome = run([
      { ends: 'late', later: 'unreachable' },
      { ends: 'green', later: 'unreachable' },
    ])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(1)
  })

  it('runs the row once more and no more when the retry leaves /later unbuilt too', () => {
    const outcome = run([
      { ends: 'late', later: '404' },
      { ends: 'late', later: '404' },
      { ends: 'green', later: '404' },
    ])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(2)
  })
})

/**
 * A server whose wait writes the route again `times` times and then gives up.
 */
const givingUpAfter = (times: number): Parameters<typeof untilLaterRouteGrid>[0] => ({
  untilCss: (_url, _selector, options) => {
    for (let write = 0; write < times; write += 1) options?.rewrite?.()
    return Promise.reject(new Error('/ did not serve CSS holding .nave-grid within 240000 ms:'))
  },
  get: () => Promise.resolve({ status: 200, text: 'nave-grid' }),
})

const failureOf = async (
  server: Parameters<typeof untilLaterRouteGrid>[0],
  options?: Parameters<typeof untilLaterRouteGrid>[2],
  rewrite: () => void = () => {},
): Promise<string> => {
  try {
    await untilLaterRouteGrid(server, rewrite, options)
  } catch (error) {
    return (error as Error).message
  }
  return 'it did not fail'
}

const failingWrite = (): void => {
  throw new Error('the write failed')
}

describe('the diagnostic of the pages row', () => {
  it('gives up on a server that is alive and answers nothing, and that is not the 404 case', async () => {
    const server = {
      untilCss: () =>
        Promise.reject(new Error('/ did not serve CSS holding .nave-grid within 240000 ms:')),
      get: () => new Promise<{ readonly status: number; readonly text: string }>(() => {}),
    }

    let failure = 'it did not fail'
    try {
      await untilLaterRouteGrid(server, () => {}, { requestMs: 300 })
    } catch (error) {
      failure = (error as Error).message
    }

    expect(failure).toContain('/later did not answer within 300 ms')
    expect(RETRY_ON_ROUTE_NOT_BUILT.condition.test(failure)).toBe(false)
  }, 5000)

  it('says how many times the wait wrote the route again', async () => {
    expect(await failureOf(givingUpAfter(3))).toContain('The wait wrote the route again 3 times.')
    expect(await failureOf(givingUpAfter(1))).toContain('The wait wrote the route again once.')
    expect(await failureOf(givingUpAfter(0))).toContain('The wait wrote the route again 0 times.')
  })

  it('adds what the row does each time it writes the route again', async () => {
    expect(
      await failureOf(givingUpAfter(2), { rewriteDetail: ' (removing pages/ first)' }),
    ).toContain('The wait wrote the route again 2 times (removing pages/ first).')
  })

  it('counts a rewrite that threw', async () => {
    expect(await failureOf(givingUpAfter(1), undefined, failingWrite)).toContain(
      'The wait wrote the route again once.',
    )
  })

  it('calls the rewrite of the row each time the wait writes the route again', async () => {
    const rewrite = vi.fn()
    await untilLaterRouteGrid(
      {
        untilCss: (_url, _selector, options) => {
          options?.rewrite?.()
          options?.rewrite?.()
          return Promise.resolve()
        },
        get: () => Promise.resolve({ status: 200, text: 'nave-grid' }),
      },
      rewrite,
    )
    expect(rewrite).toHaveBeenCalledTimes(2)
  })
})
