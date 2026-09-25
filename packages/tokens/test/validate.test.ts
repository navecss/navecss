/**
 * The CLI's validator (R12, R15-R18): whether a consumer's token source satisfies the shipped
 * core contract manifest, reporting every missing name in one run.
 */
import { describe, expect, it } from 'vitest'

import type { CoreContractManifest } from '../src/theming/core-contract.ts'

import { UsageError } from '../src/errors.ts'
import { MANIFEST_FORMAT_VERSION } from '../src/theming/core-contract.ts'
import { SEMANTIC_SLOTS } from '../src/theming/semantics.ts'
import { checkManifestFormatSupport, formatValidateReport } from '../src/validate-report.ts'
import {
  computeMissing,
  detectSourceKind,
  namesFromDtcgSource,
  namesFromSource,
  scanDeclaredCustomProperties,
  splitMissingBySupply,
} from '../src/validate.ts'

function manifestOf(tokens: readonly string[]): CoreContractManifest {
  return {
    formatVersion: MANIFEST_FORMAT_VERSION,
    producer: { name: '@navecss/core', version: '0.1.0' },
    tokens: [...tokens].toSorted((a, b) => a.localeCompare(b)),
  }
}

/**
 * A manifest declaring a format one higher than this build understands. R13's format integer
 * is what lets a validator meeting a FUTURE manifest shape refuse it rather than mis-read
 * it; with no comparison anywhere, such a manifest produced a confident, provenance-stamped
 * name-set answer computed from a schema this build has never seen.
 */
/**
 * A round-2 fix (the quality reviewer's note F1): the two zero-checkable-set tests below used to
 * assert on `lines[1]` — an INDEX, correct only because of where the success line happened
 * to land in `formatValidateReport`'s current return order. A pure reorder of that return
 * (moving `NAMESPACE_PREAMBLE` later) leaves the two tests reading `formatSuppliedLines`'s
 * own copy of the identical parenthetical instead, silently. Locates the success line by
 * CONTENT — a discriminator only `formatSuccessLine`'s own zero-checkable branch produces —
 * and fails loudly (never silently reading whichever line happened to match) if that
 * discriminator matches zero lines or more than one, so a locator this narrow cannot itself
 * become the thing that silently picks the wrong line one layer down.
 */
function uniqueLine(lines: readonly string[], pattern: RegExp, label: string): string {
  const matches = lines.filter((line) => pattern.test(line))
  if (matches.length !== 1) {
    throw new Error(
      `uniqueLine(${label}): expected exactly one line matching ${pattern}, found ${matches.length}.`,
    )
  }
  return matches[0]!
}

function futureFormatManifest(): CoreContractManifest {
  return {
    ...manifestOf(['--nave-color-a', '--nave-color-b']),
    formatVersion: MANIFEST_FORMAT_VERSION + 1,
  }
}

describe('AC-token-build-12 covers: R12', () => {
  it('reports exactly the missing name when a source satisfies N-1 of N contract tokens, whatever N is', () => {
    for (const n of [1, 4, 9, 25]) {
      const names = Array.from({ length: n }, (_, i) => `--nave-color-slot-${i}`)
      const manifest = manifestOf(names)
      const satisfyingAllButLast = new Set(names.slice(0, -1))
      const css = names
        .slice(0, -1)
        .map((n_) => `${n_}: red;`)
        .join('\n')
      // The fixture is what it claims: a source declaring exactly N-1 of the N names, so a
      // one-name `missing` below is evidence about the check and not about a mis-built
      // fixture that happened to omit the same name twice over.
      expect(scanDeclaredCustomProperties(css)).toEqual(satisfyingAllButLast)
      expect(computeMissing(manifest, 'css', css)).toEqual([names.at(-1)])
    }
  })

  it("validate's pass set always equals the FULL scanned contract, never a pinned count", () => {
    const names = Array.from({ length: 12 }, (_, i) => `--nave-color-slot-${i}`)
    const manifest = manifestOf(names)
    const css = names.map((n) => `${n}: red;`).join('\n')
    expect(computeMissing(manifest, 'css', css)).toEqual([])
  })
})

