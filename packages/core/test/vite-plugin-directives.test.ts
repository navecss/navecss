/**
 * The Vite plugin's leg of the directive criteria, fed through its transform hook directly:
 * AC-directive-core-04 (placement, and what is refused), -10 (the directive's spelling), -11 (the
 * prelude as component values), -12 (a block and a nested group rule), -14 (the texts, printed
 * with the host's frame), -16 (the fold: every problem in one stylesheet, in one report) and -17
 * (whose line and column, for this plugin).
 */
import { SourceMapGenerator } from 'source-map'
import { describe, expect, it } from 'vitest'

import { runHook } from './helpers/vite-hook.ts'

const flat = (css: string | undefined): string => (css ?? '').replaceAll(/\s+/g, ' ').trim()

describe('AC-directive-core-04 — placement, through the Vite plugin', () => {
  const rows: readonly [input: string, expected: string][] = [
    ['.a { color: red; @nave flex; }', '.a { color: red; display: flex; }'],
    [
      '.a { &:hover { color: red } @nave flex; }',
      '.a { &:hover { color: red } & { display: flex } }',
    ],
    ['.a { color: red; @foo; @nave flex; }', '.a { color: red; @foo; & { display: flex } }'],
    [
      '@supports (display: grid) { .a { @nave flex; } }',
      '@supports (display: grid) { .a { display: flex; } }',
    ],
    ['.a { @media (x) { & { @nave flex; } } }', '.a { @media (x) { & { display: flex; } } }'],
  ]

  it.each(rows)('%s', async (input, expected) => {
    const run = await runHook({ code: input, options: { onUnknown: 'warn' } })

    expect(run.warnings).toEqual([])
    expect(flat(run.code)).toBe(expected)
  })

  it.each([
    '@keyframes k { to { @nave flex; } }',
    '@-webkit-keyframes k { to { @nave flex; } }',
    '@keyframes k { to { .f { @nave flex; } } }',
    '.a { @nave; }',
    '.a { @nave toString; }',
  ])(
    '%s is refused through onUnknown: removed under warn and ignore, an error under error',
    async (css) => {
      const warned = await runHook({ code: css, options: { onUnknown: 'warn' } })
      const ignored = await runHook({ code: css, options: { onUnknown: 'ignore' } })
      const errored = await runHook({ code: css, options: { onUnknown: 'error' } })

      expect(warned.warnings).toHaveLength(1)
      expect(warned.code).not.toContain('@nave')
      expect(ignored.warnings).toEqual([])
      expect(ignored.code).not.toContain('@nave')
      expect(errored.error).toBeDefined()
    },
  )

  it('does not select the most permissive mode for a value outside the closed set', async () => {
    // @ts-expect-error — exercising a value outside the closed set on purpose
    const run = await runHook({ code: '.a { @nave nope; }', options: { onUnknown: 'bogus' } })

    expect(run.error).toBeDefined()
  })
})

describe('AC-directive-core-10 — the directive name matches ASCII case-insensitively', () => {
  it.each([
    '.a { @NAVE flex; }',
    '.a { @Nave flex; }',
    String.raw`.a { @n\61ve flex; }`,
    String.raw`.a { @n\61 ve flex; }`,
    String.raw`.a { @\6e ave flex; }`,
  ])('%s expands to display: flex', async (css) => {
    const run = await runHook({ code: css })

    expect(run.error).toBeUndefined()
    expect(flat(run.code)).toBe('.a { display: flex; }')
  })

  it.each(['.a { @navex flex; }', '.a { @nave-x flex; }', '.a { @ｎave flex; }'])(
    '%s passes through unchanged, no diagnostic',
    async (css) => {
      const run = await runHook({ code: css, options: { onUnknown: 'warn' } })

      expect(run.warnings).toEqual([])
      expect(run.error).toBeUndefined()
      expect(run.code ?? css).toBe(css)
    },
  )
})

