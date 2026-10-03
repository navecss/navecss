/**
 * Edge cases of the used-atoms plugin that its row tables do not reach: a class split across
 * adjacent literals, scope rules for parameters and loops, short-circuits that decide a call,
 * escaped class literals, the pruning step's reading of CSS spellings, the report's ordering and
 * text, option validation of holes, line terminators in a source map position, and a stylesheet
 * edited in watch mode.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { hintFor } from '../src/vite-atom-check.ts'
import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'
import { writeHandshake } from '../src/vite-handshake.ts'
import { cut } from '../src/vite-problems.ts'
import { inspectAtomicLayer, pruneAtomicLayer } from '../src/vite-prune.ts'
import { authoredPlace } from '../src/vite-source-map.ts'
import { stateFor } from '../src/vite-state.ts'
import { buildReport, type LocatedProblem } from '../src/vite-used-report.ts'
import { navePlugin } from '../src/vite.ts'

const IMPORT = `import { cx } from '${CX_SOURCE}'\n`

/**
 * Reads `code` as an application module; `isVueScript` says whether it is a compiled component's
 * script.
 */
function read(code: string, isVueScript = false): ModuleReading {
  return readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(),
    isDependency: false,
    isVueScript,
  })
}

describe('a Nave class split across adjacent literals is refused', () => {
  it.each(["'na' + 've-' + tone", "'nave' + '-' + tone", "`na` + 've-' + tone"])(
    '%s',
    (expression) => {
      const reading = read(`${IMPORT}export const f = (tone) => ${expression}\n`)

      expect(reading.problems.map((problem) => problem.kind)).toEqual(['concatenation'])
    },
  )

  it('leaves a split that does not end in the prefix alone', () => {
    const reading = read(`${IMPORT}export const f = (tone) => 'a' + 'b-' + tone\n`)

    expect(reading.problems).toEqual([])
  })
})

describe('scope rules', () => {
  it('a var redeclared with no value is no write', () => {
    const reading = read(`${IMPORT}var name = 'flex'; var name; cx(name)\n`)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(['flex'])
  })

  it('a default parameter does not see a declaration in the function body', () => {
    const reading = read(
      `${IMPORT}export function f(a = cx('flex')) { const cx = (x) => x; return [a, cx(1)] }\n`,
    )

    expect([...reading.atoms]).toEqual(['flex'])
  })

  it('the iterable of a loop is read in the scope around it', () => {
    const reading = read(`${IMPORT}for (const cx of [cx('grid')]) { void cx }\n`)

    expect([...reading.atoms]).toEqual(['grid'])
    expect(reading.problems).toEqual([])
  })
})

describe('a short-circuit that decides the call', () => {
  it.each([
    ['false && props.variant', []],
    ['null && props.variant', []],
    ["'flex' || props.variant", ['flex']],
    ["'grid' ?? props.variant", ['grid']],
  ])('%s', (expression, expected) => {
    const reading = read(`${IMPORT}export const f = (props) => cx(${expression})\n`)

    expect(reading.problems).toEqual([])
    expect([...reading.atoms]).toEqual(expected)
  })

  it('still refuses an operand that decides nothing', () => {
    const reading = read(`${IMPORT}export const f = (props) => cx(props.on && props.variant)\n`)

    expect(reading.problems).toHaveLength(1)
  })
})

describe('an escaped class literal', () => {
  it('is decoded before it is matched', () => {
    const reading = read(String.raw`export const s = 'nave-\x66lex'` + '\n')

    expect([...reading.classes]).toEqual(['flex'])
  })
})

describe('the setup-return exposure belongs to a compiled Vue script', () => {
  const code = `${IMPORT}const __returned__ = { get cx() { return cx } }\nexport default __returned__\n`

  it('is refused in an ordinary module and read in a component script', () => {
    expect(read(code).problems.map((problem) => problem.kind)).toEqual(['reference'])
    const reading = read(code, true)

    expect(reading.problems).toEqual([])
    expect(reading.exposes.get('cx')).toEqual({ kind: 'cx' })
  })
})

describe('the call a namespace import quotes', () => {
  it('names N.cx.dynamic, the callee that ran', () => {
    const reading = read(
      `import * as N from '${CX_SOURCE}'\nexport const f = (t) => N.cx.dynamic(t)\n`,
    )

    expect(reading.dynamicCalls[0]!.construct).toBe('N.cx.dynamic(t)')
  })
})