describe('AC-token-build-15 covers: R15', () => {
  it('a .css file is scanned for DECLARED custom properties directly, no generation step run', () => {
    const css = `:root {\n  --nave-color-surface-base: oklch(1 0 0);\n  --nave-color-content-primary: black;\n}`
    const names = scanDeclaredCustomProperties(css)
    expect(names).toEqual(new Set(['--nave-color-content-primary', '--nave-color-surface-base']))
  })

  it('a name appearing only inside a CSS comment is NOT counted as declared', () => {
    const css = [
      ':root {',
      '  /* TODO: declare --nave-color-surface-base: white; later */',
      '  --nave-color-content-primary: black;',
      '}',
      '/* multi-line, spanning a real-looking block:',
      '   --nave-color-border-default: grey;',
      '*/',
    ].join('\n')
    expect(scanDeclaredCustomProperties(css)).toEqual(new Set(['--nave-color-content-primary']))

    // The consequence that makes this a defect rather than a nicety: a source declaring
    // nothing must not report as satisfying the contract with full provenance.
    const manifest = manifestOf(['--nave-color-surface-base'])
    const commentedOut = '/* --nave-color-surface-base: white; */'
    expect(computeMissing(manifest, 'css', commentedOut)).toEqual(['--nave-color-surface-base'])
  })

  it('a DTCG .json source runs the readers name computation only, prefixed as the emitter would', () => {
    const source = { color: { surface: { base: { $type: 'color', $value: '#fff' } } } }
    const names = namesFromDtcgSource(source)
    expect(names).toEqual(new Set(['--nave-color-surface-base']))
  })

  it('a file whose extension is neither .css nor .json is a usage error (kind undefined), never a guess', () => {
    expect(detectSourceKind('tokens.css')).toBe('css')
    expect(detectSourceKind('tokens.json')).toBe('json')
    expect(detectSourceKind('tokens.scss')).toBeUndefined()
    expect(detectSourceKind('tokens')).toBeUndefined()
  })

  it('the extension match is case-insensitive: Tokens.CSS is a css source, not a usage error', () => {
    expect(detectSourceKind('Tokens.CSS')).toBe('css')
    expect(detectSourceKind('Tokens.Json')).toBe('json')
    expect(detectSourceKind('/abs/path/THEME.CSS')).toBe('css')
    // Still not a guess: an unknown extension stays undefined in any case.
    expect(detectSourceKind('tokens.SCSS')).toBeUndefined()
  })

  it('namesFromSource dispatches on kind without guessing', () => {
    expect(namesFromSource('css', '--nave-color-x: red;')).toEqual(new Set(['--nave-color-x']))
    expect(
      namesFromSource('json', JSON.stringify({ color: { x: { $type: 'color', $value: '#000' } } })),
    ).toEqual(new Set(['--nave-color-x']))
  })

  /**
   * ROW F4 from a quality-review pass (Phase 3 round 2) at the fix site. R15's dated precision
   * (product, 2026-09-14): a `--source` that parses as JSON but whose ROOT is not a JSON object
   * is a USAGE error naming the file — the guard belongs HERE, in `namesFromSource` before
   * `namesFromDtcgSource`, never in `bin.ts` (R4's precision 5's catch-all decline stands).
   */
  it.each([['[]'], ['42'], ['"a string"'], ['null']])(
    'a quality-review finding (F4): a .json source whose root is %s throws a UsageError naming the file, never a bare DTCG reader error',
    (content) => {
      expect(() => namesFromSource('json', content, { path: 'tokens.json' })).toThrow(UsageError)
      expect(() => namesFromSource('json', content, { path: 'tokens.json' })).toThrow(
        /tokens\.json/,
      )
    },
  )

  /**
   * ROW G2 from an architecture-review pass (still-open row 2, fixed on Cédric's GATE-2 decision).
   * The third parameter used to be a `string` whose contract was "a label already in its final
   * printed form", held nowhere but in its callers: `facade.ts` quoted the path itself at both
   * call sites, `validate`'s door did not, and one guard function printed two spellings of its
   * own file label — which is row R3-03 from the quality-review pass, the defect this parameter's
   * shape produced.
   *
   * The contract now lives in the SIGNATURE. A caller says which of the two things it has, a
   * `path` or a `phrase`, and the delimiting decision is made once, here, by the code that
   * knows which it was given. The developer-relations reviewer's decline is the reason this is a
   * discriminated pair rather than "quote it always": the default is a generic PHRASE, and quoting
   * that prints `"this validate source" is not valid JSON`, which reads as a file named that.
   *
   * The CLI-visible bytes do NOT move — R3-03's three rows in `bin.test.ts` pin every
   * door through `isEveryMentionQuoted`, and they were re-confirmed by name at this head.
   */
  it('architecture-review row G2: a PATH-shaped label is delimited by the function that knows it is a path; the generic PHRASE default stays bare', () => {
    expect(() => namesFromSource('json', '{oops', { path: 'tokens.json' })).toThrow(
      /"tokens\.json" is not valid JSON/,
    )
    expect(() => namesFromSource('json', '[]', { path: 'tokens.json' })).toThrow(
      /"tokens\.json" is not a DTCG 2025\.10 token document/,
    )
    expect(() => namesFromSource('json', '{oops')).toThrow(
      /^this validate source is not valid JSON/,
    )
  })

  it('a quality-review finding (F4, negative half): the line is at the ROOT — a document accepted as an object and faulty INSIDE is still the readers error, not a UsageError', () => {
    const faultyInside = JSON.stringify({ color: { base: { value: '#fff', type: 'color' } } })
    expect(() => namesFromSource('json', faultyInside, { path: 'tokens.json' })).toThrow(
      /legacy token shape/,
    )
    expect(() => namesFromSource('json', faultyInside, { path: 'tokens.json' })).not.toThrow(
      UsageError,
    )
  })
})

