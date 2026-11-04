/**
 * What a dev row that waited for an edit in vain says of the server's own side: whether the page
 * the server serves carries the class the edit gave it, and whether the stylesheet that page
 * links holds the class's rule. A document that lacks the rule while the server serves it is an
 * update the browser never got; a server that serves neither never recompiled. The server here is
 * a stand-in whose answers each row scripts. A route the server never built, which answers 404, runs
 * the row again, once and from a fresh app, and so does the first load that found a manifest empty;
 * any other red fails the row after one attempt.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { explainEdit, RETRY_ON_DEV_ROW, serverSentence } from './helpers/dev-update.ts'
import { PACKAGE_ROOT } from './helpers/next-process.ts'
import { until } from './helpers/until.ts'

const HELPERS = path.join(import.meta.dirname, 'helpers')
const VITEST = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs')
const NOTE = 'An earlier attempt of this row ended with Next.js not building /new (it answered 404)'

interface Served {
  readonly html: string
  readonly css: string
  readonly status?: number
}

/**
 * The part of a dev server `serverSentence` reads, serving `served`.
 */
function serving({ html, css, status = 200 }: Served): Parameters<typeof serverSentence>[0] {
  return {
    get: () => Promise.resolve({ status, text: html }),
    css: () => Promise.resolve(css),
  }
}

describe('the sentence on the server side of a wait that ran out', () => {
  it('AC-nextjs-used-atoms-05: says the page carries the class and the stylesheet holds the rule', async () => {
    const server = serving({ html: '<div class="nave-grid">', css: '.nave-grid{display:grid}' })

    expect(await serverSentence(server, '/', 'nave-grid')).toBe(
      '/ answers 200; its HTML carries nave-grid; the CSS it links holds .nave-grid.',
    )
  })

  it('AC-nextjs-used-atoms-05: says the page lacks the class when the server serves the old page', async () => {
    const server = serving({ html: '<div class="nave-flex">', css: '.nave-flex{display:flex}' })

    expect(await serverSentence(server, '/', 'nave-grid')).toBe(
      '/ answers 200; its HTML does not carry nave-grid; the CSS it links does not hold .nave-grid.',
    )
  })

  it('AC-nextjs-used-atoms-05: says the stylesheet lacks the rule when only the page has the class', async () => {
    const server = serving({ html: '<div class="nave-grid">', css: '.nave-flex{display:flex}' })

    expect(await serverSentence(server, '/', 'nave-grid')).toContain(
      'its HTML carries nave-grid; the CSS it links does not hold .nave-grid.',
    )
  })

  it('AC-nextjs-used-atoms-05: does not take a longer class for the class', async () => {
    const server = serving({ html: '<div class="nave-grid-cols">', css: '.nave-grid-cols{}' })

    expect(await serverSentence(server, '/', 'nave-grid')).toContain('does not carry nave-grid')
    expect(await serverSentence(server, '/', 'nave-grid')).toContain('does not hold .nave-grid.')
  })

  it('AC-nextjs-used-atoms-05: names the route and the status a failing route answers', async () => {
    const server = serving({ html: '', css: '', status: 404 })

    expect(await serverSentence(server, '/new', 'nave-block')).toContain('/new answers 404;')
  })

  it('AC-nextjs-used-atoms-05: says a server that answers nothing did not answer, within the time given', async () => {
    const server: Parameters<typeof serverSentence>[0] = {
      get: () => new Promise(() => {}),
      css: () => new Promise(() => {}),
    }

    expect(await serverSentence(server, '/', 'nave-grid', { requestMs: 50 })).toBe(
      '/ did not answer within 50 ms.',
    )
  })

  it('AC-nextjs-used-atoms-05: names the request that did not answer', async () => {
    const server: Parameters<typeof serverSentence>[0] = {
      get: () => Promise.resolve({ status: 404, text: '' }),
      css: () => new Promise(() => {}),
    }

    expect(await serverSentence(server, '/new', 'nave-block', { requestMs: 50 })).toBe(
      '/new answers 404; its HTML does not carry nave-block; the CSS it links did not answer within 50 ms.',
    )
  })

  it('AC-nextjs-used-atoms-05: says a server that cannot be requested could not be, and does not throw', async () => {
    const server: Parameters<typeof serverSentence>[0] = {
      get: () => Promise.reject(new Error('next dev exited')),
      css: () => Promise.reject(new Error('next dev exited')),
    }

    expect(await serverSentence(server, '/', 'nave-grid')).toBe(
      '/ could not be requested: Error: next dev exited',
    )
  })
})

