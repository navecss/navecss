import { spawnSync } from 'node:child_process'
/**
 * The dev row's first load: a page that answers 500 ends the attempt at once, with the server's
 * output, instead of the wait for a stylesheet an error page cannot link. The row runs again,
 * once and from a fresh app, when the server printed one of the two errors Next.js raises on
 * finding one of its manifests empty (`Unexpected end of JSON input` and `Manifest file is empty`,
 * seen on 16.2.0 with webpack) and after nothing else. The page here is a stand-in whose answers
 * each attempt scripts.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openPage, RETRY_ON_MANIFEST_READ } from './helpers/dev-error-page.ts'
import { PACKAGE_ROOT } from './helpers/next-process.ts'

const HELPER = path.join(import.meta.dirname, 'helpers/dev-error-page.ts')
const VITEST = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs')
const JSON_READ = '⨯ SyntaxError: Unexpected end of JSON input\n    at JSON.parse (<anonymous>)'
const MANIFEST_EMPTY =
  "⨯ Error: Manifest file is empty\n    at ignore-listed frames {\n  page: '/'\n}"
const URL = 'http://localhost:3000/'

interface Attempt {
  readonly status: number
  readonly printed: string
}

/**
 * What `openPage` throws for an answer, or `undefined` when it does not throw.
 */
async function failureOf({ status, printed }: Attempt): Promise<string | undefined> {
  // The server prints while it answers the request: nothing before it.
  let isAnswered = false
  const page = {
    goto: () => {
      isAnswered = true
      return Promise.resolve({ status: () => status })
    },
  }
  try {
    // The stand-in holds what the row reads of a page.
    await openPage(page as never, URL, () => (isAnswered ? printed : ''))
  } catch (error) {
    return (error as Error).message
  }
  return undefined
}

describe('the first load of the dev row', () => {
  it('AC-nextjs-used-atoms-05: ends at once on a 500, naming the address and the server output', async () => {
    const failure = await failureOf({ status: 500, printed: 'GET / 500 in 3.1s' })

    expect(failure).toContain(`${URL} answered 500`)
    expect(failure).toContain('GET / 500 in 3.1s')
  })

  it('AC-nextjs-used-atoms-05: lets a page that answers 200 through', async () => {
    expect(await failureOf({ status: 200, printed: '' })).toBeUndefined()
  })

  it('AC-nextjs-used-atoms-05: names the truncated JSON read when the server printed it, and only then', async () => {
    const read = await failureOf({ status: 500, printed: JSON_READ })
    const other = await failureOf({ status: 500, printed: 'Error: something else' })

    expect(RETRY_ON_MANIFEST_READ.condition.test(read ?? '')).toBe(true)
    expect(RETRY_ON_MANIFEST_READ.condition.test(other ?? '')).toBe(false)
  })

  it('AC-nextjs-used-atoms-05: reads only what the server printed during the request, not the log before it', async () => {
    let log = JSON_READ
    const page = {
      goto: () => {
        log += '\nGET / 500 in 3.1s'
        return Promise.resolve({ status: () => 500 })
      },
    }
    let failure = 'it did not fail'
    try {
      await openPage(page as never, URL, () => log)
    } catch (error) {
      failure = (error as Error).message
    }

    expect(failure).toContain(`${URL} answered 500,`)
    expect(RETRY_ON_MANIFEST_READ.condition.test(failure)).toBe(false)
  })

  it('AC-nextjs-used-atoms-05: names the empty manifest read when the server printed it, and says which one it was', async () => {
    const failure = await failureOf({ status: 500, printed: MANIFEST_EMPTY })

    expect(RETRY_ON_MANIFEST_READ.condition.test(failure ?? '')).toBe(true)
    expect(failure).toContain('Next.js printed "Manifest file is empty"')
  })

  it('AC-nextjs-used-atoms-05: does not name a SyntaxError that is not the truncated JSON read', async () => {
    const position = await failureOf({
      status: 500,
      printed:
        "⨯ SyntaxError: Unexpected token '}' in JSON at position 3\n    at JSON.parse (<anonymous>)",
    })
    const token = await failureOf({ status: 500, printed: "⨯ SyntaxError: Unexpected token '<'" })

    expect(RETRY_ON_MANIFEST_READ.condition.test(position ?? '')).toBe(false)
    expect(RETRY_ON_MANIFEST_READ.condition.test(token ?? '')).toBe(false)
  })

  it('AC-nextjs-used-atoms-05: ends at once on a 503 or a 502, like a 500', async () => {
    const unavailable = await failureOf({ status: 503, printed: 'GET / 503 in 1s' })
    const gateway = await failureOf({ status: 502, printed: 'GET / 502 in 1s' })

    expect(unavailable).toContain(`${URL} answered 503`)
    expect(gateway).toContain(`${URL} answered 502`)
  })

  it('AC-nextjs-used-atoms-05: lets a page that answers 404 through, which is not a server error', async () => {
    expect(await failureOf({ status: 404, printed: 'GET / 404 in 1s' })).toBeUndefined()
  })

  it('AC-nextjs-used-atoms-05: reports a 503 that follows a manifest read as a 503 and does not retry it', async () => {
    const failure = await failureOf({ status: 503, printed: MANIFEST_EMPTY })

    expect(failure).toContain(`${URL} answered 503`)
    expect(failure).not.toContain('answered 500')
    expect(RETRY_ON_MANIFEST_READ.condition.test(failure ?? '')).toBe(false)
  })

  it('AC-nextjs-used-atoms-05: a 503 after a manifest read leaves no note for a later run of the same row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await failureOf({ status: 503, printed: MANIFEST_EMPTY })
    await failureOf({ status: 200, printed: '' })
    const calls = warn.mock.calls.length
    warn.mockRestore()

    expect(calls).toBe(0)
  })

  it('AC-nextjs-used-atoms-05: does not name a manifest error other than the empty one as the read', async () => {
    const stale = await failureOf({ status: 500, printed: '⨯ Error: Manifest file is stale' })

    expect(RETRY_ON_MANIFEST_READ.condition.test(stale ?? '')).toBe(false)
  })

  it('AC-nextjs-used-atoms-05: does not take the words of a server that printed them without a 500 for a failure', async () => {
    expect(await failureOf({ status: 200, printed: JSON_READ })).toBeUndefined()
  })
})

