import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { check } from '../../src/directive/check.ts'

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

describe('AC-directive-core-25 — check() stays fast and robust on a large stylesheet', () => {
  it('reports 20000 survivors in a single file in under 2 seconds', async () => {
    const filePath = await writeCss('a.css', '.b{@nave flex}'.repeat(20_000))

    const start = performance.now()
    const result = await check({ source: [filePath] })
    expect(performance.now() - start).toBeLessThan(2000)

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(20_000)
  })

  it('does not overflow the call stack on 5000 levels of nesting', async () => {
    const filePath = await writeCss('d.css', '.a{'.repeat(5000) + '}'.repeat(5000))

    const result = await check({ source: [filePath] })

    expect(result.status).toBe(0)
  })

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

  it('walks a mesh of sibling directories, each linked to every other, in well under 2 seconds', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (const name of names) {
      await mkdir(path.join(ctx.dir, name))
      await writeFile(path.join(ctx.dir, name, `${name}.css`), '.x{}')
    }
    for (const name of names) {
      const others = names.filter((other) => other !== name)
      for (const other of others) {
        await symlink(path.join(ctx.dir, other), path.join(ctx.dir, name, other))
      }
    }

    const start = performance.now()
    const result = await check({ source: [ctx.dir] })
    expect(performance.now() - start).toBeLessThan(2000)

    expect(result.status).toBe(0)
    expect(result.stylesheetsRead).toBe(names.length)
  })
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
