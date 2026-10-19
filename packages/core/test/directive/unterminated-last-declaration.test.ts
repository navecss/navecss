/**
 * A rule whose last declaration has no `;` is lawful CSS. `expandText()` appends the blocks an
 * atom adds (`:focus-visible`, `@media`, `@container`) at the rule's closing `}`, so without a
 * `;` of its own the first block was written into that declaration's value: the declaration and
 * the block were both invalid and the browser dropped both. With `focusRing` that left the
 * element with `outline: none` and nothing to restore it under keyboard focus.
 *
 * Every leg that expands text is run on the same rows: the text expander, the Vite plugin on its
 * default transformer, the Lightning CSS adapter (and Lightning CSS reading what it printed, on
 * both releases the adapter supports) and `navecss-core expand`. The PostCSS plugin builds nodes
 * rather than text and is the control.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { tokenize } from '../../src/directive/tokenizer.ts'
import { runExpand } from '../../src/expand-command.ts'
import { navePlugin as lightningAdapter } from '../../src/lightningcss.ts'
import { navePlugin } from '../../src/postcss.ts'
import { LIGHTNING_RELEASES } from '../helpers/lightningcss-releases.ts'
import { runHook } from '../helpers/vite-hook.ts'

interface Row {
  readonly name: string
  readonly css: string
  /**
   * The nested at-rules (by name) `.x` must still hold.
   */
  readonly atRules: readonly string[]
  /**
   * The declarations the `.x` rule must still hold directly.
   */
  readonly declarations: Record<string, string>
  /**
   * The nested rules `.x` must still hold.
   */
  readonly rules: readonly string[]
}

const FOCUS = '&:focus-visible'

/**
 * Collapses whitespace so the rows pin the bytes that matter, not the spacing around them.
 */
function norm(css: string): string {
  return css.replaceAll(/\s+/g, ' ').replaceAll('}}', '} }').trim()
}

const ROWS: readonly Row[] = [
  {
    name: 'focusRing, then a declaration with no semicolon',
    css: '.x { @nave focusRing; color: red }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: 'hideDesktopUp, then a declaration with no semicolon',
    css: '.x { @nave hideDesktopUp; display: grid }',
    declarations: { display: 'grid' },
    rules: [],
    atRules: ['media'],
  },
  {
    name: 'hideDesktopUp then focusRing: the ring is the second block',
    css: '.x { @nave hideDesktopUp focusRing; color: red }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: ['media'],
  },
  {
    name: 'focusRing then hideDesktopUp: the ring is the first block',
    css: '.x { @nave focusRing hideDesktopUp; color: red }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: ['media'],
  },
  {
    name: 'srOnlyFocusable keeps both reveals',
    css: '.x { @nave srOnlyFocusable; color: red }',
    declarations: { position: 'absolute', color: 'red' },
    rules: [FOCUS, '&:focus-within'],
    atRules: [],
  },
  {
    name: 'a comment after the last declaration',
    css: '.x { @nave focusRing; color: red /* c */ }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: 'a declaration that abuts the closing brace',
    css: '.x{@nave focusRing;color:red}',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: '!important on the last declaration',
    css: '.x { @nave focusRing; color: red !important }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: 'a custom property as the last declaration',
    css: '.x { @nave focusRing; --gap: 1px }',
    declarations: { outline: 'none', '--gap': '1px' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: 'the directive is itself the last item',
    css: '.x { color: red; @nave focusRing }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: 'inside an @media rule',
    css: '@media (width >= 1px) { .x { @nave focusRing; color: red } }',
    declarations: { outline: 'none', color: 'red' },
    rules: [FOCUS],
    atRules: [],
  },
  {
    name: 'after a nested rule, so the directive is wrapped',
    css: '.x { &:hover { color: blue } @nave focusRing; color: red }',
    declarations: { color: 'red' },
    rules: ['&:hover', '&', FOCUS],
    atRules: [],
  },
]

interface Found {
  atRules: string[]
  declarations: Record<string, string>
  rules: string[]
}

/**
 * What the rule `selector` (the `.x` rule unless told otherwise) of `css` still holds once a CSS
 * parser has read it.
 */
function readRule(css: string, selector = '.x'): Found {
  const found: Found = { atRules: [], declarations: {}, rules: [] }
  postcss.parse(css).walkRules(selector, (rule) => {
    rule.each((child) => {
      switch (child.type) {
        case 'atrule': {
          found.atRules.push(child.name)
          break
        }
        case 'decl': {
          found.declarations[child.prop] = child.value.trim()
          break
        }
        case 'rule': {
          found.rules.push(...child.selectors)
          // The declarations a directive's rule writes after a nested block sit inside `& { }`,
          // which is still the rule's own content.
          if (child.selector === '&') {
            child.each((inner) => {
              if (inner.type === 'decl') found.declarations[inner.prop] = inner.value.trim()
            })
          }
          break
        }
        default: {
          break
        }
      }
    })
  })
  return found
}

/**
 * The shape `readRule()` must answer for `row`.
 */
function intact(row: Row): Found {
  return {
    atRules: expect.arrayContaining([...row.atRules]) as string[],
    declarations: expect.objectContaining(row.declarations) as Record<string, string>,
    rules: expect.arrayContaining([...row.rules]) as string[],
  }
}

const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories) rmSync(directory, { force: true, recursive: true })
  directories.length = 0
})

