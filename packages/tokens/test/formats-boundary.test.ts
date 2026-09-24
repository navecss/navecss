/**
 * `formatJsTokens`/`formatTsDeclarations` emit `dist/tokens.js` /
 * `dist/tokens.d.ts` as EVERY public DTCG token, and the semantic colour layer
 * (`--nave-color-*`) is composed separately (`theming/emit.ts`) and appended as CSS text —
 * it never enters this flat token list. The old doc comment said "All public Nave design
 * tokens" and offered an unprefixed `--color-action-primary` example the artifact has never
 * contained, which is false as shipped and misleads exactly the JS/TS consumer it addresses.
 * Content, not a marker: asserts the emitted string actually states the boundary, not merely
 * that some comment exists at that position.
 */
import { describe, expect, it } from 'vitest'

import type { FlatToken } from '../src/reader.ts'

import { formatJsTokens, formatTsDeclarations } from '../src/formats.ts'

/**
 * A qualified tracker reference, `<slug>#<digits>`: what a bare number turns into when someone
 * "fixes" it by putting a repository in front of it. Requiring a word character immediately
 * before the `#` is what keeps a CSS hex colour out, since a hex value is always preceded by a
 * space or a delimiter.
 *
 * IT DELIBERATELY DOES NOT FENCE THE LEFT SIDE, and that is a reverted decision rather than an
 * omission, so the next reader does not re-attempt it. Unfenced, the shape accepts one known
 * false-positive class: the tail of a digit-initial URL fragment, `https://example.com/docs#3`.
 * That class is UNREACHABLE in the subjects below, because neither a CSS id selector nor an XML
 * id may begin with a digit, and no subject here carries one. A lookbehind keyed on `/` was
 * tried and reverted, because every slash-keyed fence also excludes the TWO-SEGMENT spelling,
 * `owner/repo#632` — which is reachable, and which the repository-wide bare-form guard already
 * skips by its own identical fence, so fencing here would leave that spelling seen by no check
 * in this repository at all. An unreachable false positive is the cheaper of the two.
 */
const TRACKER_REFERENCE_PATTERN = /[\w-]+#\d+/

/**
 * The same reader, the other spelling: a tracker reference written out as a full URL carries no
 * `<slug>#<digits>` at all, so the shape above cannot see it. The fixture below names
 * `owner/repo` and never a real repository, because a fixture is read by the same person the
 * assertion protects.
 */
const TRACKER_URL_PATTERN = /\bgithub\.com\/[\w-]+\/[\w-]+\/(?:issues|pull)\/\d+/

const FIXTURE_TOKENS: FlatToken[] = [
  { path: ['font', 'size', 'md'], name: 'font-size-md', type: 'dimension', value: '1rem' },
  {
    path: ['_primitive', 'neutral', '500'],
    name: 'primitive-neutral-500',
    type: 'color',
    value: 'oklch(0.5 0 0)',
  },
]

describe('formatJsTokens / formatTsDeclarations boundary', () => {
  it('formatJsTokens states what the export actually covers, not "all public" tokens', () => {
    const js = formatJsTokens(FIXTURE_TOKENS)
    expect(js).not.toMatch(/all public/i)
    expect(js.toLowerCase()).toMatch(/dtcg 2025\.10 token set/)
  })

  it('formatJsTokens names where the semantic colour layer actually ships instead', () => {
    const js = formatJsTokens(FIXTURE_TOKENS)
    expect(js).toContain('--nave-color-*')
    expect(js).toContain('dist/tokens.css')
  })

  it('formatJsTokens no longer offers the unprefixed example key the artifact never contains', () => {
    const js = formatJsTokens(FIXTURE_TOKENS)
    expect(js).not.toContain('--color-action-primary')
  })

  it('formatTsDeclarations carries the same boundary sentence (a types-only reader never opens the .js)', () => {
    const dts = formatTsDeclarations(FIXTURE_TOKENS)
    expect(dts).not.toMatch(/all public/i)
    expect(dts.toLowerCase()).toMatch(/dtcg 2025\.10 token set/)
    expect(dts).toContain('--nave-color-*')
    expect(dts).toContain('dist/tokens.css')
  })

  // The shape, not one tracker's name. These two functions emit a doc comment into
  // `dist/tokens.js` and `dist/tokens.d.ts`, so every byte they compose is read by someone who
  // installed this package and has no checkout — the reader `.github/CONTRIBUTING.md`
  // §"Text the build prints or ships" is about, which forbids internal reference tags in
  // exactly this position. A qualified tracker reference is `<slug>#<digits>`; requiring the
  // word character before the `#` is what keeps a CSS hex colour in a token value from
  // reading as a citation, since a hex value is always preceded by a space or a delimiter.
  it('carries no tracker reference a consumer of the published package cannot open', () => {
    expect(formatJsTokens(FIXTURE_TOKENS)).not.toMatch(TRACKER_REFERENCE_PATTERN)
    expect(formatTsDeclarations(FIXTURE_TOKENS)).not.toMatch(TRACKER_REFERENCE_PATTERN)
    // The full-URL spelling, which the shape above cannot see: `github.com/owner/repo/issues/N`
    // carries no `<slug>#<digits>`, and it is exactly as unopenable to this reader.
    expect(formatJsTokens(FIXTURE_TOKENS)).not.toMatch(TRACKER_URL_PATTERN)
    expect(formatTsDeclarations(FIXTURE_TOKENS)).not.toMatch(TRACKER_URL_PATTERN)
  })

  // The two shapes' own behaviour, isolated from the emitted bytes, so what each one catches is
  // pinned directly rather than only exercised incidentally by whatever the formatters happen
  // to emit today.
  it('catches a two-segment qualified reference, which no slash-keyed fence can keep', () => {
    expect('see owner/repo#632').toMatch(TRACKER_REFERENCE_PATTERN)
    expect('see owner-repo#632').toMatch(TRACKER_REFERENCE_PATTERN)
  })

  it('catches a tracker URL written out in full, and not an ordinary repository URL', () => {
    expect('see https://github.com/owner/repo/issues/632').toMatch(TRACKER_URL_PATTERN)
    expect('see https://github.com/owner/repo/pull/632').toMatch(TRACKER_URL_PATTERN)
    expect('https://github.com/owner/repo').not.toMatch(TRACKER_URL_PATTERN)
  })
})