describe('AC-token-build-13 covers: R13', () => {
  it('a manifest declaring a format higher than this build understands is refused by name', () => {
    const refusal = checkManifestFormatSupport(futureFormatManifest())
    expect(refusal).toEqual({
      found: MANIFEST_FORMAT_VERSION + 1,
      supported: MANIFEST_FORMAT_VERSION,
    })
    // The format this build writes is understood, and so is any older one.
    expect(checkManifestFormatSupport(manifestOf(['--nave-color-a']))).toBeUndefined()
    expect(
      checkManifestFormatSupport({ ...manifestOf(['--nave-color-a']), formatVersion: 0 }),
    ).toBeUndefined()
  })

  it('the refusal replaces the name-set answer: no "0 missing", no missing list, no provenance count', () => {
    const lines = formatValidateReport(futureFormatManifest(), [], undefined)
    const joined = lines.join('\n')
    expect(joined).toMatch(/unrecognized manifest format/i)
    expect(joined).toContain(String(MANIFEST_FORMAT_VERSION + 1))
    expect(joined).not.toMatch(/0 missing/)
    expect(joined).not.toMatch(/missing name\(s\)/)

    // Also with a computed missing list in hand: the refusal short-circuits either way.
    const withMissing = formatValidateReport(
      futureFormatManifest(),
      ['--nave-color-b'],
      undefined,
    ).join('\n')
    expect(withMissing).toMatch(/unrecognized manifest format/i)
    expect(withMissing).not.toContain('--nave-color-b')
  })

  it('R18 holds on the refusal: its subject is the MANIFEST, never the consumers palette or source', () => {
    const lines = formatValidateReport(futureFormatManifest(), [], undefined)
    for (const line of lines) {
      expect(line.toLowerCase()).not.toMatch(/\bpalette\b/)
      expect(line.toLowerCase()).not.toMatch(/your (token source|theme|palette)/)
      expect(line.toLowerCase()).toContain('manifest')
    }
  })
})

