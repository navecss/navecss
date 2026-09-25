/**
 * Direct rows for `readme-sections.mjs`, the parsing three README guards now share
 * (`readme-theming-ladder.test.mjs`, `readme-ac-theming-34-36.test.mjs`,
 * `readme-cleared-copy.test.mjs`).
 *
 * WHY A FILE OF ITS OWN, MEASURED RATHER THAN ASSERTED. Every proposition this module's own
 * docblock argues for is a statement about markdown the repository-root `README.md` does not
 * contain: a four-backtick fence nesting a three-backtick one, a closer carrying an info
 * string, a closer shorter than its opener, a fence indented inside a list item, an unclosed
 * fence, a `#hashtag` at line start. So the three consumers, and the 436 assertions behind
 * them, exercise NONE of it: six separate reversions of those rules (the info-string rule, the
 * closer-length rule, the unclosed-fence rule, the indent tolerance, the backtick-in-info-string
 * rule, and the whitespace after a `#` run) each leave the full `scripts:test` suite at 436/436.
 * Extraction did not create that hole, it multiplied what it costs: one regression here now
 * lands in three guards at once, and two of them read SAFETY-CRITICAL cleared copy.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bodyOf,
  fences,
  headingLines,
  readReadme,
  scanFences,
  sectionRange,
} from './readme-sections.mjs'

const headingsOf = (text) => {
  const lines = text.split('\n')
  return [...headingLines(lines)].map((i) => lines[i])
}

test('a closer carrying an info string does not close its fence', () => {
  // ```js is a second OPENER's spelling, not a closer, so the fence runs past the `#` line.
  const md = ['```bash', 'echo hi', '```js', '# not a heading', '```', '', '## Real'].join('\n')
  assert.deepEqual(headingsOf(md), ['## Real'])
})

test('a closer may be LONGER than its opener, and a four-backtick fence nests a three-backtick one', () => {
  const md = ['````', '```', '# not a heading', '```', '`````', '', '## Real'].join('\n')
  assert.deepEqual(headingsOf(md), ['## Real'])
})

test('a fence marker may not carry a backtick in its info string', () => {
  const md = ['```js`x', '', '## Real'].join('\n')
  assert.deepEqual(headingsOf(md), ['## Real'])
})

test('a fence indented up to three spaces is a fence; one indented four is not', () => {
  // Measured on `fences`, not on `headingLines`: an indented fence's own content is indented
  // too, so a `#` line inside it is not a heading candidate either way, and a row written
  // against headings passes with the indent tolerance removed.
  assert.deepEqual(
    fences(['   ```json', '   {}', '   ```'].join('\n')).map((fence) => fence.lang),
    ['json'],
  )
  assert.deepEqual(
    fences(['    ```json', '    {}', '    ```'].join('\n')).map((fence) => fence.lang),
    [],
  )
})

test('an unclosed fence runs to the end of the document', () => {
  const md = ['## Before', '```bash', '# not a heading', 'echo hi'].join('\n')
  assert.deepEqual(headingsOf(md), ['## Before'])
  const found = fences(md)
  assert.equal(found.length, 1, 'the unclosed fence is still a fence')
  assert.equal(found[0].content, '# not a heading\necho hi')
})

test('a `#` run with no whitespace after it is not a heading', () => {
  assert.deepEqual(headingsOf(['#hashtag', '', '# Real'].join('\n')), ['# Real'])
})

test('sectionRange stops at the boundary DEPTH, so a deeper sub-heading stays inside', () => {
  const lines = ['## A', 'x', '### A1', 'y', '#### A1a', 'z', '## B', 'w']
  const range = sectionRange(lines, headingLines(lines), /^## A\b/, 2)
  assert.deepEqual(range, { start: 0, end: 6 })
  assert.equal(bodyOf(lines, range), 'x\n### A1\ny\n#### A1a\nz')
})

test('sectionRange runs to the end of the input when no later boundary heading exists', () => {
  const lines = ['## A', 'x', '### A1', 'y']
  const range = sectionRange(lines, headingLines(lines), /^## A\b/, 2)
  assert.equal(range.end, 4)
})

test('sectionRange refuses rather than returning an empty range when the heading is absent', () => {
  const lines = ['## A', 'x']
  assert.throws(() => sectionRange(lines, headingLines(lines), /^## Missing\b/, 2))
})

test('bodyOf excludes the heading line the section opens on', () => {
  const lines = ['## A', 'x', '## B']
  assert.equal(bodyOf(lines, sectionRange(lines, headingLines(lines), /^## A\b/, 2)), 'x')
})

test('readReadme reads the repository-root README, not one relative to any caller', () => {
  const readme = readReadme()
  assert.match(readme, /^## Theming$/m)
  assert.match(readme, /^## Accessibility$/m)
})

// PINNING ROWS (round-3 terminal read; free under a later ruling).
// The module's docblock promises that `contentStart` / `contentEnd` are EXACT offsets into the
// body "so a command can be located in the artifact it was found in", and
// `readme-theming-ladder.test.mjs` spends that promise on a real assertion
// (`AC-token-build-34`: the first mention of the binary at rung 1b sits inside the script
// fence). MEASURED: breaking the per-line offset arithmetic (`cursor += line.length + 1` ->
// `cursor += line.length`) left the whole `scripts:test` suite at 454/454 GREEN, so the one
// consumer of the promise passes with the offsets wrong. Same for the info string's trim, which
// is what makes `lang` the first WORD rather than the empty string on a padded marker.
test("a fence's contentStart/contentEnd are exact character offsets into the body", () => {
  const md = ['## A', '', '```bash', 'echo hi', 'echo there', '```', '', '## B'].join('\n')
  const [fence] = fences(md)
  assert.equal(fence.content, 'echo hi\necho there')
  assert.equal(md.slice(fence.contentStart, fence.contentEnd), fence.content)
  assert.deepEqual([fence.from, fence.to], [3, 4])
})

test("a fence's info string is trimmed, and `lang` is its first word lowercased", () => {
  const [fence] = fences(['```  JSON  title=x  ', '{}', '```'].join('\n'))
  assert.equal(fence.info, 'JSON  title=x')
  assert.equal(fence.lang, 'json')
})

// scanFences is also the one place HTML comment blocks are tracked, so a second, independent
// comment scanner never has to reconcile its own state against the fence state (or vice versa).
test('a lone fence marker inside a comment opens no fence, and the paragraph after the comment stays outside every fence', () => {
  const md = ['<!--', '```', '-->', '', 'A real paragraph, not fenced.'].join('\n')
  const { fences: found, fenceLines } = scanFences(md)
  assert.deepEqual(found, [])
  assert.equal(fenceLines.has(4), false, 'the paragraph after the comment must not be a fence line')
})

test('a complete fence inside a comment is not returned by fences()', () => {
  const md = ['<!--', '```text', 'hidden', '```', '-->', ''].join('\n')
  assert.deepEqual(fences(md), [])
})

test('`<!--` inside a fence opens no comment', () => {
  const md = ['```text', '<!--', 'still fence content', '```', '', 'After.'].join('\n')
  const { fences: found, commentLines } = scanFences(md)
  assert.equal(found.length, 1)
  assert.equal(found[0].content, '<!--\nstill fence content')
  assert.equal(commentLines.size, 0)
})

test('a heading-shaped line inside a comment is not in headingLines()', () => {
  const md = ['<!--', '## Not really a heading', '-->', '', '## Real'].join('\n')
  assert.deepEqual(headingsOf(md), ['## Real'])
})
