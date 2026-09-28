import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { check } from '../../src/directive/check.ts'
import { assertScalesLinearly } from '../helpers/perf-scaling.ts'

const ctx = { dir: '' }

beforeEach(async () => {
  ctx.dir = await mkdtemp(path.join(tmpdir(), 'nave-check-'))
})

afterEach(async () => {
  await rm(ctx.dir, { recursive: true, force: true })
})

async function writeCss(name: string, content: string): Promise<string> {
  const filePath = path.join(ctx.dir, name)
  await mkdir(path.join(filePath, '..'), { recursive: true })
  await writeFile(filePath, content)
  return filePath
}

describe('AC-directive-core-23 — what the check counts as a surviving directive', () => {
  it('finds a directive inline in a rule, with the enclosing selector', async () => {
    const filePath = await writeCss('a.css', '.a{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ line: 1, column: 4, selector: '.a' })
  })

  it('is case- and escape-insensitive on the directive name', async () => {
    const upper = await writeCss('upper.css', '.a{@NAVE flex}')
    const escaped = await writeCss('escaped.css', String.raw`.a{@n\61ve flex}`)

    const upperResult = await check({ source: [upper] })
    const escapedResult = await check({ source: [escaped] })

    expect(upperResult.findings).toHaveLength(1)
    expect(escapedResult.findings).toHaveLength(1)
  })

  it('finds a directive inside a declaration value', async () => {
    const filePath = await writeCss('a.css', '.a{color:@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ selector: '.a' }])
  })

  it('finds a top-level directive with no selector', async () => {
    const filePath = await writeCss('a.css', '@nave flex;')

    const result = await check({ source: [filePath] })

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.selector).toBeUndefined()
  })

  it('finds a directive nested inside a group at-rule, reporting the enclosing rule', async () => {
    const filePath = await writeCss('a.css', '@media (x){.a{@nave flex}}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ selector: '.a' }])
  })

  it('does not flag a comment, a string, a url(), or an unrelated at-keyword', async () => {
    const rows = [
      '/* @nave flex */',
      '.a{content:"@nave flex"}',
      '.a{background:url(@nave.png)}',
      '.a{@navex flex}',
    ]

    for (const content of rows) {
      const filePath = await writeCss('row.css', content)

      const result = await check({ source: [filePath] })
      expect(result.findings).toEqual([])
    }
  })

  it.each([
    ['.a @nave{color:red}', 'a stray at-keyword ahead of a rule, in its selector prelude'],
    ['@media @nave{.a{color:red}}', 'a stray at-keyword in a group rule prelude'],
    ['.a{color red @nave flex}', 'a stray at-keyword inside an invalid item'],
    ['@import url(x.css) @nave flex;', 'a stray at-keyword trailing an at-rule prelude'],
    ['.a:is(@nave flex) { color: red }', 'a stray at-keyword inside a selector function'],
  ])(
    'finds a directive-named at-keyword anywhere outside comments and strings: %s (%s)',
    async (content) => {
      const filePath = await writeCss('row.css', content)

      const result = await check({ source: [filePath] })

      expect(result.findings).toHaveLength(1)
    },
  )

  it('keeps counting the declaration-value form exactly once', async () => {
    const filePath = await writeCss('a.css', '.a { color: @nave flex; }')

    const result = await check({ source: [filePath] })

    expect(result.findings).toHaveLength(1)
  })
})

describe('AC-directive-core-22 — navecss-core check, the exit contract', () => {
  it('exits 0 when every stylesheet read holds no directive', async () => {
    await writeCss('clean.css', '.a{color:red}')

    const result = await check({ source: [ctx.dir] })

    expect(result.status).toBe(0)
    expect(result.stylesheetsRead).toBe(1)
  })

  it('exits 1 when at least one directive survives, recursively', async () => {
    await writeCss('a/b/c.css', '.a{@nave flex}')

    const result = await check({ source: [ctx.dir] })

    expect(result.status).toBe(1)
  })

  it('exits 2 when the source path is unreadable', async () => {
    const result = await check({ source: [path.join(ctx.dir, 'missing')] })

    expect(result.status).toBe(2)
  })

  it('exits 2 when no stylesheet is found at all', async () => {
    await writeFile(path.join(ctx.dir, 'x.js'), '// no css here')

    const result = await check({ source: [ctx.dir] })

    expect(result.status).toBe(2)
    expect(result.stylesheetsRead).toBe(0)
  })

  it('reads a file named explicitly without a .css extension', async () => {
    const filePath = await writeCss('a.txt', '.a{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.status).toBe(1)
    expect(result.stylesheetsRead).toBe(1)
  })
})

// A generous per-row timeout throughout this block, well above the test runner's own
// default: `assertScalesLinearly` can run its measured subject up to 14 times (a warm-up
// plus 3+3 samples, doubled once on a retry), and a slow or shared runner's own per-call
// time can be an order of magnitude past a fast local machine's — the wall-clock ceiling
// on how long the ROW is allowed to take is deliberately loose, since the scaling ratio
// assertion inside it is what actually decides pass or fail.
const SCALING_ROW_TIMEOUT = 30_000

describe('check() stays roughly linear, not quadratic, and stack-safe on a large stylesheet', () => {
  it(
    'stays roughly linear reporting survivors in a single file',
    async () => {
      await assertScalesLinearly(async (size) => {
        const filePath = await writeCss(`a-${size}.css`, '.b{@nave flex}'.repeat(size))

        const start = performance.now()
        const result = await check({ source: [filePath] })
        const elapsed = performance.now() - start

        expect(result.status).toBe(1)
        expect(result.findings).toHaveLength(size)

        return elapsed
      }, 20_000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'does not overflow the call stack on 5000 levels of nesting',
    async () => {
      const filePath = await writeCss('d.css', '.a{'.repeat(5000) + '}'.repeat(5000))

      const result = await check({ source: [filePath] })

      expect(result.status).toBe(0)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'stays roughly linear, not quadratic, in nesting depth',
    async () => {
      await assertScalesLinearly(async (size) => {
        const filePath = await writeCss(`e-${size}.css`, '.a{'.repeat(size) + '}'.repeat(size))

        const start = performance.now()
        const result = await check({ source: [filePath] })
        const elapsed = performance.now() - start

        expect(result.status).toBe(0)

        return elapsed
      }, 40_000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it('counts a lone CR and a lone form feed as line breaks, not only LF', async () => {
    const filePath = await writeCss('a.css', '.a{\r}\r.b{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ line: 3, column: 4 }])
  })

  it('a leading BOM does not shift the column', async () => {
    const filePath = await writeCss('a.css', '﻿.a{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ line: 1, column: 4 }])
  })
})

describe('AC-directive-core-22 — an unreadable file exits 2 without losing other hits', () => {
  it.skipIf(process.getuid?.() === 0)(
    'keeps a readable hit when a sibling --source is unreadable',
    async () => {
      const hitPath = await writeCss('hit.css', '.a{@nave flex}')
      const lockedPath = path.join(ctx.dir, 'locked.css')
      await writeFile(lockedPath, '.a{}')
      await chmod(lockedPath, 0)

      const result = await check({ source: [hitPath, lockedPath] })

      expect(result.status).toBe(2)
      expect(result.findings).toMatchObject([{ file: hitPath }])
    },
  )

  it.skipIf(process.getuid?.() === 0)(
    'exits 2 on an unreadable file passed alone, with no findings',
    async () => {
      const lockedPath = path.join(ctx.dir, 'locked.css')
      await writeFile(lockedPath, '.a{}')
      await chmod(lockedPath, 0)

      const result = await check({ source: [lockedPath] })

      expect(result.status).toBe(2)
      expect(result.findings).toEqual([])
    },
  )

  it.skipIf(process.getuid?.() === 0)(
    'exits 2 when a subdirectory is unreadable, keeping hits from sibling files',
    async () => {
      const hitPath = await writeCss('dir/hit.css', '.a{@nave flex}')
      const lockedDir = path.join(ctx.dir, 'dir', 'locked')
      await mkdir(lockedDir)
      await chmod(lockedDir, 0)

      const result = await check({ source: [path.join(ctx.dir, 'dir')] })

      expect(result.status).toBe(2)
      expect(result.findings).toMatchObject([{ file: hitPath }])
    },
  )
})

describe('a directory --source follows symlinks, loop-safe', () => {
  it('follows a symlinked file and a symlinked directory that loops back, counting the real file once', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    const realDir = path.join(ctx.dir, 'real')
    await mkdir(distDir)
    await mkdir(realDir)
    const realHit = path.join(realDir, 'hit.css')
    await writeFile(realHit, '.a{@nave flex}')
    await symlink(realHit, path.join(distDir, 'hit.css'))
    await symlink('..', path.join(distDir, 'up'))
    await writeFile(path.join(distDir, 'clean.css'), '.a{}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(1)
  })

  it(
    'stays roughly linear walking a mesh of sibling directories, each linked to every other',
    async () => {
      // The mesh's own edge count is quadratic in its width (every directory links to every
      // other), so the scaling assertion is driven off the total directory-entry count rather
      // than the mesh width directly: doubling the width quadruples the entries, matching the
      // n-vs-4n comparison `assertScalesLinearly` makes.
      await assertScalesLinearly(async (totalEntries) => {
        const width = Math.max(2, Math.round(Math.sqrt(totalEntries)))
        const dir = await mkdtemp(path.join(tmpdir(), 'nave-check-mesh-'))
        const names = Array.from({ length: width }, (_, i) => `d${i}`)
        for (const name of names) {
          await mkdir(path.join(dir, name))
          await writeFile(path.join(dir, name, `${name}.css`), '.x{}')
        }
        for (const name of names) {
          const others = names.filter((other) => other !== name)
          for (const other of others) {
            await symlink(path.join(dir, other), path.join(dir, name, other))
          }
        }

        const start = performance.now()
        const result = await check({ source: [dir] })
        const elapsed = performance.now() - start

        expect(result.status).toBe(0)
        expect(result.stylesheetsRead).toBe(width)

        await rm(dir, { recursive: true, force: true })

        return elapsed
      }, 196)
    },
    SCALING_ROW_TIMEOUT,
  )
})

describe('a directory --source reads .css in any ASCII case', () => {
  it('finds a directive in a file whose extension is uppercase', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await writeFile(path.join(distDir, 'a.css'), '.a{}')
    await writeFile(path.join(distDir, 'b.CSS'), '.a{@nave flex}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(1)
  })

  it('exits 0, not 2, for a directory holding only a mixed-case extension', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await writeFile(path.join(distDir, 'b.Css'), '.a{}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(0)
  })
})

describe('a dangling symlink is unreadable only when its name would have been read', () => {
  it('ignores a dangling symlink whose name does not end in .css', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await symlink(path.join(distDir, 'nowhere'), path.join(distDir, 'x.map'))
    await writeFile(path.join(distDir, 'a.css'), '.a{}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(0)
  })

  it('reports a dangling .css symlink as unreadable, naming it', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await symlink(path.join(distDir, 'nowhere'), path.join(distDir, 'y.css'))

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(2)
  })
})
