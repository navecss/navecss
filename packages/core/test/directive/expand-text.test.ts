import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { findSurvivors } from '../../src/directive/find-survivors.ts'
import { tokenize } from '../../src/directive/tokenizer.ts'
import { assertScalesLinearly } from '../helpers/perf-scaling.ts'

/**
Collapses whitespace runs so assertions don't pin the exact spacing expandText happens to choose.
 */
function norm(css: string): string {
  return css.replaceAll(/\s+/g, ' ').trim()
}

/**
One field's VLQ base64 encoding, for building a scratch source map by hand.
 */
function encodeVLQ(n: number): string {
  const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let value = n < 0 ? (-n << 1) + 1 : n << 1
  let result = ''
  do {
    let digit = value & 0b1_1111
    value >>>= 5
    if (value > 0) digit |= 0b10_0000
    result += base64[digit]
  } while (value > 0)
  return result
}

describe('AC-directive-core-04 — the shipped placement semantics, through expandText()', () => {
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

  it.each(rows)('%s', (input, expected) => {
    const { css, diagnostics } = expandText(input, { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(norm(css)).toBe(norm(expected))
  })

  it.each([
    '.a { @NAVE flex; }',
    '.a { @Nave flex; }',
    String.raw`.a { @n\61ve flex; }`,
    String.raw`.a { @n\61 ve flex; }`,
    String.raw`.a { @\6e ave flex; }`,
  ])('AC-directive-core-10: %s expands to display: flex', (input) => {
    const { css, diagnostics } = expandText(input, {})

    expect(diagnostics).toEqual([])
    expect(css).toContain('display: flex')
  })

  it.each(['.a { @navex flex; }', '.a { @nave-x flex; }', '.a { @ｎave flex; }'])(
    'AC-directive-core-10: %s passes through unchanged, no diagnostic',
    (input) => {
      const { css, diagnostics } = expandText(input, {})

      expect(diagnostics).toEqual([])
      expect(css).toBe(input)
    },
  )

  it('refuses @nave inside @keyframes at any depth, through onUnknown', () => {
    const { css, diagnostics } = expandText('@keyframes k { to { @nave flex; } }', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([
      { code: 'in-keyframes', severity: 'warning', line: 1, column: 21, offset: 20, endOffset: 31 },
    ])
    expect(css).not.toContain('display: flex')
    expect(norm(css)).toBe('@keyframes k { to { } }')
  })

  it('refuses a bare @nave with no atom name, through onUnknown', () => {
    const { css, diagnostics } = expandText('.a { @nave; }', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      { code: 'no-atom', severity: 'warning', line: 1, column: 6, offset: 5, endOffset: 11 },
    ])
    expect(norm(css)).toBe('.a { }')
  })

  it('reports unknown-atom for an unregistered name', () => {
    const { css, diagnostics } = expandText('.a { @nave toString; }', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      {
        code: 'unknown-atom',
        name: 'toString',
        severity: 'warning',
        line: 1,
        column: 12,
        offset: 11,
        endOffset: 19,
      },
    ])
    expect(norm(css)).toBe('.a { }')
  })
})

describe('AC-directive-core-06 — expandText() changes only directive spans', () => {
  it.each([
    ['\n', 'LF'],
    ['\r\n', 'CRLF'],
    ['\r', 'CR'],
    ['\f', 'FF'],
  ])(
    'turns a %s (%s) line terminator inside an inserted extend value into one space, keeping every line number',
    (terminator) => {
      const extend = {
        deep: { declarations: { 'grid-template-areas': `"a b"${terminator} "c d"` } },
      }
      const input = '.a {\n  color: red;\n  @nave deep;\n  color: blue;\n}\n'

      const { css } = expandText(input, { onUnknown: 'warn', extend })

      expect(css.split('\n')).toHaveLength(input.split('\n').length)
      expect(css).toContain('grid-template-areas: "a b"  "c d";')
    },
  )

  it('returns an object with exactly css, map and diagnostics', () => {
    const result = expandText('.a { @nave flex; }', { onUnknown: 'warn' })

    expect(Object.keys(result).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'css',
      'diagnostics',
      'map',
    ])
  })

  it('never touches @nave inside a comment, a string, a url(), a declaration value or a custom property value', () => {
    const untouched = [
      '/* @nave flex; */',
      '.a { content: "@nave flex"; }',
      '.a { background: url(@nave.png); }',
      '.a { color: @nave flex; }',
      '.a { --x: @nave flex; }',
      '.a { --x: { a: b }; }',
    ]
    for (const css of untouched) {
      const result = expandText(css, { onUnknown: 'warn' })
      expect(result.css).toBe(css)
      expect(result.diagnostics).toEqual([])
    }
  })

  it('puts declarations inline with no wrapper when a custom property {} value precedes the directive', () => {
    const { css, diagnostics } = expandText('.a { --x: { a: b }; @nave flex; }', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([])
    expect(norm(css)).toBe(norm('.a { --x: { a: b }; display: flex; }'))
  })

  it('gives one bad-parent for a top-level directive', () => {
    const { diagnostics } = expandText('@nave flex;', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([
      { code: 'bad-parent', severity: 'warning', line: 1, column: 1, offset: 0, endOffset: 11 },
    ])
  })
})

describe('AC-directive-core-07 — expander-only rows, Syntax 3 recovery', () => {
  it('every row in this criterion genuinely throws in PostCSS’s own parser', () => {
    const rows = [
      '.a { color: red; @nave focusRing',
      '.a { color: red; @nave flex;',
      '.a { b; @nave flex; }',
      '<!-- .a { @nave flex; } -->',
      '.a { @nave flex; /* unclosed',
      '.a { content: "unclosed; @nave flex; }',
    ]
    for (const css of rows) {
      expect(() => postcss.parse(css), `expected PostCSS to reject: ${css}`).toThrow()
    }
  })

  it('expands an unclosed rule at end of input, appending its blocks at end of input', () => {
    const { css, diagnostics } = expandText('.a { color: red; @nave focusRing', {
      onUnknown: 'warn',
    })

    expect(diagnostics).toEqual([])
    expect(css).toContain('outline: none')
    expect(css).toContain('&:focus-visible')
    expect(css.indexOf('outline: none')).toBeLessThan(css.indexOf('&:focus-visible'))
  })

  it('expands an unclosed directive with no trailing semicolon', () => {
    const { css } = expandText('.a { color: red; @nave flex;', { onUnknown: 'warn' })

    expect(norm(css)).toBe('.a { color: red; display: flex;')
  })

  it('treats an invalid item as not a nested node', () => {
    const { css } = expandText('.a { b; @nave flex; }', { onUnknown: 'warn' })

    expect(norm(css)).toBe('.a { b; display: flex; }')
  })

  it('expands inside a CDO/CDC pair, keeping the <!-- and --> bytes', () => {
    const { css, diagnostics } = expandText('<!-- .a { @nave flex; } -->', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(css).toBe('<!-- .a { display: flex; } -->')
  })

  it('expands before an unclosed trailing comment, keeping the comment bytes', () => {
    const { css, diagnostics } = expandText('.a { @nave flex; /* unclosed', { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(css).toBe('.a { display: flex; /* unclosed')
  })

  it('places an appended block before an unclosed trailing comment, not inside it', () => {
    const { css } = expandText('.a { @nave focusRing; /* c', { onUnknown: 'warn' })

    const tokens = tokenize(css)
    expect(tokens.some((t) => t.type === 'ident-token' && t.raw === 'focus-visible')).toBe(true)
    expect(css.endsWith('/* c')).toBe(true)
  })

  it('leaves a directive inside an unclosed (bad) string untouched', () => {
    const input = '.a { content: "unclosed; @nave flex; }'
    const { css, diagnostics } = expandText(input, { onUnknown: 'warn' })

    expect(diagnostics).toEqual([])
    expect(css).toBe(input)
  })

  it.each([
    [' content: "abc', 'an unterminated double-quoted string'],
    [" content: 'abc", 'an unterminated single-quoted string'],
    [' x: url(abc', 'an unterminated unquoted url'],
    [' x: "a\\', 'a string ending in a trailing backslash'],
    [' /*/', 'an unclosed comment whose own two bytes fake a close'],
    [' x: f(', 'an unterminated function call'],
    [' x: [', 'an unterminated ['],
    [' --x: {', 'an unterminated custom-property {} value'],
  ])('writes the closer(s) EOF implied before an appended block, inside %s (%s)', (tail) => {
    const { css } = expandText(`.a { @nave focusRing;${tail}`, { onUnknown: 'warn' })

    const tokens = tokenize(css)
    expect(tokens.some((t) => t.type === 'ident-token' && t.raw === 'focus-visible')).toBe(true)
  })

  it('closes a later, still-open sibling rule first, so the appended block is its sibling, not nested inside it', () => {
    const { css } = expandText('.a { @nave focusRing; .b {', { onUnknown: 'warn' })

    // `.b {` is closed (empty) before `&:focus-visible` is appended, so the
    // two are siblings under `.a`, not `&:focus-visible` nested inside `.b`.
    expect(norm(css)).toContain('.b {} &:focus-visible')
  })
})

describe('nested frames left open at EOF each close only their own level, never a deeper one twice', () => {
  it('closes the innermost level first, then each ancestor closes only the one level directly below it', () => {
    const { css } = expandText('.a { @nave focusRing; .b { @nave focusRing; .c {')

    expect(css).toBe(
      '.a { outline: none; .b { outline: none; .c {} &:focus-visible { outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus); outline-offset: 2px }} &:focus-visible { outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus); outline-offset: 2px }',
    )
  })

  it('closes a dangling string once, not once per still-open ancestor frame, and still terminates its declaration', () => {
    const { css } = expandText('.a { @nave focusRing; .b { @nave focusRing; content: "abc')

    expect(css).toMatch(/content: "abc";\s*&:focus-visible/)
    expect(css.match(/"abc"/g)).toHaveLength(1)
  })
})

describe('an unterminated declaration at EOF is given its own semicolon before the appended block', () => {
  it('ends a bare declaration with no dangling string, url or bracket', () => {
    const { css } = expandText('.a { @nave focusRing; color: red')

    expect(css).toMatch(/color: red;\s*&:focus-visible/)
  })

  /**
   * `.a` itself is never closed by any of these inputs (there is no real
   * `}` for it anywhere in the source), so parsing the raw output always
   * hits postcss's own "Unclosed block" error regardless of how the INNER
   * content came out — a fact about `.a`, not about what this test checks.
   * A trailing `}`, added only for the parse, closes exactly that one
   * outer level so the inner structure can be inspected the normal way (the
   * one tail that leaves a trailing comment still open, unrelated to this
   * fix, gets its own closing bytes first, for the same reason).
   */
  function parseWithOuterClosed(css: string): ReturnType<typeof postcss.parse> {
    // A bare substring search for "*/" cannot tell a real close from the
    // "/*/" shape itself, whose own two closing bytes overlap its opener —
    // the same reason `closeInfoFor` uses the tokenizer's own read of the
    // last token rather than a substring check.
    const last = tokenize(css).at(-1)
    const hasOpenComment =
      last?.type === 'comment' && !(last.raw.length >= 4 && last.raw.endsWith('*/'))
    const closedComment = hasOpenComment ? css + '*/' : css
    return postcss.parse(closedComment + '}')
  }

  function hasFocusVisibleChildOf(
    root: ReturnType<typeof postcss.parse>,
    selector: string,
  ): boolean {
    let found = false
    root.walkRules((rule) => {
      const parent = rule.parent
      if (
        rule.selector === '&:focus-visible' &&
        parent &&
        'selector' in parent &&
        (parent as { selector: string }).selector === selector
      ) {
        found = true
      }
    })
    return found
  }

  it.each([
    [' content: "abc', 'an unterminated double-quoted string'],
    [" content: 'abc", 'an unterminated single-quoted string'],
    [' x: url(abc', 'an unterminated unquoted url'],
    [' x: "a\\', 'a string ending in a trailing backslash'],
    [' /*/', 'an unclosed comment whose own two bytes fake a close'],
    [' x: f(', 'an unterminated function call'],
    [' x: [', 'an unterminated ['],
    [' --x: {', 'an unterminated custom-property {} value'],
  ])('appends the block as a real rule child of .a, not swallowed into %s (%s)', (tail) => {
    const { css } = expandText(`.a { @nave focusRing;${tail}`, { onUnknown: 'warn' })

    expect(hasFocusVisibleChildOf(parseWithOuterClosed(css), '.a')).toBe(true)
  })

  it('closes a dangling url ending in a trailing backslash by pairing it, not by escaping the closing paren', () => {
    const { css } = expandText('.a { @nave focusRing; x: url(abc\\')

    expect(tokenize(css).some((t) => t.type === 'ident-token' && t.raw === 'focus-visible')).toBe(
      true,
    )
    expect(hasFocusVisibleChildOf(parseWithOuterClosed(css), '.a')).toBe(true)
  })

  it('drops an unterminated qualified-rule prelude with no block of its own, appending the block as its sibling, not nested inside it', () => {
    const { css } = expandText('.a { @nave focusRing; .b')

    expect(hasFocusVisibleChildOf(parseWithOuterClosed(css), '.a')).toBe(true)
    expect(css).not.toContain('.b &:focus-visible')
  })
})

// A generous per-row timeout throughout this block, well above the test runner's own
// default: `assertScalesLinearly` can run its measured subject up to 14 times (a warm-up
// plus 3+3 samples, doubled once on a retry), and a slow or shared runner's own per-call
// time can be an order of magnitude past a fast local machine's — the wall-clock ceiling
// on how long the ROW is allowed to take is deliberately loose, since the scaling ratio
// assertion inside it is what actually decides pass or fail.
const SCALING_ROW_TIMEOUT = 30_000

describe('expandText() stays roughly linear, not quadratic, on a large stylesheet', () => {
  it(
    'stays roughly linear on a stylesheet with no directive',
    async () => {
      await assertScalesLinearly((n) => {
        const css = '.a { color: red; }\n'.repeat(n)
        const start = performance.now()
        expandText(css)
        return performance.now() - start
      }, 5000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'stays roughly linear across many directives, each on its own line',
    async () => {
      await assertScalesLinearly((n) => {
        const css = '.a { @nave flex; }\n'.repeat(n)
        const start = performance.now()
        expandText(css)
        return performance.now() - start
      }, 5000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'does not overflow the call stack on 20000 levels of nesting',
    () => {
      const css = '.a{'.repeat(20_000) + '}'.repeat(20_000)

      expect(() => expandText(css)).not.toThrow()
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'stays roughly linear closing levels left open at EOF (none of them closed for real)',
    async () => {
      await assertScalesLinearly((n) => {
        const css = '.a{'.repeat(n)
        const start = performance.now()
        expandText(css)
        return performance.now() - start
      }, 20_000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'stays roughly linear closing levels left open at EOF, each one appending its own block, with no RangeError',
    async () => {
      // This combines deep nesting, a directive walk and an EOF-closer
      // computation at every level, so it costs more per level than any one
      // of those alone (the neighbouring rows above measure each in
      // isolation) — a smaller n than its siblings, so the 4n run still
      // finishes in reasonable time on a slow runner. The scaling
      // assertion, not a wall-clock budget, is what rules out a quadratic
      // blowup here.
      await assertScalesLinearly((n) => {
        const css = '.a{@nave focusRing;'.repeat(n)
        const start = performance.now()
        expect(() => expandText(css)).not.toThrow()
        return performance.now() - start
      }, 1250)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'stays roughly linear chaining through an incoming source map across many directives',
    async () => {
      await assertScalesLinearly((n) => {
        const css = '.a { @nave flex; }\n'.repeat(n)
        const lineCount = css.split('\n').length

        // An identity mapping, one segment per line at column 0: every line
        // maps to itself in a single source, 'a.css'.
        const mappings = Array.from({ length: lineCount }, (_, i) =>
          i === 0
            ? `${encodeVLQ(0)}${encodeVLQ(0)}${encodeVLQ(0)}${encodeVLQ(0)}`
            : `${encodeVLQ(0)}${encodeVLQ(0)}${encodeVLQ(1)}${encodeVLQ(0)}`,
        ).join(';')
        const inputSourceMap = { version: 3 as const, sources: ['a.css'], names: [], mappings }

        const start = performance.now()
        expandText(css, { inputSourceMap })
        return performance.now() - start
      }, 5000)
    },
    SCALING_ROW_TIMEOUT,
  )
})

describe('a closer only closes its own mirror opener inside a custom property value too', () => {
  it.each([
    '.a { --x: (}; @nave flex; }',
    '.a { --x: [}; @nave flex; }',
    '.a { --x: (]; @nave flex; }',
    '.a { --x: f(]; @nave flex; }',
  ])('%s: left unchanged, the directive buried in the unclosed value', (css) => {
    expect(expandText(css).css).toBe(css)
  })
})

describe('a stray closer that is not an item’s first token is a preserved token, not a terminator', () => {
  it('keeps a name after a stray "]" in the same directive’s prelude', () => {
    const { css, diagnostics } = expandText('.a { @nave flex ] grid; }', { onUnknown: 'warn' })

    expect(diagnostics.map((d) => d.code)).toContain('bad-token')
    expect(norm(css)).toBe(norm('.a { display: flex; display: grid; }'))
  })

  it('never gives a survivor an empty-string selector when its prelude starts with a stray ")"', () => {
    const survivors = findSurvivors('.a { @media ) { @nave flex; } }')

    expect(survivors).toHaveLength(1)
    expect(survivors[0]!.selector).not.toBe('')
  })
})
