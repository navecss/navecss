/**
 * A stray `}` with no opener anywhere in its own scan range used to make the
 * block reader return an item spanning zero tokens; the walk then re-read
 * the same closer forever instead of moving past it. A depth-0 closer seen
 * before anything else has been consumed for that item is now its own
 * one-token invalid item, so the walk always advances.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findSurvivors } from '../../src/directive/find-survivors.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '..', '..', 'dist', 'bin.js')
const FIND_SURVIVORS_SRC = path.resolve(HERE, '..', '..', 'src', 'directive', 'find-survivors.ts')

function runCheck(
  cwd: string,
  ...args: string[]
): { signal: string | null; status: number | null } {
  const result = spawnSync(process.execPath, [BIN, 'check', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
  })
  return { status: result.status, signal: result.signal }
}

describe('a stray closer with no opener anywhere in range terminates the item it starts', () => {
  it('is not counted itself, and the rest of the stylesheet is still read, in a real process under a timeout', () => {
    // In a spawned child, not in-process: the historical bug here was an
    // EMPTY span ceded back to the caller, which re-read the same token
    // forever — a genuine infinite loop, not merely a slow one. Run
    // in-process, a reverted fix would hang this whole worker rather than
    // fail this one test; a spawned child with a timeout fails instead.
    const script = [
      `import { findSurvivors } from ${JSON.stringify(pathToFileURL(FIND_SURVIVORS_SRC).href)}`,
      String.raw`const survivors = findSurvivors('a { } }\n.b { color: @nave flex; }')`,
      `process.stdout.write(String(survivors.length))`,
    ].join('\n')

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      { timeout: 3000, encoding: 'utf8' },
    )

    expect(result.signal).toBeNull()
    expect(result.stdout).toBe('1')
  })

  it('is one at-rule too, when the whole thing is a bare stray closer', () => {
    expect(findSurvivors(')')).toEqual([])
  })
})

describe('a stray closer never hangs the survival scan', () => {
  const ctx = { dir: '' }

  beforeEach(() => {
    ctx.dir = mkdtempSync(path.join(tmpdir(), 'nave-stray-closer-'))
  })

  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true })
  })

  it('exits clean when nothing past the stray closer is a directive', () => {
    writeFileSync(path.join(ctx.dir, 'a.css'), '.a{color:red}}.b{color:blue}')

    const { status, signal } = runCheck(ctx.dir, '--source=a.css')

    expect(signal).toBeNull()
    expect(status).toBe(0)
  })

  it('still finds a directive that follows a stray closer', () => {
    writeFileSync(path.join(ctx.dir, 'a.css'), '.a{color:red}}.b{@nave flex}')

    const { status, signal } = runCheck(ctx.dir, '--source=a.css')

    expect(signal).toBeNull()
    expect(status).toBe(1)
  })
})
