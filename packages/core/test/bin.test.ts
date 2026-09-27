/**
 * AC-directive-core-22, AC-directive-core-24: the shipped `navecss-core`
 * bin — the `check` subcommand's exit contract and printed bytes, and the
 * bin's own detection of an unreadable or missing --source path (the bin
 * derives this itself; `check()`'s own returned shape carries no such
 * field).
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '..', 'dist', 'bin.js')

function run(cwd: string, ...args: string[]): { out: string; status: number | null } {
  const result = spawnSync(process.execPath, [BIN, 'check', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  })
  return { out: result.stdout + result.stderr, status: result.status }
}

const ctx = { dir: '' }

beforeEach(() => {
  ctx.dir = mkdtempSync(path.join(tmpdir(), 'nave-bin-'))
})

afterEach(() => {
  rmSync(ctx.dir, { recursive: true, force: true })
})

describe('the bin is a real, spawnable node script', () => {
  it('starts with the standard shebang line', () => {
    expect(readFileSync(BIN, 'utf8').split('\n', 1)[0]).toBe('#!/usr/bin/env node')
  })
})

describe('an unreadable or missing --source path exits 2, naming the path', () => {
  it('names a nonexistent --source path', () => {
    writeFileSync(path.join(ctx.dir, 'c.css'), '.a{}')

    const result = run(ctx.dir, '--source=.next/stati')

    expect(result.status).toBe(2)
    expect(result.out).toContain('.next/stati')
  })

  it('names a missing --source path while a sibling one is readable, with no generic fallback message', () => {
    writeFileSync(path.join(ctx.dir, 'c.css'), '.a{}')

    const result = run(ctx.dir, '--source=c.css', '--source=missing')

    expect(result.status).toBe(2)
    expect(result.out).toContain('missing')
    expect(result.out).not.toMatch(/No stylesheet could be checked/)
  })

  it.skipIf(process.getuid?.() === 0)(
    'names an unreadable file, keeps a sibling hit, and never leaks a URL',
    () => {
      writeFileSync(path.join(ctx.dir, 'hit.css'), '.a{@nave flex}')
      const locked = path.join(ctx.dir, 'locked.css')
      writeFileSync(locked, '.a{}')
      chmodSync(locked, 0)

      const result = run(ctx.dir, '--source=hit.css', '--source=locked.css')

      expect(result.status).toBe(2)
      expect(result.out).toContain('hit.css:1:4: @nave flex (in .a)')
      expect(result.out).toContain('locked.css')
      expect(result.out).not.toContain('://')
    },
  )

  it.skipIf(process.getuid?.() === 0)('names an unreadable --source file passed alone', () => {
    const locked = path.join(ctx.dir, 'locked.css')
    writeFileSync(locked, '.a{}')
    chmodSync(locked, 0)

    const result = run(ctx.dir, '--source=locked.css')

    expect(result.status).toBe(2)
    expect(result.out).toContain('locked.css')
  })

  it.skipIf(process.getuid?.() === 0)(
    'names an unreadable subdirectory, keeping hits from sibling files',
    () => {
      mkdirSync(path.join(ctx.dir, 'dir'))
      writeFileSync(path.join(ctx.dir, 'dir', 'hit.css'), '.a{@nave flex}')
      const lockedDir = path.join(ctx.dir, 'dir', 'locked')
      mkdirSync(lockedDir)
      chmodSync(lockedDir, 0)

      try {
        const result = run(ctx.dir, '--source=dir')

        expect(result.status).toBe(2)
        expect(result.out).toContain('locked')
        expect(result.out).toContain('hit.css:1:4: @nave flex (in .a)')
      } finally {
        // A mode-000 directory blocks its own removal, which would otherwise
        // fail the shared afterEach's recursive cleanup for every test after
        // this one, not just this one.
        chmodSync(lockedDir, 0o755)
      }
    },
  )
})

describe('the pass line names the source it read, not a placeholder', () => {
  it('states the count and the given --source path together', () => {
    mkdirSync(path.join(ctx.dir, 'dist'))
    for (const name of ['a', 'b', 'c']) {
      writeFileSync(path.join(ctx.dir, 'dist', `${name}.css`), '.x{}')
    }

    const result = run(ctx.dir, '--source=dist')

    expect(result.status).toBe(0)
    expect(result.out).toMatch(/3 stylesheets[^\n]*\bdist\b/)
  })
})

describe('a --source directory follows symlinks, loop-safe, never hanging', () => {
  it('exits 0 with no hang when a symlinked directory loops back on itself', () => {
    mkdirSync(path.join(ctx.dir, 'dist'))
    mkdirSync(path.join(ctx.dir, 'real'))
    const realHit = path.join(ctx.dir, 'real', 'hit.css')
    writeFileSync(realHit, '.a{color:red}')
    symlinkSync(realHit, path.join(ctx.dir, 'dist', 'hit.css'))
    symlinkSync('..', path.join(ctx.dir, 'dist', 'up'))
    writeFileSync(path.join(ctx.dir, 'dist', 'clean.css'), '.a{}')

    const result = run(ctx.dir, '--source=dist')

    expect(result.status).toBe(0)
  })
})