describe('AC-directive-core-11 — the prelude is read as component values, through the Vite plugin', () => {
  const rows: readonly [prelude: string, expands: string, problems: number][] = [
    ['flex block', 'display: flex; display: block;', 0],
    ['flex /* c */ block', 'display: flex; display: block;', 0],
    ['flex/**/block', 'display: flex; display: block;', 0],
    ['flex, block', 'display: flex; display: block;', 1],
    ['flex,block', 'display: flex; display: block;', 1],
    ['flex !important', 'display: flex;', 1],
    ['flex "block"', 'display: flex;', 1],
    ['flex 2', 'display: flex;', 1],
    ['flex var(--x, a b)', 'display: flex;', 1],
    ['.flex', 'display: flex;', 1],
    ['flex [a]', 'display: flex;', 1],
    ['nope flex', 'display: flex;', 1],
  ]

  it.each(rows)(
    'under warn, %s expands what it can and reports each problem',
    async (prelude, expands, problems) => {
      const run = await runHook({
        code: `.a { @nave ${prelude}; }`,
        options: { onUnknown: 'warn' },
      })

      expect(flat(run.code)).toBe(`.a { ${expands} }`)
      expect(run.warnings).toHaveLength(problems)
    },
  )

  it.each(rows)(
    'under ignore, %s expands the same names and reports nothing',
    async (prelude, expands) => {
      const run = await runHook({
        code: `.a { @nave ${prelude}; }`,
        options: { onUnknown: 'ignore' },
      })

      expect(flat(run.code)).toBe(`.a { ${expands} }`)
      expect(run.warnings).toEqual([])
      expect(run.error).toBeUndefined()
    },
  )

  it.each(rows.filter(([, , problems]) => problems > 0))(
    'under error, %s fails with one report',
    async (prelude) => {
      const run = await runHook({
        code: `.a { @nave ${prelude}; }`,
        options: { onUnknown: 'error' },
      })

      expect(run.error).toBeDefined()
    },
  )

  it('a bad-token message quotes the token as written and says to separate names with spaces', async () => {
    const run = await runHook({
      code: '.a { @nave flex "block"; }',
      options: { onUnknown: 'warn' },
    })

    expect(run.warnings[0]!.message).toContain('"block"')
    expect(run.warnings[0]!.message).toContain('separate atom names with spaces')
  })
})

describe('AC-directive-core-12 — a directive block, and a directive directly in a nested group rule', () => {
  it('a directive with a {} block is one has-block diagnostic, and an error under error', async () => {
    const css = '.a { @nave flex { color: red } }'
    const warned = await runHook({ code: css, options: { onUnknown: 'warn' } })
    const errored = await runHook({ code: css, options: { onUnknown: 'error' } })

    expect(warned.warnings).toHaveLength(1)
    expect(warned.warnings[0]!.message).toContain('a directive with a {} block is not supported')
    expect(errored.error).toBeDefined()
  })

  it.each([
    '@media (width >= 37.5em)',
    '@supports (display: grid)',
    '@container (width > 1px)',
    '@layer x',
    '@scope (.b)',
    '@starting-style',
  ])(
    '%s: one bad-parent that names the & { } workaround; the at-rule stays, emptied',
    async (group) => {
      const run = await runHook({
        code: `.a { ${group} { @nave flex; } }`,
        options: { onUnknown: 'warn' },
      })

      expect(run.warnings).toHaveLength(1)
      expect(run.warnings[0]!.message).toContain('& { @nave ...; }')
      expect(flat(run.code)).toContain(group)
      expect(run.code).not.toContain('@nave')
    },
  )
})

describe('AC-directive-core-14 — the core’s texts, printed with the host’s frame', () => {
  it('an unknown atom prints the core’s text after the file:line:column frame', async () => {
    const run = await runHook({
      code: '.x { @nave interactve; }',
      id: '/proj/card.css',
      options: { onUnknown: 'error' },
    })

    expect(run.error!.message).toContain('/proj/card.css:1:12: ')
    expect(run.error!.message).toContain(
      '@nave: unknown atom "interactve". Did you mean "interactive"?',
    )
  })

  it('an unhinted unknown atom keeps its Available list, printed last', async () => {
    const run = await runHook({
      code: '.x { @nave fancyShadow; }',
      options: { onUnknown: 'error' },
    })
    const lines = run.error!.message.split('\n')

    expect(lines[0]).toContain(
      '@nave: unknown atom "fancyShadow". If it is an atom of your own, pass it in the extend option.',
    )
    expect(lines.find((line) => line.startsWith('Available: '))).toBeDefined()
  })

  it('an extend atom is a hint candidate, with no Available list', async () => {
    const run = await runHook({
      code: '.x { @nave brandBoxx; }',
      options: { extend: { brandBox: { declarations: { color: 'red' } } } },
    })

    expect(run.error!.message).toContain('Did you mean "brandBox"?')
    expect(run.error!.message).not.toContain('Available:')
  })

  it('the other texts are the core’s own, unchanged', async () => {
    const bare = await runHook({ code: '.x { @nave; }' })
    const top = await runHook({ code: '@nave flex;' })
    const keyframes = await runHook({ code: '@keyframes k { to { @nave flex; } }' })

    expect(bare.error!.message).toContain('@nave: directive names no atom')
    expect(top.error!.message).toContain(
      '@nave must be the direct child of a CSS rule selector block',
    )
    expect(keyframes.error!.message).toContain('@nave cannot be used inside @keyframes')
  })
})

