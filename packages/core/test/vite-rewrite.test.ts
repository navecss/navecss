import { runInNewContext } from 'node:vm'
/**
 * The rewrite on its own, over module text: what the build turns each `cx()`, `cx.raw()` and
 * `cx.dynamic()` call into (AC-used-atoms-21, -22 and -23). The build-level fixtures in
 * vite-used-atoms-inline.test.ts run the same rewrite through a real `vite build`.
 */
import { type RawSourceMap, SourceMapConsumer } from 'source-map'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { cx as runtimeCx } from '../src/cx.ts'
import { CX_SOURCE, readModule, type ReadOptions } from '../src/vite-collect.ts'
import { applyEdits } from '../src/vite-rewrite-edit.ts'

/* eslint-disable unicorn/no-null -- null is one of the falsy values cx() drops, so the equivalence has to be measured over it */
const IMPORT = `import { cx } from '${CX_SOURCE}'\n`

interface Rewritten {
  readonly code: string
  readonly map: string
  readonly problems: number
}

/**
 * `code` rewritten the way the build rewrites it, `keep` being the map a `cx.dynamic()` call
 * looks a name up in.
 */
function rewrite(
  code: string,
  keep: Readonly<Record<string, string>> = {},
  options: Partial<ReadOptions> = {},
): Rewritten {
  const reading = readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: false,
    rewrite: { keep },
    ...options,
  })
  return { ...applyEdits(code, 'module.js', reading.edits), problems: reading.problems.length }
}

/**
 * What the module text `text` exports as its default, run with `cx` as the one binding it reads
 * (its import of `cx` taken away, since the rewrite may have taken it already).
 */
function evaluate<T>(text: string, cx: unknown): T {
  const body = text.replaceAll(/^import .*\n/gm, '').replace('export default', 'return')
  return runInNewContext(`(() => {\n${body}\n})()`, { cx }) as T
}

/**
 * The imports a module text declares, as the specifiers it names.
 */
function importsOf(code: string): string[] {
  return (parseAst(code).body as unknown as AstNode[])
    .filter((node) => node.type === 'ImportDeclaration')
    .map((node) => (node.source as { value: string }).value)
}

/**
 * Every list of `length` values of `domain`.
 * @yields {unknown[]} One list.
 */
function* listsOf<T>(domain: readonly T[], length: number): Generator<T[]> {
  if (length === 0) {
    yield []
    return
  }
  const tails = [...listsOf(domain, length - 1)]
  for (const head of domain) {
    for (const tail of tails) yield [head, ...tail]
  }
}

/**
 * Where `needle` first sits in `text`, as a line (from 1) and a column (from 0).
 */
function positionOf(text: string, needle: string): { column: number; line: number } {
  const before = text.slice(0, text.indexOf(needle)).split('\n')
  return { column: before.at(-1)!.length, line: before.length }
}

type Shape = (props: unknown) => string
type Conditions = (a: () => unknown, b: () => unknown, c: () => unknown) => string

/**
 * What `call` returns, and what its three conditions log, for every value they can take.
 */
function runsOf(
  call: Conditions,
  domain: readonly unknown[],
): { logs: string[]; values: string[] } {
  const logs: string[] = []
  const values: string[] = []
  for (const [a, b, c] of listsOf(domain, 3)) {
    const log: string[] = []
    const read = (name: string, value: unknown) => () => {
      log.push(name)
      return value
    }
    values.push(call(read('a', a), read('b', b), read('c', c)))
    logs.push(log.join(','))
  }
  return { logs, values }
}

/**
 * The same calls with a fold that reads the conditions in another order.
 */
const reordered: Conditions = (a, b, c) =>
  [b() ? 'nave-grid' : c() && 'nave-block', a() && 'nave-flex'].filter(Boolean).join(' ')