async function viaCommandLine(css: string): Promise<string> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nave-unterminated-'))
  directories.push(directory)
  const source = path.join(directory, 'in.css')
  const out = path.join(directory, 'out.css')
  writeFileSync(source, css)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const status = await runExpand([`--source=${source}`, `--out=${out}`])
  expect(status).toBe(0)
  return readFileSync(out, 'utf8')
}

describe('a rule whose last declaration has no semicolon keeps that declaration and every block', () => {
  describe.each(ROWS)('$name', (row) => {
    it('expandText()', () => {
      const { css } = expandText(row.css, {})

      expect(readRule(css), css).toMatchObject(intact(row))
    })

    it('the Vite plugin', async () => {
      const run = await runHook({ code: row.css })

      expect(run.error).toBeUndefined()
      expect(readRule(run.code!), run.code).toMatchObject(intact(row))
    })

    it('the Lightning CSS adapter, and Lightning CSS reading what it printed', () => {
      const expanded = lightningAdapter().expand(row.css, '/proj/app.css')

      const text = Buffer.from(expanded.code).toString()
      expect(readRule(text), text).toMatchObject(intact(row))
      for (const { lib } of LIGHTNING_RELEASES) {
        const printed = lib.transform({ filename: '/proj/app.css', code: expanded.code })
        expect(readRule(printed.code.toString()), printed.code.toString()).toMatchObject(
          intact(row),
        )
      }
    })

    it('navecss-core expand', async () => {
      const css = await viaCommandLine(row.css)

      expect(readRule(css), css).toMatchObject(intact(row))
    })

    it('control: the PostCSS plugin', async () => {
      const result = await postcss([navePlugin()]).process(row.css, { from: undefined })

      expect(readRule(result.css), result.css).toMatchObject(intact(row))
    })
  })
})

describe('the shapes that were already correct stay as they were', () => {
  const RING =
    '&:focus-visible { outline-style: solid; outline-width: var(--nave-border-width-focus, 2px); outline-color: var(--nave-color-border-focus, currentColor); outline-offset: 2px }'

  it.each([
    [
      'a last declaration that has its semicolon',
      '.x { @nave focusRing; color: red; }',
      `.x { outline: none; ${RING} & { color: red; } }`,
    ],
    [
      'a nested rule as the last item',
      '.x { @nave focusRing; &:hover { color: blue } }',
      `.x { outline: none; ${RING} &:hover { color: blue } }`,
    ],
    [
      'a directive that is itself the last item',
      '.x { color: red; @nave focusRing }',
      `.x { color: red; outline: none; ${RING} }`,
    ],
    ['an empty remainder', '.x { @nave focusRing; }', `.x { outline: none; ${RING} }`],
  ])('%s gains no semicolon', (_name, css, expected) => {
    expect(norm(expandText(css, {}).css)).toBe(norm(expected))
  })

  it('input that ends before the rule closes is still closed once', () => {
    const { css } = expandText('.x { @nave focusRing; color: red', {})

    expect(norm(css)).toBe(norm(`.x { outline: none; ${RING} & { color: red; }`))
  })
})

describe('input that ends before the rule closes', () => {
  it.each([
    ['a closed comment', '.x { @nave focusRing; color: red /* c */', 'color: red; /* c */'],
    ['an unclosed comment', '.x { @nave focusRing; color: red /* c', 'color: red; }/* c'],
  ])('keeps the last declaration when it ends in %s', (_name, css, expected) => {
    expect(norm(expandText(css, {}).css)).toContain(expected)
  })
})