describe('the retry of the dev row', () => {
  let directory = ''
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-error-page-retry-'))
    directory = realpathSync(made)
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  /**
   * Runs one row under the retry of the helper, against a stand-in page. Each attempt takes the
   * next of `attempts`. Resolves to the run's output, its exit code and how many attempts the row
   * made.
   */
  function run(attempts: readonly Attempt[]): {
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
        `import { openPage, RETRY_ON_MANIFEST_READ } from ${JSON.stringify(HELPER)}`,
        '',
        "it('the row', { retry: RETRY_ON_MANIFEST_READ }, async () => {",
        `  appendFileSync(process.env.ATTEMPTS_LOG, 'x')`,
        `  const attempt = readFileSync(process.env.ATTEMPTS_LOG, 'utf8').length - 1`,
        `  const step = JSON.parse(readFileSync(process.env.ATTEMPTS_SCRIPT, 'utf8'))[attempt]`,
        '  let isAnswered = false',
        '  const page = { goto: async () => { isAnswered = true; return { status: () => step.status } } }',
        `  await openPage(page, ${JSON.stringify(URL)}, () => (isAnswered ? step.printed : ''))`,
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

  it('AC-nextjs-used-atoms-05: passes a row whose first load answered 500 after the truncated JSON read and whose retry is green, and names it', () => {
    const outcome = run([
      { status: 500, printed: JSON_READ },
      { status: 200, printed: '' },
    ])

    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.attempts).toBe(2)
    expect(outcome.output).toContain('ended with Next.js answering 500')
  })

  it('AC-nextjs-used-atoms-05: fails a row whose first load answered 500 for any other reason after one attempt', () => {
    const outcome = run([
      { status: 500, printed: 'Error: something else' },
      { status: 200, printed: '' },
    ])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(1)
    expect(outcome.output).toContain('Error: something else')
  })

  it('AC-nextjs-used-atoms-05: runs the row once more and no more when the retry answers 500 after the same read', () => {
    const outcome = run([
      { status: 500, printed: JSON_READ },
      { status: 500, printed: JSON_READ },
      { status: 200, printed: '' },
    ])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(2)
  })

  it('AC-nextjs-used-atoms-05: runs a green row once and prints no note', () => {
    const outcome = run([{ status: 200, printed: '' }])

    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.attempts).toBe(1)
    expect(outcome.output).not.toContain('ended with Next.js answering 500')
  })
})