describe('AC-used-atoms-21 — a call becomes the string cx() returns', () => {
  it('turns an all-literal call into one string literal', () => {
    const out = rewrite(
      `${IMPORT}export const a = cx('flex', 'grid')\nexport const b = cx('flex', null)\nexport const c = cx()\nexport const d = cx(\`block\`, undefined, false, '')\n`,
    )

    expect(out.problems).toBe(0)
    expect(out.code).toContain('export const a = "nave-flex nave-grid"')
    expect(out.code).toContain('export const b = "nave-flex"')
    expect(out.code).toContain('export const c = ""')
    expect(out.code).toContain('export const d = "nave-block"')
    expect(out.code).not.toMatch(/\bcx\b/)
  })

  it('keeps every other argument where it is, each atom literal replaced by its class', () => {
    const out = rewrite(
      `${IMPORT}export const f = (on) => cx('flex', on && 'grid', on ? 'block' : '')\n`,
    )

    expect(out.code).toBe(
      `export const f = (on) => ["nave-flex", on && "nave-grid", on ? "nave-block" : ''].filter(Boolean).join(" ")\n`,
    )
  })

  it('rewrites a call inside the arguments of a cx.raw call, and the cx.raw call', () => {
    const out = rewrite(
      `${IMPORT}export default [(on) => cx.raw('legacy', cx('flex', on && 'grid'))]\n`,
    )

    expect(out.code).not.toMatch(/\bcx\b/)
    const [f] = evaluate<((isOn: boolean) => string)[]>(out.code, undefined)
    expect(f!(true)).toBe('legacy nave-flex nave-grid')
    expect(f!(false)).toBe('legacy nave-flex')
  })

  it('closes the line before a statement the call begins, which would otherwise take [ for an index', () => {
    const out = rewrite(
      `${IMPORT}export function f(on) {\n  let n = 1\n  cx('flex', on && 'grid')\n  cx.raw('a', on)\n  return n\n}\n`,
    )

    expect(out.code).not.toMatch(/\bcx\b/)
    expect(out.code.match(/^ {2};\[/gm)).toHaveLength(2)
    expect(() => parseAst(out.code)).not.toThrow()
    const exported = parseAst(out.code).body[0] as unknown as {
      declaration: { body: { body: AstNode[] } }
    }
    const statements = exported.declaration.body.body
    expect(statements.map((node) => node.type)).toEqual([
      'VariableDeclaration',
      'ExpressionStatement',
      'ExpressionStatement',
      'ReturnStatement',
    ])
  })

  it('leaves a call it cannot read as it is, and the import that call needs', () => {
    const out = rewrite(
      `${IMPORT}export const f = (p) => cx(p.variant)\nexport const g = cx('flex')\n`,
    )

    expect(out.problems).toBe(1)
    expect(out.code).toContain('cx(p.variant)')
    expect(out.code).toContain(`import { cx } from '${CX_SOURCE}'`)
    expect(out.code).toContain('export const g = "nave-flex"')
  })

  describe('equivalence with the run-time cx() over every argument shape of AC-used-atoms-09', () => {
    interface Argument {
      readonly arg: string
      readonly pre: string
    }
    // `$` is replaced by a name of its own for each argument, so three arguments never share one.
    const ARGUMENTS: readonly Argument[] = [
      { pre: '', arg: "'flex'" },
      { pre: '', arg: '`grid`' },
      { pre: '', arg: 'null' },
      { pre: '', arg: 'undefined' },
      { pre: '', arg: 'false' },
      { pre: '', arg: "''" },
      { pre: '', arg: "props.on && 'block'" },
      { pre: '', arg: "props.on ? 'inlineFlex' : ''" },
      { pre: '', arg: "props.a ? (props.b ? 'flexCol' : 'flexWrap') : null" },
      { pre: '', arg: "props.on && (props.b ? 'absolute' : 'hFull')" },
      { pre: "const $ = 'itemsCenter'", arg: '$' },
      { pre: "let $ = props.on ? 'itemsStart' : ''", arg: '$' },
      { pre: "var $ = 'itemsEnd'", arg: '$' },
      { pre: "const $ = props.on ? 'justifyCenter' : null", arg: "$ ?? 'justifyEnd'" },
      { pre: "const $ = props.on ? 'justifyBetween' : ''", arg: "$ || 'flexGrow'" },
    ]
    const CONDITIONS: readonly unknown[] = [true, false, 0, 1, '', 'x', null, undefined, NaN, {}]

    // Every call of one or two arguments, and every fifth of three.
    const calls: Argument[][] = [
      ...listsOf(ARGUMENTS, 1),
      ...listsOf(ARGUMENTS, 2),
      ...listsOf(ARGUMENTS, 3).filter((_call, index) => index % 5 === 0),
    ]

    /**
     * The module of one function for each call, each named argument declared before the call.
     */
    function moduleOf(list: readonly Argument[][]): string {
      const functions = list.map((call) => {
        const named = call.map((argument, index) => ({
          arg: argument.arg.replaceAll('$', () => `n${index}`),
          pre: argument.pre.replaceAll('$', () => `n${index}`),
        }))
        const pre = named.map((a) => a.pre).filter(Boolean)
        return `(props) => { ${pre.join('; ')}; return cx(${named.map((a) => a.arg).join(', ')}) }`
      })
      return `${IMPORT}export default [\n${functions.join(',\n')},\n]\n`
    }

    /**
     * How many cases `rewritten` is compared with `original` over, and how many it differs in.
     */
    function mismatches(
      original: readonly Shape[],
      rewritten: readonly Shape[],
    ): { cases: number; mismatches: number } {
      let cases = 0
      let wrong = 0
      for (const [index, expected] of original.entries()) {
        for (const [on, a, b] of listsOf(CONDITIONS, 3)) {
          cases += 1
          if (expected({ on, a, b }) !== rewritten[index]!({ on, a, b })) wrong += 1
        }
      }
      return { cases, mismatches: wrong }
    }

    const text = moduleOf(calls)
    const out = rewrite(text)
    const original = evaluate<Shape[]>(text, runtimeCx)

    it('gives the string cx() gives in every case, with the call gone from the module', () => {
      expect(out.problems).toBe(0)
      expect(out.code).not.toMatch(/\bcx\b/)

      const result = mismatches(original, evaluate<Shape[]>(out.code, undefined))

      expect(result.cases).toBeGreaterThan(100_000)
      expect(result.mismatches).toBe(0)
    }, 60_000)

    it('control: a rewrite without the falsy filter gives mismatches', () => {
      const control = evaluate<Shape[]>(out.code.replaceAll('.filter(Boolean)', ''), undefined)

      expect(mismatches(original, control).mismatches).toBeGreaterThan(0)
    }, 60_000)
  })

  describe('each argument is evaluated once, in its original order', () => {
    const DOMAIN: readonly unknown[] = [true, false, 0, 1, '', 'x', null, undefined, NaN, {}]
    const source = `${IMPORT}export default (a, b, c) => cx(a() && 'flex', b() ? 'grid' : c() && 'block')\n`
    const expected = runsOf(evaluate<Conditions>(source, runtimeCx), DOMAIN)

    it('logs what the run-time call logs, for every value combination', () => {
      const out = rewrite(source)

      expect(runsOf(evaluate<Conditions>(out.code, undefined), DOMAIN)).toEqual(expected)
    })

    it('control: a fold that reads the conditions in another order reds the comparison', () => {
      expect(runsOf(reordered, DOMAIN).logs).not.toEqual(expected.logs)
    })
  })

  describe('the source map of a rewritten module', () => {
    const source = [
      IMPORT.trimEnd(),
      "export const a = cx('flex', on && 'grid'); export const afterOnSameLine = 1",
      'export const b = [',
      "  cx('block'),",
      '  afterOnLaterLine,',
      "  cx.raw('x', y), afterRaw,",
      ']',
      '',
    ].join('\n')

    it.each(['afterOnSameLine', 'afterOnLaterLine', 'afterRaw', 'on &&', 'export const b'])(
      'maps %s to where it is written',
      async (token) => {
        const out = rewrite(source)
        expect(out.code).not.toBe(source)
        const consumer = await new SourceMapConsumer(JSON.parse(out.map) as RawSourceMap)
        try {
          const generated = positionOf(out.code, token)

          const origin = consumer.originalPositionFor(generated)

          expect(origin.source).toBe('module.js')
          expect({ column: origin.column, line: origin.line }).toEqual(positionOf(source, token))
        } finally {
          consumer.destroy()
        }
      },
    )
  })
})

describe('AC-used-atoms-22 — cx.raw and cx.dynamic calls, and the import that is left', () => {
  it('turns cx.raw and cx["raw"] calls into the join, mapping nothing', () => {
    const out = rewrite(
      `${IMPORT}export default [(on) => cx.raw('legacy', on && 'x'), () => cx['raw']('y', 'container'), () => cx.raw()]\n`,
    )

    expect(out.code).not.toMatch(/\bcx\b/)
    expect(out.code).not.toContain('nave-')
    const [a, b, c] = evaluate<((isOn?: boolean) => string)[]>(out.code, undefined)
    expect(a!(true)).toBe('legacy x')
    expect(a!(false)).toBe('legacy')
    expect(b!()).toBe('y container')
    expect(c!()).toBe('')
  })

  it('looks a cx.dynamic name up in one static map per module, equal to what keep and keepFor give', () => {
    const keep = { grid: 'nave-grid', block: 'nave-block' }
    const out = rewrite(
      `${IMPORT}export default [(t) => cx.dynamic(t), (t) => cx.dynamic(t) + cx.dynamic('grid')]\n`,
      keep,
    )

    expect(out.code).not.toMatch(/\bcx\b/)
    expect(out.code.match(/__proto__/g)).toHaveLength(1)
    const [one, two] = evaluate<((name: unknown) => string)[]>(out.code, undefined)
    // What `cx.dynamic()` returns for a name when `keep` is the map it reads (R7).
    const expected = (name: unknown): string =>
      name && Object.hasOwn(keep, name as string) ? keep[name as keyof typeof keep] : ''
    for (const name of [
      'grid',
      'block',
      'flex',
      '',
      0,
      null,
      undefined,
      false,
      'toString',
      'constructor',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(one!(name)).toBe(expected(name))
    }
    expect(two!('block')).toBe('nave-blocknave-grid')
  })

  it('leaves a cx.dynamic call without exactly one plain argument to the run-time function', () => {
    const out = rewrite(
      `${IMPORT}export const a = (t) => cx.dynamic(t, 1)\nexport const b = () => cx.dynamic()\nexport const c = (l) => cx.dynamic(...l)\n`,
      { grid: 'nave-grid' },
    )

    expect(out.code).toContain('cx.dynamic(t, 1)')
    expect(out.code).toContain('cx.dynamic()')
    expect(out.code).toContain('cx.dynamic(...l)')
    expect(out.code).toContain(`import { cx } from '${CX_SOURCE}'`)
  })

  it.each([
    ['const r = cx.raw', "const r = cx.raw\nexport const z = r('z')"],
    ['const { raw } = cx', "const { raw } = cx\nexport const z = raw('z')"],
    ['const { raw: r } = cx', "const { raw: r } = cx\nexport const z = r('z')"],
  ])('keeps the import for the aliased form %s, never an error', (_name, line) => {
    const out = rewrite(`${IMPORT}${line}\nexport const f = cx('flex')\n`)

    expect(out.problems).toBe(0)
    expect(out.code).toContain(`import { cx } from '${CX_SOURCE}'`)
    expect(out.code).toContain('export const f = "nave-flex"')
  })
})

describe('AC-used-atoms-21 and -22 — the shapes a build meets besides a plain call', () => {
  it('rewrites a namespace import and an aliased import, and removes both imports', () => {
    const out = rewrite(
      `import * as N from '${CX_SOURCE}'\nimport { cx as ncx } from '${CX_SOURCE}'\nexport const a = N.cx('block')\nexport const r = N.cx.raw('x', 'y')\nexport const b = ncx('grid')\n`,
    )

    expect(out.code).toBe(
      'export const a = "nave-block"\nexport const r = "x y"\nexport const b = "nave-grid"\n',
    )
  })

  it('rewrites an optional call, a call with a comment before its parenthesis, a parenthesised callee and a trailing comma', () => {
    const out = rewrite(
      `${IMPORT}export default [(on) => cx?.('flex'), (on) => cx /* c */ ('flex', on && 'grid'), (on) => (cx)('block', on && 'grid'), (on) => cx('flex', on && 'grid',)]\n`,
    )

    expect(out.code).not.toMatch(/\bcx\b/)
    const [a, b, c, d] = evaluate<((isOn: boolean) => string)[]>(out.code, undefined)
    expect([a!(true), b!(true), b!(false), c!(true), d!(false)]).toEqual([
      'nave-flex',
      'nave-flex nave-grid',
      'nave-flex',
      'nave-block nave-grid',
      'nave-flex',
    ])
  })

  it('rewrites a Vue template reaching cx through unref(), a call and a member of the call', () => {
    const out = rewrite(
      `import { unref as _unref } from 'vue'\n${IMPORT}export default (_ctx) => [_unref(cx)('flex', _ctx.on && 'grid'), _unref(cx).raw('legacy'), _unref(cx).dynamic(_ctx.t)]\n`,
      { grid: 'nave-grid' },
    )

    expect(out.code).not.toMatch(/\bcx\b/)
    const [f] = evaluate<((ctx: object) => string[])[]>(
      out.code.replace('export default', 'export default [').concat(']'),
      undefined,
    )
    expect(f!({ on: true, t: 'grid' })).toEqual(['nave-flex nave-grid', 'legacy', 'nave-grid'])
  })

  it('reads a minified call: template literals, !1 and void 0', () => {
    const out = rewrite(
      `${IMPORT}export default [(e) => cx(\`flex\`, e && \`grid\`, !1, void 0, \`block\`)]\n`,
    )

    expect(out.problems).toBe(0)
    const [f] = evaluate<((e: unknown) => string)[]>(out.code, undefined)
    expect(f!(true)).toBe('nave-flex nave-grid nave-block')
    expect(f!(false)).toBe('nave-flex nave-block')
  })

  it('reads a name bound to a name, in the order the call evaluates it', () => {
    const out = rewrite(
      `${IMPORT}export default [(isOn) => { const a = isOn ? 'flex' : ''; const b = a; return cx(b, 'grid') }]\n`,
    )

    const [f] = evaluate<((isOn: boolean) => string)[]>(out.code, undefined)
    expect([f!(true), f!(false)]).toEqual(['nave-flex nave-grid', 'nave-grid'])
  })

  it('keeps a directive first and declares the map after the imports, under a name nothing else spells', () => {
    const source = `'use strict'\nimport { ref } from 'vue'\n${IMPORT}const __naveKeep = ref\nexport const f = (t) => cx.dynamic(t)\n`
    const out = rewrite(source, { grid: 'nave-grid' })

    const body = parseAst(out.code).body as unknown as AstNode[]
    expect(body[0]).toMatchObject({ directive: 'use strict' })
    expect(out.code).toContain('const __naveKeep1={__proto__:null,"grid":"nave-grid"};')
    expect(out.code.indexOf('const __naveKeep1')).toBeGreaterThan(
      out.code.indexOf("import { ref } from 'vue'"),
    )
    expect(out.code.indexOf('const __naveKeep1')).toBeLessThan(
      out.code.indexOf('const __naveKeep ='),
    )
  })

  it('rewrites a call of a module listed in cxModules and keeps that import', () => {
    const source = `import { cx } from './ui'\nexport const f = cx('flex')\n`
    const out = rewrite(
      source,
      {},
      {
        cxSources: new Set(['./ui', CX_SOURCE]),
        declaredSources: new Set(['./ui']),
      },
    )

    expect(out.code).toBe(`import { cx } from './ui'\nexport const f = "nave-flex"\n`)
  })

  it('reads a call that evaluates a condition with a side effect, once', () => {
    const out = rewrite(`${IMPORT}export default (hit) => cx(hit() && 'flex', 'grid')\n`)

    let hits = 0
    const f = evaluate<(didHit: () => boolean) => string>(out.code, undefined)
    expect(f(() => (hits += 1) > 0)).toBe('nave-flex nave-grid')
    expect(hits).toBe(1)
  })

  it('maps a module with CRLF line ends to where each token is written', async () => {
    const source =
      `${IMPORT}export const a = cx('flex', on && 'grid');\r\nexport const afterLine = 1\r\n`
        .replaceAll('\n', '\r\n')
        .replaceAll('\r\r\n', '\r\n')
    const out = rewrite(source)
    const consumer = await new SourceMapConsumer(JSON.parse(out.map) as RawSourceMap)
    try {
      const origin = consumer.originalPositionFor(positionOf(out.code, 'afterLine'))

      expect({ column: origin.column, line: origin.line }).toEqual(positionOf(source, 'afterLine'))
    } finally {
      consumer.destroy()
    }
  })
})

describe('AC-used-atoms-23 — the rewrite adds no import and no runtime', () => {
  it('declares the input imports minus the cx import, and inserts only data and the join', () => {
    const source = `import { ref } from 'vue'\n${IMPORT}import './side.js'\nexport const f = (on) => cx('flex', on && 'grid')\nexport const g = (t) => cx.dynamic(t)\nexport const h = cx.raw('a', ref)\n`
    const out = rewrite(source, { grid: 'nave-grid' })

    expect(importsOf(out.code)).toEqual(importsOf(source).filter((name) => name !== CX_SOURCE))
    expect(out.code).not.toMatch(/\b(?:require|function|import\()/)
    expect(out.code.match(/=>/g)).toHaveLength(source.match(/=>/g)!.length)
  })

  it('keeps the input imports as they are when a use of the binding stays', () => {
    const source = `import { ref } from 'vue'\n${IMPORT}export const f = cx('flex')\nexport const q = [cx]\n`
    const out = rewrite(source)

    expect(importsOf(out.code)).toEqual(importsOf(source))
  })

  it('does not read a module it was not asked to rewrite', () => {
    const code = `${IMPORT}export const f = cx('flex')\n`
    const reading = readModule(code, parseAst(code) as unknown as AstNode, {
      cxSources: new Set([CX_SOURCE]),
      ownAtoms: new Set(),
      isDependency: false,
    })

    expect(reading.edits).toEqual([])
  })
})