describe('AC-token-build-17 covers: R17', () => {
  const manifest = manifestOf(['--nave-color-a', '--nave-color-b', '--nave-color-c'])

  it('every missing name is reported in ONE run, never only the first, in the emitted spelling, with the DTCG mapping stated once', () => {
    const missing = computeMissing(manifest, 'css', '--nave-color-a: red;')
    expect(missing).toEqual(['--nave-color-b', '--nave-color-c'])
    const lines = formatValidateReport(manifest, missing, undefined)
    // Every missing name appears, emitted-spelling.
    for (const name of missing) expect(lines.some((l) => l.includes(name))).toBe(true)
    // The DTCG source-node spelling <-> emitted-property mapping is stated once (preamble).
    const mappingLines = lines.filter((l) => l.includes('--nave-') && l.includes('color.'))
    expect(mappingLines.length).toBe(1)
  })

  it('on success, the report still prints the contract source package name, version, and count checked', () => {
    const lines = formatValidateReport(manifest, [], undefined)
    const joined = lines.join('\n')
    expect(joined).toContain('@navecss/core')
    expect(joined).toContain('0.1.0')
    expect(joined).toContain(String(manifest.tokens.length))
  })

  it("the success denominator is the CHECKABLE set (contract minus SUPPLIED), never the contract's own size", () => {
    // 'a' and 'b' are declared in the consumer's source (so they are neither missing nor
    // supplied); 'c' is reclassified SUPPLIED. Only 'a' and 'b' could have failed this run.
    const lines = formatValidateReport(manifest, [], undefined, {
      status: 'resolved',
      supplied: ['--nave-color-c'],
    })
    const joined = lines.join('\n')
    expect(joined).toMatch(/Checked 2 name\(s\)/)
    expect(joined).not.toMatch(/Checked 3 name\(s\)/)
  })

  it('when every contract name is SUPPLIED, the checkable set is empty and the line says so in terms, never printing the contract size as though it were a checked count', () => {
    const lines = formatValidateReport(manifest, [], undefined, {
      status: 'resolved',
      supplied: manifest.tokens,
    })
    const joined = lines.join('\n')
    expect(joined).not.toMatch(/Checked 3 name\(s\)/)
    expect(joined.toLowerCase()).toMatch(/none.{0,40}could have.{0,10}(been )?checked/)
    expect(joined).toContain('@navecss/core')
    expect(joined).toContain('0.1.0')
  })

  it('the "not-installed" branch applies the same checkable denominator', () => {
    const lines = formatValidateReport(manifest, [], undefined, {
      status: 'not-installed',
      supplied: manifest.tokens,
    })
    const joined = lines.join('\n')
    expect(joined).not.toMatch(/3 name\(s\) checked/)
    expect(joined.toLowerCase()).toMatch(/none.{0,40}could have.{0,10}(been )?checked/)
    expect(joined).toMatch(/no installed @navecss\/core was found/i)
  })

  it("product's follow-up: the zero-checkable sentence ITSELF (not merely the report as a whole, which also carries formatSuppliedLines's own copy of this phrase) states the SUPPLIED premise, on the 'resolved' branch — a rung-5 consumer who does not build with navecss-tokens build must be able to reject the claim from that one line alone", () => {
    // Isolate the success LINE, not the joined report and not an assumed index: with
    // `supplied` non-empty, `formatSuppliedLines` independently emits the same "(true only if
    // you build with that tool)" phrase elsewhere in the output, so a whole-report
    // `toContain` would pass even if the success line itself never carried the premise
    // (caught by red-first). Located by CONTENT (a round-2 fix, the quality reviewer's note F1):
    // only `formatSuccessLine`'s zero-checkable `resolved` branch emits "Manifest from" — verified
    // stacked against the quality reviewer's own mutant below.
    const lines = formatValidateReport(manifest, [], undefined, {
      status: 'resolved',
      supplied: manifest.tokens,
    })
    const successLine = uniqueLine(lines, /Manifest from/, 'the resolved-branch success line')
    expect(successLine).toContain('(true only if you build with that tool)')
  })

  it("product's follow-up: the zero-checkable sentence carries the SUPPLIED premise on the 'not-installed' branch too, isolated the same way", () => {
    const lines = formatValidateReport(manifest, [], undefined, {
      status: 'not-installed',
      supplied: manifest.tokens,
    })
    // Only `formatSuccessLine`'s zero-checkable `not-installed` branch begins "0 missing
    // against" (formatMissingLines's failure branch says "N missing name(s):" instead).
    const successLine = uniqueLine(
      lines,
      /^0 missing against/,
      'the not-installed-branch success line',
    )
    expect(successLine).toContain('(true only if you build with that tool)')
  })

  /**
   * ROW F2 from a quality-review pass (Phase 3 round 2) at the unit level, beside the renderer
   * it constrains. R17 property 3's SECOND dated precision (product, 2026-09-14): in R14's
   * state 1, EVERY outcome's provenance states the manifest's recorded producer as recorded
   * and states that no installed `@navecss/core` was found and no skew check ran. Fence (a)
   * of that precision is that the sentence is TRANSCRIBED, not re-worded — so this row
   * EXTRACTS it from the success line rather than re-typing it into the expectation, because
   * a hand-copied expectation is precisely how one fact acquires two voices.
   */
  it("a quality-review finding (F2): in R14 state 1 the FAILURE line carries the success line's no-skew-check sentence VERBATIM, and states the recorded producer as recorded", () => {
    const successLine = uniqueLine(
      formatValidateReport(manifest, [], undefined, { status: 'not-installed' }),
      /^0 missing against/,
      'the not-installed success line',
    )
    const disclaimer = successLine.slice(successLine.indexOf('No installed @navecss/core'))
    // Pins the EXTRACTION (an empty or truncated slice would make the containment assertion
    // below vacuously true), never the failure line's own copy of it.
    expect(disclaimer).toBe('No installed @navecss/core was found, so no version-skew check ran.')

    const failureLines = formatValidateReport(manifest, ['--nave-color-b'], undefined, {
      status: 'not-installed',
    })
    expect(failureLines.join('\n')).toContain(disclaimer)
    const provenanceLine = uniqueLine(
      failureLines,
      /^Checked against/,
      'the failure provenance line',
    )
    expect(provenanceLine).toContain('@navecss/core@0.1.0')
    expect(provenanceLine.toLowerCase()).toContain('recorded')
  })

  it('a quality-review finding (F2, negative half): the resolved state is untouched — a comparison DID happen, so the failure line carries no no-core disclaimer', () => {
    const failureLines = formatValidateReport(manifest, ['--nave-color-b'], undefined, {
      status: 'resolved',
    }).join('\n')
    expect(failureLines).toMatch(/Checked against @navecss\/core@0\.1\.0 \(manifest format \d+\)\./)
    expect(failureLines).not.toMatch(/no installed @navecss\/core was found/i)
  })

  it('either outcome states the checks scope (one-directional, an extra token is never an error)', () => {
    const passLines = formatValidateReport(manifest, [], undefined).join('\n')
    const failLines = formatValidateReport(manifest, ['--nave-color-b'], undefined).join('\n')
    expect(passLines.toLowerCase()).toContain('one-directional')
    expect(failLines.toLowerCase()).toContain('one-directional')
  })

  // The THIRD output path (R14's version skew), which was unexercised: every other test here
  // passes `undefined` for it, so the branch that short-circuits the report shipped with no
  // coverage at all. This pins what it actually prints; it takes no position on whether
  // R17's "given either outcome" clause governs a short-circuit outcome, which is spec text.
  it('a version skew short-circuits the report: both versions named, and no name-set answer', () => {
    const lines = formatValidateReport(manifest, ['--nave-color-b'], {
      recorded: '0.1.0',
      installed: '0.2.0',
    })
    const joined = lines.join('\n')
    expect(joined).toContain('0.1.0')
    expect(joined).toContain('0.2.0')
    expect(joined).toContain('@navecss/core')
    expect(joined).toMatch(/core contract this @navecss\/tokens ships/)
    expect(joined).toMatch(/Reinstall matching versions before trusting this result/)
    expect(joined).not.toMatch(/0 missing/)
    expect(joined).not.toMatch(/missing name\(s\)/)
    expect(joined).not.toContain('--nave-color-b')
  })
})