/**
 * What a wait that runs out at once throws, as its message.
 */
async function messageOfWait(
  what: string,
  explain: () => Promise<string>,
): Promise<string | undefined> {
  try {
    await until(() => Promise.resolve(false), what, { explain, deadlineMs: 0 })
  } catch (error) {
    return (error as Error).message
  }
  return undefined
}

describe('the wait of the dev row', () => {
  it('AC-nextjs-used-atoms-05: says what it waited for and what the server serves when it runs out', async () => {
    const server = serving({ html: '', css: '', status: 404 })

    const message = await messageOfWait('the nave-block rule on /new', () =>
      serverSentence(server, '/new', 'nave-block'),
    )

    expect(message).toContain(
      'timed out waiting for the nave-block rule on /new:\n/new answers 404;',
    )
  })

  it('AC-nextjs-used-atoms-05: says when the state could not be read', async () => {
    const message = await messageOfWait('a rule', () =>
      Promise.reject(new Error('the page is gone')),
    )

    expect(message).toContain('the state could not be read: Error: the page is gone')
  })

  it('AC-nextjs-used-atoms-05: keeps the server side, and the retry, when the document cannot be read', async () => {
    const server = {
      ...serving({ html: '', css: '', status: 404 }),
      output: () => ' GET /new 404 in 9ms\n',
    }

    const message = await messageOfWait('the nave-block rule on /new', () =>
      explainEdit(
        () => Promise.reject(new Error('Execution context was destroyed')),
        server,
        '/new',
        'nave-block',
      ),
    )

    expect(message).toContain('/new answers 404;')
    expect(message).toContain('GET /new 404')
    expect(RETRY_ON_DEV_ROW.condition.test(message ?? '')).toBe(true)
  })
})