describe('a declaration that abuts an unclosed comment at the end of the input', () => {
  // `postcss.parse()` refuses an unclosed comment (and the rule it leaves open), so the printed
  // text is closed for the parser only: the verdict is the one every row above is read against.
  it('keeps the declaration and the block ahead of the comment', () => {
    const { css } = expandText('.x{@nave focusRing;color:red/* c', {})

    expect(readRule(`${css}*/}`)).toMatchObject({
      atRules: [],
      declarations: expect.objectContaining({ outline: 'none', color: 'red' }) as Record<
        string,
        string
      >,
      rules: expect.arrayContaining([FOCUS]) as string[],
    })
  })
})

describe('an at-rule statement with no semicolon as the last item', () => {
  it('is ended before the block that follows it', () => {
    const { css } = expandText('.x { @nave focusRing; @unknown thing }', {})

    expect(readRule(css).rules).toContain(FOCUS)
  })
})

describe('a trailing backslash before the line break', () => {
  it('is not turned into an escape by the inserted semicolon', () => {
    const { css } = expandText('.x { @nave focusRing; color: red\\\n }', {})

    expect(readRule(css).rules).toContain(FOCUS)
  })
})

/**
 * `css` closed for the parser, and for nothing else: `postcss.parse()` refuses an unclosed comment
 * and an unclosed rule, which is what an expansion of input that ends early is allowed to print.
 * The closing text is derived from the tokenizer, not from a pattern over the text, so a brace
 * inside a string or a comment is not counted. It only ever adds closers after the last byte, so
 * it cannot move a block into or out of another rule: a wrong nesting stays wrong.
 */
function closedForTheParser(css: string): string {
  const tokens = tokenize(css)
  const last = tokens.at(-1)
  const isInUnclosedComment =
    last?.type === 'comment' && !(last.raw.length >= 4 && last.raw.endsWith('*/'))
  let depth = 0
  for (const token of tokens) {
    if (token.type === '{-token') depth++
    else if (token.type === '}-token') depth--
  }
  return `${css}${isInUnclosedComment ? '*/' : ''}${'}'.repeat(Math.max(depth, 0))}`
}

const UNCLOSED_COMMENT = '/* c'
const CLOSED_COMMENT = '/* c */'

