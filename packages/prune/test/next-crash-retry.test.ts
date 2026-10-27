import { spawnSync } from 'node:child_process'
/**
 * The real-build rows of the webpack third state run again after Next.js 16.2.0's intermittent
 * crash and after nothing else: a crash followed by a green run passes, and says so in the output,
 * and any other red, a green build that ships the wrong atom included, fails at once.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PACKAGE_ROOT } from './helpers/next-process.ts'

const CRASH_HELPER = path.join(import.meta.dirname, 'helpers/next-crash.ts')
const VITEST = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs')
const CRASH_TEXT =
  "uncaughtException TypeError: Cannot read properties of undefined (reading 'length')"

describe('the retry of the webpack third state', () => {
  let directory = ''
  beforeEach(() => {
    const made = mkdtempSync(path.join(tmpdir(), 'prune-crash-retry-'))
    directory = realpathSync(made)
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  /**
   * Runs two rows under the retry of the helper: the first fails its first attempt with `first`
   * and passes the next, the second always fails with `second`. Resolves to the run's output, its
   * exit code and how many attempts each row made.
   */
  function run(
    first: string,
    second: string,
  ): {
    readonly attempts: { readonly first: number; readonly second: number }
    readonly code: number | null
    readonly output: string
  } {
    const log = (name: string): string => JSON.stringify(path.join(directory, `${name}.log`))
    writeFileSync(
      path.join(directory, 'vitest.config.mjs'),
      `export default { test: { root: ${JSON.stringify(directory)}, include: ['file.test.ts'] } }\n`,
    )
    writeFileSync(
      path.join(directory, 'file.test.ts'),
      [
        "import { appendFileSync, readFileSync } from 'node:fs'",
        "import { describe, it } from 'vitest'",
        `import { noteNextCrash, RETRY_ON_NEXT_CRASH } from ${JSON.stringify(CRASH_HELPER)}`,
        '',
        "describe('cells', { retry: RETRY_ON_NEXT_CRASH }, () => {",
        "  it('first', () => {",
        `    appendFileSync(${log('first')}, 'x')`,
        `    if (readFileSync(${log('first')}, 'utf8').length === 1) {`,
        `      noteNextCrash(${JSON.stringify(first)})`,
        `      throw new Error(${JSON.stringify(first)})`,
        '    }',
        '  })',
        "  it('second', () => {",
        `    appendFileSync(${log('second')}, 'x')`,
        `    throw new Error(${JSON.stringify(second)})`,
        '  })',
        '})',
        '',
      ].join('\n'),
    )
    const result = spawnSync(process.execPath, [VITEST, 'run', '--config', 'vitest.config.mjs'], {
      cwd: directory,
      encoding: 'utf8',
    })
    const count = (name: string): number =>
      readFileSync(path.join(directory, `${name}.log`), 'utf8').length
    return {
      attempts: { first: count('first'), second: count('second') },
      code: result.status,
      output: `${result.stdout}\n${result.stderr}`,
    }
  }

  it('passes a row whose first build crashed and whose retry is green, and names the crash', () => {
    const outcome = run(`build output\n${CRASH_TEXT}\n`, 'the layer ships hidden')

    expect(outcome.attempts.first).toBe(2)
    expect(outcome.output).toContain("Cannot read properties of undefined (reading 'length')")
    expect(outcome.output).toMatch(/first/u)
    expect(outcome.output).not.toMatch(/FAIL.*first/u)
  })

  it('fails a row whose first build is green but ships the wrong atom, without a retry', () => {
    const outcome = run(`build output\n${CRASH_TEXT}\n`, 'the layer ships hidden')

    expect(outcome.attempts.second).toBe(1)
    expect(outcome.code).toBe(1)
    expect(outcome.output).toContain('the layer ships hidden')
  })
})
