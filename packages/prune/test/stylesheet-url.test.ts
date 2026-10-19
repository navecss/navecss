/**
 * The file an `@import` or `composes ... from` URL names: the URL without its query or fragment,
 * and without the legacy `~` that marks a package.
 */
import { describe, expect, it } from 'vitest'

import { fileSpecifierOf } from '../src/stylesheets.ts'

describe('the file a stylesheet URL names', () => {
  it.each([
    ['neither a query nor a fragment', './a.css', './a.css'],
    ['a fragment', './a.css#part', './a.css'],
    ['a query', './a.css?v=2', './a.css'],
    ['a query, then a fragment', './a.css?v=2#part', './a.css'],
    ['a fragment, then a question mark', './a.css#part?v=2', './a.css'],
    ['a package marked with ~', '~kit/a.css?v=2', 'kit/a.css'],
    ['nothing before the query', '?v=2', ''],
  ])('%s', (_case, url, file) => {
    expect(fileSpecifierOf(url)).toBe(file)
  })

  it('a long run of # and ? with a line break in it', () => {
    const url = `./a.css${'#?'.repeat(20_000)}\nrest`
    expect(fileSpecifierOf(url)).toBe('./a.css')
  })
})