describe('the pruning step reads CSS spellings', () => {
  const body = '{ .nave-flex { display: flex } .nave-grid { display: grid } }'

  it('finds a layer named with a comment or an escape, and prunes it', () => {
    for (const opener of ['@layer /* c */ atomic', String.raw`@layer \61tomic`]) {
      const css = `${opener} ${body}`

      expect(inspectAtomicLayer(css).hasLayer, opener).toBe(true)
      expect(pruneAtomicLayer(css, new Set(['flex'])), opener).not.toContain('nave-grid')
    }
  })

  it('keeps the comments of a layer left with nothing else', () => {
    const css = '@layer atomic { /* kept */ }'

    expect(pruneAtomicLayer(css, new Set())).toBe(css)
  })
})

describe('the report', () => {
  const problem = (overrides: Partial<LocatedProblem>): LocatedProblem => ({
    kind: 'argument',
    offset: 0,
    construct: 'cx(x)',
    text: 'the argument is not a literal atom name.',
    file: 'src/a.ts',
    line: 1,
    column: 1,
    ...overrides,
  })

  it('prints a construct on one line', () => {
    expect(cut('cx(a,\n   b)')).toBe('cx(a, b)')
  })

  it('keeps the application’s cx.dynamic() calls ahead of a dependency’s problems', () => {
    const report = buildReport([
      problem({ file: 'node_modules/dep/index.js', pkg: 'dep' }),
      problem({ kind: 'dynamic', construct: 'cx.dynamic(t)', text: '', file: 'src/z.ts' }),
    ])
    const lines = report.split('\n')

    expect(lines.findIndex((line) => line.startsWith('src/z.ts'))).toBeLessThan(
      lines.findIndex((line) => line.startsWith('node_modules/dep')),
    )
  })
})

describe('option validation', () => {
  it('refuses a hole in a keepFor list', () => {
    // eslint-disable-next-line no-sparse-arrays
    const holey = ['flex', , 'grid'] as never
    expect(() => navePlugin({ keepFor: { '@acme/ui': holey } })).toThrow('keepFor["@acme/ui"]')
  })

  it('does not crash on extend: null', () => {
    expect(() => navePlugin({ extend: null as never, keep: ['sr-only' as never] })).toThrow(
      'navePlugin(): keep names an unknown atom "sr-only"',
    )
  })
})

describe('the hint', () => {
  it('is not taken from text inside the name', () => {
    expect(hintFor('xx Did you mean "flex"?')).toBeUndefined()
  })
})

describe('a place in the module', () => {
  it.each([
    ['carriage return', 'a\rb'],
    ['carriage return and line feed', 'a\r\nb'],
    ['line separator', 'a\u2028b'],
    ['paragraph separator', 'a\u2029b'],
    ['line feed', 'a\nb'],
  ])('counts a %s as a line break', (_name, code) => {
    expect(authoredPlace(code, code.indexOf('b'), undefined)).toEqual({ line: 2, column: 1 })
  })
})

describe('a failed cache file write', () => {
  it('is said, not swallowed', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nave-handshake-'))
    try {
      const blocker = path.join(directory, 'file')
      writeFileSync(blocker, 'x')
      const messages: string[] = []
      writeHandshake(
        path.join(blocker, 'cache'),
        { emitted: ['flex'], writer: 'client', consumed: false },
        (message) => messages.push(message),
      )

      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain('nave-used-atoms.json')
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})

describe('a stylesheet edited in watch mode', () => {
  it('forgets its layer once the layer is gone', async () => {
    const [nave] = navePlugin()
    const config = {
      root: '/watch-root',
      command: 'build',
      logger: { warn() {} },
    }
    nave.configResolved(config)
    const ctx = {
      environment: { name: 'client', config: { consumer: 'client' }, plugins: [] },
    } as never
    const transform = nave.transform as (this: never, code: string, id: string) => Promise<unknown>

    await transform.call(ctx, '@layer atomic { .nave-flex { display: flex } }', '/watch-root/a.css')
    const state = stateFor('/watch-root', config)
    expect(state.sheets.size).toBe(1)
    await transform.call(ctx, '.card { color: red }', '/watch-root/a.css')

    expect(state.sheets.size).toBe(0)
  })
})