describe('input that ends in a comment or a backslash before the rule closes', () => {
  it.each([
    ['a closed comment', CLOSED_COMMENT],
    ['an unclosed comment', UNCLOSED_COMMENT],
  ])("closes the nested rule ahead of %s, so the block is the outer rule's own", (_n, comment) => {
    const { css } = expandText(`.x { @nave focusRing; &:hover { color: red ${comment}`, {})
    const parsed = closedForTheParser(css)

    expect(readRule(parsed, '&:hover')).toMatchObject({
      declarations: { color: 'red' },
      rules: [],
    })
    expect(readRule(parsed).rules).toContain(FOCUS)
    expect(readRule(parsed, '&:hover').rules).not.toContain(FOCUS)
  })

  it.each([
    ['a closed comment', CLOSED_COMMENT],
    ['an unclosed comment', UNCLOSED_COMMENT],
  ])('two nested rules that both use @nave keep both rings ahead of %s', (_n, comment) => {
    const { css } = expandText(
      `.x { @nave focusRing; &:hover { @nave focusRing; color: red ${comment}`,
      {},
    )
    const parsed = closedForTheParser(css)

    expect(readRule(parsed).rules).toContain(FOCUS)
    expect(readRule(parsed, '&:hover').rules).toContain(FOCUS)
  })

  describe.each([
    ['a line feed', '\n'],
    ['a carriage return and a line feed', '\r\n'],
  ])('a backslash before %s, then a comment', (_name, lineBreak) => {
    it.each([
      ['a closed comment', CLOSED_COMMENT],
      ['an unclosed comment', UNCLOSED_COMMENT],
    ])('does not escape the inserted semicolon when it is %s', (_n, comment) => {
      const { css } = expandText(`.x { @nave focusRing; color: red\\${lineBreak}${comment}`, {})

      expect(readRule(closedForTheParser(css)).rules).toContain(FOCUS)
    })
  })

  it('does not spell an escape out after an escaped backslash', () => {
    const { css } = expandText('.x { @nave focusRing; color: red\\\\', {})

    expect(css).toContain(String.raw`red\\;`)
    expect(css).not.toContain('fffd')
  })

  it('writes the escape ahead of the bracket it leaves open', () => {
    const { css } = expandText('.x { @nave focusRing; width: calc(1px\\', {})

    expect(css).toContain(String.raw`calc(1px\fffd);`)
  })

  it('closes the function ahead of a closed comment', () => {
    const { css } = expandText(`.x { @nave focusRing; width: calc(1px ${CLOSED_COMMENT}`, {})
    const parsed = closedForTheParser(css)

    expect(readRule(parsed).declarations).toMatchObject({ width: 'calc(1px)' })
    expect(readRule(parsed).rules).toContain(FOCUS)
  })

  it('keeps a trailing backslash from escaping the semicolon after a declaration value', () => {
    const { css } = expandText('.x { @nave focusRing; color: red\\', {})

    expect(css).toContain(String.raw`red\fffd;`)
    expect(readRule(closedForTheParser(css)).rules).toContain(FOCUS)
  })

  it('does the same for a custom property', () => {
    const { css } = expandText('.x { @nave focusRing; --x: a\\', {})

    expect(css).toContain(String.raw`--x: a\fffd;`)
    expect(readRule(closedForTheParser(css)).rules).toContain(FOCUS)
  })

  it('leaves a bare prelude that ends in a backslash as written, the ring ahead of it', () => {
    const { css } = expandText('.x { @nave focusRing; .y\\', {})

    // Nothing is written after the prelude: the ring sits where the directive was.
    expect(css.endsWith('.y\\')).toBe(true)
    expect(css.indexOf(FOCUS)).toBeGreaterThan(-1)
    expect(css.indexOf(FOCUS)).toBeLessThan(css.indexOf('.y'))
    const beforePrelude = css.slice(0, css.indexOf('.y'))
    expect(readRule(`${beforePrelude}}`).rules).toContain(FOCUS)
  })

  it.each([
    ['a closed comment', CLOSED_COMMENT],
    ['an unclosed comment', UNCLOSED_COMMENT],
  ])('writes the last directive once when %s follows it', (_n, comment) => {
    const { css } = expandText(`.x { @nave focusRing ${comment}`, {})
    const parsed = closedForTheParser(css)

    expect(css.split('outline: none')).toHaveLength(2)
    expect(readRule(parsed).declarations).toMatchObject({ outline: 'none' })
    expect(readRule(parsed).rules).toContain(FOCUS)
  })
})

describe('a trailing comment changes nothing but the comment itself', () => {
  const SOURCES = [
    '.x { @nave focusRing; color: red',
    '.x { @nave focusRing; &:hover { color: red',
    '.x { @nave focusRing; width: calc(1px',
    '.x { @nave focusRing; color: red;',
    '.x { @nave focusRing; .y',
    '.x { @nave focusRing; &:hover { color: red }',
    '.x { @nave focusRing; &:hover { @nave focusRing; color: red',
    '.x { @nave focusRing; &:hover { @nave focusRing; color: red }',
    '.x { color: red; @nave focusRing',
    '@media (x) { .x { @nave focusRing; color: red',
  ]
  const COMMENTS: readonly (readonly [string, string])[] = [
    ['closed', ` ${CLOSED_COMMENT}`],
    ['unclosed', ` ${UNCLOSED_COMMENT}`],
  ]
  const CASES = SOURCES.flatMap((source) =>
    COMMENTS.map(([kind, comment]): [string, string, string] => [source, kind, comment]),
  )

  // The comment itself is kept (or dropped with a directive that swallows it) wherever the
  // expander left it; taking its first occurrence out must leave exactly what the source gave
  // without it.
  it.each(CASES)('%s, then a %s comment', (source, _kind, comment) => {
    const bare = expandText(source, {}).css
    const commented = expandText(`${source}${comment}`, {}).css

    const withoutComment = commented.replace(comment.trim(), '')

    expect(norm(withoutComment)).toBe(norm(bare))
  })

  // Nothing is written after an unclosed comment: it runs to the end of the input, so text
  // after it would be inside it. A directive that swallows the comment leaves none to check.
  it.each(SOURCES)('%s, then an unclosed comment: nothing follows the comment', (source) => {
    const commented = expandText(`${source} ${UNCLOSED_COMMENT}`, {}).css

    const at = commented.lastIndexOf(UNCLOSED_COMMENT)
    const after = at === -1 ? '' : commented.slice(at + UNCLOSED_COMMENT.length)

    expect(after).toBe('')
  })
})