describe('the retry of the dev row', () => {
  let directory = ''
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-dev-update-retry-'))
    directory = realpathSync(made)
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  type Kind = 'green' | 'manifest' | 'new-404' | 'new-served' | 'root-404'

  /**
   * Runs one row under the retry of the helper. Each attempt takes the next of `attempts`: a first
   * load that found a manifest empty, a wait for `/new` that ran out against a server answering 404
   * or serving the route without the class, a wait for `/` against a server answering 404, or
   * a green attempt. Resolves to the run's output, its exit code and how many attempts it made.
   */
  function run(attempts: readonly Kind[]): {
    readonly attempts: number
    readonly code: number | null
    readonly output: string
  } {
    const log = path.join(directory, 'attempts.log')
    writeFileSync(path.join(directory, 'script.json'), JSON.stringify(attempts))
    writeFileSync(
      path.join(directory, 'vitest.config.mjs'),
      "export default { test: { include: ['file.test.ts'], reporters: ['verbose'] } }\n",
    )
    writeFileSync(
      path.join(directory, 'file.test.ts'),
      [
        "import { appendFileSync, readFileSync } from 'node:fs'",
        "import { it } from 'vitest'",
        `import { noteEarlierRouteNotBuilt, RETRY_ON_DEV_ROW, rememberRouteNotBuilt, serverSentence } from ${JSON.stringify(path.join(HELPERS, 'dev-update.ts'))}`,
        `import { openPage } from ${JSON.stringify(path.join(HELPERS, 'dev-error-page.ts'))}`,
        `import { until } from ${JSON.stringify(path.join(HELPERS, 'until.ts'))}`,
        '',
        "it('the row', { retry: RETRY_ON_DEV_ROW }, async () => {",
        '  noteEarlierRouteNotBuilt()',
        `  appendFileSync(process.env.ATTEMPTS_LOG, 'x')`,
        `  const attempt = readFileSync(process.env.ATTEMPTS_LOG, 'utf8').length - 1`,
        `  const kind = JSON.parse(readFileSync(process.env.ATTEMPTS_SCRIPT, 'utf8'))[attempt]`,
        "  if (kind === 'green') return",
        "  if (kind === 'manifest') {",
        '    let isAnswered = false',
        '    const page = { goto: async () => { isAnswered = true; return { status: () => 500 } } }',
        "    await openPage(page, 'http://localhost:3000/', () => (isAnswered ? 'Error: Manifest file is empty' : ''))",
        '    return',
        '  }',
        "  const route = kind === 'root-404' ? '/' : '/new'",
        "  const status = kind === 'new-served' ? 200 : 404",
        "  const server = { get: async () => ({ status, text: '' }), css: async () => '' }",
        '  try {',
        "    await until(async () => false, 'a rule', { explain: () => serverSentence(server, route, 'nave-block'), deadlineMs: 0 })",
        '  } catch (error) {',
        '    rememberRouteNotBuilt(error)',
        '    throw error',
        '  }',
        '})',
        '',
      ].join('\n'),
    )
    const result = spawnSync(process.execPath, [VITEST, 'run', '--config', 'vitest.config.mjs'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        ATTEMPTS_LOG: log,
        ATTEMPTS_SCRIPT: path.join(directory, 'script.json'),
      },
    })
    return {
      attempts: readFileSync(log, 'utf8').length,
      code: result.status,
      output: `${result.stdout}\n${result.stderr}`,
    }
  }

  it('AC-nextjs-used-atoms-05: passes a row whose wait for /new ran out against a 404 and whose retry is green, and names it', () => {
    const outcome = run(['new-404', 'green'])

    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.attempts).toBe(2)
    expect(outcome.output).toContain(NOTE)
  })

  it('AC-nextjs-used-atoms-05: runs the row once more and no more when the retry answers 404 too', () => {
    const outcome = run(['new-404', 'new-404', 'green'])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(2)
  })

  it('AC-nextjs-used-atoms-05: fails a row whose /new was built but never got its rule after one attempt', () => {
    const outcome = run(['new-served', 'green'])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(1)
    expect(outcome.output).not.toContain(NOTE)
  })

  it('AC-nextjs-used-atoms-05: fails a row whose wait for / ran out against a 404 after one attempt', () => {
    const outcome = run(['root-404', 'green'])

    expect(outcome.code).not.toBe(0)
    expect(outcome.attempts).toBe(1)
  })

  it('AC-nextjs-used-atoms-05: still runs a first load that found a manifest empty once more, and prints no 404 note', () => {
    const outcome = run(['manifest', 'green'])

    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.attempts).toBe(2)
    expect(outcome.output).not.toContain(NOTE)
  })

  it('AC-nextjs-used-atoms-05: runs a green row once and prints no note', () => {
    const outcome = run(['green'])

    expect(outcome.code, outcome.output).toBe(0)
    expect(outcome.attempts).toBe(1)
    expect(outcome.output).not.toContain(NOTE)
  })
})

/**
 * The message of a wait that ran out: the document's state, the sentence on the server side and
 * what the server printed after it.
 */
const waitMessage = (served: string, output = ''): string =>
  `timed out waiting for a rule:\nhttp://localhost:1/new is complete, with no stylesheet link\n${served}\n${output}`

describe('the condition of the retry', () => {
  it('AC-nextjs-used-atoms-05: holds for a /new that answered 404 and for no other route or status', () => {
    expect(
      RETRY_ON_DEV_ROW.condition.test(
        waitMessage('/new answers 404; its HTML does not carry nave-block;'),
      ),
    ).toBe(true)
    expect(
      RETRY_ON_DEV_ROW.condition.test(
        waitMessage('/new answers 200; its HTML does not carry nave-block;'),
      ),
    ).toBe(false)
    expect(
      RETRY_ON_DEV_ROW.condition.test(
        waitMessage('/ answers 404; its HTML does not carry nave-grid;'),
      ),
    ).toBe(false)
  })

  it('AC-nextjs-used-atoms-05: is not set off by the server printing a 404 for /new', () => {
    const printed = ' GET /new 404 in 108ms (next.js: 13ms, application-code: 94ms)'

    expect(
      RETRY_ON_DEV_ROW.condition.test(
        waitMessage('/new answers 200; its HTML carries nave-block;', printed),
      ),
    ).toBe(false)
  })
})