describe('AC-directive-core-16 — every problem in one stylesheet, in one report (Vite)', () => {
  const CSS = '.root {\n  @nave flx interactve;\n}\n.icon {\n  @nave srOnlyy;\n}'

  it('under error is one error at 2:9 whose body is the fold', async () => {
    const run = await runHook({ code: CSS, id: '/proj/app.css' })
    const lines = run.error!.message.split('\n')

    expect(run.error!.loc).toEqual({ file: '/proj/app.css', line: 2, column: 8 })
    expect(lines[0]).toMatch(
      /^\/proj\/app\.css:2:9: @nave: unknown atom "flx"\. Did you mean "flex"\?/,
    )
    expect(lines[1]).toBe('2 more in this stylesheet:')
    expect(lines[2]).toMatch(/^2:13: unknown atom "interactve"\. Did you mean "interactive"\?/)
    expect(lines[3]).toMatch(/^5:9: unknown atom "srOnlyy"\. Did you mean "srOnly"\?/)
  })

  it('a @keyframes problem on line 7 joins the same report', async () => {
    const run = await runHook({ code: `${CSS}\n@keyframes k { to { @nave flex; } }` })

    expect(run.error!.message).toMatch(/\n7:\d+: @nave cannot be used inside @keyframes/)
    expect(run.error!.message).toContain('3 more in this stylesheet:')
  })

  it('prints Available once, last, when any folded problem has no hint', async () => {
    const run = await runHook({ code: '.a { @nave flx; }\n.b { @nave zzqqxxww; }' })
    const lines = run.error!.message.split('\n')

    expect(lines.filter((line) => line.startsWith('Available: '))).toHaveLength(1)
    expect(lines.at(-1)).toMatch(/^Available: /)
  })

  it('under warn there are exactly three warnings, at 2:9, 2:13 and 5:9, with no fold', async () => {
    const run = await runHook({ code: CSS, options: { onUnknown: 'warn' } })

    expect(run.warnings.map((w) => [w.loc!.line, w.loc!.column + 1])).toEqual([
      [2, 9],
      [2, 13],
      [5, 9],
    ])
    expect(run.warnings.some((w) => w.message.includes('more in this stylesheet'))).toBe(false)
  })

  it('two stylesheets with one problem each give two reports', async () => {
    const first = await runHook({ code: '.a { @nave nope; }', id: '/proj/a.css' })
    const second = await runHook({ code: '.b { @nave nope; }', id: '/proj/b.css' })

    expect(first.error!.message).toContain('/proj/a.css:1:')
    expect(second.error!.message).toContain('/proj/b.css:1:')
  })
})

describe('AC-directive-core-17 — whose line and column (Vite)', () => {
  const CSS = '.x {\n  color: red;\n  @nave nope;\n}'

  function incomingMap(): { sources: string[]; mappings: string; names: string[] } {
    const generator = new SourceMapGenerator({ file: 'compiled.css' })
    generator.addMapping({
      source: '/proj/a.scss',
      original: { line: 4, column: 2 },
      generated: { line: 3, column: 2 },
    })
    return JSON.parse(generator.toString()) as {
      sources: string[]
      mappings: string
      names: string[]
    }
  }

  it('maps the diagnostic to the authored file and line when Vite supplies a map', async () => {
    const run = await runHook({ code: CSS, id: '/proj/compiled.css', incomingMap: incomingMap() })

    expect(run.error!.loc!.file).toBe('/proj/a.scss')
    expect(run.error!.loc!.line).toBe(4)
    expect(run.error!.message).toContain('/proj/a.scss:4:')
    expect(run.error!.message).not.toContain('no source map')
  })

  it('with no map, names the file Vite passed and says the position is as processed', async () => {
    const run = await runHook({ code: CSS, id: '/proj/compiled.css?inline' })

    expect(run.error!.loc!.file).toBe('/proj/compiled.css')
    expect(run.error!.message).toContain('/proj/compiled.css:3:9: ')
    expect(run.error!.message).toContain(
      '(position in /proj/compiled.css as processed; no source map)',
    )
  })

  it('loc.column is the diagnostic’s column minus 1, while the message prints it 1-based', async () => {
    const run = await runHook({ code: CSS, id: '/proj/compiled.css' })

    expect(run.error!.loc!.column).toBe(8)
    expect(run.error!.message).toContain(':3:9: ')
  })

  it('a stylesheet Vite supplies an empty map for is read as having none', async () => {
    const run = await runHook({ code: CSS, id: '/proj/compiled.css' })

    expect(run.error!.message).toContain('no source map')
  })
})
