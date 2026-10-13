/**
 * Where a rewritten call sits (AC-used-atoms-21 to -23): a call that begins a statement is led by
 * a `;` only where a statement list could have left the line before it unfinished, the import
 * that is taken away does not glue the lines around it, and the module declares nothing a cycle
 * of imports could reach before it runs.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseAst } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { cx as runtimeCx } from '../src/cx.ts'
import { CX_SOURCE } from '../src/vite-collect.ts'
import { evaluate, IMPORT, rewrite } from './helpers/vite-rewrite.ts'

const KEEP = { grid: 'nave-grid' }

/**
 * The run-time functions, `cx.dynamic()` reading `KEEP` as it does in a build.
 */
const atRunTime = Object.assign((...args: never[]) => runtimeCx(...args), {
  raw: runtimeCx.raw,
  dynamic: (name: unknown): string =>
    name && Object.hasOwn(KEEP, name as string) ? KEEP[name as keyof typeof KEEP] : '',
})

type Body = (...args: unknown[]) => unknown

interface Run {
  readonly error?: string
  readonly log: string[]
  readonly returned?: unknown
}

/**
 * What the function `body` returns, or throws, and what the stand-ins it was given log.
 */
function run(body: Body): Run {
  const log: string[] = []
  const stand = (name: string, value: unknown) => () => {
    log.push(name)
    return value
  }
  try {
    const returned = body(stand('foo', 's'), stand('f', 'grid'), 2, true, 'grid', [])
    return { log, returned }
  } catch (error) {
    return { log, error: String(error) }
  }
}

/**
 * The statements of a module text.
 */
function statementsOf(code: string): AstNode[] {
  return parseAst(code).body as unknown as AstNode[]
}

describe('AC-used-atoms-21 and -22 — a call that begins a statement', () => {
  const CALLS: readonly (readonly [string, string])[] = [
    ['cx', "cx(f() && 'flex')"],
    ['cx.raw', "cx.raw(f(), 'a')"],
    ['cx.dynamic', 'cx.dynamic(f())'],
  ]

  describe.each(CALLS)('%s(...) as the body of a statement', (_name, call) => {
    // Each body puts the call where a statement is expected without braces, so a `;` led before
    // the call would become that body and leave the call to run every time.
    const BODIES = [
      `if (false) ${call}`,
      `if (false) ${call}\n  else n += 1`,
      `if (true) n += 1\n  else ${call}`,
      `if (false) ${call}; else n += 1`,
      `for (let i = 0; i < 3; i++) ${call}`,
      `for (const k of [1, 2]) ${call}`,
      `for (const k in { a: 1, b: 2 }) ${call}`,
      `let i = 0\n  while (i++ < 3) ${call}`,
      `let i = 0\n  do ${call}; while (i++ < 1)`,
      `let i = 0\n  do ${call}\n  while (i++ < 1)`,
      `L: ${call}`,
      `L: for (;;) { ${call}; break L }`,
    ]

    it.each(BODIES)('does what the run-time call does in %j', (body) => {
      const source = `${IMPORT}export default (foo, f, g, on, t, xs) => {\n  let n = 0\n  ${body}\n  return n\n}\n`
      const out = rewrite(source, KEEP)

      expect(out.problems).toBe(0)
      expect(() => parseAst(out.code)).not.toThrow()
      expect(out.code).not.toMatch(/\bcx\b/)
      const original = run(evaluate<Body>(source, atRunTime))
      expect(original.error).toBeUndefined()
      expect(run(evaluate<Body>(out.code, undefined))).toEqual(original)
    })
  })

  describe.each(CALLS)('%s(...) in a statement list', (_name, call) => {
    it.each([
      `{ ${call} }`,
      `switch (1) { case 1: ${call}; break }`,
      `switch (1) { default: ${call} }`,
      `class K { static { ${call} } }`,
      `switch (1) { case 1: foo()\n  ${call} }`,
      `class K { static { foo()\n  ${call} } }`,
    ])('does what the run-time call does in %j', (body) => {
      const source = `${IMPORT}export default (foo, f, g, on, t, xs) => {\n  let n = foo()\n  ${body}\n  return n\n}\n`
      const out = rewrite(source, KEEP)

      expect(() => parseAst(out.code)).not.toThrow()
      const original = run(evaluate<Body>(source, atRunTime))
      expect(original.error).toBeUndefined()
      expect(run(evaluate<Body>(out.code, undefined))).toEqual(original)
    })
  })

  describe('after a line that was left unfinished', () => {
    const FOLLOWED = [
      "cx(on && 'flex').length",
      "cx(on && 'flex') + 'x'",
      "cx(on && 'flex') / g",
      "cx(on && 'flex'), n++",
      "cx(on && 'flex') ? n++ : n--",
      "cx(on && 'flex')?.length",
      "cx('flex', on && 'grid')[0]",
      "cx.raw('a', on && 'b').trim()",
      'cx.dynamic(t).length',
      'cx.dynamic(t) + 1',
      "cx?.(on && 'flex')",
      "cx?.('flex').length",
      "cx?.raw('a', on && 'b')",
      "cx.raw?.('a', on && 'b')",
      'cx.dynamic?.(t)',
      'cx?.dynamic(t)',
      "cx('flex').length",
      "cx.raw('a').length",
      "cx(on && 'flex').x = 1",
      "cx(on && 'flex')[0] ??= 1",
      "cx(on && 'flex').x++",
      "cx.raw('a', on && 'b').x += 1",
      'cx.dynamic(t).x &&= 1',
    ]

    it.each(FOLLOWED)('does what the run-time call does for %j', (statement) => {
      const source = `${IMPORT}export default (foo, f, g, on, t, xs) => {\n  let n = 0\n  let s = foo()\n  ${statement}\n  return [s, n]\n}\n`
      const out = rewrite(source, KEEP)

      expect(out.problems).toBe(0)
      expect(() => parseAst(out.code)).not.toThrow()
      expect(out.code).not.toMatch(/\bcx\b/)
      const original = run(evaluate<Body>(source, atRunTime))
      expect(original.error).toBeUndefined()
      expect(run(evaluate<Body>(out.code, undefined))).toEqual(original)
    })
  })

  it('leads a call that starts a statement of the program itself', () => {
    const out = rewrite(`${IMPORT}const a = [1]\ncx('flex', on && 'grid')\nexport const b = 1\n`)

    expect(statementsOf(out.code).map((node) => node.type)).toEqual([
      'VariableDeclaration',
      'ExpressionStatement',
      'ExportNamedDeclaration',
    ])
  })

  it('does not lead a call that is not the start of its statement', () => {
    const out = rewrite(
      `${IMPORT}export default (on) => {\n  const a = cx('flex', on && 'grid')\n  return [a, (cx('block', on && 'grid')), cx.raw('x', on).length]\n}\n`,
    )

    expect(out.code).not.toContain(';[')
  })
})

