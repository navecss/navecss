/**
 * AC-directive-core-43, below the command: which `@import` a stylesheet holds is a bare module
 * specifier, where it sits, and the text a host prints for one. Only `navecss-core expand` asks;
 * `expandText()` and every adapter never emit the code (AC-directive-core-42).
 */
import { describe, expect, it } from 'vitest'

import { findBareImports } from '../../src/directive/bare-imports.ts'
import { formatDiagnostic } from '../../src/directive/diagnostics-format.ts'

const NOTHING_EXISTS = (): boolean => false

function specifiers(
  css: string,
  exists: (specifier: string) => boolean = NOTHING_EXISTS,
): string[] {
  return findBareImports(css, exists).map((diagnostic) => diagnostic.text!)
}

describe('findBareImports — which @import is a bare module specifier', () => {
  it.each([
    ["@import url('@navecss/core/layers');", '@navecss/core/layers'],
    ['@import url("@navecss/core");', '@navecss/core'],
    ["@import '@navecss/tokens/css';", '@navecss/tokens/css'],
    ['@import "normalize.css";', 'normalize.css'],
    ['@import url(@navecss/core);', '@navecss/core'],
    ["@import url('@navecss/core') layer(base) supports(display: grid) screen;", '@navecss/core'],
    ["@IMPORT '@navecss/core';", '@navecss/core'],
  ])('%s is bare', (css, specifier) => {
    expect(specifiers(css)).toEqual([specifier])
  })

  it.each([
    "@import './a.css';",
    "@import '../a.css';",
    "@import '/a.css';",
    "@import url('/a.css');",
    '@import url(./a.css);',
    "@import 'https://cdn.example/a.css';",
    '@import url(https://cdn.example/a.css);',
    "@import url('//cdn.example/a.css');",
    "@import 'data:text/css,.a{}';",
    "@import url('HTTP://cdn.example/a.css');",
  ])('%s is not', (css) => {
    expect(specifiers(css)).toEqual([])
  })

  it('a specifier that names a file beside the stylesheet is not bare, and one that names none is', () => {
    const exists = (specifier: string): boolean => specifier === 'theme.css'

    expect(specifiers("@import 'theme.css';", exists)).toEqual([])
    expect(specifiers("@import 'other.css';", exists)).toEqual(['other.css'])
  })

  it('a query or fragment after the file name does not hide the file', () => {
    const exists = (specifier: string): boolean => specifier === 'theme.css'

    expect(specifiers("@import 'theme.css?v=2';", exists)).toEqual([])
    expect(specifiers("@import 'theme.css#top';", exists)).toEqual([])
  })

  it('reads only a top-level @import: not one in a comment, a string, a block or a declaration value', () => {
    const css = [
      "/* @import '@a'; */",
      '.a { content: "@import \'@b\';"; }',
      "@media screen { @import '@c'; }",
      ".d { background: url('@e'); @import '@f'; }",
    ].join('\n')

    expect(specifiers(css)).toEqual([])
  })

  it('reports every bare import, in source order, each at its @ and spanning the whole at-rule', () => {
    const css = "@import '@a';\n.x { color: red }\n@import url('@b') layer(z);\n"

    const found = findBareImports(css, NOTHING_EXISTS)

    expect(found.map((diagnostic) => diagnostic.text)).toEqual(['@a', '@b'])
    expect(found.every((diagnostic) => diagnostic.code === 'bare-import')).toBe(true)
    expect(css.slice(found[0]!.offset, found[0]!.endOffset)).toBe("@import '@a';")
    expect(css.slice(found[1]!.offset, found[1]!.endOffset)).toBe("@import url('@b') layer(z);")
  })

  it('an @import with no specifier, or an unterminated one, is no finding', () => {
    expect(specifiers('@import;')).toEqual([])
    expect(specifiers('@import')).toEqual([])
    expect(specifiers('@import layer(x);')).toEqual([])
  })

  it('an @import at the end of input with no semicolon is read to the end', () => {
    const css = "@import '@a'"

    const [found] = findBareImports(css, NOTHING_EXISTS)

    expect(css.slice(found!.offset, found!.endOffset)).toBe(css)
  })
})

describe('the text of a bare-import diagnostic', () => {
  const [diagnostic] = findBareImports("@import url('@navecss/core/layers');", NOTHING_EXISTS)
  const text = formatDiagnostic(diagnostic!)

  it('names the import, and says a browser cannot load a bare module', () => {
    expect(text).toContain('"@navecss/core/layers"')
    expect(text).toContain('bare module')
    expect(text).toContain('a browser cannot load')
  })

  it('names the self-contained stylesheet, by path and by CDN URL', () => {
    expect(text).toContain('node_modules/@navecss/core/dist/standalone.css')
    expect(text).toContain('https://cdn.jsdelivr.net/npm/@navecss/core/dist/standalone.css')
  })

  it('is not a directive message: it carries no @nave prefix', () => {
    expect(text.startsWith('@import ')).toBe(true)
  })
})

describe('findBareImports — what is not a top-level at-rule', () => {
  it('an @import token inside a function, a parenthesis or a bracket is not an import', () => {
    expect(specifiers("a:is(@import '@x') { color: red }")).toEqual([])
    expect(specifiers('[data-x="1"] { background: image-set(@import \'@y\') }')).toEqual([])
  })

  it('a percent-encoded name is read as the file it names', () => {
    const exists = (specifier: string): boolean => specifier === 'theme file.css'

    expect(specifiers("@import 'theme%20file.css';", exists)).toEqual([])
    expect(specifiers("@import 'theme%zz.css';", exists)).toEqual(['theme%zz.css'])
  })

  it('the text names Nave’s stylesheet only for a Nave import', () => {
    const [nave] = findBareImports("@import '@navecss/core';", NOTHING_EXISTS)
    const [other] = findBareImports("@import 'normalize.css';", NOTHING_EXISTS)

    expect(formatDiagnostic(nave!)).toContain('standalone.css')
    expect(formatDiagnostic(other!)).not.toContain('standalone.css')
    expect(formatDiagnostic(other!)).toContain('a browser cannot load it')
  })
})