describe('AC-token-build-18 covers: R18', () => {
  it('no success or failure line predicates completeness, validity or readiness of the PALETTE or THEME as a whole', () => {
    const manifest = manifestOf(['--nave-color-a', '--nave-color-b'])
    const passLines = formatValidateReport(manifest, [], undefined)
    const failLines = formatValidateReport(manifest, ['--nave-color-b'], undefined)
    for (const line of [...passLines, ...failLines]) {
      expect(line.toLowerCase()).not.toMatch(
        /your (token source|theme|palette) is (valid|ready|complete)/,
      )
      expect(line.toLowerCase()).not.toMatch(/\btheme is ready\b/)
      expect(line.toLowerCase()).not.toMatch(/\bpalette\b/)
    }
    // "0 missing" alone would be an implied palette endorsement without provenance —
    // the pass line must carry the provenance clause in the SAME line-set.
    const passJoined = passLines.join(' ')
    expect(passJoined).toMatch(/0 missing/)
    expect(passJoined).toContain('@navecss/core')
  })

  it('"not-installed" states the manifest\'s own RECORDED version and that no skew check ran — never a claim that a comparison happened', () => {
    const manifest = manifestOf(['--nave-color-a'])
    const lines = formatValidateReport(manifest, [], undefined, { status: 'not-installed' })
    const joined = lines.join('\n')
    expect(joined).toMatch(/no installed @navecss\/core was found/i)
    expect(joined).toMatch(/no version-skew check ran/i)
    expect(joined).toContain('0.1.0') // the manifest's own recorded producer version
  })

  it('"unresolvable" (an older core with no "./package.json" export) is a named failure, not a silent skip', () => {
    const manifest = manifestOf(['--nave-color-a'])
    const lines = formatValidateReport(manifest, [], undefined, { status: 'unresolvable' })
    const joined = lines.join('\n')
    expect(joined).toMatch(/could not determine the installed @navecss\/core's version/i)
    expect(joined).not.toMatch(/0 missing/)
  })

  it('"unreadable" names the read/parse failure rather than proceeding as though nothing were installed', () => {
    const manifest = manifestOf(['--nave-color-a'])
    const lines = formatValidateReport(manifest, [], undefined, {
      status: 'unreadable',
      message: 'ENOENT: no such file',
    })
    const joined = lines.join('\n')
    expect(joined).toMatch(/could not read the installed @navecss\/core's package\.json/i)
    expect(joined).toContain('ENOENT')
  })

  it('a round-2 fix (the developer-relations reviewer\'s note F7): "unreadable" (exit 2) composes no name-set verdict either, matching the "unresolvable" sibling above — the property the README\'s exit-code paragraph now states ("a run that exits 2 reports none") armed on the one exit-2 branch that lacked its own assertion', () => {
    const manifest = manifestOf(['--nave-color-a'])
    // A NON-EMPTY missing array, so this is armed rather than vacuous: were the short-circuit
    // ever removed and the report composed alongside the refusal, this would be the case that
    // actually names a contract token.
    const lines = formatValidateReport(manifest, ['--nave-color-a'], undefined, {
      status: 'unreadable',
      message: 'ENOENT: no such file',
    })
    const joined = lines.join('\n')
    expect(joined).not.toMatch(/0 missing/)
    expect(joined).not.toContain('--nave-color-a')
  })

  it('the version-skew line predicates the CORE CONTRACT this package ships, never the palette or the token source', () => {
    const manifest = manifestOf(['--nave-color-a'])
    const lines = formatValidateReport(manifest, [], { recorded: '0.1.0', installed: '0.2.0' })
    for (const line of lines) {
      expect(line.toLowerCase()).not.toMatch(/\bpalette\b/)
      expect(line.toLowerCase()).not.toMatch(
        /your (token source|theme|palette) is (valid|ready|complete)/,
      )
      expect(line.toLowerCase()).toContain('core contract')
    }
  })
})

describe('SUPPLIED vs MISSING — a name the theming half emits unconditionally is never reported as missing', () => {
  // The real R14 contract names all sit in the theming half's `--nave-color-*` namespace.
  const realManifest = manifestOf([
    '--nave-color-border-default',
    '--nave-color-border-disabled',
    '--nave-color-border-focus',
    '--nave-color-content-disabled',
    '--nave-color-content-primary',
    '--nave-color-surface-base',
  ])

  it("Nave's OWN bundled DTCG source (declaring none of the six contract names) reports all six SUPPLIED, none MISSING", () => {
    // The bundled tokens.json declares zero colour tokens (R27/#409's own measurement) —
    // reproduced here as an empty DTCG source, since only the name-set matters.
    const notDeclared = computeMissing(realManifest, 'json', JSON.stringify({}))
    expect(notDeclared).toHaveLength(realManifest.tokens.length)
    const { missing, supplied } = splitMissingBySupply('json', notDeclared)
    expect(missing).toEqual([])
    expect(supplied).toEqual(realManifest.tokens)
  })

  it('a synthetic contract name outside the real theming namespace is genuinely MISSING, never SUPPLIED', () => {
    const manifest = manifestOf(['--nave-radius-lg']) // the widened, non-colour class
    const notDeclared = computeMissing(manifest, 'json', JSON.stringify({}))
    const { missing, supplied } = splitMissingBySupply('json', notDeclared)
    expect(missing).toEqual(['--nave-radius-lg'])
    expect(supplied).toEqual([])
  })

  it("the split never applies to a .css scan: an absent name there stays MISSING, per R15's no-assumption design", () => {
    const notDeclared = computeMissing(realManifest, 'css', '')
    const { missing, supplied } = splitMissingBySupply('css', notDeclared)
    expect(missing).toEqual(realManifest.tokens)
    expect(supplied).toEqual([])
  })

  it('a real semantic slot genuinely declared in the css scan is neither missing nor supplied — it is already satisfied', () => {
    // Regression guard for the exact shape validate.test.ts's own R15 comment-stripping test
    // uses (a real contract name, kind 'css'): the split must not reclassify it.
    const css = '--nave-color-surface-base: white;'
    const notDeclared = computeMissing(manifestOf(['--nave-color-surface-base']), 'css', css)
    expect(notDeclared).toEqual([])
  })

  it('formatValidateReport states the supplier and the premise, and keeps them out of the missing count', () => {
    const lines = formatValidateReport(
      realManifest,
      ['--nave-color-only-genuinely-missing'],
      undefined,
      { status: 'resolved', supplied: realManifest.tokens },
    )
    const joined = lines.join('\n')
    expect(joined).toMatch(/1 missing name\(s\)/)
    expect(joined).toContain('--nave-color-only-genuinely-missing')
    expect(joined).toMatch(/navecss-tokens build.*theming layer.*from your seed/)
    expect(joined).toMatch(/true only if you build with that tool/)
    for (const name of realManifest.tokens) expect(joined).toContain(name)
  })

  it('formatValidateReport with no supplied names (the default) is byte-identical to its output before the supplied-names parameter existed', () => {
    const withDefault = formatValidateReport(realManifest, ['--nave-color-x'], undefined)
    const withExplicitEmpty = formatValidateReport(realManifest, ['--nave-color-x'], undefined, {
      status: 'resolved',
      supplied: [],
    })
    expect(withDefault).toEqual(withExplicitEmpty)
    expect(withDefault.join('\n')).not.toMatch(/supplied|theming layer/)
  })

  it('SEMANTIC_SLOTS sanity: the real slot set is non-empty, so the split above is exercising real data', () => {
    expect(SEMANTIC_SLOTS.length).toBeGreaterThan(0)
  })
})