describe('AC-used-atoms-23 — the import that is taken away leaves the lines around it apart', () => {
  it.each([
    ['a parenthesis', "(function () { globalThis.ran = 1 })()\nexport const a = cx('flex')"],
    ['a bracket', "[1].forEach(() => { globalThis.ran = 1 })\nexport const a = cx('flex')"],
    ['a template literal', "`x`.length\nexport const a = cx('flex')"],
    ['a plus sign', "+1\nexport const a = cx('flex')"],
    ['a minus sign', "-1\nexport const a = cx('flex')"],
    ['a regular expression', "/x/.test('x')\nexport const a = cx('flex')"],
  ])('keeps the directive a directive when %s follows the import', (_name, rest) => {
    for (const directive of ["'use client'", "'use strict'"]) {
      const source = `${directive}\n${IMPORT}${rest}\n`
      const out = rewrite(source)

      expect(out.problems).toBe(0)
      expect(out.code).not.toMatch(/\bcx\b/)
      const body = statementsOf(out.code)
      expect(body[0]).toMatchObject({ directive: directive.slice(1, -1) })
      expect(body.map((node) => node.type)).toEqual([
        'ExpressionStatement',
        'ExpressionStatement',
        'ExportNamedDeclaration',
      ])
    }
  })

  it('keeps a statement of the line before apart from the one after the import', () => {
    const out = rewrite(
      `const n = 1\n${IMPORT}[n].forEach(() => {})\nexport const a = cx('flex')\n`,
    )

    expect(statementsOf(out.code).map((node) => node.type)).toEqual([
      'VariableDeclaration',
      'ExpressionStatement',
      'ExportNamedDeclaration',
    ])
  })

  it('reads a comment between the import and the next statement as part of the gap', () => {
    const out = rewrite(
      `'use client'\n${IMPORT.trimEnd()} // the classes\n/* then */\n(function () {})()\nexport const a = cx('flex')\n`,
    )

    expect(statementsOf(out.code)[0]).toMatchObject({ directive: 'use client' })
    expect(statementsOf(out.code)).toHaveLength(3)
  })

  it('skips a comment to the statement after it, and writes no semicolon before one that cannot continue', () => {
    const out = rewrite(
      `'use client'\n${IMPORT.trimEnd()} // the classes\n/* then */\nexport const a = cx('flex')\n`,
    )

    expect(out.code).not.toContain(';')
  })

  it('leaves no stray semicolon where the next statement cannot continue the one before', () => {
    const out = rewrite(`'use client'\n${IMPORT}export const a = cx('flex')\n`)

    expect(out.code).toBe(`'use client'\nexport const a = "nave-flex"\n`)
  })

  it('puts the semicolon where the import was, on the line after the directive', () => {
    const out = rewrite(`'use client'\n${IMPORT}(function () {})()\nexport const a = cx('flex')\n`)

    expect(out.code.split('\n', 2)[1]).toMatch(/^;\(function/)
  })
})

describe('AC-used-atoms-22 — a cx.dynamic call in a module that a cycle of imports reaches early', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  it('gives its class where a module that imports it calls it before its own body has run', () => {
    const a = `import './b.mjs'\n${IMPORT}export function f(t) { return cx.dynamic(t) }\nexport function g(t) { return cx.dynamic(t) + cx.dynamic('grid') }\n`
    const b = `import { f, g } from './a.mjs'\nglobalThis.fromB = [f('grid'), f('flex'), g('grid')].join('|')\n`
    const dir = mkdtempSync(path.join(tmpdir(), 'nave-cycle-'))
    dirs.push(dir)
    const rewritten = rewrite(a, KEEP).code
    writeFileSync(path.join(dir, 'a.mjs'), rewritten)
    writeFileSync(path.join(dir, 'b.mjs'), b)
    writeFileSync(path.join(dir, 'main.mjs'), `import './a.mjs'\nconsole.log(globalThis.fromB)\n`)

    const printed = execFileSync(process.execPath, [path.join(dir, 'main.mjs')], {
      encoding: 'utf8',
    })

    expect(printed.trim()).toBe('nave-grid||nave-gridnave-grid')
    expect(rewritten).not.toContain(CX_SOURCE)
  })
})
