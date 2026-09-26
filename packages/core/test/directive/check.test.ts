import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  it('finds a directive inside a declaration value (R5f)', async () => {
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
    const rows = ['/* @nave flex */', '.a{content:"@nave flex"}', '.a{background:url(@nave.png)}', '.a{@navex flex}']

    for (const content of rows) {
      const filePath = await writeCss('row.css', content)
       
      const result = await check({ source: [filePath] })
      expect(result.findings).toEqual([])
    }
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
